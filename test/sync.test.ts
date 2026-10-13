import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyBaseLogger } from 'fastify';
import type { Linha } from '../src/format';
import type { Pipeline } from '../src/pipelines';
import { Sincronizador } from '../src/sync';

const logMudo = { info() {}, warn() {}, error() {} } as unknown as FastifyBaseLogger;

const pipe = (nome: string, pipelineId: number): Pipeline => ({
  nome,
  pipelineId,
  gid: pipelineId * 10,
  montarLinha: (r) => ({ id: String(r.id) }),
});

describe('Sincronizador', () => {
  it('roda em sequência, isola falhas e bloqueia disparos simultâneos', async () => {
    const ordem: string[] = [];
    let terminou!: () => void;
    const fim = new Promise<void>((r) => (terminou = r));

    const sync = new Sincronizador([pipe('a', 1), pipe('b', 2), pipe('c', 3)], {
      log: logMudo,
      agora: () => 'agora',
      async buscar(pipelineId) {
        ordem.push(`buscar ${pipelineId}`);
        if (pipelineId === 2) throw new Error('CRM fora do ar');
        return [{ id: pipelineId }];
      },
      sheets: {
        limparCache() {},
        async upsert(gid: number, linhas: Linha[]) {
          ordem.push(`upsert ${gid}`);
          if (gid === 30) setImmediate(terminou);
          return { aba: `aba ${gid}`, atualizados: 0, inseridos: linhas.length, colunasIgnoradas: [], semId: 0, duplicadas: 0 };
        },
      },
    });

    assert.equal(sync.disparar('teste'), true);
    assert.equal(sync.disparar('teste'), false);
    await fim;
    await new Promise((r) => setImmediate(r));

    assert.deepEqual(ordem, ['buscar 1', 'upsert 10', 'buscar 2', 'buscar 3', 'upsert 30']);
    const [a, b, c] = sync.status().pipelines;
    assert.equal(a.sucesso, true);
    assert.equal(a.inseridos, 1);
    assert.equal(b.sucesso, false);
    assert.equal(b.ultimoErro?.mensagem, 'CRM fora do ar');
    assert.equal(c.sucesso, true);
    assert.equal(sync.emAndamento, false);
    assert.equal(sync.disparar('teste', [pipe('a', 1)]), true);
  });
});
