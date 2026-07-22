# Publicação do portal

## Primeira etapa: backend no Render

1. Crie um repositório privado no GitHub.
2. Envie para ele o conteúdo do pacote `backend-render.zip`.
3. No Render, escolha **New > Blueprint** e conecte o repositório.
4. O Render identificará automaticamente o arquivo `render.yaml`.
5. Quando solicitado, informe `EFAS_INITIAL_ADMIN_PASSWORD` com uma senha temporária de pelo menos 12 caracteres.
6. Confirme o serviço pago com disco persistente. O disco preserva o banco de dados entre reinicializações.
7. Aguarde a publicação e copie o endereço terminado em `.onrender.com`.
8. Acesse `/admin.html`, entre como `administrador` e troque a senha temporária.

## Segunda etapa: frontend no Netlify

Depois que o backend estiver funcionando, informe seu endereço HTTPS para que seja gerado o pacote final do Netlify. Ele incluirá uma regra `_redirects` semelhante a:

```text
/api/* https://SEU-BACKEND.onrender.com/api/:splat 200
```

Sem essa URL, calendário, login, notas, ranking e administração não funcionam no endereço do Netlify.

## Dados existentes

O banco `data/notas.db` não acompanha o pacote por segurança. Não o envie ao GitHub. Caso seja necessário migrar cadastros e notas já existentes, transfira o banco diretamente para o disco persistente por um canal protegido.
