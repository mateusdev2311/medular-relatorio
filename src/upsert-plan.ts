import type { Celula, Linha } from './format';

export interface RangeValores {
  range: string;
  values: Celula[][];
}

export interface PlanoUpsert {
  /** Um item por linha existente; cada um com um range por bloco de colunas mapeadas contíguas. */
  atualizacoes: RangeValores[][];
  /** Linhas novas na ordem do cabeçalho (colunas não mapeadas ficam vazias). */
  insercoes: Celula[][];
  /** Colunas geradas que não existem no cabeçalho (ignoradas). */
  colunasIgnoradas: string[];
  /** Linhas geradas sem id (descartadas). */
  semId: number;
  /** Linhas geradas com id repetido no mesmo lote (vale a última). */
  duplicadas: number;
}

export interface EntradaPlano {
  /** Título da aba, usado na notação A1. */
  aba: string;
  /** Linha 1 da planilha. */
  cabecalho: unknown[];
  /** Coluna `id` da linha 2 em diante (o índice 0 é a linha 2). */
  idsExistentes: unknown[];
  linhas: Linha[];
  colunaId?: string;
}

export function letraColuna(indice: number): string {
  let n = indice + 1;
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

export function abaA1(aba: string): string {
  return `'${aba.replace(/'/g, "''")}'`;
}

/** Mapa nome do cabeçalho (com trim) → índice da coluna. Em nomes repetidos, vale o primeiro. */
export function indicesDoCabecalho(cabecalho: unknown[]): Map<string, number> {
  const indices = new Map<string, number>();
  cabecalho.forEach((h, i) => {
    const nome = String(h ?? '').trim();
    if (nome && !indices.has(nome)) indices.set(nome, i);
  });
  return indices;
}

/** Agrupa índices ordenados em blocos contíguos: [0,1,3] → [[0,1],[3]]. */
function blocosContiguos(indices: number[]): number[][] {
  const blocos: number[][] = [];
  for (const i of indices) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo[ultimo.length - 1] === i - 1) ultimo.push(i);
    else blocos.push([i]);
  }
  return blocos;
}

/**
 * Planeja o "append or update" casando pela coluna id, sem fazer nenhuma requisição.
 * Atualizações escrevem só as colunas mapeadas (agrupadas em ranges contíguos), para não
 * sobrescrever colunas da planilha que não são do serviço.
 */
export function planejarUpsert({ aba, cabecalho, idsExistentes, linhas, colunaId = 'id' }: EntradaPlano): PlanoUpsert {
  const indices = indicesDoCabecalho(cabecalho);
  if (!indices.has(colunaId)) {
    throw new Error(`A aba "${aba}" não tem a coluna "${colunaId}" no cabeçalho.`);
  }
  if (linhas.length === 0) return { atualizacoes: [], insercoes: [], colunasIgnoradas: [], semId: 0, duplicadas: 0 };

  const chavesGeradas = new Set<string>();
  for (const linha of linhas) for (const chave of Object.keys(linha)) chavesGeradas.add(chave);

  const colunasIgnoradas = [...chavesGeradas].filter((c) => !indices.has(c));
  const mapeadas = [...chavesGeradas]
    .filter((c) => indices.has(c))
    .map((nome) => ({ nome, indice: indices.get(nome)! }))
    .sort((a, b) => a.indice - b.indice);
  const nomePorIndice = new Map(mapeadas.map((m) => [m.indice, m.nome]));
  const blocos = blocosContiguos(mapeadas.map((m) => m.indice));
  const ultimaMapeada = mapeadas[mapeadas.length - 1].indice;

  const linhaDaPlanilha = new Map<string, number>();
  idsExistentes.forEach((v, i) => {
    const id = String(v ?? '').trim();
    if (id && !linhaDaPlanilha.has(id)) linhaDaPlanilha.set(id, i + 2);
  });

  // Dedup por id: vale a última ocorrência, na posição da primeira.
  const porId = new Map<string, Linha>();
  let semId = 0;
  let duplicadas = 0;
  for (const linha of linhas) {
    const id = String(linha[colunaId] ?? '').trim();
    if (!id) {
      semId++;
      continue;
    }
    if (porId.has(id)) duplicadas++;
    porId.set(id, linha);
  }

  const valor = (linha: Linha, indice: number): Celula => {
    const nome = nomePorIndice.get(indice);
    return nome === undefined ? '' : (linha[nome] ?? '');
  };

  const atualizacoes: RangeValores[][] = [];
  const insercoes: Celula[][] = [];
  for (const [id, linha] of porId) {
    const numero = linhaDaPlanilha.get(id);
    if (numero === undefined) {
      const nova: Celula[] = [];
      for (let i = 0; i <= ultimaMapeada; i++) nova.push(valor(linha, i));
      insercoes.push(nova);
      continue;
    }
    atualizacoes.push(
      blocos.map((bloco) => ({
        range: `${abaA1(aba)}!${letraColuna(bloco[0])}${numero}:${letraColuna(bloco[bloco.length - 1])}${numero}`,
        values: [bloco.map((i) => valor(linha, i))],
      })),
    );
  }

  return { atualizacoes, insercoes, colunasIgnoradas, semId, duplicadas };
}
