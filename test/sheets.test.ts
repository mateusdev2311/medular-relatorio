import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SheetsClient } from '../src/sheets';

interface Chamada {
  method: string;
  url: URL;
  body: any;
}

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Simula a API do Sheets: aba "Aba X" (gid 7), cabeçalho id|nome|extra|email e ids 1001, 1002. */
function simularSheets(chamadas: Chamada[]) {
  globalThis.fetch = (async (entrada: string, init: RequestInit = {}) => {
    const url = new URL(entrada);
    const method = init.method ?? 'GET';
    chamadas.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const caminho = decodeURIComponent(url.pathname);
    let resposta: unknown = {};
    if (method === 'GET' && caminho === '/v4/spreadsheets/PLANILHA') {
      resposta = { sheets: [{ properties: { sheetId: 7, title: 'Aba X' } }] };
    } else if (caminho.endsWith("'Aba X'!1:1")) {
      resposta = { values: [['id', 'nome', 'extra', 'email']] };
    } else if (caminho.endsWith("'Aba X'!A2:A")) {
      resposta = { values: [[1001, 1002]] };
    }
    return new Response(JSON.stringify(resposta), { status: 200 });
  }) as typeof fetch;
}

describe('SheetsClient.upsert', () => {
  it('usa os endpoints de valores do Sheets v4 com os parâmetros certos', async () => {
    const chamadas: Chamada[] = [];
    simularSheets(chamadas);
    const cliente = new SheetsClient('PLANILHA', { tipo: 'oauth', oauth: { clientId: 'c', clientSecret: 's', refreshToken: 'r' } });
    (cliente as any).auth = { getAccessToken: async () => ({ token: 'tok' }) };

    const res = await cliente.upsert(7, [
      { id: '1001', nome: 'Maria', email: 'm@ex.com' },
      { id: '1003', nome: 'João', email: 'j@ex.com' },
    ]);
    assert.deepEqual({ aba: res.aba, atualizados: res.atualizados, inseridos: res.inseridos }, { aba: 'Aba X', atualizados: 1, inseridos: 1 });

    const resumo = chamadas.map((c) => `${c.method} ${decodeURIComponent(c.url.pathname)}`);
    assert.deepEqual(resumo, [
      'GET /v4/spreadsheets/PLANILHA',
      "GET /v4/spreadsheets/PLANILHA/values/'Aba X'!1:1",
      "GET /v4/spreadsheets/PLANILHA/values/'Aba X'!A2:A",
      'POST /v4/spreadsheets/PLANILHA/values:batchUpdate',
      "POST /v4/spreadsheets/PLANILHA/values/'Aba X'!A1:append",
    ]);

    assert.equal(chamadas[0].url.searchParams.get('fields'), 'sheets.properties(sheetId,title)');
    assert.equal(chamadas[2].url.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE');
    assert.equal(chamadas[2].url.searchParams.get('majorDimension'), 'COLUMNS');

    assert.deepEqual(chamadas[3].body, {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: "'Aba X'!A2:B2", values: [['1001', 'Maria']] },
        { range: "'Aba X'!D2:D2", values: [['m@ex.com']] },
      ],
    });

    assert.equal(chamadas[4].url.searchParams.get('valueInputOption'), 'USER_ENTERED');
    assert.equal(chamadas[4].url.searchParams.get('insertDataOption'), 'INSERT_ROWS');
    assert.deepEqual(chamadas[4].body, { majorDimension: 'ROWS', values: [['1003', 'João', '', 'j@ex.com']] });
  });
});
