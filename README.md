# Controle de Notas — CFS / 1º Pelotão

Portal institucional responsivo da EFAS para calendário, consulta individual de notas e administração restrita. A interface usa HTML5, CSS3 e JavaScript puro; o backend usa apenas a biblioteca padrão do Python e SQLite.

## Estrutura do projeto

- `index.html`, `styles.css` e `script.js`: portal dos discentes.
- `admin.html` e `admin.js`: painel administrativo.
- `server.py`: servidor, autenticação, API e regras de negócio.
- `assets/escudo-efas.png`: escudo institucional usado no cabeçalho, destaque e rodapé.
- `data/notas.db`: banco local criado na primeira execução. Este arquivo é confidencial e está excluído do Git.
- `.env.example`: modelo das configurações exigidas no servidor.

## Execução local

Requer Python 3.10 ou superior. Na primeira execução, defina uma senha administrativa temporária com pelo menos 12 caracteres.

### Windows PowerShell

```powershell
$env:EFAS_INITIAL_ADMIN_PASSWORD="defina-uma-senha-forte"
python server.py
```

Abra `http://127.0.0.1:4174/`. O usuário inicial é `administrador`. O sistema exigirá a troca da senha no primeiro acesso.

Nas execuções seguintes, o banco já contém o administrador e a variável da senha inicial não é necessária.

## Regras acadêmicas

- Disciplinas com uma avaliação: AVF de 7 pontos e trabalho de 3 pontos; o campo AVC permanece bloqueado.
- Disciplinas com duas avaliações: AVC de 3 pontos, AVF de 4 pontos e trabalho de 3 pontos.
- Saúde Integral, Armamento e Tiro Policial e APMI: resultado `Apto` ou `Inapto`, fora da pontuação numérica do ranking.
- Educação Física Militar: 1º TAF de 3 pontos, 2º TAF de 3 pontos e 3º TAF de 4 pontos.

O ranking completo é exclusivo do administrador. Cada discente recebe somente sua própria colocação, notas e observação individual.

Após consultar o boletim pela primeira vez, o discente pode substituir a senha temporária fornecida pela administração. A troca exige uma sessão autenticada, confirmação da nova senha e no mínimo 8 caracteres. A opção permanece disponível no boletim para mudanças futuras; as senhas continuam armazenadas somente como hash PBKDF2 com salt.

O painel administrativo também permite gerar um relatório PDF protegido com os nomes dos discentes, matrículas, disciplinas, componentes lançados, totais, data de geração e paginação. O arquivo é destinado à conferência posterior e só pode ser baixado durante uma sessão administrativa válida.

O calendário pode ser atualizado pelo administrador por meio da importação do PDF oficial da EFAS. O sistema aceita arquivos de até 5 MB, valida o conteúdo, identifica disciplinas, datas, horários, duração e marcações V.F/V.C e somente então substitui o calendário. Arquivos inválidos ou parcialmente reconhecidos são recusados sem modificar os dados existentes.

## Controle de versão

O repositório mantém somente código e arquivos públicos. Banco de dados, senhas, logs e arquivos temporários são ignorados pelo `.gitignore`.

Fluxo recomendado para registrar uma versão revisada:

```powershell
git status
git add .
git diff --cached
git commit -m "Prepara portal EFAS para publicação"
```

Antes de enviar para um repositório remoto, confirme que `data/notas.db` e `.env` não aparecem em `git status`.

## Procedimento de publicação

Este projeto possui autenticação e banco SQLite; por isso, **não deve ser publicado apenas como site estático** no GitHub Pages. Use um servidor Python persistente (servidor institucional, VPS ou plataforma que preserve o disco) atrás de HTTPS.

1. Faça uma cópia de segurança do banco `data/notas.db` em local protegido.
2. Envie ao servidor apenas os arquivos versionados do repositório.
3. Instale Python 3.10 ou superior.
4. Configure as variáveis de ambiente, usando `.env.example` como referência:
   - `EFAS_HOST=0.0.0.0`
   - `EFAS_PORT=4174`
   - `EFAS_ADMIN_USER=administrador`
   - `EFAS_INITIAL_ADMIN_PASSWORD`: senha temporária forte, necessária somente ao criar um banco novo.
   - `EFAS_COOKIE_SECURE=1`: obrigatório quando o endereço público usa HTTPS.
5. Inicie `python server.py` por um gerenciador de serviços do sistema para reinício automático.
6. Coloque Nginx, Apache ou o proxy institucional à frente da porta 4174, com certificado HTTPS válido. Não exponha a porta diretamente à internet.
7. Acesse o painel, altere a senha temporária e teste uma consulta de discente.
8. Configure backup criptografado e periódico de `data/notas.db`, com acesso restrito.

Exemplo mínimo de proxy Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:4174;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Formas de lançamento de notas

No painel do administrador, a seção **Como deseja lançar as notas?** oferece três modos:

- **Por matéria individual:** mantém a disciplina selecionada depois de salvar, facilitando o lançamento para o próximo discente.
- **Por discente:** mantém o discente selecionado depois de salvar, facilitando o preenchimento das demais disciplinas.
- **Coletivo por matéria:** exibe todos os discentes em uma tabela e salva os resultados preenchidos de uma só vez.

Os lançamentos são incrementais: campos deixados em branco preservam as notas já cadastradas. Ao selecionar novamente o mesmo discente e a mesma disciplina, os valores existentes são carregados para conferência e somente os componentes efetivamente alterados são atualizados.

No boletim, o botão **Sair do boletim** encerra a sessão individual, oculta as notas e remove o código digitado. Recomenda-se sempre utilizá-lo em computadores compartilhados.

No **Ranking completo do pelotão**, o administrador pode clicar no nome de qualquer discente para consultar as matérias que já possuem lançamento, as notas de cada componente, o total, a colocação e a média.

## Checklist antes de publicar

- Revisar nome, e-mail e contatos institucionais em `index.html`.
- Confirmar autorização de uso do escudo em `assets/escudo-efas.png`.
- Testar login, troca de senha, cadastro, lançamento, calendário e consulta individual.
- Confirmar que `/data/notas.db`, `/server.py`, `/.git/` e `/.env` retornam erro 404.
- Usar HTTPS e `EFAS_COOKIE_SECURE=1`.
- Restringir o acesso administrativo conforme a política da instituição.
- Definir rotina de backup e observar as obrigações da LGPD.

## Edição visual

- Textos e contatos: `index.html`.
- Cores e responsividade: variáveis e media queries em `styles.css`.
- Comportamento do portal: `script.js`.
- Comportamento administrativo: `admin.js`.
- Escudo: substitua `assets/escudo-efas.png`, mantendo o nome e preferencialmente as proporções.

Não inclua senhas, códigos de acesso ou bancos reais em commits, capturas de tela ou chamados de suporte.
