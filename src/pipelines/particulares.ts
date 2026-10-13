import { base, dataCriacao, txt } from '../format';
import { nomeRegraB } from '../procedimentos';
import type { Pipeline } from './tipos';

/** Particulares. Nesta aba a coluna `procedimento` recebe o nome do procedimento, não o id. */
export const particulares: Pipeline = {
  nome: 'particulares',
  pipelineId: 14,
  gid: 1906934168,
  montarLinha(r, agora) {
    const { f, id, nome, telefone, email, etapa } = base(r);
    return {
      id,
      nome,
      telefone,
      email,
      etapa,
      createdat: dataCriacao(r.createdAt),
      updatedat: agora,
      valor_orcamento: txt(f['581a9f30']),
      valor_com_desconto: txt(f['6003c4b0']),
      valor_opme: txt(f['65fa9010']),
      numero_nf: txt(f['69e62220']),
      data_de_faturamento: txt(f['752fb0b0']),
      cirurgiao: txt(f['c5213c60']),
      '1auxiliar': txt(f['2722ce10']),
      '2auxiliar': txt(f['4c4afb40']),
      '3auxiliar': txt(f['8602d470']),
      '4auxiliar': txt(f['ab0c7d20']),
      forma_de_pagamento: txt(f['414f9740']),
      observacao: txt(f['8c6eb350']),
      procedimento: nomeRegraB(r.tags),
      honorario_medico: txt(f['0711f1a0']),
      guia_status: txt(f['f87ee7d70']),
      data_realizacao: txt(f['f6cd309a0']),
    };
  },
};
