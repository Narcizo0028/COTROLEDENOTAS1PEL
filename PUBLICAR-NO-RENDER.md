# Publicação nova e limpa no Render

Esta pasta contém somente a aplicação necessária para o Render. Não contém o banco de dados, senhas, arquivos temporários ou configurações do Netlify.

## Regra principal para preservar os dados

Atualize o serviço Render existente `controle-notas-1-pelotao`. Não crie outro serviço e não remova o disco persistente `dados-notas`.

O banco existente permanece no caminho:

`/opt/render/project/src/data/notas.db`

## Etapa 1 - atualizar o repositório

1. Abra o repositório GitHub que já está conectado ao serviço Render.
2. Extraia o arquivo ZIP no computador antes de abrir o GitHub. O GitHub não extrai um ZIP enviado ao repositório.
3. Na raiz do repositório, envie e substitua estes arquivos: `.python-version`, `server.py`, `requirements.txt`, `render.yaml`, `README.md` e `PUBLICAR-NO-RENDER.md`.
4. Confira que `server.py` ficou na raiz, no mesmo nível de `requirements.txt`. Não coloque os arquivos dentro de uma nova subpasta.
5. Mantenha a pasta `data` sem arquivo `notas.db`.
6. Não envie senhas, arquivos `.env` ou bancos `.db`.
7. Confirme as alterações no GitHub e aguarde a criação do novo commit.

Importante: não envie somente o arquivo ZIP ao GitHub. O Render ignora o conteúdo interno do ZIP e continuará executando a versão anterior.

## Etapa 2 - conferir o serviço existente

No painel do Render, abra o serviço `controle-notas-1-pelotao` e confirme:

- Runtime: Python.
- Build Command: `pip install -r requirements.txt`
- Start Command: `python server.py`
- Health Check Path: `/`
- Variável `EFAS_HOST`: `0.0.0.0`
- Variável `EFAS_PORT`: `10000`
- Variável `EFAS_ADMIN_USER`: `administrador`
- Variável `EFAS_COOKIE_SECURE`: `1`
- Disco persistente `dados-notas` montado em `/opt/render/project/src/data`

Não altere `EFAS_INITIAL_ADMIN_PASSWORD` se o administrador já foi cadastrado. Essa variável é usada somente quando o banco ainda não possui administrador.

## Etapa 3 - publicar

1. No serviço existente, clique em **Manual Deploy**.
2. Escolha **Deploy latest commit**.
3. Aguarde a mensagem **Deploy live**.
4. Acesse `https://controle-notas-1-pelotao.onrender.com/`.
5. Atualize o navegador com `Ctrl + F5`.
6. Abra `https://controle-notas-1-pelotao.onrender.com/api/version` e confira a versão `2026-08-01-restauracao-render-verificada-v4`.
7. Entre no painel e confira um discente, uma nota já lançada e o calendário.

## O que não fazer

- Não criar outro serviço Render.
- Não excluir ou recriar o disco persistente.
- Não alterar o ponto de montagem do disco.
- Não enviar `data/notas.db` ao GitHub.
- Não publicar esta aplicação no Netlify.
- Não clicar em **Clear build cache & deploy** durante a primeira tentativa.

## Verificação dos dados

Depois da publicação, os nomes, senhas, notas e calendário devem continuar disponíveis porque o disco persistente não é substituído pelo código. Se algum dado não aparecer, interrompa as alterações e confirme se o disco continua montado no caminho indicado acima.
