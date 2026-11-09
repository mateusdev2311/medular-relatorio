import { timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Registro } from './format';
import { buscaDeNomes, PAGINAS_RELATORIO } from './relatorio';

/**
 * Hospeda a extensão "Relatório Medular" (manifest, página e ícones) e o endpoint de dados dela.
 * O administrador instala a extensão no sistema pela URL /extensao/manifest.json.
 */
export interface OpcoesExtensao {
  /** Pasta com manifest.json, index.html e assets/. */
  pasta: string;
  /** Token que a extensão manda no Authorization. Sem ele o endpoint de dados fica desligado. */
  token: string | undefined;
  /** URL pública do serviço (ex.: https://medular-sync.exemplo.com). Sem ela, usa o host da requisição. */
  urlPublica: string | undefined;
  buscar(pipelineId: number): Promise<Registro[]>;
  /** Etiquetas do CRM (id → nome), de onde vêm os nomes dos procedimentos. */
  buscarTags(): Promise<Map<string, string>>;
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const VALIDADE_CACHE_MS = 60_000;
const INTERVALO_MINIMO_ATUALIZAR_MS = 10_000;
const VALIDADE_TAGS_MS = 5 * 60_000;

interface Resposta {
  em: number;
  json: string;
  gzip: Buffer;
}

function lerArquivos(pasta: string): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const completo = path.join(dir, nome);
      if (statSync(completo).isDirectory()) visitar(completo);
      else if (TIPOS[path.extname(nome)]) arquivos.set(path.relative(pasta, completo).split(path.sep).join('/'), readFileSync(completo));
    }
  };
  visitar(pasta);
  return arquivos;
}

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** O sistema busca manifest e página de outra origem, então tudo em /extensao sai com CORS aberto. */
function cors(reply: FastifyReply): FastifyReply {
  return reply
    .header('Access-Control-Allow-Origin', '*')
    .header('Access-Control-Allow-Headers', 'authorization, content-type')
    .header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    .header('Access-Control-Max-Age', '600')
    .header('Cross-Origin-Resource-Policy', 'cross-origin');
}

export function registrarExtensao(app: FastifyInstance, op: OpcoesExtensao): boolean {
  if (!existsSync(path.join(op.pasta, 'manifest.json'))) {
    app.log.warn({ pasta: op.pasta }, 'pasta da extensão não encontrada: rotas /extensao desligadas');
    return false;
  }
  const arquivos = lerArquivos(op.pasta);
  const paginas = new Map(PAGINAS_RELATORIO.map((p) => [p.id, p]));
  const cache = new Map<string, Resposta>();
  const emAndamento = new Map<string, Promise<Resposta>>();

  const urlBase = (req: FastifyRequest) => `${(op.urlPublica ?? `${req.protocol}://${req.host}`).replace(/\/+$/, '')}/extensao/`;

  let tags: { em: number; mapa: Map<string, string> } | null = null;

  /** Falha ao buscar etiquetas não derruba o relatório: usa os últimos nomes conhecidos ou o dicionário fixo. */
  async function obterTags(forcar: boolean): Promise<Map<string, string>> {
    if (tags && !forcar && Date.now() - tags.em < VALIDADE_TAGS_MS) return tags.mapa;
    try {
      tags = { em: Date.now(), mapa: await op.buscarTags() };
      return tags.mapa;
    } catch (err) {
      app.log.warn({ err: { message: err instanceof Error ? err.message : String(err) } }, 'falha ao buscar etiquetas do CRM');
      return tags?.mapa ?? new Map();
    }
  }

  async function montar(id: string, forcar: boolean): Promise<Resposta> {
    const p = paginas.get(id)!;
    const inicio = Date.now();
    const nomes = buscaDeNomes(await obterTags(forcar));
    // O array do CRM não é guardado: só as linhas enxutas ficam no cache.
    const linhas = (await op.buscar(p.pipelineId)).map((r) => p.linha(r, nomes));
    const json = JSON.stringify({ pagina: id, geradoEm: new Date().toISOString(), total: linhas.length, linhas });
    app.log.info({ pagina: id, linhas: linhas.length, bytes: json.length, duracaoMs: Date.now() - inicio }, 'dados da extensão gerados');
    return { em: Date.now(), json, gzip: gzipSync(json) };
  }

  function obter(id: string, forcar: boolean): Promise<Resposta> {
    const atual = cache.get(id);
    const idade = atual ? Date.now() - atual.em : Infinity;
    if (atual && (idade < (forcar ? INTERVALO_MINIMO_ATUALIZAR_MS : VALIDADE_CACHE_MS))) return Promise.resolve(atual);
    const andamento = emAndamento.get(id);
    if (andamento) return andamento;
    const promessa = montar(id, forcar)
      .then((r) => {
        cache.set(id, r);
        return r;
      })
      .finally(() => emAndamento.delete(id));
    emAndamento.set(id, promessa);
    return promessa;
  }

  app.options('/extensao/*', async (_req, reply) => cors(reply).code(204).send());

  app.get<{ Params: { pagina: string }; Querystring: { atualizar?: string } }>('/extensao/dados/:pagina', async (req, reply) => {
    cors(reply).header('Cache-Control', 'no-store');
    if (!op.token) return reply.code(503).send({ erro: 'Extensão desligada no servidor: defina EXTENSAO_TOKEN.' });
    const auth = req.headers.authorization ?? '';
    const recebido = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!recebido || !tokenConfere(recebido, op.token)) return reply.code(401).send({ erro: 'Token da extensão ausente ou inválido.' });
    if (!paginas.has(req.params.pagina)) return reply.code(404).send({ erro: 'Página desconhecida.', validas: [...paginas.keys()] });

    try {
      const r = await obter(req.params.pagina, req.query.atualizar === '1');
      reply.type('application/json; charset=utf-8');
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) return reply.header('Content-Encoding', 'gzip').header('Vary', 'Accept-Encoding').send(r.gzip);
      return reply.send(r.json);
    } catch (err) {
      req.log.error({ pagina: req.params.pagina, err: { message: err instanceof Error ? err.message : String(err) } }, 'falha ao buscar dados da extensão');
      return reply.code(502).send({ erro: 'Não foi possível buscar os dados no CRM.' });
    }
  });

  app.get<{ Params: { '*': string } }>('/extensao/*', async (req, reply) => {
    cors(reply).header('Cache-Control', 'no-cache');
    const rel = req.params['*'] || 'index.html';
    const conteudo = arquivos.get(rel);
    if (!conteudo) return reply.code(404).send({ erro: 'Arquivo não encontrado.' });
    reply.type(TIPOS[path.extname(rel)] ?? 'application/octet-stream');
    // A página precisa saber onde está o endpoint de dados, mesmo quando o sistema a carrega por outro caminho.
    if (rel === 'index.html') return reply.send(conteudo.toString('utf8').replace('__API_BASE__', urlBase(req)));
    return reply.send(conteudo);
  });

  app.log.info({ arquivos: [...arquivos.keys()], dadosHabilitados: Boolean(op.token) }, 'extensão disponível em /extensao/manifest.json');
  return true;
}
