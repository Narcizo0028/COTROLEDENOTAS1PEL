"""Servidor local EFAS: autenticação, currículo, notas, observações e ranking."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit
from datetime import datetime
import base64, hashlib, hmac, io, json, os, re, secrets, sqlite3, time

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data" / "notas.db"
HOST = os.environ.get("EFAS_HOST", "127.0.0.1")
PORT = int(os.environ.get("EFAS_PORT", "4174"))
SESSIONS = {}
STUDENT_SESSIONS = {}
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

OFFICIAL_CALENDAR_VERSION = "modulo-1-2026-07-20"
OFFICIAL_EXAMS = [
 ("2026-05-13","Redação de Documentos Institucionais da PMMG","06h30min","Duração: 100 minutos","Avaliação Complementar (AVC)"),
 ("2026-05-20","Legislação Institucional Aplicada à Gestão de Recursos Humanos","06h30min","Duração: 100 minutos","Avaliação Complementar (AVC)"),
 ("2026-05-25","Gestão Orçamentária e Financeira","06h30min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-05-27","Direito Penal","06h30min","Duração: 100 minutos","Avaliação Complementar (AVC)"),
 ("2026-06-02","Processos Administrativos","06h20min","Duração: 100 minutos","Avaliação Complementar (AVC)"),
 ("2026-07-20","Inteligência de Segurança Pública","06h50min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-07-30","Redação de Documentos Institucionais da PMMG","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-07-31","Comunicação Organizacional","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-08-10","Polícia Comunitária","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-08-12","Gestão de Serviços Operacionais","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-08-17","Direito Penal Militar","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-08-18","Técnica Policial Militar","06h40min","Duração: 100 minutos","Avaliação Complementar (AVC)"),
 ("2026-08-20","Processos Administrativos","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-08-26","Direito Penal","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-10-14","Ordem Unida","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-10-20","Técnica Policial Militar","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
 ("2026-10-21","Legislação Institucional Aplicada à Gestão de Recursos Humanos","06h40min","Duração: 100 minutos","Avaliação Final (AVF)"),
]

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
        CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT NOT NULL,rank TEXT NOT NULL,salt TEXT NOT NULL,access_hash TEXT NOT NULL,observation TEXT NOT NULL DEFAULT '',must_change INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY,hours INTEGER NOT NULL,name TEXT UNIQUE NOT NULL,exam_count INTEGER NOT NULL,grading_mode TEXT NOT NULL DEFAULT 'normal');
        CREATE TABLE IF NOT EXISTS scores(student_id TEXT NOT NULL,subject_id INTEGER NOT NULL,exam1 REAL,exam2 REAL,work REAL,status TEXT,PRIMARY KEY(student_id,subject_id));
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        """)
        columns = [x[1] for x in db.execute("PRAGMA table_info(students)")]
        if "observation" not in columns: db.execute("ALTER TABLE students ADD COLUMN observation TEXT NOT NULL DEFAULT ''")
        if "must_change" not in columns: db.execute("ALTER TABLE students ADD COLUMN must_change INTEGER NOT NULL DEFAULT 1")
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
        calendar_version=db.execute("SELECT value FROM settings WHERE key='official_calendar_version'").fetchone()
        if not calendar_version:
            db.execute("DELETE FROM exams")
            db.executemany("INSERT INTO exams(date,subject,time,place,type) VALUES(?,?,?,?,?)",OFFICIAL_EXAMS)
            db.execute("INSERT INTO settings(key,value) VALUES('official_calendar_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(OFFICIAL_CALENDAR_VERSION,))
        # Migra lançamentos antigos das disciplinas de avaliação única para a coluna AVF.
        db.execute("""UPDATE scores SET exam2=COALESCE(exam2,exam1),exam1=NULL
          WHERE exam1 IS NOT NULL AND subject_id IN
          (SELECT id FROM subjects WHERE exam_count=1 AND grading_mode='normal')""")

def subject_rows(db):
    return [dict(x) for x in db.execute("SELECT id,hours,name,exam_count,grading_mode FROM subjects ORDER BY hours,name")]

def parse_calendar_pdf(raw):
    """Extrai avaliações do modelo oficial de calendário da EFAS."""
    import pdfplumber
    if not raw.startswith(b'%PDF'):raise ValueError('O arquivo selecionado não é um PDF válido.')
    try:
        with pdfplumber.open(io.BytesIO(raw)) as document:
            if not 1<=len(document.pages)<=20:raise ValueError('O PDF deve possuir entre 1 e 20 páginas.')
            text='\n'.join(page.extract_text(x_tolerance=2,y_tolerance=3) or '' for page in document.pages)
    except ValueError:raise
    except Exception as error:raise ValueError('Não foi possível ler o conteúdo do PDF.') from error
    if 'CALENDÁRIO DE PROVAS' not in text.upper():raise ValueError('O arquivo não parece ser um calendário oficial de provas.')
    aliases={
      'Redação de Documentos Instituc. da':'Redação de Documentos Institucionais da PMMG',
      'Legislação Institucional Aplicada à Gest.':'Legislação Institucional Aplicada à Gestão de Recursos Humanos',
    }
    valid_subjects={name:name for _,name,_ in SUBJECTS};months={'Jan':'01','Fev':'02','Mar':'03','Abr':'04','Mai':'05','Jun':'06','Jul':'07','Ago':'08','Set':'09','Out':'10','Nov':'11','Dez':'12'}
    pattern=re.compile(r'^(.+?)\s+([Xx-])\s+([Xx-])\s+(\d{2})(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)(\d{2})\s+(\d{2}h\d{2}min)\s+(\d+)\s+Minutos$',re.IGNORECASE)
    events=[]
    for source_line in text.splitlines():
        line=' '.join(source_line.split());match=pattern.match(line)
        if not match:continue
        raw_subject,vf,vc,day,month,year,hour,duration=match.groups();subject=aliases.get(raw_subject,valid_subjects.get(raw_subject))
        if not subject:raise ValueError(f'Disciplina não reconhecida no PDF: {raw_subject}.')
        kind='Avaliação Final (AVF)' if vf.upper()=='X' else 'Avaliação Complementar (AVC)' if vc.upper()=='X' else None
        if not kind:raise ValueError(f'Tipo de avaliação não identificado para {subject}.')
        events.append((f'20{year}-{months[month.title()]}-{day}',subject,hour,f'Duração: {int(duration)} minutos',kind))
    date_tokens=re.findall(r'\b\d{2}(?:Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\d{2}\b',text,re.IGNORECASE)
    if not events:raise ValueError('Nenhuma avaliação foi identificada no PDF.')
    if len(events)!=len(date_tokens):raise ValueError('Algumas linhas do calendário não puderam ser interpretadas. Nenhuma alteração foi realizada.')
    if len(events)!=len(set(events)):raise ValueError('O PDF contém avaliações duplicadas.')
    return sorted(events,key=lambda item:(item[0],item[1]))

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

def notes_report_pdf(db):
    """Gera o relatório administrativo de lançamentos em PDF."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rows=db.execute("""SELECT st.name,st.id student_id,st.rank,sub.name subject,sub.grading_mode,
      sc.exam1,sc.exam2,sc.work,sc.status
      FROM scores sc JOIN students st ON st.id=sc.student_id
      JOIN subjects sub ON sub.id=sc.subject_id
      ORDER BY st.name,sub.name""").fetchall()
    output=io.BytesIO();styles=getSampleStyleSheet()
    title=ParagraphStyle('ReportTitle',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=17,leading=20,textColor=colors.HexColor('#171713'),alignment=TA_CENTER,spaceAfter=4*mm)
    subtitle=ParagraphStyle('ReportSubtitle',parent=styles['Normal'],fontName='Helvetica',fontSize=8.5,leading=11,textColor=colors.HexColor('#5f5d55'),alignment=TA_CENTER,spaceAfter=5*mm)
    cell=ParagraphStyle('ReportCell',parent=styles['Normal'],fontName='Helvetica',fontSize=7,leading=8.5,textColor=colors.HexColor('#171713'),alignment=TA_LEFT)
    head=ParagraphStyle('ReportHead',parent=cell,fontName='Helvetica-Bold',textColor=colors.white,alignment=TA_CENTER)
    doc=SimpleDocTemplate(output,pagesize=landscape(A4),leftMargin=10*mm,rightMargin=10*mm,topMargin=12*mm,bottomMargin=13*mm,title='Relatório de lançamentos de notas',author='CFS - 1º Pelotão')
    story=[Paragraph('CFS - 1º PELOTÃO',title),Paragraph(f'Relatório administrativo de lançamentos de notas<br/>Gerado em {datetime.now().strftime("%d/%m/%Y às %H:%M")}',subtitle)]
    def fmt(value):return '-' if value is None else f'{float(value):.2f}'.replace('.',',')
    headers=['Discente','Matrícula','Disciplina','AVC / 1º TAF','AVF / 2º TAF','Trabalho / 3º TAF','Total / resultado']
    data=[[Paragraph(x,head) for x in headers]]
    for row in rows:
        apt=row['grading_mode']=='apt';total=(row['exam1'] or 0)+(row['exam2'] or 0)+(row['work'] or 0)
        result=(row['status'] or '-') if apt else fmt(total)
        values=[f"{row['name']}<br/><font size='6'>{row['rank']}</font>",row['student_id'],row['subject'],'-' if apt else fmt(row['exam1']),'-' if apt else fmt(row['exam2']),'-' if apt else fmt(row['work']),result]
        data.append([Paragraph(str(x),cell) for x in values])
    if rows:
        table=Table(data,colWidths=[43*mm,23*mm,72*mm,25*mm,25*mm,30*mm,28*mm],repeatRows=1,hAlign='CENTER')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#8a6b25')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('ALIGN',(3,1),(-1,-1),'CENTER'),('GRID',(0,0),(-1,-1),0.35,colors.HexColor('#c9c2b2')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f5f2e9')]),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]));story.append(table)
    else:story.append(Paragraph('Nenhum lançamento de nota foi encontrado.',styles['Normal']))
    story.extend([Spacer(1,7*mm),KeepTogether([Paragraph(f'Total de lançamentos: {len(rows)}',styles['Normal']),Spacer(1,9*mm),Paragraph('Conferido por: ____________________________________________    Data: ____/____/________',styles['Normal'])])])
    def footer(canvas,document):
        canvas.saveState();canvas.setFont('Helvetica',7);canvas.setFillColor(colors.HexColor('#69675f'));canvas.drawString(10*mm,7*mm,'Documento administrativo - Controle de Notas CFS / 1º Pelotão');canvas.drawRightString(landscape(A4)[0]-10*mm,7*mm,f'Página {document.page}');canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer);return output.getvalue()

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
    def output_pdf(self,raw,filename):
        self.send_response(200);self.send_header("Content-Type","application/pdf");self.send_header("Content-Disposition",f'attachment; filename="{filename}"');self.send_header("Content-Length",str(len(raw)));self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(raw)
    def admin(self):
        cookies=SimpleCookie(self.headers.get("Cookie")); token=cookies.get("efas_session"); session=SESSIONS.get(token.value if token else "")
        return session[0] if session and session[1]>time.time() else None
    def student(self):
        cookies=SimpleCookie(self.headers.get("Cookie"));token=cookies.get("efas_student_session");session=STUDENT_SESSIONS.get(token.value if token else "")
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
        if path=="/api/admin/report.pdf":
            if not self.require_admin():return
            with connect() as db:raw=notes_report_pdf(db)
            self.output_pdf(raw,f"relatorio-notas-{datetime.now().strftime('%Y-%m-%d')}.pdf");return
        if path=="/": self.path="/index.html"
        elif path not in PUBLIC_FILES:
            self.send_error(404, "Arquivo não encontrado")
            return
        super().do_GET()
    def do_POST(self):
        if int(self.headers.get("Content-Length",0) or 0)>8*1024*1024:self.output({"error":"Arquivo ou solicitação acima do limite permitido."},413);return
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
            token=secrets.token_urlsafe(32);STUDENT_SESSIONS[token]=(student["id"],time.time()+7200);secure="; Secure" if COOKIE_SECURE else "";self.output({"id":student["id"],"name":student["name"],"rank":student["rank"],"observation":student["observation"],"must_change_password":bool(student["must_change"]),"scores":scores,"ranking":{k:own[k] for k in ("position","points","distributed","average")}},cookie=f"efas_student_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200{secure}");return
        if self.path=="/api/student/password":
            sid=self.student()
            if not sid:self.output({"error":"Sessão expirada. Consulte suas notas novamente."},401);return
            password=str(data.get("password",''));confirmation=str(data.get("confirmation",''))
            if password!=confirmation:self.output({"error":"A confirmação da senha não confere."},400);return
            if len(password)<8:self.output({"error":"A nova senha deve possuir pelo menos 8 caracteres."},400);return
            with connect() as db:
                current=db.execute("SELECT salt,access_hash FROM students WHERE id=?",(sid,)).fetchone()
                if not current:self.output({"error":"Discente não encontrado."},404);return
                if verify(password,current["salt"],current["access_hash"]):self.output({"error":"Escolha uma senha diferente da atual."},400);return
                salt,digest=password_hash(password);db.execute("UPDATE students SET salt=?,access_hash=?,must_change=0 WHERE id=?",(salt,digest,sid))
            self.output({"ok":True});return
        if self.path=="/api/student/logout":
            cookies=SimpleCookie(self.headers.get("Cookie"));token=cookies.get("efas_student_session");STUDENT_SESSIONS.pop(token.value if token else "",None);secure="; Secure" if COOKIE_SECURE else "";self.output({"ok":True},cookie=f"efas_student_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0{secure}");return
        user=self.require_admin()
        if not user:return
        if self.path=="/api/admin/calendar/import":
            try:
                encoded=str(data.get("pdf_base64",''));raw=base64.b64decode(encoded,validate=True)
                if len(raw)>5*1024*1024:raise ValueError('O PDF deve possuir no máximo 5 MB.')
                events=parse_calendar_pdf(raw);version='imported-'+hashlib.sha256(raw).hexdigest()[:16]
                with connect() as db:
                    db.execute("DELETE FROM exams");db.executemany("INSERT INTO exams(date,subject,time,place,type) VALUES(?,?,?,?,?)",events)
                    db.execute("INSERT INTO settings(key,value) VALUES('official_calendar_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(version,))
                self.output({"ok":True,"imported":len(events),"version":version});return
            except (ValueError,TypeError) as error:self.output({"error":str(error)},400);return
        if self.path=="/api/admin/scores/bulk":
            try:
                subject_id=int(data.get('subject_id'));entries=data.get('entries')
                if not isinstance(entries,list) or not 1<=len(entries)<=500:raise ValueError('Envie entre 1 e 500 resultados por vez.')
                with connect() as db:
                    sub=db.execute("SELECT exam_count,grading_mode FROM subjects WHERE id=?",(subject_id,)).fetchone()
                    if not sub:raise ValueError('Disciplina inválida.')
                    known={row[0] for row in db.execute("SELECT id FROM students")};prepared=[]
                    def bulk_number(value,maximum,label):
                        if value in (None,''):return None
                        number=float(str(value).strip().replace(',','.'))
                        if not 0<=number<=maximum:raise ValueError(f'{label} deve estar entre 0 e {maximum}.')
                        return number
                    for entry in entries:
                        sid=str(entry.get('student_id','')).strip()
                        if sid not in known:raise ValueError(f'Discente inválido: {sid}.')
                        mode=sub['grading_mode'];status=None
                        if mode=='apt':
                            status=str(entry.get('status','')).strip()
                            if status not in ('Apto','Inapto'):raise ValueError(f'Selecione Apto ou Inapto para o discente {sid}.')
                            exam1=exam2=work=None
                        elif mode=='taf':exam1=bulk_number(entry.get('exam1'),3,'1º TAF');exam2=bulk_number(entry.get('exam2'),3,'2º TAF');work=bulk_number(entry.get('work'),4,'3º TAF')
                        elif sub['exam_count']==1:exam1=None;exam2=bulk_number(entry.get('exam2'),7,'AVF');work=bulk_number(entry.get('work'),3,'Trabalho')
                        else:exam1=bulk_number(entry.get('exam1'),3,'AVC');exam2=bulk_number(entry.get('exam2'),4,'AVF');work=bulk_number(entry.get('work'),3,'Trabalho')
                        prepared.append((sid,subject_id,exam1,exam2,work,status))
                    db.executemany("INSERT INTO scores(student_id,subject_id,exam1,exam2,work,status) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id) DO UPDATE SET exam1=COALESCE(excluded.exam1,scores.exam1),exam2=COALESCE(excluded.exam2,scores.exam2),work=COALESCE(excluded.work,scores.work),status=COALESCE(excluded.status,scores.status)",prepared)
                self.output({'ok':True,'saved':len(prepared)});return
            except (ValueError,TypeError,sqlite3.Error) as error:self.output({'error':str(error)},400);return
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
                    salt,digest=password_hash(code);db.execute("INSERT INTO students(id,name,rank,salt,access_hash,observation,must_change) VALUES(?,?,?,?,?,'',1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,rank=excluded.rank,salt=excluded.salt,access_hash=excluded.access_hash,must_change=1",(sid,str(data.get("name","")).strip(),str(data.get("rank","")).strip(),salt,digest))
                elif self.path=="/api/admin/score":
                    sid=str(data.get("student_id","")).strip();subject_id=int(data.get("subject_id"));sub=db.execute("SELECT exam_count,grading_mode FROM subjects WHERE id=?",(subject_id,)).fetchone()
                    if not db.execute("SELECT 1 FROM students WHERE id=?",(sid,)).fetchone() or not sub:raise ValueError("Discente ou disciplina inválida.")
                    def number(key,maximum):
                        value=data.get(key)
                        if value in (None,""):return None
                        # Aceita ponto ou vírgula como separador decimal.
                        value=float(str(value).strip().replace(",", "."))
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
                    db.execute("INSERT INTO scores(student_id,subject_id,exam1,exam2,work,status) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id) DO UPDATE SET exam1=COALESCE(excluded.exam1,scores.exam1),exam2=COALESCE(excluded.exam2,scores.exam2),work=COALESCE(excluded.work,scores.work),status=COALESCE(excluded.status,scores.status)",(sid,subject_id,exam1,exam2,work,status))
                    db.execute("UPDATE students SET observation=? WHERE id=?",(str(data.get("observation","")).strip(),sid))
                elif self.path=="/api/admin/logout":
                    cookies=SimpleCookie(self.headers.get("Cookie"));token=cookies.get("efas_session");SESSIONS.pop(token.value if token else "",None);self.output({"ok":True},cookie="efas_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");return
                else:self.output({"error":"Rota inexistente."},404);return
            self.output({"ok":True})
        except (ValueError,sqlite3.Error) as error:self.output({"error":str(error)},400)

if __name__=="__main__":initialize();print(f"Portal EFAS em http://{HOST}:{PORT}/");ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
