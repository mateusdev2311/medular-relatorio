import { base, dataCriacao, txt } from '../format';
import { idProcedimento, nomeRegraB } from '../procedimentos';
import type { Pipeline } from './tipos';

/** Cirurgias e procedimentos. */
export const cirurgias: Pipeline = {
  nome: 'cirurgias',
  pipelineId: 6,
  gid: 187518574,
  montarLinha(r, agora) {
    const { f, id, nome, telefone, email, etapa } = base(r);
    return {
      id,
      nome,
      telefone,
      email,
      etapa,
      created_at: dataCriacao(r.createdAt),
      updated_at: agora,
      medico_responsavel: txt(f['6119c6c0']),
      procedimento: idProcedimento(r.tags),
      nome_procedimento: nomeRegraB(r.tags),
      '1auxiliar': txt(f['47133900']),
      cirurgiao: txt(f['83429750']),
      forma_de_pagamento: txt(f['0aaccfb0']),
      numero_nf: txt(f['6b861ce0']),
      valor_clinica_inicial: txt(f['c78426b0']),
      Valor_medico_inicial: txt(f['fe5e3450']),
      hospital: txt(f['e7ff8d90']),
      // TODO: conferir o campo de valor_orcamento (hoje lê o mesmo campo de Valor_medico_inicial, como no n8n)
      valor_orcamento: txt(f['fe5e3450']),
      guia_status: txt(f['f81243470']),
      data_realizacao: txt(f['f3bee40c0']),
    };
  },
};
