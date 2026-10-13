import type { FastifyBaseLogger } from 'fastify';
import type { Linha, Registro } from './format';
import type { Pipeline } from './pipelines';
import type { ResultadoUpsert } from './sheets';

export interface StatusPipeline {
  pipeline: string;
  pipelineId: number;
  emAndamento: boolean;
  inicio: string | null;
  fim: string | null;
  duracaoMs: number | null;
  lidos: number | null;
  atualizados: number | null;
  inseridos: number | null;
  sucesso: boolean | null;
  ultimoErro: { em: string; mensagem: string } | null;
}

export interface DependenciasSync {
  buscar(pipelineId: number): Promise<Registro[]>;
  sheets: {
    limparCache(): void;
    upsert(gid: number, linhas: Linha[]): Promise<ResultadoUpsert>;
  };
  agora(): string;
  log: FastifyBaseLogger;
}

export class Sincronizador {
  private rodando = false;
  private readonly estado = new Map<string, StatusPipeline>();

  constructor(
    private readonly pipelines: readonly Pipeline[],
    private readonly deps: DependenciasSync,
  ) {
    for (const p of pipelines) {
      this.estado.set(p.nome, {
        pipeline: p.nome,
        pipelineId: p.pipelineId,
        emAndamento: false,
        inicio: null,
        fim: null,
        duracaoMs: null,
        lidos: null,
        atualizados: null,
        inseridos: null,
        sucesso: null,
        ultimoErro: null,
      });
    }
  }

  get emAndamento(): boolean {
    return this.rodando;
  }

  pipeline(nome: string): Pipeline | undefined {
    return this.pipelines.find((p) => p.nome === nome);
  }

  /**
   * Inicia a sincronização em segundo plano e retorna na hora.
   * Retorna false (sem fazer nada) se já houver uma sincronização rodando.
   */
  disparar(origem: string, selecionadas: readonly Pipeline[] = this.pipelines): boolean {
    if (this.rodando) return false;
    this.rodando = true;
    void this.executar(origem, selecionadas).finally(() => {
      this.rodando = false;
    });
    return true;
  }

  status() {
    return { emAndamento: this.rodando, pipelines: [...this.estado.values()] };
  }

  private async executar(origem: string, selecionadas: readonly Pipeline[]): Promise<void> {
    const { log } = this.deps;
    const inicio = Date.now();
    log.info({ origem, pipelines: selecionadas.map((p) => p.nome) }, 'sync iniciado');
    this.deps.sheets.limparCache();

    // Uma pipeline por vez, nunca em paralelo: o volume é o que derrubava o n8n.
    let falhas = 0;
    for (const p of selecionadas) {
      if (!(await this.executarPipeline(p))) falhas++;
    }

    log.info({ origem, duracaoMs: Date.now() - inicio, falhas }, 'sync finalizado');
  }

  private async executarPipeline(p: Pipeline): Promise<boolean> {
    const { log } = this.deps;
    const st = this.estado.get(p.nome)!;
    const inicio = Date.now();
    Object.assign(st, {
      emAndamento: true,
      inicio: new Date(inicio).toISOString(),
      fim: null,
      duracaoMs: null,
      lidos: null,
      atualizados: null,
      inseridos: null,
      sucesso: null,
    });

    try {
      const agora = this.deps.agora();
      // O array de registros não é guardado: só as linhas montadas seguem adiante.
      const linhas = (await this.deps.buscar(p.pipelineId)).map((r) => p.montarLinha(r, agora));
      st.lidos = linhas.length;

      const res = await this.deps.sheets.upsert(p.gid, linhas);
      if (res.colunasIgnoradas.length) {
        log.warn({ pipeline: p.nome, aba: res.aba, colunas: res.colunasIgnoradas }, 'colunas sem cabeçalho na planilha foram ignoradas');
      }
      if (res.semId || res.duplicadas) {
        log.warn({ pipeline: p.nome, semId: res.semId, duplicadas: res.duplicadas }, 'registros sem id ou com id repetido');
      }

      st.atualizados = res.atualizados;
      st.inseridos = res.inseridos;
      st.sucesso = true;
      log.info(
        { pipeline: p.nome, aba: res.aba, lidos: st.lidos, atualizados: res.atualizados, inseridos: res.inseridos, duracaoMs: Date.now() - inicio },
        'pipeline sincronizada',
      );
      return true;
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      st.sucesso = false;
      st.ultimoErro = { em: new Date().toISOString(), mensagem };
      // Só nome/mensagem/stack: erros do gaxios trazem config e headers da requisição, que não devem ir para o log.
      const resumo = err instanceof Error ? { type: err.name, message: mensagem, stack: err.stack } : { message: mensagem };
      log.error({ pipeline: p.nome, err: resumo, duracaoMs: Date.now() - inicio }, 'falha ao sincronizar pipeline');
      return false;
    } finally {
      st.emAndamento = false;
      st.fim = new Date().toISOString();
      st.duracaoMs = Date.now() - inicio;
    }
  }
}
