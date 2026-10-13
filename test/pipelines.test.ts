import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Registro } from '../src/format';
import { cirurgias } from '../src/pipelines/cirurgias';
import { externa } from '../src/pipelines/externa';
import { interna } from '../src/pipelines/interna';
import { particulares } from '../src/pipelines/particulares';

const AGORA = '13/10/2026 10:00:00';

const registroInterna: Registro = {
  id: 1001,
  title: 'Maria Souza',
  mainphone: '5538999990000',
  mainmail: 'maria@ex.com',
  fkStage: 7,
  createdAt: '2026-03-05T02:30:00.000Z',
  tags: [32],
  formsdata: { '53461550': 'Alta', b14f9c60: 123456, f8ff2d920: '2026-04-10T00:00:00.000Z' },
};

describe('Autorização Interna', () => {
  it('monta a linha completa', () => {
    const l = interna.montarLinha(registroInterna, AGORA);
    assert.equal(l.id, '1001');
    assert.equal(l.nome, 'Maria Souza');
    assert.equal(l.prioridade, 'Alta');
    assert.equal(l.numero_guia, '123456');
    assert.equal(l.created_at, '04/03/2026');
    assert.equal(l.updated_at, AGORA);
    assert.equal(l.etapa, 7);
    assert.equal(l.nome_procedimento, 'Laminectomia');
    assert.equal(l.procedimento, 32);
    assert.equal(l.data_realizacao, '09/04/2026');
    assert.equal(l.status_da_guia, '');
  });

  it('trata tags desconhecidas, vazias, email nulo e data não ISO', () => {
    assert.equal(interna.montarLinha({ ...registroInterna, tags: [999] }, AGORA).nome_procedimento, 'Procedimento não encontrado');

    const semTags = interna.montarLinha({ ...registroInterna, tags: [] }, AGORA);
    assert.equal(semTags.nome_procedimento, 'ID não fornecido');
    assert.equal(semTags.procedimento, '');

    assert.equal(interna.montarLinha({ ...registroInterna, mainmail: null }, AGORA).email, '');

    const dataBr = interna.montarLinha({ ...registroInterna, formsdata: { f8ff2d920: '10/04/2026' } }, AGORA);
    assert.equal(dataBr.data_realizacao, '10/04/2026');
  });

  it('aceita formsdata ausente', () => {
    const l = interna.montarLinha({ id: 5, formsdata: null }, AGORA);
    assert.equal(l.prioridade, '');
    assert.equal(l.created_at, '');
    assert.equal(l.etapa, '');
  });
});

describe('Autorização Externa', () => {
  it('createdAt e data_entregua_guia_hospital usam a data de criação no fuso de São Paulo', () => {
    const l = externa.montarLinha({ id: 1, createdAt: '2026-07-01T01:00:00.000Z', tags: [3] }, AGORA);
    assert.equal(l.createdAt, '30/06/2026');
    assert.equal(l.data_entregua_guia_hospital, '30/06/2026');
    assert.equal(l.updatedAt, AGORA);
    assert.equal(l.nome_procedimento, 'Bloqueio com cânula');
  });
});

describe('Cirurgias e procedimentos', () => {
  it('aplica a Regra B', () => {
    assert.equal(cirurgias.montarLinha({ id: 1, tags: [] }, AGORA).nome_procedimento, 'Sem informação de procedimento');
    assert.equal(cirurgias.montarLinha({ id: 1, tags: [999] }, AGORA).nome_procedimento, 'ID 999 não mapeado');
    assert.equal(cirurgias.montarLinha({ id: 1, tags: [53] }, AGORA).nome_procedimento, 'Tratamento Cirúrgico da Eplepsia');
  });

  it('valor_orcamento e Valor_medico_inicial leem o mesmo campo', () => {
    const l = cirurgias.montarLinha({ id: 1, formsdata: { fe5e3450: '1500,00' } }, AGORA);
    assert.equal(l.Valor_medico_inicial, '1500,00');
    assert.equal(l.valor_orcamento, '1500,00');
  });
});

describe('Particulares', () => {
  it('a coluna procedimento recebe o nome do procedimento', () => {
    const l = particulares.montarLinha({ id: 1, tags: [44] }, AGORA);
    assert.equal(l.procedimento, 'BMA');
    assert.equal(l.createdat, '');
    assert.equal(l.updatedat, AGORA);
  });
});
