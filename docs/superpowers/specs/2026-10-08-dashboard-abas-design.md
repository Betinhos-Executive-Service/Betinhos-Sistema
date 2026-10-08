# Dashboard em abas — design (2ª entrega)

**Data:** 08/10/2026 · **Status:** decisões do Renan ("faça suas próprias recomendações") aplicadas · **Escopo:** `#/dashboard` passa a ter abas em React com o conteúdo do dashboard original, sem o que é irrelevante ou repetido. Substitui a organização em "seções numeradas" e as abas em iframe.

Base: a 1ª entrega (`2026-10-08-dashboard-resumo-design.md`, domínio em `apps/shell/src/pages/dashboard/domain`, dados em `data/`). Referências literais do legado: `2026-10-08-dashboard-resumo-legado.md` (Resumo) e `2026-10-08-dashboard-abas-legado.md` (demais abas). Paridade numérica com o legado continua obrigatória; divergências conscientes vão para a §6.

## 1. Abas e conteúdo

A aba vive na URL (`#/dashboard?tab=<id>`). Filtros globais (período, status, cliente, motorista, tipo de veículo) ficam acima das abas e valem para todas; Despesas tem filtros próprios (categoria, forma, empresa) além do período.

| Aba | KPIs (linha do topo) | Blocos (no máximo 2 por linha, cada um com um assunto) |
|---|---|---|
| **Resumo** | Faturamento (LM/LY, previsão) · Serviços · Ticket médio · A receber · CP pendente · Recebimento % | Alertas de operação (CNH, Multas, Ocorrências, Score) · Qualidade dos dados (4) · Total produzido (3 anos) · Meta × realizado |
| **Serviços** | Total · Concluídos · Cancelados · Emergenciais | Serviços por mês (barras) · Status dos serviços · Por tipo de serviço (qtd, fat, %) · Por tipo de veículo (qtd, fat, %) · Produção própria × terceirizada (linhas) · Emergenciais por mês (top clientes) |
| **Financeiro** (= Faturamento + Pagamentos) | Maior serviço · Clientes ativos · Total recebido · Cartão · Atrasados > 5 dias · Tempo médio de pagamento | Ciclo financeiro (prazo p/ faturar, p/ pagar, ciclo, CP mais antiga, Rodoanel) · Status de faturamento · Ticket médio mensal · **Clientes** (tabela única: serviços, faturamento, ticket, participação; linha expansível com os meses) · Recebimentos por forma · Recebimentos por status |
| **Despesas** | Os 6 KPIs do legado (conferir na referência; cortar os que repetem) | Despesas por mês · Por categoria · Por empresa · Grupos DRE · **Por motorista** (tabela única: hospedagem, alimentação, total) |
| **Frota** | Total · Disponíveis · Blindados · Em manutenção · Uso da frota própria (% médio) | Telemetria Infleet (km, velocidade média/máx., excessos, consumo, motor ocioso) · Km por dia · Uso da frota própria por mês (dias úteis × fim de semana) · Eventos de condução por mês |
| **Motoristas** | Total · CNH em atenção · Score médio | **Ranking** (serviços, faturamento, ticket, participação, CNH; linha expansível com serviços por mês; filtro próprio/terceiro) · CNH vencendo (lista com data) · Score por motorista e mês + ranking mensal · Nota de condução por mês (linha) |
| **Manutenções** | Total · Custo total (apoio: % da receita) · Em andamento · Custo médio · Prazo médio (apoio: % em até 10 dias, mês e ano anteriores) | Custo por mês · Por tipo de reparo (qtd, valor, %) · Categorias (6, por palavra-chave) com metas |
| **Multas** | Total · Pendentes · Resolvidas | Por motorista · Por infração (código/descrição) · Por mês |

Saem: Trocas, Marketing, MarQPonto, faixa "Frota e pessoas", KPIs repetidos (faturamento/ticket/serviços/a receber fora do Resumo), gráfico mensal de faturamento, "por cliente" em Pagamentos, "por status" em Multas, Top 5 próprios/terceirizados como cards (viram filtro do ranking), chips 1º/2º quando a tabela já mostra.

## 2. Dados novos

