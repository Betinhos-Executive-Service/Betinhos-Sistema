# Dashboard em abas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `#/dashboard` com 8 abas em React (Resumo, Serviços, Financeiro, Despesas, Frota, Motoristas, Manutenções, Multas), cada uma só com o que importa, sem repetição, números iguais ao legado.

**Architecture:** Mesmo molde da 1ª entrega: `domain/` puro por aba, `data/` com consultas e mappers novos, `useDashboard` carrega tudo de uma vez, `DashboardPage` renderiza a aba ativa (`?tab=`) com `Tabs` do DS. As seções numeradas, a barra de atalhos e o iframe do legado saem.

**Tech Stack:** React 19, TypeScript, Vitest, `@betinhos/ui`, `@betinhos/dataverse`, Recharts 3, Lucide.

**Spec:** `docs/superpowers/specs/2026-10-08-dashboard-abas-design.md`. Referências literais do legado (vencem em dúvida de fórmula): `docs/superpowers/specs/2026-10-08-dashboard-abas-legado.md` (abas) e `2026-10-08-dashboard-resumo-legado.md` (Resumo).

## Global Constraints

- Paridade numérica com o legado em todo item herdado; classificação por texto onde o legado usa texto (`normL`/`stL`). Divergências conscientes só as da spec §6; qualquer outra entra na spec §6 antes de ser aceita.
- Nenhuma escrita no Dataverse. Metadata só em DEV, só leitura (MCP `Dataverse_DEV`); nunca PROD.
- Janela de carga: reservas por `cargaDesde`; conjuntos com data pela mesma janela; cadastros inteiros. Falha em conjunto secundário → `s/dado` só nos cards dele.
- Domínio puro e testado (RED→GREEN). Comandos: `cd apps/shell && npx vitest run <arquivo>`; suíte `pnpm --filter @betinhos/shell test`; `pnpm --filter @betinhos/shell typecheck`.
- UI: só tokens `--bt-*`; sem gradiente; light-only; `--bt-color-surface-neutral` em cabeçalhos/listas neutras; Lucide; status com texto; 320 px sem rolagem horizontal; `accessibilityLayer={false}` nos gráficos; nunca editar `packages/ui`.
- Microcopy pt-BR com acentos; `dd/MM/yyyy`; `R$ 1.234,56`; vírgula decimal.
- Commits locais em português, detalhados, trailer exato `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Sem push; `pnpm push` só com ok do Renan.
- Escapes Unicode (` `) ficam como texto no arquivo (conferir com grep).

## File Structure

```
apps/shell/src/pages/dashboard/
  domain/types.ts            (+) Pagante, Despesa, CategoriaDespesa, FormaPagamento, campos extras em Reserva/Veiculo/Funcionario/Manutencao/Multa/Viagem/EventoConducao/TelemetriaDia; Dados; Conjunto
  domain/abas/servicos.ts, financeiro.ts, despesas.ts, frota.ts, motoristas.ts, manutencoes.ts, multas.ts (+ .test.ts)
  domain/resumo.ts           (~) só o que o Resumo mostra
  data/queries.ts, mock.ts, source.ts (~) conjuntos novos e campos extras; data.test.ts
  components/abas/ResumoTab.tsx, ServicosTab.tsx, FinanceiroTab.tsx, DespesasTab.tsx, FrotaTab.tsx, MotoristasTab.tsx, ManutencoesTab.tsx, MultasTab.tsx
  components/… (reaproveitar KpiGrid, AnaliseCard, Celulas, charts, AlertList, DashboardToolbar; remover Secoes/atalhos/iframe)
  DashboardPage.tsx (~), dashboard.css (~), DashboardPage.test.tsx (~)
