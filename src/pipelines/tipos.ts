import type { Linha, Registro } from '../format';

export interface Pipeline {
  /** Identificador usado nas rotas e nos logs (ex.: `interna`). */
  nome: string;
  pipelineId: number;
  /** gid da aba de destino (o título da aba pode mudar; o gid não). */
  gid: number;
  montarLinha(registro: Registro, agora: string): Linha;
}
