import { base, dataCriacao, dataForm, txt } from '../format';
import { idProcedimento, nomeRegraA } from '../procedimentos';
import type { Pipeline } from './tipos';

/** Autorização Interna. */
export const interna: Pipeline = {
  nome: 'interna',
  pipelineId: 2,
  gid: 0,
  montarLinha(r, agora) {
    const { f, id, nome, telefone, email, etapa } = base(r);
    return {
      id,
      nome,
      telefone,
      email,
      prioridade: txt(f['53461550']),
      status_da_guia: txt(f['0abd3f10']),
      possui_opme: txt(f['77b3fdc0']),
      data_da_solicitacao: txt(f['84d4cc10']),
      convenio_associado: txt(f['903787f0']),
      numero_guia: txt(f['b14f9c60']),
      medico_responsavel: txt(f['e12ff4f0']),
      observacoes: txt(f['b64aa2a0']),
      etapa,
      created_at: dataCriacao(r.createdAt),
      updated_at: agora,
      procedimento: idProcedimento(r.tags),
      nome_procedimento: nomeRegraA(r.tags),
      data_realizacao: dataForm(f['f8ff2d920']),
    };
  },
};
