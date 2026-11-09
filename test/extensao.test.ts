import assert from 'node:assert/strict';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registrarExtensao } from '../src/extensao';
import type { Registro } from '../src/format';
import { diaLivre, diaSP, PAGINAS_RELATORIO, valorBR } from '../src/relatorio';

// Os testes rodam de dist-test/test; a pasta da extensão fica na raiz do projeto.
const PASTA = path.resolve(__dirname, '..', '..', 'extensao-relatorio');

describe('transformações do relatório', () => {
  it('converte datas para o dia em São Paulo', () => {
    assert.equal(diaSP('2026-03-05T02:30:00.000Z'), '2026-03-04');
    assert.equal(diaSP('2026-04-10'), '2026-04-10');
    assert.equal(diaSP(''), '');
    assert.equal(diaLivre('2026-09-01T03:00:00.000Z'), '2026-09-01');
    assert.equal(diaLivre('21/10/2026'), '2026-10-21');
    assert.equal(diaLivre('Invalid DateTime'), '');
  });

  it('lê valores em reais como a planilha', () => {
    assert.equal(valorBR('1.500,00'), 1500);
    assert.equal(valorBR('1500'), 1500);
    assert.equal(valorBR('55.000'), 55000);
    assert.equal(valorBR('R$ 900,50'), 900.5);
    assert.equal(valorBR('00'), 0);
    assert.equal(valorBR(''), null);
    assert.equal(valorBR('a combinar'), null);
  });

  it('monta a linha da Autorização Interna com os campos do relatório', () => {
    const interna = PAGINAS_RELATORIO.find((p) => p.id === 'interna')!;
    const l = interna.linha({
      title: 'Maria', fkStage: 83, createdAt: '2026-03-05T02:30:00.000Z', tags: [32],
      formsdata: { e12ff4f0: 'Dr. X', '0abd3f10': 'Autorizada', '903787f0': 'AMIL', f8ff2d920: '2026-04-10T03:00:00.000Z' },
    });
    assert.deepEqual(l, {
      paciente: 'Maria', etapa: 83, dia: '2026-03-04', medico: 'Dr. X', statusGuia: 'Autorizada', convenio: 'AMIL',
      procedimento: 'Laminectomia', realizacao: '2026-04-10',
    });
  });

  it('usa a Regra B e o valor do orçamento em Cirurgias', () => {
    const cirurgias = PAGINAS_RELATORIO.find((p) => p.id === 'cirurgias')!;
    const l = cirurgias.linha({ title: 'João', fkStage: 25, tags: [999], formsdata: { fe5e3450: '25.000,00', 83429750: 'Dr. Y' } });
    assert.equal(l.procedimento, 'ID 999 não mapeado');
    assert.equal(l.valor, 25000);
    assert.equal(l.cirurgiao, 'Dr. Y');
    assert.equal(l.hospital, '');
  });
});

describe('rotas da extensão', () => {
  const registros: Registro[] = [{ title: 'Ana', fkStage: 98, createdAt: '2026-10-01T12:00:00.000Z', tags: [44], formsdata: { '581a9f30': '3000' } }];

  async function montarApp(token: string | undefined) {
    const app = Fastify();
    const chamadas: number[] = [];
    const ok = registrarExtensao(app, {
      pasta: PASTA,
      token,
      urlPublica: 'https://sync.exemplo.com/',
      buscar: async (id) => {
        chamadas.push(id);
        return registros;
      },
    });
    assert.equal(ok, true);
    await app.ready();
    return { app, chamadas };
  }

  it('serve o manifest e a página com CORS aberto e o endereço da API embutido', async () => {
    const { app } = await montarApp('segredo');
    const manifest = await app.inject({ method: 'GET', url: '/extensao/manifest.json' });
    assert.equal(manifest.statusCode, 200);
    assert.equal(manifest.headers['access-control-allow-origin'], '*');
    const m = manifest.json();
    assert.equal(m.contributions[0].url, 'index.html');
    assert.deepEqual(m.contributions[0].visibility, { userTypes: [0] });

    const pagina = await app.inject({ method: 'GET', url: '/extensao/index.html' });
    assert.equal(pagina.statusCode, 200);
    assert.match(String(pagina.headers['content-type']), /text\/html/);
    assert.match(pagina.body, /content="https:\/\/sync\.exemplo\.com\/extensao\/"/);

    const icone = await app.inject({ method: 'GET', url: '/extensao/assets/icone.svg' });
    assert.equal(icone.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/extensao/README.md' })).statusCode, 404);
    await app.close();
  });

  it('protege os dados com o token e responde o preflight', async () => {
    const { app, chamadas } = await montarApp('segredo');
    const preflight = await app.inject({ method: 'OPTIONS', url: '/extensao/dados/clinica' });
    assert.equal(preflight.statusCode, 204);
    assert.match(String(preflight.headers['access-control-allow-headers']), /authorization/);

    assert.equal((await app.inject({ method: 'GET', url: '/extensao/dados/clinica' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/extensao/dados/clinica', headers: { authorization: 'Bearer errado' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/extensao/dados/nada', headers: { authorization: 'Bearer segredo' } })).statusCode, 404);

    const r = await app.inject({ method: 'GET', url: '/extensao/dados/clinica', headers: { authorization: 'Bearer segredo', 'accept-encoding': 'gzip' } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-encoding'], 'gzip');
    const corpo = JSON.parse(gunzipSync(r.rawPayload).toString('utf8'));
    assert.equal(corpo.total, 1);
    assert.deepEqual(corpo.linhas[0], { paciente: 'Ana', etapa: 98, dia: '2026-10-01', cirurgiao: '', valor: 3000, procedimento: 'BMA', realizacao: '' });

    // Segunda leitura vem do cache: o CRM foi consultado uma vez só, no funil 14.
    await app.inject({ method: 'GET', url: '/extensao/dados/clinica', headers: { authorization: 'Bearer segredo' } });
    assert.deepEqual(chamadas, [14]);
    await app.close();
  });

  it('desliga os dados quando EXTENSAO_TOKEN não está definido', async () => {
    const { app } = await montarApp(undefined);
    const r = await app.inject({ method: 'GET', url: '/extensao/dados/interna', headers: { authorization: 'Bearer x' } });
    assert.equal(r.statusCode, 503);
    await app.close();
  });
});
