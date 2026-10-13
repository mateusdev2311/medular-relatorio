import { base, dataCriacao, txt } from '../format';
import { idProcedimento, nomeRegraA } from '../procedimentos';
import type { Pipeline } from './tipos';

// TODO: o campo correto provavelmente é f['5b899400']
// Com `false`, data_entregua_guia_hospital recebe a data de criação, como no n8n atual.
export const USAR_CAMPO_REAL_ENTREGA_GUIA = false;

/** Autorização Externa. */
export const externa: Pipeline = {
  nome: 'externa',
  pipelineId: 3,
  gid: 1917362983,
  montarLinha(r, agora) {
    const { f, id, nome, telefone, email, etapa } = base(r);
    const criacao = dataCriacao(r.createdAt);
    return {
      id,
      nome,
      telefone,
      email,
      etapa,
      createdAt: criacao,
      updatedAt: agora,
      data_entregua_guia_hospital: USAR_CAMPO_REAL_ENTREGA_GUIA ? txt(f['5b899400']) : criacao,
      medico_responsavel: txt(f['6119c6c0']),
      observacoes: txt(f['62f19a60']),
      status_da_guia: txt(f['886b2420']),
      paciente_particular: txt(f['98c67ef0']),
      possui_opme: txt(f['c4d43aa0']),
      hospital: txt(f['c9146330']),
      convenio_associado: txt(f['fb99b880']),
      numero_de_protocolo: txt(f['fdfef460']),
      procedimento: idProcedimento(r.tags),
      nome_procedimento: nomeRegraA(r.tags),
      data_realizacao: txt(f['f00b85310']),
    };
  },
};
