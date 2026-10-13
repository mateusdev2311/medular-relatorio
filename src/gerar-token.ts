/**
 * Gera o GOOGLE_REFRESH_TOKEN para o modo OAuth (só é preciso rodar uma vez).
 *
 *   npm run build && npm run gerar-token
 *
 * Lê GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET do .env, sobe um servidor local para receber o retorno
 * do Google, imprime a URL de autorização e, depois do login, grava o refresh token no .env.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { OAuth2Client } from 'google-auth-library';

const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets';
const ARQUIVO_ENV = '.env';
const TEMPO_LIMITE_MS = 10 * 60_000;

function salvarNoEnv(nome: string, valor: string): boolean {
  if (!existsSync(ARQUIVO_ENV)) return false;
  const linhas = readFileSync(ARQUIVO_ENV, 'utf8').split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(`${nome}=`));
  if (i >= 0) linhas[i] = `${nome}=${valor}`;
  else linhas.splice(linhas[linhas.length - 1] === '' ? linhas.length - 1 : linhas.length, 0, `${nome}=${valor}`);
  writeFileSync(ARQUIVO_ENV, linhas.join('\n'));
  return true;
}

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (no .env ou no ambiente).');
  process.exit(1);
}

const porta = Number(process.env.OAUTH_PORTA ?? 53682);
const redirectUri = `http://localhost:${porta}/oauth2callback`;
const cliente = new OAuth2Client({ clientId, clientSecret, redirectUri });
const state = randomBytes(16).toString('hex');

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', redirectUri);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }
  const responder = (status: number, msg: string) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(msg);
  };

  if (url.searchParams.get('state') !== state) return responder(400, 'state inválido; rode o script de novo.');
  const erro = url.searchParams.get('error');
  if (erro) {
    responder(400, `O Google recusou a autorização: ${erro}`);
    console.error(`Autorização recusada: ${erro}`);
    process.exit(1);
  }

  try {
    const { tokens } = await cliente.getToken(url.searchParams.get('code') ?? '');
    if (!tokens.refresh_token) {
      responder(500, 'O Google não devolveu refresh token. Veja o terminal.');
      console.error('Sem refresh_token na resposta. Remova o acesso do app em https://myaccount.google.com/permissions e rode de novo.');
      process.exit(1);
    }
    responder(200, 'Pronto! Refresh token gerado. Pode fechar esta aba e voltar ao terminal.');
    const salvo = salvarNoEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log(salvo ? `Gravado em ${ARQUIVO_ENV}.` : `Não há ${ARQUIVO_ENV} aqui: copie a linha acima para as variáveis do deploy.`);
    process.exit(0);
  } catch (err) {
    responder(500, 'Falha ao trocar o código pelo token. Veja o terminal.');
    console.error('Falha ao trocar o código pelo token:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
});

servidor.listen(porta, '127.0.0.1', () => {
  const urlAutorizacao = cliente.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // força o Google a devolver o refresh token mesmo se o app já foi autorizado antes
    scope: [ESCOPO],
    state,
  });
  console.log(`Redirect URI usada: ${redirectUri}`);
  console.log('Abra esta URL no navegador e entre com uma conta que tenha acesso de Editor à planilha:\n');
  console.log(urlAutorizacao + '\n');
  console.log('Aguardando a autorização...');
});

setTimeout(() => {
  console.error('Tempo esgotado esperando a autorização.');
  process.exit(1);
}, TEMPO_LIMITE_MS).unref();
