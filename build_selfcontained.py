"""Gera um servidor único que restaura os arquivos públicos ao iniciar."""
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
output = root.parent / "SERVIDOR-AUTORREPARO-RENDER"
output.mkdir(exist_ok=True)

public_files = {
    "portal.html": root / "portal.html",
    "index.html": root / "portal.html",
    "painel.html": root / "painel.html",
    "admin.html": root / "painel.html",
    "coordenacao.html": root / "coordenacao.html",
    "admin.js": root / "admin.js",
    "admin-dashboard.js": root / "admin-dashboard.js",
    "coordenacao.js": root / "coordenacao.js",
    "script.js": root / "script.js",
    "styles.css": root / "styles.css",
    "assets/escudo-efas.png": root / "assets" / "escudo-efas.png",
}

bundle = BytesIO()
with ZipFile(bundle, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for archive_name, source in public_files.items():
        archive.writestr(archive_name, source.read_bytes())

encoded = b64encode(bundle.getvalue()).decode("ascii")
source = (root / "server.py").read_text(encoding="utf-8")
source = source.replace(
    "import base64, binascii, difflib, hashlib, hmac, io, json, os, re, secrets, sqlite3, time, unicodedata",
    "import base64, binascii, difflib, hashlib, hmac, io, json, os, re, secrets, sqlite3, time, unicodedata, zipfile",
    1,
)
injected = f'''EMBEDDED_PUBLIC_BUNDLE = "{encoded}"

def restore_embedded_public_files():
    """Restaura os arquivos públicos corretos sem alterar o banco de dados."""
    raw = base64.b64decode(EMBEDDED_PUBLIC_BUNDLE)
    allowed = {{"portal.html", "index.html", "painel.html", "admin.html", "coordenacao.html", "admin.js", "admin-dashboard.js", "coordenacao.js", "script.js", "styles.css", "assets/escudo-efas.png"}}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for name in archive.namelist():
            if name not in allowed:
                continue
            target = ROOT / name
            target.parent.mkdir(parents=True, exist_ok=True)
            content = archive.read(name)
            if not target.exists() or target.read_bytes() != content:
                target.write_bytes(content)

'''
source = source.replace("SUBJECTS = [", injected + "SUBJECTS = [", 1)
source = source.replace("def initialize():\n    DB.parent.mkdir(exist_ok=True)", "def initialize():\n    restore_embedded_public_files()\n    DB.parent.mkdir(exist_ok=True)", 1)
(output / "server.py").write_text(source, encoding="utf-8", newline="\n")
(output / "requirements.txt").write_bytes((root / "requirements.txt").read_bytes())
(output / "render.yaml").write_bytes((root / "render.yaml").read_bytes())
print(output / "server.py")
