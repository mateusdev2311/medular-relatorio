import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { letraColuna, planejarUpsert } from '../src/upsert-plan';

describe('planejarUpsert', () => {
  const cabecalho = ['id', ' nome ', 'extra_manual', 'email'];

  it('separa atualização e inserção sem tocar na coluna extra', () => {
    const plano = planejarUpsert({
      aba: 'Autorização Interna',
      cabecalho,
      idsExistentes: ['1001', '1002'],
      linhas: [
        { id: '1001', nome: 'Maria', email: 'maria@ex.com' },
        { id: '1003', nome: 'João', email: 'joao@ex.com' },
      ],
    });

    assert.deepEqual(plano.atualizacoes, [
      [
        { range: "'Autorização Interna'!A2:B2", values: [['1001', 'Maria']] },
        { range: "'Autorização Interna'!D2:D2", values: [['maria@ex.com']] },
      ],
    ]);
    assert.deepEqual(plano.insercoes, [['1003', 'João', '', 'joao@ex.com']]);
    assert.deepEqual(plano.colunasIgnoradas, []);
  });

  it('casa ids numéricos da planilha e ignora colunas fora do cabeçalho', () => {
    const plano = planejarUpsert({
      aba: "Aba d'água",
      cabecalho,
      idsExistentes: [1001, '', 1002],
      linhas: [{ id: '1002', nome: 'X', email: 'x@ex.com', nao_existe: 'y' }],
    });
    assert.equal(plano.atualizacoes.length, 1);
    assert.equal(plano.atualizacoes[0][0].range, "'Aba d''água'!A4:B4");
    assert.deepEqual(plano.colunasIgnoradas, ['nao_existe']);
    assert.equal(plano.insercoes.length, 0);
  });

  it('descarta linhas sem id e deduplica ids repetidos', () => {
    const plano = planejarUpsert({
      aba: 'A',
      cabecalho,
      idsExistentes: [],
      linhas: [
        { id: '', nome: 'sem id', email: '' },
        { id: '7', nome: 'primeira', email: '' },
        { id: '7', nome: 'segunda', email: '' },
      ],
    });
    assert.equal(plano.semId, 1);
    assert.equal(plano.duplicadas, 1);
    assert.deepEqual(plano.insercoes, [['7', 'segunda', '', '']]);
  });

  it('exige a coluna id no cabeçalho', () => {
    assert.throws(() => planejarUpsert({ aba: 'A', cabecalho: ['nome'], idsExistentes: [], linhas: [] }), /coluna "id"/);
  });

  it('converte índices em letras de coluna', () => {
    assert.equal(letraColuna(0), 'A');
    assert.equal(letraColuna(25), 'Z');
    assert.equal(letraColuna(26), 'AA');
    assert.equal(letraColuna(701), 'ZZ');
    assert.equal(letraColuna(702), 'AAA');
  });
});
