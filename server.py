"""Servidor local EFAS: autenticação, currículo, notas, observações e ranking."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit
import hashlib, hmac, json, os, secrets, sqlite3, time

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data" / "notas.db"
HOST = os.environ.get("EFAS_HOST", "127.0.0.1")
PORT = int(os.environ.get("EFAS_PORT", "4174"))
SESSIONS = {}
USER = os.environ.get("EFAS_ADMIN_USER", "administrador")
INITIAL_PASSWORD = os.environ.get("EFAS_INITIAL_ADMIN_PASSWORD", "")
COOKIE_SECURE = os.environ.get("EFAS_COOKIE_SECURE", "0") == "1"
PUBLIC_FILES = {
    "/index.html", "/admin.html", "/styles.css", "/script.js", "/admin.js",
    "/assets/escudo-efas.png",
}

SUBJECTS = [
 (12,"Instrumentos de Menor Potencial Ofensivo",1),(16,"Saúde Integral",1),(20,"Gestão Logística",1),(20,"Gestão Orçamentária e Financeira",1),(20,"Resolução de Conflitos e Técnicas de Mediação",1),(20,"Tecnologias Aplicadas à Atividade Policial",1),(30,"Análise Criminal",1),(30,"Comunicação Organizacional",1),(30,"Direito Civil Aplicado à Atividade Policial",1),(30,"Direito Penal Militar",1),(30,"Direito Processual Penal Comum e Militar",1),(30,"Direitos Humanos",1),(30,"Gestão de Serviços Operacionais",1),(30,"Inteligência de Segurança Pública",1),(30,"Legislação Aplicada à Atividade Policial",1),(30,"Liderança Policial Militar e Gestão de Pessoas",1),(30,"Polícia Comunitária",1),(30,"Proteção e Defesa Civil",1),
 (40,"Defesa Pessoal Policial",2),(40,"Direito Penal",2),(40,"Ordem Unida",2),(40,"Policiamento Ostensivo de Trânsito",2),(40,"Redação de Documentos Institucionais da PMMG",2),(50,"Legislação Institucional Aplicada à Gestão de Recursos Humanos",2),(60,"Armamento e Tiro Policial",2),(70,"Processos Administrativos",2),(70,"Técnica Policial Militar",2),(80,"Educação Física Militar",2),(270,"APMI – Atividades Policiais e Militares Interdisciplinares",2)]

def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    return salt.hex(), hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000).hex()

def verify(password, salt, digest):
    return hmac.compare_digest(password_hash(password, bytes.fromhex(salt))[1], digest)

def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    DB.parent.mkdir(exist_ok=True)
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password_hash TEXT NOT NULL,must_change INTEGER DEFAULT 1);
        CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY,date TEXT,subject TEXT,time TEXT,place TEXT,type TEXT);
        CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL,rank TEXT NOT NULL,salt TEXT NOT NULL,access_hash TEXT NOT NULL,observation TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY,hours INTEGER NOT NULL,name TEXT UNIQUE NOT NULL,exam_count INTEGER NOT NULL,grading_mode TEXT NOT NULL DEFAULT 'normal');
        CREATE TABLE IF NOT EXISTS scores(student_id TEXT NOT NULL,subject_id INTEGER NOT NULL,exam1 REAL,exam2 REAL,work REAL,status TEXT,PRIMARY KEY(student_id,subject_id));
        """)
        columns = [x[1] for x in db.execute("PRAGMA table_info(students)")]
        if "observation" not in columns: db.execute("ALTER TABLE students ADD COLUMN observation TEXT NOT NULL DEFAULT ''")
        subject_columns = [x[1] for x in db.execute("PRAGMA table_info(subjects)")]
        if "grading_mode" not in subject_columns: db.execute("ALTER TABLE subjects ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'normal'")
        score_columns = [x[1] for x in db.execute("PRAGMA table_info(scores)")]
        if "status" not in score_columns: db.execute("ALTER TABLE scores ADD COLUMN status TEXT")
        if not db.execute("SELECT 1 FROM admins WHERE username=?", (USER,)).fetchone():
            if len(INITIAL_PASSWORD) < 12:
                raise RuntimeError("Defina EFAS_INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres antes do primeiro uso.")
            salt,digest=password_hash(INITIAL_PASSWORD); db.execute("INSERT INTO admins VALUES(?,?,?,1)",(USER,salt,digest))
        db.executemany("INSERT INTO subjects(hours,name,exam_count) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET hours=excluded.hours,exam_count=excluded.exam_count",SUBJECTS)
        db.execute("UPDATE subjects SET grading_mode='apt' WHERE name IN ('Saúde Integral','Armamento e Tiro Policial','APMI – Atividades Policiais e Militares Interdisciplinares')")
        db.execute("UPDATE subjects SET grading_mode='taf' WHERE name='Educação Física Militar'")
        # Migra lançamentos antigos das disciplinas de avaliação única para a coluna AVF.
        db.execute("""UPDATE scores SET exam2=COALESCE(exam2,exam1),exam1=NULL
          WHERE exam1 IS NOT NULL AND subject_id IN
          (SELECT id FROM subjects WHERE exam_count=1 AND grading_mode='normal')""")

