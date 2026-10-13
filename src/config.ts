import { IANAZone } from 'luxon';

// Lido sem validação para que format.ts e os testes não dependam das variáveis obrigatórias.
export const TZ_APP = process.env.TZ_APP?.trim() || 'America/Sao_Paulo';

export interface ContaServico {
  client_email: string;
  private_key: string;
}

export interface Config {
  medularApiKey: string;
  medularApiUrl: string;
  medularQueueId: number | string;
  spreadsheetId: string;
  contaServico: ContaServico;
  syncToken: string | undefined;
  cronSchedule: string;
  tz: string;
  port: number;
}

function valor(env: NodeJS.ProcessEnv, nome: string): string | undefined {
  const v = env[nome]?.trim();
  return v ? v : undefined;
}

function lerContaServico(bruto: string): ContaServico {
  const json = bruto.startsWith('{') ? bruto : Buffer.from(bruto, 'base64').toString('utf8');
  let conta: Partial<ContaServico>;
  try {
    conta = JSON.parse(json);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido (nem cru, nem em base64).');
  }
  if (!conta.client_email || !conta.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON precisa conter client_email e private_key.');
  }
  // Quando a chave passa por variável de ambiente, as quebras de linha às vezes chegam como "\n" literal.
  return { client_email: conta.client_email, private_key: conta.private_key.replace(/\\n/g, '\n') };
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const faltando = ['MEDULAR_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_JSON'].filter((nome) => !valor(env, nome));
  if (faltando.length) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}`);
  }

  const tz = valor(env, 'TZ_APP') ?? 'America/Sao_Paulo';
  if (!IANAZone.isValidZone(tz)) throw new Error(`TZ_APP inválido: ${tz}`);

  const port = Number(valor(env, 'PORT') ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT inválida: ${env.PORT}`);

  const queueId = valor(env, 'MEDULAR_QUEUE_ID') ?? '25';

  return {
    medularApiKey: valor(env, 'MEDULAR_API_KEY')!,
    medularApiUrl: valor(env, 'MEDULAR_API_URL') ?? 'https://medular.atenderbem.com/int/getPipeOpportunities',
    medularQueueId: /^\d+$/.test(queueId) ? Number(queueId) : queueId,
    spreadsheetId: valor(env, 'SPREADSHEET_ID') ?? '17VKwnesDgkPYrres2DFyE4oxLlt7qX3DNzZTcGQDgOE',
    contaServico: lerContaServico(valor(env, 'GOOGLE_SERVICE_ACCOUNT_JSON')!),
    syncToken: valor(env, 'SYNC_TOKEN'),
    cronSchedule: valor(env, 'CRON_SCHEDULE') ?? '0 5,14 * * *',
    tz,
    port,
  };
}
