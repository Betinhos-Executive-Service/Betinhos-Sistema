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
| **Manutenções** | Total · Custo total · Em andamento · Custo médio | Custo por mês · Por tipo de reparo (qtd, valor, %) · Categorias (6, por palavra-chave) com metas · % da receita |
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