```

---

### Task 0: Metadata em DEV dos conjuntos novos

**Files:** Modify `docs/superpowers/specs/2026-10-08-dashboard-abas-design.md` (nova §7).

- [ ] Conferir em DEV (só leitura) entity set e colunas listadas na referência do legado §0 (`T`/`F`) para: `cr40f_pagantes` (valor, forma, status, `_cr40f_financeiro_value`, `_cr40f_bancodedados_value`, `createdon`, `cr40f_datadoprimeiropagamento`), `cr40f_despesaoperacional` (todos os campos de `F.despesa`), `cr40f_categoriadespesaoperacional`, `cr40f_formapagamentodespesa`, `cr40f_anexodespesaoperacional`, `cr40f_veiculos` (placa, marca, modelo, status, blindado, ano, categoria), `cr40f_funcionarios` (nome, status, função, CNH, apelido, empresa), `cr40f_manutencoes` (data, aprovação, valor, status, tipo do reparo, `_cr40f_placa_carro_value`), `cr40f_multas` (data, status, `_cr40f_codigodainfracao_value`, `_cr40f_motorista_value`, `_cr40f_placa_value`; navigation `cr40f_Codigodainfracao`) e `cr40f_infracaodetransito` (código, descrição), `cr40f_reservadeveculos` (`cr40f_tipodoservico`, `new_datadefinalizacao`), Infleet (todos os campos de `F.infleetDiaria/Evento/Viagem`). Option sets: status do pagante (recebido 202410002), `statusfinanceiro` da despesa (100000001 = aguardando), `statusanexo`.
- [ ] Registrar na spec §7 (tabela item → ok/diferença). PARE se algo não existir.
- [ ] Commit: "Dashboard: metadata dos conjuntos das abas conferida em DEV".

### Task 1: Tipos, consultas, mappers, mock e Source dos conjuntos novos

**Files:** `domain/types.ts`, `data/queries.ts`, `data/mock.ts`, `data/source.ts`, `data/data.test.ts`.

**Interfaces (Produces):**
- `types.ts`: `Reserva` ganha `tipoServico: string` (FormattedValue) e `finalizadoRaw: string`; `Veiculo` ganha `placa, marca, modelo, blindado: boolean, ano: number | null`; `Funcionario` ganha `id, nome, apelido, funcao, empresa`; `Manutencao` ganha `aprovacaoDia: string, statusLabel, tipoReparo, veiculoId`; `Multa` ganha `motoristaId, motorista, veiculoId, infracaoCodigo, infracaoDescricao, statusLabel`; `TelemetriaDia` ganha `distanciaKm, velocidadeMedia, velocidadeMaxima, excessos, autonomia, tempoAcimaMin`; `Viagem` ganha `velocidadeMedia, velocidadeMaxima, combustivelL, custoCombustivel`; `EventoConducao` ganha `veiculoId, velocidade, limite`; novos `Pagante { id, opId, pessoaId, pessoa, valor, forma: number|null, formaLabel, status: number|null, statusLabel, criadoRaw, criadoDia, primeiroPagamentoRaw }`, `Despesa { id, dia, mes, valor, categoriaId, categoria, formaId, forma, empresa, motoristaId, motorista, reservaId, statusFinanceiro: number|null, statusAnexo, anexos: number, descricao }`, `CategoriaDespesa { id, nome, grupoDre }`, `FormaPagamento { id, nome }`. `Dados` ganha `pagantes, despesas, categoriasDespesa, formasPagamento`; `Conjunto` ganha `'pagantes' | 'despesas'`.
- `queries.ts`: paths e mappers para cada conjunto, `$select` conforme a referência §0 e §3–§8, `$expand=cr40f_Codigodainfracao(...)` nas multas; janela de datas nos conjuntos com data.
- `source.ts`: `carregarDataverse` carrega os conjuntos novos (limite 4 em paralelo); `mock.ts` gera pagantes, despesas (com categorias/formas), campos extras coerentes com reservas/veículos/motoristas.

- [ ] Testes RED: mappers (um por tipo, com FormattedValue), paths (janela), carga com falha de `pagantes` → `indisponiveis`.
- [ ] Implementar; GREEN; suíte inteira; typecheck. Commit.

### Task 2: Domínio Serviços

**Files:** `domain/abas/servicos.ts`, `.test.ts`. **Legado:** referência §1 + Resumo §10 (produção, emergenciais) e §11 (status).

**Produces:** `calcularServicos(ctx: Contexto): Servicos` com `kpis` (Total, Concluídos, Cancelados, Emergenciais — valor + % quando o legado mostra), `porMes: {mes, rotulo, qtd}[]`, `status` (de `statusServicos`), `porTipoServico: {tipo, qtd, fat, pctQtd, pctFat}[]`, `porTipoVeiculo` idem, `producao` (de `producaoPropriaTerceira`), `emergenciais` (de `emergenciais`). Reaproveite as funções já existentes em `analises.ts`/`destaques.ts` movendo o que for exclusivo do Resumo para cá (sem duplicar código).

- [ ] Testes com `reserva()` de `test-utils`: tabelas por tipo (qtd, fat, %), KPIs, porMes. RED→GREEN. Commit.

### Task 3: Domínio Financeiro

**Files:** `domain/abas/financeiro.ts`, `.test.ts`. **Legado:** referência §2 e §3 (+ `renderFaturamentoCycle`).

**Produces:** `calcularFinanceiro(ctx, pagantes: Pagante[], indisponivel: boolean): Financeiro` com `kpis` (Maior serviço, Clientes ativos, Total recebido, Cartão, Atrasados > 5 dias, Tempo médio de pagamento), `ciclo` (prazoFaturar, prazoPagar, ciclo, cpMaisAntiga, rodoanel — cada um número ou null → `s/dado`), `statusFaturamento: {status, qtd, valor, pct}[]`, `ticketMensal` (de `analises.ticketMensal`), `clientes: {cliente, servicos, faturamento, ticket, pct, meses: {mes, valor, delta}[]}[]` (unifica `faturamentoPorCliente`, `topVolume`, `topFaturamento`, `tbFat`; ordena por faturamento; todos os clientes, "Sem cliente" por último), `porForma: {forma, qtd, valor, pct}[]`, `porStatus` idem. Pagantes "recebido" = status 202410002 ou rótulo com "pago"/"paga" (legado). Atrasados: pendentes com `createdon` há mais de 5 dias.

- [ ] Testes RED→GREEN (maior serviço, clientes ativos, recebido/cartão/atrasados, tempo de pagamento com `cr40f_datadoprimeiropagamento`, ciclo com s/dado, distribuições). Commit.

### Task 4: Domínio Despesas

**Files:** `domain/abas/despesas.ts`, `.test.ts`. **Legado:** referência §4 (buildExpenseRows, filtros próprios, 6 KPIs, mensal, categorias, empresa, DRE, por motorista, hospedagem).

**Produces:** `type FiltrosDespesa = { categorias: string[]; formas: string[]; empresas: string[] }`, `filtrarDespesas(despesas, periodo, f)`, `calcularDespesas(despesas, categorias, formas, periodo, f, periodoAnterior): Despesas` com `kpis` (Despesa realizada, Alimentação, Aguardando pagamento, Ticket médio, Sem comprovante, Média hospedagem com faixa meta/atenção/fora) cada um com chip "ANT." contra o período anterior, `porMes`, `porCategoria`, `porEmpresa`, `gruposDre`, `porMotorista: {motorista, hospedagem, alimentacao, total, lancamentos}[]` (une as três tabelas do legado), `opcoes` (categorias/formas/empresas distintas).

- [ ] Testes RED→GREEN com despesas sintéticas (categorias "Almoço", "Hospedagem", status 100000001, sem anexo). Commit.

### Task 5: Domínio Frota

**Files:** `domain/abas/frota.ts`, `.test.ts`. **Legado:** referência §5 (escopo de veículos, KPIs cadastrais, telemetria, km diário, ocioso, uso mensal da frota própria, eventos por mês).

**Produces:** `calcularFrota(ctx, dados): Frota` com `kpis` (Total, Disponíveis, Blindados, Em manutenção, Uso médio da frota própria %), `telemetria` (km, velocidade média ponderada, máxima, excessos, consumo km/L, motor ocioso min — com `s/dado` se Infleet indisponível), `kmPorDia: {dia, km}[]`, `usoMensal: {mes, usoUteis, usoFds, usados, ociosos, terceiros, aluguel}[]` (regra do legado com corte 01/06/2026), `eventosPorMes: {mes, aceleracao, frenagem, curva}[]`.

- [ ] Testes RED→GREEN. Commit.

### Task 6: Domínio Motoristas, Manutenções e Multas

**Files:** `domain/abas/motoristas.ts`, `manutencoes.ts`, `multas.ts` (+ testes). **Legado:** referência §6, §7, §8; score já em `domain/score.ts` (estender para expor linhas por motorista/mês e ranking mensal).

**Produces:**
- `calcularMotoristas(ctx, dados): Motoristas` com `kpis` (Total, CNH em atenção, Score médio), `ranking: {key, nome, propria: boolean|null, servicos, faturamento, ticket, pct, cnhDia, meses: {mes, qtd, pct}[]}[]` (base = funcionários, como o legado; `propria` pela categoria do veículo mais usado, para o filtro próprio/terceiro), `cnhVencendo: {nome, cnhDia, dias}[]`, `scorePorMotoristaMes`, `rankingMensal`, `notaPorMes`.
- `calcularManutencoes(ctx, dados): Manutencoes` com `kpis` (Total, Custo total, Em andamento, Custo médio, % da receita), `custoPorMes`, `porTipoReparo`, `categorias: {categoria, qtd, meta, status}[]` (palavras-chave e metas do legado).
- `calcularMultas(ctx, dados): Multas` com `kpis` (Total, Pendentes, Resolvidas), `porMotorista`, `porInfracao`, `porMes`.

- [ ] Testes RED→GREEN. Commit (pode ser um por arquivo).

### Task 7: Resumo enxuto e página com abas

**Files:** `domain/resumo.ts` (~), `DashboardPage.tsx`, `components/abas/ResumoTab.tsx`, remover `components/Secoes*`/atalhos/iframe e CSS correspondente, `dashboard.css`, `DashboardPage.test.tsx`, `components.test.tsx`.

- [ ] `calcularResumo` passa a devolver só: `kpis`, `operacao`, `qualidade`, `totalProduzido`, `metaRealizado` (o resto migra para as abas; apague o que ficou sem uso).
- [ ] `DashboardPage`: `PageHeader` + `Tabs` (8 abas, `?tab=` via `useHashQuery`) + barra de filtros; renderiza só a aba ativa; `useMemo` por aba; estados carregando/erro/vazio por aba; a aba Despesas mostra os filtros próprios abaixo dos globais. Remover seções numeradas, barra de atalhos e iframe do legado. "Abrir dashboard completo" continua no header.
- [ ] `ResumoTab`: linha de 6 KPIs; abaixo, 2 colunas: Alertas de operação | Qualidade dos dados; depois Total produzido | Meta × realizado.
- [ ] Testes: página abre no Resumo, troca de aba muda o hash e o painel, Resumo não mostra mais produção/clientes/motoristas. Commit.

### Task 8: Abas Serviços e Financeiro (UI)

**Files:** `components/abas/ServicosTab.tsx`, `FinanceiroTab.tsx`, CSS, testes.

- [ ] Serviços: KPIs (4) · Serviços por mês (barras) | Status · Por tipo de serviço | Por tipo de veículo · Produção própria × terceirizada | Emergenciais por mês.
- [ ] Financeiro: KPIs (6) · Ciclo financeiro (5 medidas em lista) | Status de faturamento · Ticket médio mensal | Recebimentos por forma e por status (duas tabelas no mesmo bloco) · **Clientes** largura total (tabela única; linha com "Ver meses" expansível no desktop e no celular).
- [ ] Testes por texto/role. Conferir no navegador (dev server em http://localhost:36590) em 1440 e 375. Commit.

### Task 9: Abas Despesas e Frota (UI)

- [ ] Despesas: filtros próprios (categoria, forma, empresa) · KPIs (6, com chip ANT. e faixa da hospedagem com texto) · Despesas por mês | Por categoria · Por empresa | Grupos DRE · Por motorista (largura total).
- [ ] Frota: KPIs (5) · Telemetria (6 medidas em lista com `s/dado`) | Km por dia (linha) · Uso da frota própria por mês (barras úteis × fds + tabela) | Eventos por mês (barras empilhadas, 3 séries distinguíveis por padrão + legenda).
- [ ] Testes; navegador; commit.

### Task 10: Abas Motoristas, Manutenções e Multas (UI)

- [ ] Motoristas: KPIs (3) · Ranking largura total com segmento Todos | Próprios | Terceiros e "Ver meses" · CNH vencendo | Nota de condução por mês · Score por motorista e mês (tabela) | Ranking mensal (top 5).
- [ ] Manutenções: KPIs (5) · Custo por mês | Por tipo de reparo · Categorias com metas (tabela com selo Dentro/Fora da meta).
- [ ] Multas: KPIs (3) · Por mês | Por motorista · Por infração.
- [ ] Testes; navegador; commit.

### Task 11: Verificação final (controller)

- [ ] Suíte inteira, typecheck, `rg` de hex/gradient. Navegador: 8 abas em 1440/1120/820/375, sem rolagem horizontal, console limpo, troca de aba e filtros.
- [ ] Revisão final de branch; correções; relatório ao Renan com capturas. Publicação em DEV e paridade por aba só com o ok dele.
