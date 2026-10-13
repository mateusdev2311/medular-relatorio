import { celula, type Celula } from './format';

/** Id da tag do CRM → nome do procedimento. Grafias mantidas exatamente como no n8n. */
export const MAPA: Readonly<Record<string, string>> = {
  3: 'Bloqueio com cânula',
  4: 'Bloqueio sem cânula',
  5: 'Bloqueio com ácido',
  6: 'Bloqueio sem ácido',
  7: 'Venoso',
  8: 'Estimulação elétrica',
  9: 'Estimulação magnética craniana',
  10: 'Estimulação magnética periferica',
  11: 'Laser',
  12: 'TOC',
  13: 'Endoscopia coluna',
  14: 'Artrodese Alif',
  15: 'Artrodese Olif',
  16: 'Artrodese Xlif',
  17: 'Escoliose',
  18: 'Parkinson',
  19: 'Neurocirurgia',
  20: 'Denervação com cânula',
  21: 'Denervação sem cânula',
  22: 'Rizotomia Facetas',
  23: 'Estimulador medular',
  24: 'Bomba de morfina',
  25: 'DRG',
  28: 'Tumor cerebral',
  29: 'Artrodese cervical',
  30: 'Tumor de coluna',
  31: 'Bloqueio peridural',
  32: 'Laminectomia',
  33: 'Artrodese via posterior',
  34: 'Rizotomia Trigêmio',
  35: 'Complementação de honorário',
  36: 'Pacote dor crônica',
  37: 'Implante de eletrodo medular',
  38: 'Neurólise',
  39: 'Descompressão Medular',
  40: 'Disrafismo',
  41: 'Fístula',
  42: 'MKT - Receptivo – CEU',
  43: 'MKT - Resgate – CEU',
  44: 'BMA',
  45: 'Pseudoartrose de coluna',
  46: 'Osteotomia de coluna',
  47: 'TTO Cirurgico de fratura de coluna',
  48: 'NP',
  49: 'Revisão de Sistema',
  50: 'Estimulação Elétrica Craniana',
  51: 'Estimulação Elétrica Periférica',
  52: 'Fisioterapia',
  53: 'Tratamento Cirúrgico da Eplepsia',
  54: 'CIRURGIA DE CISTO ARTROSSINOVIAL',
  55: 'Administração de Medicamentos',
  56: 'Viscossuplementação com ácido hialuronico - em quadril direito',
  57: 'Viscossuplementação com ácido hialuronico - em quadril esquerdo',
  58: 'Viscossuplementação com ácido hialuronico - em qualquer articulação',
  59: 'Biopsia de coluna',
  60: 'biportal',
  61: 'biportal',
  62: 'biportal',
  63: 'BLOQUEIO OCCIPITAL',
  64: 'INFILTRAÇÃO DE JOELHO',
  65: 'TUNEL DO CARPO',
  66: 'REGENERATIVA BMA',
  67: 'CIRURGIA INTRACRANIANA POR VIA ENDOSCOPICA',
  68: 'ESTENOSE DE CANAL',
  69: 'TAP TEST',
  70: 'INFILTRAÇÃO PERIDURAL',
};

function buscar(id: unknown): string | undefined {
  return Object.hasOwn(MAPA, String(id)) ? MAPA[String(id)] : undefined;
}

/** Id do procedimento (primeira tag), usado na coluna `procedimento`. */
export function idProcedimento(tags: unknown): Celula {
  return Array.isArray(tags) ? celula(tags[0] ?? '') : '';
}

/** Regra A (Autorização Interna e Externa). */
export function nomeRegraA(tags: unknown): string {
  if (!Array.isArray(tags) || tags.length === 0) return 'ID não fornecido';
  return buscar(tags[0]) || 'Procedimento não encontrado';
}

/** Regra B (Cirurgias e Particulares). */
export function nomeRegraB(tags: unknown): string {
  const id = Array.isArray(tags) ? tags[0] : tags;
  if (id === null || id === undefined) return 'Sem informação de procedimento';
  return buscar(id) || `ID ${id} não mapeado`;
}