| Conjunto | Entidade | Uso |
|---|---|---|
| Pagantes | `cr40f_pagantes` (campos conforme a referência do legado + `cr40f_datadoprimeiropagamento`) | Financeiro: recebido, cartão, atrasados, tempo de pagamento, distribuições, ciclo |
| Despesas | `cr40f_despesaoperacional` + `cr40f_categoriadespesaoperacional` + `cr40f_formapagamentodespesa` (+ anexos só se o legado usar em KPI) | Despesas |
| Veículos (mais campos) | `cr40f_veiculos`: placa, marca, modelo, blindado, ano | Frota cadastral |
| Funcionários (mais campos) | `cr40f_funcionarios`: função, apelido, empresa | Motoristas |
| Manutenções (mais campos) | `cr40f_manutencoes`: aprovação, status, tipo do reparo, veículo | Manutenções |
| Multas (mais campos) | `cr40f_multas`: motorista, placa, infração (`$expand` código/descrição) | Multas |
| Infleet | telemetria diária, eventos, viagens com os campos de km, velocidades, excessos, consumo, ocioso | Frota, Motoristas |
| Reservas (mais campos) | `cr40f_tipodoservico` formatado, `new_datadefinalizacao` | Serviços, ciclo financeiro |

Todas as consultas seguem a janela de datas da 1ª entrega (reservas: `cargaDesde`; secundários: a mesma janela onde houver campo de data; cadastros inteiros). Metadata conferida em DEV, só leitura, antes de codar (Tarefa 0 do plano). Falha em conjunto secundário → `s/dado` só nos cards dele.

**Carga em dois estágios (melhorias, Lote A, 08/10/2026).** Estágio 1, sempre: reservas, composições, funcionários, veículos, manutenções, multas, ocorrências e as 3 tabelas do Infleet (o que Resumo, Serviços, Frota, Motoristas, Manutenções e Multas usam). Estágio 2, sob demanda: pagantes (aba Financeiro) e as 4 tabelas de despesas (aba Despesas), carregados na primeira vez que a aba abre e guardados; a recarga de 60 s e o "Atualizar" só refazem o estágio 2 da aba ativa (ao voltar a uma aba com estágio 2 de mais de 60 s, ele é atualizado em segundo plano). Conjunto do estágio 2 ainda não carregado fica vazio e listado em `Dados.pendentes`: a aba mostra esqueleto, não s/dado. Manutenções (`cr40f_datamanutencao`), multas (`cr40f_dataehorario`) e ocorrências (`cr40f_dataocorrencia`), todas DateTime na metadata DEV, passam a vir pela janela das reservas (`cargaDesde`..fim do filtro), em vez de inteiras.

## 3. Layout (Design System)

- `PageHeader` com `Tabs` do DS no slot `children`; barra de filtros abaixo; cada aba é um `role="tabpanel"`.
- Linha de KPIs: cards locais (`.dash-kpi`) com borda superior na cor do indicador, chips e sparkline onde houver série.
- Blocos: `Surface` com eyebrow (assunto), valor de destaque, sub, gráfico e/ou tabela do DS; nunca mais de dois por linha; um assunto por bloco.
- Mobile: KPIs em 1 coluna, blocos em 1 coluna, tabelas em lista com rótulo inline, linhas expansíveis fechadas.
- Só tokens `--bt-*`, sem gradiente, light-only, Lucide, status sempre com texto.

## 4. Arquitetura

`apps/shell/src/pages/dashboard/`:
- `domain/abas/<aba>.ts` (puros, testados) + `domain/resumo.ts` já existente → `calcularResumo` fica só com o que o Resumo mostra; novas funções `calcularServicos`, `calcularFinanceiro`, `calcularDespesas`, `calcularFrota`, `calcularMotoristas`, `calcularManutencoes`, `calcularMultas`.
- `data/`: `queries.ts` ganha as consultas novas; `Dados` ganha `pagantes`, `despesas`, `categoriasDespesa`, `formasPagamento`; mappers; mock para cada conjunto.
- `useDashboard` inalterado (carga única com todos os conjuntos; a aba só escolhe o que calcular, com `useMemo` por aba).
- `components/abas/<Aba>Tab.tsx` + componentes compartilhados já existentes (`KpiGrid`, `AnaliseCard`, `Celulas`, charts).
- `DashboardPage.tsx`: header + filtros + `Tabs`; renderiza só a aba ativa.

