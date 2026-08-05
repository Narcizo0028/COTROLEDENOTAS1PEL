PACOTE CORRIGIDO PARA O RENDER

1. Extraia o arquivo ZIP no computador.
2. Envie TODOS os arquivos extraídos para a raiz do repositório GitHub.
3. Não renomeie os arquivos.
4. Não copie o conteúdo de um arquivo para outro.
5. Confirme no GitHub:
   - requirements.txt começa com: reportlab>=4.0,<5
   - render.yaml começa com: services:
   - admin.html começa com: <!DOCTYPE html>
   - admin.js começa com: const $=
6. No Render, use Manual Deploy > Deploy latest commit.
7. Abra o painel pela URL terminada em /admin.html, nunca /admin.js.

Arquivos que não devem ser enviados:
- notas.db, notas.db-shm ou notas.db-wal
- pasta .venv
- pasta __pycache__
- ZIPs antigos

Regras incluídas:
- Defesa Pessoal Policial: AVF 6 pontos + Trabalho 4 pontos.
- Nota em branco no lançamento manual equivale a zero.
