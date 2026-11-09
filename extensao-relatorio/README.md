# Extensão "Relatório Medular"

Versão interna do relatório do Looker Studio **"Relatório Medular - Kentro Atualizado"**, como extensão do sistema. Ela aparece em **Relatórios → Relatório Medular** e só para **administradores** (`visibility.userTypes: [0]`).

A extensão é **hospedada pelo próprio medular-sync**, e o administrador a instala pela URL `https://SEU-HOST/extensao/manifest.json`. Os dados vêm **ao vivo do CRM da Medular**: a página pede ao serviço (`/extensao/dados/:pagina`), e o serviço busca no CRM pelo id do funil (`getPipeOpportunities`), aplica as regras de transformação da planilha e devolve só os campos que o relatório usa. A `apiKey` do CRM não sai do servidor, e a extensão não depende do Google Sheets nem do Looker.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `manifest.json` | Manifest servido em `/extensao/manifest.json` |
| `index.html` | A página inteira: estilos, filtros, interações e gráficos em SVG, sem bibliotecas externas. O serviço grava nela o endereço do endpoint de dados |
| `assets/icone.svg` | Ícone do menu |
| `assets/logo-medular.svg` | Logo recriado em SVG. Pode ser trocado pelo arquivo oficial com o mesmo nome |
| `../src/relatorio.ts` | Campos de cada página, montados no servidor a partir do CRM |
| `../src/extensao.ts` | Rotas `/extensao/*`: arquivos, CORS, token, cache e compressão |

## Configuração da instalação

| Campo | Obrigatório | Valor |
|---|---|---|
| `token` (Token do relatório) | sim (secreto) | O mesmo valor de `EXTENSAO_TOKEN` no medular-sync |

A página busca os dados com `fetch` e, se o sistema bloquear, usa o proxy `omni.http.request`.

## Como o relatório original funciona, e como foi reproduzido

As regras abaixo foram conferidas contra a planilha: todas as contagens, percentuais e ordenações bateram com o Looker. O comportamento dos cliques foi conferido no próprio relatório.

### Comum às quatro páginas

- **Navegação**: lista lateral com as 4 páginas, recolhível.
- **Filtros (listas)**: como o controle do Looker. Todos os valores começam marcados, o que significa sem filtro. Desmarcar um valor o exclui e "Somente" deixa um só. A lista vem ordenada por "Record Count", tem busca, e o vazio aparece como "null". As opções respeitam os demais filtros e o período, mas não os cliques nos gráficos. Sem nenhum valor marcado, o filtro não se aplica. Se uma escolha zerar a página por causa de um clique anterior, esse clique é desfeito.
- **Cadastro**: período pela data de criação da oportunidade ("Data de Criação", `createdAt` no fuso de São Paulo), como no Looker.
- **Realização**: filtro adicional, que não existe no Looker, pelo campo "Data da Realização" do formulário de cada funil. Começa em "todo o período", sem filtrar. Quando ativo, soma-se ao filtro de cadastro, deixa de fora os cartões sem essa data (a página informa quantos) e os cartões de indicadores comparam com o período anterior da realização.
- **Cliques que filtram**: clicar numa **barra**, numa **fatia de pizza** ou numa **linha de tabela** filtra todos os outros gráficos e os cartões da página. A linha de tabela filtra por todos os valores daquela linha. O gráfico clicado continua inteiro e só destaca a seleção, esmaecendo o resto. Clicar de novo no mesmo item, ou no ↶ acima do gráfico, desfaz. Seleções em gráficos diferentes se somam.
- **Redefinir Filtros**: limpa os filtros, as seleções por clique e volta ao período padrão da página.
- **Faixa de indicadores**: cada cartão conta as oportunidades de uma etapa do CRM. Abaixo do número vai a variação contra o **período anterior de mesmo tamanho**. Fica "N/A" quando o período anterior não tem dados, que é o que aparece no Looker com o período padrão.
- **Barras por etapa**: quantidade por etapa, da maior para a menor. Etapas fora do mapeamento da página entram em "Outros".
- **Tabelas**: como no Looker, linhas com os mesmos valores nas colunas exibidas viram uma linha só, ordenadas da que reúne mais registros para a que reúne menos. Também ordenam por coluna e paginam com o mesmo tamanho de página do original.
- **Pizzas**: até 10 fatias, com os 9 maiores valores e o restante somado em "Outros". A de **Convênio** ignora os registros sem convênio, como no original.

### Autorização Interna (funil 2), período padrão de 01/01/2016 ao fim do mês atual

- **Filtros**: Paciente, Médico (`medico_responsavel`), Status da Guia, Convênio, Procedimento (Regra A) e Etapas.
- **Cartões**: Aut. em Processo (etapa 7), Realizados (83), Aut. Aprovada (13), Enca. para Enfermagem (17), Agendado (89), Autorização Negada (8), Resolver (92), Desistências (93) e Faturamento (106).
- **Etapas consideradas**: só a partir de "Autorização em Processo". Autorização Pendente (3) e Pendente Estimulação (105) ficam de fora de todo o relatório.
- **Barras**: "Outros" só aparece se surgir uma etapa nova ainda sem rótulo.
- **Tabela 1**: Nome, Convênio, Procedimento, Médico, Guia e Etapa do CRM, com 1000 linhas por página.
- **Tabela 2**: as mesmas colunas, mais Data da Realização e Record Count. Mostra só os registros com data de realização válida.
- **Pizzas**: Procedimento, Médico e Convênio.

