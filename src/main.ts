import { timingSafeEqual } from 'node:crypto';
import { Cron } from 'croner';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { carregarConfig, type Config } from './config';
import { agoraFormatado } from './format';
import { buscarOportunidades } from './medular';
import { PIPELINES } from './pipelines';
import { SheetsClient } from './sheets';
import { Sincronizador } from './sync';

let config: Config;
try {
  config = carregarConfig();
} catch (err) {
  console.error(`[medular-sync] Configuração inválida: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const sync = new Sincronizador(PIPELINES, {
  buscar: (pipelineId) =>
    buscarOportunidades({ url: config.medularApiUrl, apiKey: config.medularApiKey, queueId: config.medularQueueId }, pipelineId),
  sheets: new SheetsClient(config.spreadsheetId, config.google),
  agora: agoraFormatado,
  log: app.log,
});

const cron = new Cron(config.cronSchedule, { timezone: config.tz, name: 'medular-sync' }, () => {
  if (!sync.disparar('cron')) app.log.warn('disparo do cron ignorado: já existe uma sincronização em andamento');
});

function tokenValido(recebido: unknown): boolean {
  if (typeof recebido !== 'string' || !config.syncToken) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(config.syncToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function exigirToken(req: FastifyRequest, reply: FastifyReply) {
  if (config.syncToken && !tokenValido(req.headers['x-sync-token'])) {
    return reply.code(401).send({ erro: 'x-sync-token ausente ou inválido' });
  }
}

app.get('/', { logLevel: 'warn' }, async () => ({ ok: true }));

app.get('/status', async () => ({
  ...sync.status(),
  proximaExecucao: cron.nextRun()?.toISOString() ?? null,
}));

app.post('/sync', { preHandler: exigirToken }, async (_req, reply) => {
  if (!sync.disparar('http')) return reply.code(409).send({ erro: 'já existe uma sincronização em andamento' });
  return reply.code(202).send({ aceito: true, pipelines: PIPELINES.map((p) => p.nome) });
});

app.post<{ Params: { pipeline: string } }>('/sync/:pipeline', { preHandler: exigirToken }, async (req, reply) => {
  const p = sync.pipeline(req.params.pipeline);
  if (!p) return reply.code(404).send({ erro: 'pipeline desconhecida', validas: PIPELINES.map((x) => x.nome) });
  if (!sync.disparar('http', [p])) return reply.code(409).send({ erro: 'já existe uma sincronização em andamento' });
  return reply.code(202).send({ aceito: true, pipelines: [p.nome] });
});

async function encerrar(sinal: string) {
  app.log.info({ sinal }, 'encerrando');
  cron.stop();
  await app.close();
  process.exit(0);
}
process.once('SIGTERM', () => void encerrar('SIGTERM'));
process.once('SIGINT', () => void encerrar('SIGINT'));

app
  .listen({ host: '0.0.0.0', port: config.port })
  .then(() => {
    app.log.info(
      { google: config.google.tipo, cron: config.cronSchedule, tz: config.tz, proximaExecucao: cron.nextRun()?.toISOString(), syncTokenAtivo: Boolean(config.syncToken) },
      'medular-sync pronto',
    );
  })
  .catch((err) => {
    app.log.error(err, 'falha ao subir o servidor');
    process.exit(1);
  });
