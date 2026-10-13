import { DateTime, Settings } from 'luxon';
import { TZ_APP } from './config';

// O container roda em UTC e o n8n rodava em São Paulo: datas sem fuso dependem desta zona padrão.
Settings.defaultZone = TZ_APP;

export type Celula = string | number | boolean;
export type Linha = Record<string, Celula>;

/** Registro de oportunidade como vem do CRM. */
export interface Registro {
  id?: unknown;
  title?: unknown;
  mainphone?: unknown;
  mainmail?: unknown;
  fkStage?: unknown;
  createdAt?: unknown;
  tags?: unknown;
  formsdata?: Record<string, unknown> | null;
  [campo: string]: unknown;
}

export function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Mantém números e booleanos como estão (o n8n gravava assim); o resto vira texto. */
export function celula(v: unknown): Celula {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return txt(v);
}

export function dataCriacao(v: unknown): string {
  if (!v) return '';
  return DateTime.fromISO(String(v)).setZone(TZ_APP).toFormat('dd/MM/yyyy');
}

export function dataForm(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const data = DateTime.fromISO(String(v));
  return data.isValid ? data.toFormat('dd/MM/yyyy') : String(v);
}

/** Calculado uma vez por execução de pipeline. */
export function agoraFormatado(): string {
  return DateTime.now().setZone(TZ_APP).toFormat('dd/MM/yyyy HH:mm:ss');
}

/** Campos comuns às quatro pipelines. `f` é o formsdata (ou objeto vazio). */
export function base(r: Registro) {
  return {
    f: r.formsdata || {},
    id: txt(r.id),
    nome: txt(r.title),
    telefone: txt(r.mainphone),
    email: txt(r.mainmail),
    etapa: celula(r.fkStage ?? ''),
  };
}
