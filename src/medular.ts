import type { Registro } from './format';

export interface ConfigMedular {
  url: string;
  apiKey: string;
  queueId: number | string;
}

const TIMEOUT_MS = 120_000;
const ESPERA_ANTES_DE_REPETIR_MS = 5_000;

class ErroHttp extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

function podeRepetir(err: unknown): boolean {
  if (err instanceof ErroHttp) return err.status >= 500;
  // Falhas de rede do fetch chegam como TypeError; o timeout como TimeoutError/AbortError.
  return err instanceof TypeError || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
}

function interpretar(texto: string): Registro[] {
  if (!texto.trim()) return [];
  const dados: unknown = JSON.parse(texto);
  if (Array.isArray(dados)) return dados as Registro[];
  if (dados && typeof dados === 'object') return [dados as Registro];
  return [];
}

export async function buscarOportunidades(cfg: ConfigMedular, pipelineId: number): Promise<Registro[]> {
  const corpo = JSON.stringify({ queueId: cfg.queueId, apiKey: cfg.apiKey, pipelineId });
  return interpretar(await postar(cfg.url, cfg.apiKey, corpo, `pipeline ${pipelineId}`));
}

/** Etiquetas do CRM (id → nome). Atenção: o endpoint só devolve as etiquetas habilitadas para contatos. */
export async function buscarTags(cfg: ConfigMedular): Promise<Map<string, string>> {
  const url = new URL('getTags', cfg.url).href;
  const texto = await postar(url, cfg.apiKey, JSON.stringify({ queueId: cfg.queueId, apiKey: cfg.apiKey }), 'etiquetas');
  const dados: unknown = JSON.parse(texto);
  if (!Array.isArray(dados)) throw new Error('CRM devolveu etiquetas em formato inesperado.');
  const tags = new Map<string, string>();
  for (const t of dados as { id?: unknown; name?: unknown }[]) {
    const nome = typeof t?.name === 'string' ? t.name.trim() : '';
    if (t?.id !== undefined && t?.id !== null && nome) tags.set(String(t.id), nome);
  }
  return tags;
}

async function postar(url: string, apiKey: string, corpo: string, descricao: string): Promise<string> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json,text/plain,*/*',
          'Accept-Charset': 'utf-8',
        },
        body: corpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const texto = new TextDecoder('utf-8').decode(await res.arrayBuffer());
      if (!res.ok) {
        const trecho = texto.slice(0, 300).split(apiKey).join('***');
        throw new ErroHttp(res.status, `CRM respondeu HTTP ${res.status} (${descricao}): ${trecho}`);
      }
      return texto;
    } catch (err) {
      if (tentativa >= 2 || !podeRepetir(err)) throw err;
      await new Promise((r) => setTimeout(r, ESPERA_ANTES_DE_REPETIR_MS));
    }
  }
}
