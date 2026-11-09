import { DateTime } from 'luxon';
import { TZ_APP } from './config';
import { txt, type Registro } from './format';
import { buscarNoMapa, nomeRegraA, nomeRegraB, type BuscaNome } from './procedimentos';

/** Linha enxuta que a extensão "Relatório Medular" recebe: só os campos que o relatório exibe ou filtra. */
export interface LinhaRelatorio {
  paciente: string;
  /** Id da etapa no CRM (fkStage). */
  etapa: number | null;
  /** Dia de criação (aaaa-mm-dd, no fuso do app): é o campo do filtro de período. */
  dia: string;
  procedimento: string;
  /** Data da realização (aaaa-mm-dd) ou vazio quando não é uma data. */
  realizacao: string;
  medico?: string;
  cirurgiao?: string;
  convenio?: string;
  hospital?: string;
  statusGuia?: string;
  valor?: number | null;
}

export interface PaginaRelatorio {
  /** Identificador usado na rota /extensao/dados/:pagina. */
  id: string;
  pipelineId: number;
  /** Etapas do CRM que não entram no relatório (nem em filtros, tabelas ou gráficos). */
  etapasOcultas?: readonly number[];
  linha(r: Registro, nomes?: BuscaNome): LinhaRelatorio;
}

// O getTags do CRM não devolve as etiquetas exclusivas de oportunidades, e esta foi renomeada lá depois do dicionário.
const RENOMEADAS_NO_CRM: Readonly<Record<string, string>> = { 24: 'RECARGA DE BOMBA' };

/** Nome do procedimento: primeiro o que veio do CRM; depois o dicionário fixo, para as etiquetas que o getTags omite. */
export function buscaDeNomes(tagsCRM: ReadonlyMap<string, string>): BuscaNome {
  return (id) => tagsCRM.get(String(id)) ?? (Object.hasOwn(RENOMEADAS_NO_CRM, String(id)) ? RENOMEADAS_NO_CRM[String(id)] : buscarNoMapa(id));
}

/** Data/hora ISO do CRM → dia aaaa-mm-dd no fuso do app. */
export function diaSP(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = DateTime.fromISO(s).setZone(TZ_APP);
  return d.isValid ? d.toFormat('yyyy-MM-dd') : '';
}

/** Datas dos formulários: ISO ou dd/mm/aaaa. Qualquer outra coisa não é data (no Looker aparece como null). */
export function diaLivre(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? diaSP(s) : '';
}

/** Valor em reais como a planilha o interpreta (USER_ENTERED, pt-BR): "1.500,00", "1500", "R$ 900". */
export function valorBR(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : null;
}

function base(r: Registro) {
  const etapa = Number(r.fkStage);
  return {
    f: r.formsdata || {},
    paciente: txt(r.title),
    etapa: Number.isFinite(etapa) ? etapa : null,
    dia: diaSP(r.createdAt),
  };
}

// Os mesmos campos de formsdata que alimentam as abas da planilha (veja src/pipelines/*).
export const PAGINAS_RELATORIO: readonly PaginaRelatorio[] = [
  {
    id: 'interna',
    pipelineId: 2,
    // O relatório só considera a partir de "Autorização em Processo": ficam de fora Autorização Pendente e Pendente Estimulação.
    etapasOcultas: [3, 105],
    linha(r, nomes) {
      const { f, ...b } = base(r);
      return { ...b, medico: txt(f['e12ff4f0']), statusGuia: txt(f['0abd3f10']), convenio: txt(f['903787f0']),
        procedimento: nomeRegraA(r.tags, nomes), realizacao: diaLivre(f['f8ff2d920']) };
    },
  },
  {
    id: 'externa',
    pipelineId: 3,
    linha(r, nomes) {
      const { f, ...b } = base(r);
      return { ...b, medico: txt(f['6119c6c0']), convenio: txt(f['fb99b880']), hospital: txt(f['c9146330']),
        statusGuia: txt(f['886b2420']), procedimento: nomeRegraA(r.tags, nomes), realizacao: diaLivre(f['f00b85310']) };
    },
  },
  {
    id: 'cirurgias',
    pipelineId: 6,
    linha(r, nomes) {
      const { f, ...b } = base(r);
      // valor_orcamento lê o mesmo campo de Valor_medico_inicial (fe5e3450), como na planilha.
      return { ...b, cirurgiao: txt(f['83429750']), hospital: txt(f['e7ff8d90']), valor: valorBR(f['fe5e3450']),
        procedimento: nomeRegraB(r.tags, nomes), realizacao: diaLivre(f['f3bee40c0']) };
    },
  },
  {
    id: 'clinica',
    pipelineId: 14,
    linha(r, nomes) {
      const { f, ...b } = base(r);
      return { ...b, cirurgiao: txt(f['c5213c60']), valor: valorBR(f['581a9f30']),
        procedimento: nomeRegraB(r.tags, nomes), realizacao: diaLivre(f['f6cd309a0']) };
    },
  },
];
