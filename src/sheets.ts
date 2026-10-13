import { JWT, OAuth2Client } from 'google-auth-library';
import type { CredencialGoogle } from './config';
import type { Linha } from './format';
import { abaA1, indicesDoCabecalho, letraColuna, planejarUpsert, type RangeValores } from './upsert-plan';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets';
const LINHAS_POR_LOTE = 500;
const TENTATIVAS = 4;
const TIMEOUT_MS = 120_000;

export interface ResultadoUpsert {
  aba: string;
  atualizados: number;
  inseridos: number;
  colunasIgnoradas: string[];
  semId: number;
  duplicadas: number;
}

interface Requisicao {
  method?: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: unknown;
  /** false para operações não idempotentes (append): só repete em 429, quando o Google garante que nada foi gravado. */
  idempotente?: boolean;
}

class ErroSheets extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SheetsClient {
  /** Os dois clientes renovam o access token sozinhos quando ele expira. */
  private readonly auth: JWT | OAuth2Client;
  private titulos: Map<number, string> | null = null;

  constructor(private readonly spreadsheetId: string, credencial: CredencialGoogle) {
    if (credencial.tipo === 'conta-servico') {
      this.auth = new JWT({ email: credencial.conta.client_email, key: credencial.conta.private_key, scopes: [ESCOPO] });
    } else {
      const { clientId, clientSecret, refreshToken } = credencial.oauth;
      this.auth = new OAuth2Client({ clientId, clientSecret });
      this.auth.setCredentials({ refresh_token: refreshToken });
    }
  }

  /** Esquece os títulos das abas (chamado no início de cada sync, caso uma aba tenha sido renomeada). */
  limparCache(): void {
    this.titulos = null;
  }

  async tituloDaAba(gid: number): Promise<string> {
    if (!this.titulos) {
      const meta = await this.req<{ sheets?: { properties: { sheetId: number; title: string } }[] }>('', {
        query: { fields: 'sheets.properties(sheetId,title)' },
      });
      this.titulos = new Map((meta.sheets ?? []).map((s) => [s.properties.sheetId, s.properties.title]));
    }
    const titulo = this.titulos.get(gid);
    if (titulo === undefined) throw new Error(`Aba com gid ${gid} não encontrada na planilha.`);
    return titulo;
  }

  async upsert(gid: number, linhas: Linha[]): Promise<ResultadoUpsert> {
    const aba = await this.tituloDaAba(gid);
    const a1 = abaA1(aba);

    const cabecalho = (await this.lerValores(`${a1}!1:1`, {}))[0] ?? [];
    const indiceId = indicesDoCabecalho(cabecalho).get('id');
    if (indiceId === undefined) throw new Error(`A aba "${aba}" não tem a coluna "id" no cabeçalho.`);

    const colId = letraColuna(indiceId);
    const idsExistentes =
      (await this.lerValores(`${a1}!${colId}2:${colId}`, { majorDimension: 'COLUMNS', valueRenderOption: 'UNFORMATTED_VALUE' }))[0] ?? [];

    const plano = planejarUpsert({ aba, cabecalho, idsExistentes, linhas });

    for (let i = 0; i < plano.atualizacoes.length; i += LINHAS_POR_LOTE) {
      const data: RangeValores[] = plano.atualizacoes.slice(i, i + LINHAS_POR_LOTE).flat();
      await this.req('/values:batchUpdate', {
        method: 'POST',
        body: { valueInputOption: 'USER_ENTERED', data },
        idempotente: true,
      });
    }

    if (plano.insercoes.length) {
      await this.req(`/values/${encodeURIComponent(`${a1}!A1`)}:append`, {
        method: 'POST',
        query: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
        body: { majorDimension: 'ROWS', values: plano.insercoes },
        idempotente: false,
      });
    }

    return {
      aba,
      atualizados: plano.atualizacoes.length,
      inseridos: plano.insercoes.length,
      colunasIgnoradas: plano.colunasIgnoradas,
      semId: plano.semId,
      duplicadas: plano.duplicadas,
    };
  }

  private async lerValores(range: string, query: Record<string, string>): Promise<unknown[][]> {
    const res = await this.req<{ values?: unknown[][] }>(`/values/${encodeURIComponent(range)}`, { query });
    return res.values ?? [];
  }

  private async req<T = unknown>(caminho: string, { method = 'GET', query, body, idempotente = true }: Requisicao): Promise<T> {
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
    const url = `${API}/${this.spreadsheetId}${caminho}${qs}`;

    for (let tentativa = 1; ; tentativa++) {
      try {
        const { token } = await this.auth.getAccessToken();
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const texto = await res.text();
        if (!res.ok) throw new ErroSheets(res.status, `Google Sheets HTTP ${res.status} em ${method} ${caminho || '/'}: ${texto.slice(0, 500)}`);
        return (texto ? JSON.parse(texto) : {}) as T;
      } catch (err) {
        const status = err instanceof ErroSheets ? err.status : 0;
        const falhaDeRede = err instanceof TypeError || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
        const repetivel = status === 429 || (idempotente && (falhaDeRede || status >= 500));
        if (tentativa >= TENTATIVAS || !repetivel) throw err;
        await esperar(2 ** tentativa * 1000);
      }
    }
  }
}