## 5. Aceite

- As 8 abas abrem em mock e em DEV; números do Resumo e dos itens herdados batem com o legado; itens novos batem com a aba correspondente do legado (paridade por aba, com o legado aberto ao lado).
- `pnpm test`, `typecheck`, sem cor fora dos tokens, 320 px sem rolagem horizontal, foco visível.
- Nenhuma escrita no Dataverse.

## 6. Correções conscientes em relação ao legado

- Faturamento e Pagamentos viram uma aba Financeiro.
- Itens repetidos removidos (lista na §1).
- Clientes e despesas por motorista consolidados em tabelas únicas.
- Top 5 próprios/terceirizados vira filtro do ranking de motoristas.
- Categorias de manutenção: 'Corretiva não crítica' deixa de ser classificada como crítica (bug do legado).
- Manutenções ganham um 5º KPI, **Prazo médio** (criação → data da manutenção, `daysBetweenValues` do legado, com % em até 10 dias e os comparativos do mês e do ano anteriores); o "% da receita" do legado vira apoio do KPI **Custo total** em vez de bloco próprio.
- **Manutenções "Em andamento"**: o legado contava rótulos com "andamento", "aberto" ou "pend", que nenhum status real tem (Solicitado, Aprovado, Programado, Realizado, Cancelado, Reprovado) — o card ficava sempre em 0. Passa a contar **Solicitado, Aprovado e Programado** (rótulo sem acento e sem caixa); as palavras antigas continuam valendo.
- **Multas "Resolvidas"**: o legado contava "pago", "resolvid" ou "conclu"; os status reais encerrados são Pago, Descontado e Finalizado (em PROD, Pago e Descontado somam 164 de 260 multas). Passa a contar **pago, descontado, finaliz, resolvid e conclu** (sem acento e sem caixa). Indicada, Recurso e Condutor Notificado seguem em aberto.
- **Frota**: o status do veículo só tem Ativo, Vendido ou vazio, então "Em manutenção" por palavra-chave do status ficava sempre em 0. Agora: **Total de veículos** exclui os de status Vendido (o apoio mostra "Frota cadastrada: N · M vendidos"); **Disponíveis** são os de status "ativo"/"ativo(a)" (`isActiveVehicle` do legado); **Blindados** contam só a frota (sem vendidos), para o "% da frota" ficar coerente; **Em manutenção** são os veículos distintos da frota com manutenção em andamento (Solicitado, Aprovado ou Programado) pela data da manutenção no período do filtro — s/dado quando a tabela de manutenções não carrega.
- **Pagantes cobrem o histórico inteiro** (como o `loadPagantes` do legado, sem janela de datas): o bloco Recebimentos e os KPIs Cartão e Atrasados > 5 dias dizem "todo o histórico" no rodapé/apoio, em vez do período do filtro. Pelo mesmo motivo, o apoio do KPI Tempo médio de pagamento e o "Prazo para pagar" do Ciclo financeiro também dizem "todo o histórico".

- **Janela nas manutenções, multas e ocorrências** (Lote A): antes vinham inteiras; agora pela janela das reservas. Todo cálculo dessas tabelas já filtra pelo período (ou pelo mês/ano anterior, dentro de `cargaDesde`), então os números não mudam; registros sem data deixam de vir (já não entravam em nenhum período).
- **Pagantes e despesas sob demanda** (Lote A): o legado carregava tudo junto; aqui só quando Financeiro ou Despesas abrem (detalhe na §2). Despesas consultam os funcionários de novo no estágio 2 (nome e empresa), para não esperar o estágio 1.

## 7. Conferência de metadata das abas (DEV, 08/10/2026)

Conferido por leitura (MCP `Dataverse_DEV`: `describe` das tabelas e contagens por SQL), sem escrita. Os entity sets são os `Collection Name` retornados pela metadata e coincidem com o mapa `T` do legado. Todas as colunas de `T`/`F` (legado §0) existem com o tipo esperado.