def subject_rows(db):
    return [dict(x) for x in db.execute("SELECT id,hours,name,exam_count,grading_mode FROM subjects ORDER BY hours,name")]

def ranking(db):
    rows = db.execute("""SELECT s.id,s.name,s.rank,s.observation,
      COALESCE(SUM(CASE WHEN sub.grading_mode='apt' THEN 0 ELSE COALESCE(sc.exam1,0)+COALESCE(sc.exam2,0)+COALESCE(sc.work,0) END),0) points,
      COALESCE(SUM(
        CASE WHEN sub.grading_mode='apt' THEN 0
        WHEN sub.grading_mode='taf' THEN (CASE WHEN sc.exam1 IS NOT NULL THEN 3 ELSE 0 END)+(CASE WHEN sc.exam2 IS NOT NULL THEN 3 ELSE 0 END)+(CASE WHEN sc.work IS NOT NULL THEN 4 ELSE 0 END)
        ELSE (CASE WHEN sc.exam1 IS NOT NULL AND sub.exam_count=2 THEN 3 ELSE 0 END)+(CASE WHEN sc.exam2 IS NOT NULL THEN CASE WHEN sub.exam_count=1 THEN 7 ELSE 4 END ELSE 0 END)+(CASE WHEN sc.work IS NOT NULL THEN 3 ELSE 0 END) END
      ),0) distributed,
      COUNT(CASE WHEN sub.grading_mode!='apt' AND (sc.exam1 IS NOT NULL OR sc.exam2 IS NOT NULL OR sc.work IS NOT NULL) THEN 1 END) subjects_count
      FROM students s LEFT JOIN scores sc ON sc.student_id=s.id LEFT JOIN subjects sub ON sub.id=sc.subject_id
      GROUP BY s.id ORDER BY points DESC,s.name""").fetchall()
    result=[]; last=None; position=0
    for index,row in enumerate(rows,1):
        if last is None or row["points"]<last: position=index
        last=row["points"]; item=dict(row); item["position"]=position; item["average"]=round(row["points"]/row["subjects_count"],2) if row["subjects_count"] else 0; result.append(item)
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        super().end_headers()
    def body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))))
        except Exception: return {}
    def output(self,data,status=200,cookie=None):
        raw=json.dumps(data,ensure_ascii=False).encode(); self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-store")
        if cookie:self.send_header("Set-Cookie",cookie)
        self.end_headers(); self.wfile.write(raw)
    def admin(self):
        cookies=SimpleCookie(self.headers.get("Cookie")); token=cookies.get("efas_session"); session=SESSIONS.get(token.value if token else "")
        return session[0] if session and session[1]>time.time() else None
    def require_admin(self):
        user=self.admin()
        if not user:self.output({"error":"Sessão expirada. Entre novamente."},401)
        return user
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=="/api/exams":
            with connect() as db:self.output([dict(x) for x in db.execute("SELECT date,subject,time,place,type FROM exams ORDER BY date")]); return
        if path=="/api/admin/session":
            user=self.require_admin()
            if user:
                with connect() as db: row=db.execute("SELECT must_change FROM admins WHERE username=?",(user,)).fetchone(); self.output({"username":user,"must_change_password":bool(row[0])})
            return
        if path=="/api/admin/data":
            if not self.require_admin():return
            with connect() as db:
                self.output({"subjects":subject_rows(db),"students":[dict(x) for x in db.execute("SELECT id,name,rank,observation FROM students ORDER BY name")],"scores":[dict(x) for x in db.execute("SELECT sc.*,sub.name subject,sub.exam_count,sub.grading_mode FROM scores sc JOIN subjects sub ON sub.id=sc.subject_id")],"ranking":ranking(db),"exams":[dict(x) for x in db.execute("SELECT * FROM exams ORDER BY date")]})
            return
        if path=="/": self.path="/index.html"
        elif path not in PUBLIC_FILES:
            self.send_error(404, "Arquivo não encontrado")
            return
        super().do_GET()
    def do_POST(self):
        data=self.body()
        if self.path=="/api/admin/login":
            with connect() as db: row=db.execute("SELECT * FROM admins WHERE username=?",(data.get("username",""),)).fetchone()
            if not row or not verify(data.get("password",""),row["salt"],row["password_hash"]):self.output({"error":"Usuário ou senha inválidos."},401);return
            token=secrets.token_urlsafe(32);SESSIONS[token]=(row["username"],time.time()+28800);secure="; Secure" if COOKIE_SECURE else "";self.output({"username":row["username"],"must_change_password":bool(row["must_change"])},cookie=f"efas_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}");return
        if self.path=="/api/grades":
            with connect() as db:
                student=db.execute("SELECT * FROM students WHERE id=?",(str(data.get("id","")),)).fetchone()
                if not student or not verify(data.get("code",""),student["salt"],student["access_hash"]):self.output({"error":"Credenciais inválidas."},401);return
                scores=[dict(x) for x in db.execute("SELECT sub.name subject,sub.hours,sub.exam_count,sub.grading_mode,sc.exam1,sc.exam2,sc.work,sc.status FROM scores sc JOIN subjects sub ON sub.id=sc.subject_id WHERE sc.student_id=? ORDER BY sub.hours,sub.name",(student["id"],))]
                own=next((x for x in ranking(db) if x["id"]==student["id"]),None)
            self.output({"id":student["id"],"name":student["name"],"rank":student["rank"],"observation":student["observation"],"scores":scores,"ranking":{k:own[k] for k in ("position","points","distributed","average")}});return
        user=self.require_admin()
        if not user:return
        try:
            with connect() as db:
                if self.path=="/api/admin/password":
                    password=data.get("password","")
                    if len(password)<12:raise ValueError("A senha deve possuir pelo menos 12 caracteres.")
                    salt,digest=password_hash(password);db.execute("UPDATE admins SET salt=?,password_hash=?,must_change=0 WHERE username=?",(salt,digest,user))
                elif self.path=="/api/admin/exams":db.execute("INSERT INTO exams(date,subject,time,place,type) VALUES(?,?,?,?,?)",tuple(str(data.get(k,"")).strip() for k in ("date","subject","time","place","type")))
                elif self.path=="/api/admin/student":
                    sid=str(data.get("student_id","")).strip(); code=str(data.get("access_code","")).strip()
                    if not sid or not data.get("name") or len(code)<6:raise ValueError("Preencha matrícula, nome e código com pelo menos 6 caracteres.")
                    salt,digest=password_hash(code);db.execute("INSERT INTO students(id,name,rank,salt,access_hash,observation) VALUES(?,?,?,?,?,'') ON CONFLICT(id) DO UPDATE SET name=excluded.name,rank=excluded.rank,salt=excluded.salt,access_hash=excluded.access_hash",(sid,str(data.get("name","")).strip(),str(data.get("rank","")).strip(),salt,digest))
                elif self.path=="/api/admin/score":
                    sid=str(data.get("student_id","")).strip();subject_id=int(data.get("subject_id"));sub=db.execute("SELECT exam_count,grading_mode FROM subjects WHERE id=?",(subject_id,)).fetchone()
                    if not db.execute("SELECT 1 FROM students WHERE id=?",(sid,)).fetchone() or not sub:raise ValueError("Discente ou disciplina inválida.")
                    def number(key,maximum):
                        value=data.get(key)
                        if value in (None,""):return None
                        value=float(value)
                        if not 0<=value<=maximum:raise ValueError(f"{key} deve estar entre 0 e {maximum}.")
                        return value
                    mode=sub[1];status=None
                    if mode=='apt':
                        status=str(data.get('status','')).strip()
                        if status not in ('Apto','Inapto'):raise ValueError('Selecione Apto ou Inapto.')
                        exam1=exam2=work=None
                    elif mode=='taf': exam1=number('exam1',3);exam2=number('exam2',3);work=number('work',4)
                    elif sub[0]==1: exam1=None;exam2=number("exam2",7);work=number("work",3)
                    else: exam1=number("exam1",3);exam2=number("exam2",4);work=number("work",3)
                    db.execute("INSERT INTO scores(student_id,subject_id,exam1,exam2,work,status) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id) DO UPDATE SET exam1=excluded.exam1,exam2=excluded.exam2,work=excluded.work,status=excluded.status",(sid,subject_id,exam1,exam2,work,status))
                    db.execute("UPDATE students SET observation=? WHERE id=?",(str(data.get("observation","")).strip(),sid))
                elif self.path=="/api/admin/logout":
                    cookies=SimpleCookie(self.headers.get("Cookie"));token=cookies.get("efas_session");SESSIONS.pop(token.value if token else "",None);self.output({"ok":True},cookie="efas_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");return
                else:self.output({"error":"Rota inexistente."},404);return
            self.output({"ok":True})
        except (ValueError,sqlite3.Error) as error:self.output({"error":str(error)},400)

if __name__=="__main__":initialize();print(f"Portal EFAS em http://{HOST}:{PORT}/");ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
