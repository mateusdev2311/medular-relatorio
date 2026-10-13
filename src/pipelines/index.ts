import { cirurgias } from './cirurgias';
import { externa } from './externa';
import { interna } from './interna';
import { particulares } from './particulares';
import type { Pipeline } from './tipos';

export type { Pipeline } from './tipos';

/** Ordem de execução do sync completo. Para uma pipeline nova: crie o arquivo e acrescente aqui. */
export const PIPELINES: readonly Pipeline[] = [interna, externa, cirurgias, particulares];
