# medular-sync

Microserviço que substitui o workflow n8n **"Relatorio Medular"**. Ele busca as oportunidades de 4 pipelines do CRM Medular, transforma cada registro numa linha e grava (atualiza ou insere, casando pela coluna `id`) em 4 abas de uma planilha do Google Sheets.

| Pipeline | `pipelineId` | Aba (gid) |
|---|---|---|
| `interna`: Autorização Interna | 2 | 0 |
| `externa`: Autorização Externa | 3 | 1917362983 |
| `cirurgias`: Cirurgias e procedimentos | 6 | 187518574 |
| `particulares`: Particulares | 14 | 1906934168 |

As pipelines rodam **uma de cada vez**. Para escrever na planilha, o serviço lê só o cabeçalho e a coluna `id`, faz um `batchUpdate` (em lotes de 500 linhas) com as colunas que ele mesmo preenche e um único `append` com as linhas novas. As colunas da planilha que o serviço não preenche nunca são sobrescritas, e as linhas cujo id não veio do CRM não são apagadas.

## Variáveis de ambiente

| Variável | Obrigatória | Padrão |
|---|---|---|
| `MEDULAR_API_KEY` | sim | |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | sim* | JSON cru ou em base64 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | sim* | alternativa à conta de serviço (OAuth de usuário) |
| `MEDULAR_API_URL` | não | `https://medular.atenderbem.com/int/getPipeOpportunities` |
| `MEDULAR_QUEUE_ID` | não | `25` |
| `SPREADSHEET_ID` | não | `17VKwnesDgkPYrres2DFyE4oxLlt7qX3DNzZTcGQDgOE` |
| `SYNC_TOKEN` | não | quando definido, as rotas de disparo exigem o header `x-sync-token` |
| `CRON_SCHEDULE` | não | `0 5,14 * * *` (5h e 14h) |
| `TZ_APP` | não | `America/Sao_Paulo` (fuso do cron e das datas) |
| `PORT` | não | `3000` |

\* Informe a conta de serviço **ou** as três variáveis de OAuth. Se as duas estiverem definidas, vale a conta de serviço.

Veja o `.env.example`. Se uma variável obrigatória faltar, o serviço encerra na inicialização com uma mensagem clara.

## Conta de serviço do Google

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou escolha um projeto e ative a **Google Sheets API** (APIs e serviços → Biblioteca).
2. Em **IAM e administrador → Contas de serviço**, crie uma conta de serviço. Ela não precisa de nenhum papel no projeto.
3. Na conta criada, abra **Chaves → Adicionar chave → Criar nova chave → JSON** e baixe o arquivo.
4. **Abra a planilha, clique em Compartilhar e adicione o e-mail da conta de serviço** (o `client_email` do JSON, algo como `nome@projeto.iam.gserviceaccount.com`) **como Editor**. Sem isso, o Google responde 403.
5. Coloque o conteúdo do JSON em `GOOGLE_SERVICE_ACCOUNT_JSON`. Se o painel de deploy atrapalhar com aspas e quebras de linha, use o arquivo em base64:
   ```bash
   base64 -w0 conta-servico.json        # Linux
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("conta-servico.json"))   # PowerShell
   ```

## Alternativa: OAuth de usuário

O serviço grava na planilha em nome de uma pessoa, usando um OAuth Client ID (`...apps.googleusercontent.com` + `GOCSPX-...`).

1. No Google Cloud Console, em **APIs e serviços → Credenciais**, abra o OAuth Client ID. Se o tipo for **Aplicativo da Web**, adicione `http://localhost:53682/oauth2callback` em *URIs de redirecionamento autorizados*. Se for **App para computador**, não é preciso configurar nada.
2. Ative a **Google Sheets API** no mesmo projeto.
3. Ponha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`, rode `npm run build && npm run gerar-token`, abra a URL impressa e entre com uma conta que tenha acesso de Editor à planilha. O refresh token é gravado no `.env`.
4. No deploy, defina as três variáveis `GOOGLE_*`.

**Atenção:** se a *tela de consentimento OAuth* estiver com status **Testando**, o Google invalida o refresh token em **7 dias**, e o sync para de funcionar com o erro `invalid_grant`. Para uso contínuo, publique o app (status **Em produção**) ou use a conta de serviço.

## Rotas

| Rota | Descrição |
|---|---|
| `GET /` | Health check: `{ "ok": true }`, sem depender do Google nem do CRM |
| `GET /status` | Por pipeline: início, fim, duração, lidos, atualizados, inseridos, sucesso e último erro. Mostra também se há sync em andamento e a próxima execução do cron |
| `POST /sync` | Dispara as 4 pipelines em segundo plano e responde `202` |
| `POST /sync/:pipeline` | Dispara uma só (`interna`, `externa`, `cirurgias` ou `particulares`) e responde `202` |

Se já houver uma sincronização rodando, as rotas de disparo respondem `409`, e o cron só registra um aviso.

### Disparo manual

```bash
curl -X POST https://SEU-HOST/sync -H "x-sync-token: $SYNC_TOKEN"
curl -X POST https://SEU-HOST/sync/cirurgias -H "x-sync-token: $SYNC_TOKEN"
curl https://SEU-HOST/status
```

## Desenvolvimento

```bash
npm install
npm test          # testes com node:test
npm run build     # compila para dist/
npm start         # node dist/main.js (lê as variáveis do ambiente)
npm run dev       # build + roda lendo o .env local
```

Os logs saem em JSON (Fastify/pino). Ao fim de cada pipeline, o serviço registra uma linha `pipeline sincronizada` com `lidos`, `atualizados`, `inseridos` e `duracaoMs`.

### Nova pipeline

Crie `src/pipelines/<nome>.ts` exportando `{ nome, pipelineId, gid, montarLinha(registro, agora) }`, seguindo os existentes, e acrescente o objeto na lista de `src/pipelines/index.ts`. As chaves do objeto devolvido por `montarLinha` precisam ser iguais aos cabeçalhos da aba.

## Pendências herdadas do n8n

Os pontos abaixo reproduzem o comportamento do n8n de propósito e estão marcados com `TODO` no código:

- **Externa**: `data_entregua_guia_hospital` recebe a data de criação. O campo correto provavelmente é `f['5b899400']`. Para usá-lo, mude `USAR_CAMPO_REAL_ENTREGA_GUIA` para `true` em `src/pipelines/externa.ts`.
- **Cirurgias**: `valor_orcamento` lê o mesmo campo de `Valor_medico_inicial` (`fe5e3450`).