### Autorização Externa (funil 3), período padrão de 01/01/2016 ao fim do mês atual

- **Filtros**: Médico, Convênio, Hospital, Etapas, Paciente, Status Guia e Procedimento (Regra A).
- **Cartões**: Realizados (84), Aut. em Processo (12), Aut. Aprovada (77, "PARCIAL - Autorizadas parcialmente"), Enca. para Cirurgias (79), Documentação Pendente (107), Autorização Negada (78), Desistências (91), Resolver (96, "🔴 RESOLVER URGENTE") e Agendado (85).
- **Barras**: "Aut. em Pendente" é Autorização Pendente (11). "Outros" é a etapa 96.
- **Tabela 1**: Nome, Hospital, Procedimento, Médico, Status da Guia e Etapas, com 100 linhas por página.
- **Pizzas**: Procedimento, Médico e Convênio.
- **Tabela 2**: Nome, Convênio, Procedimento, Médico, Guia, Etapa do CRM e Data da Realização.

### Cirurgias (funil 6, "Cirurgias Particulares"), período padrão de 01/01/2016 até hoje

- **Filtros**: Paciente, Cirurgião (`cirurgiao`), Hospital, Hospital, Procedimento (Regra B) e Etapas. Os dois "Hospital" são o mesmo campo, como no original, e compartilham a seleção.
- **Cartões**: Realizada Hospital (25), Realizado Clínica (88), Cirurgias Não Realizadas (não existe etapa no funil 6, por isso fica sempre 0, como no original), Orçamento Enviado (24), Ordem Judicial em Andamento (108), Agendado Hospital (90), Orçamento Negado (26), Solicitação em Processo (23) e Agendar Clínica (87).
- **Tabela**: Nome, Procedimento, Cirurgião, Hospital, Valor do Orçamento e Etapa, com 500 linhas por página. O Valor do Orçamento lê o mesmo campo de `Valor_medico_inicial`, como na planilha.
- **Pizzas**: Procedimento e Cirurgião.

### Clínica (funil 14, "Particular Clinica"), período padrão de 01/01/2023 até hoje

- **Filtros**: Procedimento (Regra B), Paciente, Médico (`cirurgiao`) e Etapas.
- **Cartões**: Cirurgias Não Realizadas (102, "Procedimentos não realizados"), Solicitação Em Processo (99), Orçamento Enviado (100), Agendar Clínica (101), Realizados (98) e Orçamento Negado (103).
- **Tabela**: Paciente, Procedimento, Cirurgião, Valor Orçamento e Etapas, com 100 linhas por página.
- **Pizzas**: Procedimento e Cirurgião.

## Nomes dos procedimentos

O nome vem do CRM (`/int/getTags`, com cache de 5 minutos) a partir da primeira etiqueta da oportunidade. Esse endpoint só devolve as etiquetas habilitadas para **contatos**. As etiquetas exclusivas de oportunidades continuam vindo do dicionário de `src/procedimentos.ts`. Uma etiqueta nova que seja só de oportunidade aparece como "não mapeado"/"não encontrado" até ser habilitada também para contatos no CRM ou incluída no dicionário.

## Diferenças em relação ao Looker

- **Totais**: a planilha nunca apaga linhas, então o Looker continua contando oportunidades que saíram do funil. Como lê o CRM, a extensão mostra a situação atual. Por exemplo, a Interna tinha 3114 linhas na planilha e 2971 no CRM.
- **Interna**: no Looker, a barra "Outros" somava as etapas pendentes. Na extensão, elas não entram no relatório.
- **Clínica**: no Looker, a barra da etapa "Orçamento Negado" aparece rotulada como "Outros", embora o cartão use o nome certo. Na extensão, a barra se chama "Orçamento Negado".
- **Externa, tabela 2**: no Looker ela mostra todas as etapas como "Outros" e a data como null. Na extensão, ela mostra a etapa e a data de realização reais.
- **Clínica**: a pizza do Looker se chama "cirurgiao por Quantidade". Na extensão, o título é "Cirurgião por Quantidade".
- **Filtros de lista**: no Looker, a seleção de um controle e a seleção por clique são independentes. Na extensão também são, e "Redefinir Filtros" limpa as duas.
- **Cores das pizzas**: no Looker, a cor segue o valor. Na extensão, segue a posição da fatia, na mesma ordem de cores do tema do Looker.

## Publicação de uma versão nova

1. Altere os arquivos desta pasta e, se a mudança for visível, suba a `version` do `manifest.json`.
2. Publique o medular-sync de novo. Os arquivos são lidos quando o serviço sobe.
3. No sistema, atualize o manifest da extensão instalada para o sistema buscar a versão nova.