| Item | Entity set (DEV) | Resultado | Option sets / observações |
|---|---|---|---|
| Pagantes (`cr40f_pagantes`) | `cr40f_paganteses` (28 registros) | ok: `cr40f_valor`, `cr40f_formadepagamento`, `cr40f_status`, `_cr40f_financeiro_value`, `_cr40f_bancodedados_value`, `createdon`, `cr40f_datadoprimeiropagamento` | status: Pendente 202410001, **Pago 202410002**, Negado 202410003, Expirado 202410004, Cancelado 202410005, Não Finalizado 202410006, Autorizado 202410007, Aguardando Facial 202410010. Forma: Cartão de crédito 202410000, Pedido de compra 202410001, Pix 202410002 |
| Despesa operacional | `cr40f_despesaoperacionals` (9.441) | ok: todos os 24 campos de `F.despesa` existem (lookups `_cr40f_categoria/formapagamento/motorista/veiculo/reserva/cidade/manutencao_value`, `kminformado` INT, `litros` DECIMAL, `possivelduplicidade` BIT, `statecode`) | `statusfinanceiro`: Não reembolsável 100000000, **Aguardando pagamento 100000001**, Pago 100000002, Cancelado 100000003. `statusoperacional`: Enviado 100000000, Precisa corrigir 100000001, Validado 100000002, Recusado 100000003, Cancelado 100000004. `statusanexo`: Sem anexo 100000000, Enviando 100000001, **Completo 100000002**, Falhou 100000003, Parcial 100000004. `origem`: App Motoristas 100000000, Model-driven 100000001, Flow 100000002, Importação 100000003 |
| Categoria de despesa | `cr40f_categoriadespesaoperacionals` | ok: `cr40f_nome`, `cr40f_grupodre`, `cr40f_ordem`, `cr40f_ativa`. Diferença de tipo em relação à nota do legado: `cr40f_grupodre` é texto (NVARCHAR 120), não option set; o valor bruto já é o nome do grupo | sem option sets |
| Forma de pagamento da despesa | `cr40f_formapagamentodespesas` | ok: `cr40f_nome`, `cr40f_tipo` (texto 80), `cr40f_ordem`, `cr40f_ativa` | sem option sets |
| Anexo de despesa | `cr40f_anexodespesaoperacionals` (35) | ok: `_cr40f_despesa_value`, `cr40f_nomearquivo`, `cr40f_urlsharepoint`, `cr40f_sharelink`, `cr40f_status`, `cr40f_tipo`, `createdon` | `cr40f_status` do anexo (distinto do `statusanexo` da despesa): Pendente 100000000, Enviado 100000001, Falhou 100000002, Inválido 100000003, Processando 100000004. `cr40f_tipo`: Comprovante 100000000, Foto complementar 100000001, Outros 100000002 |
| Veículos | `cr40f_veiculoses` | ok com diferença de rótulo: `cr40f_placa`, `cr40f_marca`, `cr40f_modelo`, `cr40f_statusdoveiculo`, `cr40f_blindado` (BIT), `cr40f_anodefabricacao`, `new_categoriadoveiculo` existem. Existe também `new_blindado` (BIT duplicado; o legado usa `cr40f_blindado`) | `statusdoveiculo`: Vendido 202410000, Ativo 202410001. **`new_categoriadoveiculo`: Próprio 100000000, Terceiro 100000001 (rótulo é "Terceiro", não "Terceirizada"), Aluguel 100000002 (valor que o legado não trata)** |
| Funcionários | `cr40f_funcionarioses` | ok: `cr40f_nomecompleto`, `cr40f_status`, `cr40f_funcao`, `cr40f_validadedacnh` (DATE ONLY), `new_apelido`, `cr40f_nomedaempresa` | status: Ativo 0, Desligado 1, Afastado 2. Função: Motorista 202410000, Administrativo 202410001. Empresa: BETINHOS L AUTO LTDA EPP 202410000, DEPAULA L AUTO LTDA EPP 202410001 |
| Manutenções | `cr40f_manutencoeses` (173) | ok: `cr40f_datamanutencao`, `cr40f_datadaaprovacao`, `cr40f_valor`, `cr40f_status`, `cr40f_tipodoreparo`, `_cr40f_placa_carro_value` (lookup para `cr40f_veiculos`) | status: Solicitado 0, Aprovado 202410001, Realizado 202410002, Programado 202410005, Cancelado 100000001, Reprovado 100000002. Tipo do reparo: Preventiva sistemática 1, Corretiva não crítica 2, Corretiva crítica 100000001, Conservação, conforto e imagem 100000002, Avaria 100000003 |
| Multas | `cr40f_multases` (235) | ok: `cr40f_dataehorario`, `cr40f_status`, `_cr40f_codigodainfracao_value`, `_cr40f_motorista_value`, `_cr40f_placa_value`. A navigation property `cr40f_Codigodainfracao` não aparece na metadata exposta pelo MCP (só o lookup `cr40f_codigodainfracao` para `cr40f_infracaodetransito`); o nome segue o padrão `cr40f_Motorista`/`cr40f_Cliente` e é o usado pelo legado em produção, mas precisa ser confirmado na primeira chamada OData real | status: **Notificar o Condutor 202410000**, Indicada 202410001, Recurso 202410002, Descontado 202410003, Condutor Notificado 202410004, Finalizado 202410005, Pago 202410006 |
| Infração de trânsito | `cr40f_infracaodetransitos` | ok: `cr40f_codigodainfracao`, `cr40f_descricaodainfracao` (texto), `cr40f_infracaodetransitoid` | sem option sets usados no dashboard |
| Reservas (campos extras) | `cr40f_reservadeveculoses` | ok: `cr40f_tipodoservico` (CHOICE) e `new_datadefinalizacao` (DATETIME); também `new_categoriadoitem`, `_cr40f_financeiro_value`, `cr40f_statusdefaturamento` | tipo do serviço: Guarulhos 202410000, São Paulo 202410001, Outras Cidades 202410002, Vale do Paraíba 202410003, Rio de Janeiro 202410004, Pindamonhangaba 202410005, São José dos Campos 202410006, Congonhas 202410007, Campinas 202410008, Dentro de São Paulo 202410009, Litoral 202410010, Região dos Lagos 202410011, Extrema 202410012, Nova Odessa 202410013, Baixada Santista 202410014, Minas Gerais 202410015, GPX 202410016. Status de faturamento: Pago 202410010, Pagante em Viagem 202410006, Faturamento Mensal 202410008. Item: Serviço 100000000 |
| Infleet telemetria diária | `new_telemetriadiariainfleets` (97) | ok: todos os 12 campos de `F.infleetDiaria` (`new_data` DATE ONLY, `_new_veiculo_value`, `new_placanormalizada`, `new_distanciapercorridakm`, `new_velocidademedia/maxima`, `new_excessosdevelocidade`, `new_autonomiakml`, `new_odometrofinal`, `new_tempomotorociosomin`, `new_tempoacimavelocidademin`, `new_sincronizadoem`) | sem option sets |
| Infleet eventos | `new_eventoinfleets` (1.861) | ok: todos os campos de `F.infleetEvento` (`new_slug`, `new_statusmapeamentomotorista` e `new_infleetdriverid` são texto) | sem option sets |
| Infleet viagens | `new_viageminfleets` (759) | ok: todos os campos de `F.infleetViagem` | sem option sets |

Diferenças que afetam o port:
1. `new_categoriadoveiculo`: o rótulo de 100000001 é "Terceiro" e existe 100000002 "Aluguel". A classificação Própria/Terceirizada do legado deve decidir por valor bruto (100000000 própria; 100000001 terceirizada) e tratar Aluguel de forma explícita (a definir em §6 antes de entrar no código).
2. `cr40f_grupodre` é texto; nenhum mapeamento de option set é necessário.
3. A navigation property `cr40f_Codigodainfracao` não pôde ser comprovada pelo MCP; confirmar na primeira consulta OData em DEV (o tipo da multa deve vir do `$expand`, com o código da infração como fallback pelo lookup `_cr40f_codigodainfracao_value`).
