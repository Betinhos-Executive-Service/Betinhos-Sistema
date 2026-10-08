# Dashboard em React (base + aba Resumo) — design

**Data:** 08/10/2026 · **Status:** aprovado em conversa (escolhas do Renan) · **Escopo:** rota `#/dashboard` no shell, primeira entrega da migração do WebResource `new_dashboard` (Dashboard Betinhos v1.0.268).

## 1. Contexto e decisões

- O legado (`Dashboard Betinhos/Dashboard.html`, ~17,9 mil linhas) tem 12 abas, modo TV (Samsung Tizen, Chromium 63) e calcula tudo no navegador sobre o histórico inteiro. As fórmulas validadas estão em `Dashboard Betinhos/DOCUMENTACAO_KPIS_DASHBOARD.md` (§1–§6) e são a especificação desta entrega.
- **Divisão:** esta entrega faz a base (rota, filtros globais, camada de dados com atualização real) e **só a aba Resumo**. As outras 11 abas viram specs seguintes, uma ou duas por vez.
- **Fidelidade:** mesmas fórmulas e mesmos números do legado; layout novo no Design System. Divergência numérica com o legado é bug, salvo correção listada na §8.
- **Histórico fixo 2023–2025:** mantido como constante isolada em `data/historico.ts`, testada e documentada (inclui `fat2026` jan–mar, usado só pela meta).
- **Jan–mar/2026 vem do CSV legado** (escolha do Renan, 08/10/2026): as ~1.978 linhas embutidas no legado (`legacy2026Rows`) viram `data/historico2026.ts` e substituem as reservas do Dataverse com saída (texto bruto `slice(0,10)`) entre 2026-01-01 e 2026-03-31, como no legado.
- **Referência literal do legado:** `2026-10-08-dashboard-resumo-legado.md` (trechos do `Dashboard.html` com linha). Em conflito entre a doc de KPIs e o código, vale o código (paridade numérica).
- **Gráficos:** Recharts, com cores e tipografia vindas dos tokens `--bt-*`.
- **Dados:** cálculo no cliente, com consulta limitada por janela de datas e `$select` mínimo (abordagem 1). Sem FetchXML agregado.
- **Modo TV fica no legado.** O WebResource `new_dashboard` continua no menu como "Dashboard (completo)" até todas as abas migrarem.
- **Fora do escopo:** abas Serviços, Faturamento, Pagamentos, Despesas, Frota, Motoristas/MarQPonto, Manutenções, Multas, Trocas, Marketing e diagnóstico de TV; modo TV e PIN; importação do MarQPonto; log de erros em `new_appmotoristaslog`; alerta de nota de condução (Infleet, vai com a aba Frota); exportação. A tela **não grava nada** no Dataverse.

## 2. Schema usado (do mapa `T`/`F` do legado; conferir na metadata de DEV na Tarefa 0)

| Entidade (entity set) | Campos | Janela |
|---|---|---|
| `cr40f_reservadeveculos` (`cr40f_reservadeveculoses`) | `cr40f_reservadeveculosid`, `cr40f_dataehorriodesada`, `createdon`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_tipodoservico`, `cr40f_tipodeveiculo`, `_cr40f_veiculo_value`, `new_categoriadoitem`, `_new_composicaodepreco_value`, `_cr40f_financeiro_value` (+ FormattedValue); `$expand=cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)` | saída ≥ 1º/jan de min(ano do início − 1, ano atual − 2) e < fim do filtro + 1 dia (BRT) |
| `cr40f_composicaodeprecos` | `cr40f_composicaodeprecosid`, `new_valortotal`, `new_status` (100000000 pendente, 100000001 concluída) | todas, como no legado (3 colunas, sem anotações), casadas pelo lookup `_new_composicaodepreco_value` |
| `cr40f_manutencoes` | `cr40f_datamanutencao`, `cr40f_valor` | período do filtro (+ LM/LY quando exibidos) |
| `cr40f_multas` | `cr40f_dataehorario`, `cr40f_status` (202410000 = pendente) | idem |
| `cr40f_errooperacional` | `cr40f_dataocorrencia` | idem |
| `cr40f_funcionarios` | `cr40f_funcionariosid`, `cr40f_nomecompleto`, `cr40f_status`, `cr40f_validadedacnh` | todos |
| `cr40f_veiculos` | `cr40f_veiculosid`, `cr40f_statusdoveiculo`, `new_categoriadoveiculo` (100000000 própria, 100000001 terceirizada) | todos |

- Status de reserva usados: 202410001 Confirmado, 202410005 Programado, 202410008 Concluído. Faturamento: Pago 202410010, Pagante em viagem 202410006, Mensal 202410008. Multa pendente 202410000.
- **Classificação literal do legado:** onde o legado usa texto ("cancel", "recus", "conclu/realiz/finaliz", "dispon/ativo", "pend"), o domínio usa o mesmo texto, com a mesma normalização (`normL` sem acento ou `stL` só minúsculas). Trocar por código fica para depois da paridade, numa mudança própria. A Tarefa 0 só confere na metadata de DEV que campos e códigos existem.
- Paginação por `@odata.nextLink` com `Prefer: odata.maxpagesize=5000`. Coluna ausente na metadata: repete a consulta sem ela (mesmo "safe mode" do Operacional) e o KPI dependente mostra `s/dado`.

## 3. Regras (domínio puro)

Base `rv` = reservas com `new_categoriadoitem = 100000000`, enriquecidas com `valor` (CP, ou 0), `cpConcluida`, `cpPendente`, `opId`, motorista, cliente (`Sem cliente` quando vazio), veículo e tipo. Filtros (período, status, cliente, motorista, tipo de veículo) aplicam antes de qualquer KPI; filtro sem seleção = todos.

**KPIs executivos** (doc §4), cada um com valor, comparativos LM/LY e sparkline mensal do ano:
1. **Faturamento** — soma de `valor`; linha "Previsão até fim do mês" ou "Previsão anual" com os estados do legado (período encerrado, sem base futura, sem base realizada).
2. **Serviços** — contagem de `rv`.
3. **Ticket médio** — elegíveis = CP concluída e valor > 0.
4. **A receber** — CP concluída + OP + não Pago + valor > 0; apoio "% do faturamento".
5. **CP pendente** — deduplicada por ID da CP, regra da doc; apoio PROJ = ticket × quantidade e FUTURO = serviços futuros × ticket.
6. **Recebimento %** — Pago ÷ base (valor > 0, exceto Pagante em viagem e Mensal); apoio "recebido de base".

**Comparativos:** LM e LY só quando o período corresponde ao mês atual (regra do legado); variação = (atual − comparado) ÷ comparado × 100; sem base → `s/dado`.

**Frota e pessoas** (doc §4): Manutenções (quantidade + custo + % da receita, atenção acima de 10%), Multas (quantidade + pendentes e %), CNH em atenção (sem validade ou < 90 dias), Frota ativa (ativos de total).

**Alertas de qualidade** (doc §5), com as datas de corte em constantes nomeadas (`CORTE_SEM_VEICULO = 2026-06-01`, `CORTE_SEM_MOTORISTA = 2026-04-10`, `CORTE_SEM_CLIENTE = 2026-04-01`): OS sem veículo, Sem tipo de veículo, Sem motorista, Sem cliente, Ocorrências (% dos serviços e "1 a cada X").

**Destaques:**
- Produção própria × terceirizada: série mensal de quantidade por categoria do veículo; Top 5 motoristas de cada lado por faturamento (desempate por quantidade).
- Serviços emergenciais: `createdon` no mesmo dia da saída (data em America/Sao_Paulo); Top 3 clientes com % e quantidade; tabela mensal com os 5 primeiros clientes.

**Análises** (doc §6): Total produzido (3 anos), Meta × realizado (meta = (50% LY + 40% LY−1 + 10% LY−2) × 1,13; atingimento; meta proporcional por dias), Faturamento por cliente (até 6, sem `Sem cliente`), Ticket médio mensal, Status dos serviços, Custo da frota, Top clientes por volume e por faturamento, Serviços por motorista.

**Histórico fixo:** `historico.ts` exporta os valores mensais de 2023–2025 copiados do legado (`fat2023/2024/2025`). A combinação com o Dataverse segue exatamente a regra do legado, conferida na Tarefa 0 e coberta por teste.

## 4. Carga e atualização

- `source.ts` expõe `load(filtro)` com implementações Dataverse e mock (mock automático sem `Xrm.WebApi`, selo "Dados de exemplo").
- O período é sempre definido (atalho ou Personalizado com as duas datas); não há modo "sem data" como no legado.
- Mudar o período recarrega a janela. Mudar só status, cliente, motorista ou tipo recalcula sem recarregar.
- **Atualização a cada 60 s refaz a consulta** (corrige o legado) apenas com a aba visível (`visibilitychange`). Botão "Atualizar" no header mobile e na barra utilitária. Os dados antigos ficam na tela durante a recarga; uma recarga mais antiga nunca sobrescreve uma mais nova.
- Consultas independentes rodam em paralelo (no máximo 4). Falha de um conjunto secundário (multas, ocorrências etc.) mostra `s/dado` só nos cards dele, com aviso; falha de reservas mostra o erro da página.

## 5. Layout

Composição do DS §11.1: anomalia e ação primeiro.

- `PageHeader`: eyebrow Operacional, título Dashboard, meta "Período · N serviços · atualizado HH:mm", selo de dados de exemplo no mock. Sem ação primária. Link secundário "Abrir dashboard completo" para o legado.
- `PageToolbar filters`: período (`SegmentedControl` ou `Select` com Hoje, 7 dias, 30 dias, Este mês, Mês anterior, Este ano (padrão), Ano anterior, Personalizado com datas) e `Select multiple` de status, cliente, motorista e tipo de veículo; "Limpar filtros".
- Seções, de cima para baixo:
  1. 6 `MetricCard` executivos (4 colunas; 2 abaixo de 1120 px; 1 abaixo de 560 px) com chips LM/LY (cor + seta + texto) e sparkline.
  2. Alertas: CNH, Multas, Ocorrências e os 4 de qualidade, como lista compacta com `StatusBadge` (OK / Atenção), nunca só cor.
  3. Frota e pessoas: 4 cards menores.
  4. Destaques: Produção própria × terceirizada (gráfico + Top 5 × 2) e Emergenciais (Top 3 + tabela mensal).
  5. Análises em grade de 2 colunas (1 abaixo de 820 px): cada `Surface` tem título, período, unidade, gráfico com tooltip e alternativa tabular ("Ver tabela"), conforme DS §10.16.
- Gráficos: série principal `--bt-color-action`, comparação `--bt-color-brand`, semânticas só com significado, grid `--bt-color-line`, barras com raio 4 px, sem pizza com muitas fatias.
- Estados: skeleton no formato final na primeira carga; erro com "Tentar de novo"; vazio por filtro com "Limpar filtros"; versão de build visível (shell).
- `dashboard.css` usa apenas tokens `--bt-*`; sem gradiente, light-only, `#FCFCFB` em tabelas e cabeçalhos neutros; sem rolagem horizontal em 320 px (tabelas viram listas).

## 6. Arquitetura

`apps/shell/src/pages/dashboard/`:
- `domain/`: `types.ts`, `codes.ts` (option sets e datas de corte), `base.ts` (enriquecimento e filtros), `periodo.ts` (atalhos, LM/LY, janela de carga), `kpis.ts`, `alertas.ts`, `destaques.ts`, `analises.ts`, `meta.ts`, `previsao.ts`. Todos puros e testados com os exemplos da doc e casos-limite (sem base, valor 0, CP duplicada, fuso).
- `data/`: `queries.ts`, `source.ts` (Dataverse/mock), `mock.ts`, `historico.ts`.
- `useDashboard.ts`: filtros, carga, refresh, estados.
- `components/`: `DashboardToolbar`, `KpiGrid`, `KpiChip`, `Sparkline`, `AlertList`, `ProducaoPropriaTerceira`, `Emergenciais`, `AnaliseCard`, `charts/` (wrappers Recharts com tokens).
- `DashboardPage.tsx` + teste de página.
- Menu: `{ kind: 'page', id: 'dashboard', label: 'Dashboard', page: 'dashboard' }` em Operacional; o item `wr('Dashboard', 'new_dashboard')` vira "Dashboard (completo)".
- Dependência nova: `recharts` em `apps/shell` (versão fixa no lockfile).

## 7. Aceite

- Em mock e em DEV, `#/dashboard` abre com "Este ano" e mostra as 5 seções; filtros e atalhos recalculam; a atualização refaz a consulta.
- **Paridade:** para "Este ano" e "Mês anterior" em DEV, os 6 KPIs executivos, os 4 de frota e pessoas e os 5 alertas batem com o legado aberto no mesmo momento. Diferenças são explicadas pela §8 ou corrigidas.
- `pnpm test` e `pnpm typecheck` verdes; sem cor fora dos tokens; 320 px sem rolagem horizontal; foco visível e gráficos com alternativa tabular.
- Nenhuma escrita no Dataverse.

## 8. Correções conscientes em relação ao legado

- Atualização automática refaz a consulta (antes só re-renderizava com cache).
- Carga limitada à janela de datas, em vez do histórico inteiro.
- Datas de corte e códigos em constantes nomeadas.
- Peculiaridades preservadas por paridade (registrar, não corrigir agora): CNH conta só funcionário com status "ativo" e validade preenchida até 90 dias (a doc diz que sem validade também conta); "Frota ativa" conta status com "dispon" ou "ativo" em minúsculas, o que inclui "Inativo"; emergencial e produção própria × terceirizada usam a data UTC bruta (`slice`), sem fuso; LY do Ticket médio no card de análise é sempre `s/dado`.
- Qualquer outra divergência numérica encontrada na paridade é registrada aqui antes de ser aceita.

## 9. Conferência de metadata (DEV, 08/10/2026)

Conferida no MCP `Dataverse_DEV`, somente leitura (`describe` e `read_query`).

| Item | Resultado |
|---|---|
| `cr40f_reservadeveculos`, entity set `cr40f_reservadeveculoses` | ok |
| Colunas da reserva: `cr40f_reservadeveculosid`, `cr40f_dataehorriodesada`, `createdon`, `cr40f_status`, `cr40f_statusdefaturamento`, `cr40f_tipodoservico`, `cr40f_tipodeveiculo`, `new_categoriadoitem` | ok (todas existem) |
| Lookups da reserva: `cr40f_veiculo` (→ `_cr40f_veiculo_value`), `new_composicaodepreco` (→ `_new_composicaodepreco_value`), `cr40f_financeiro` (→ `_cr40f_financeiro_value`) | ok |
| Navigation `cr40f_Motorista` → `cr40f_funcionarios` (`cr40f_funcionariosid`, `cr40f_nomecompleto`, `new_apelido`) | ok: lookup `cr40f_motorista` e as 3 colunas existem; join por SQL retornou linhas; nome `cr40f_Motorista` já usado no shell (operacional) |
| Navigation `cr40f_Cliente` → `cr40f_clientes1` (`cr40f_nomedocliente`) | ok: lookup `cr40f_cliente` e a coluna existem; join por SQL retornou linhas. A capitalização `cr40f_Cliente` vem do `$expand` do legado: o MCP não expõe nomes de navigation property |
| `cr40f_statusdefaturamento`: 202410010, 202410006, 202410008 | ok, valores existem; rótulos reais "Pago", "Pagante em Viagem" e "Faturamento Mensal" (o legado usa só o código) |
| `cr40f_status` da reserva: 202410001, 202410005, 202410008 | ok (Confirmado, Programado, Concluído) |
| `new_categoriadoitem`: 100000000 | ok (Serviço) |
| `cr40f_composicaodeprecos`, entity set `cr40f_composicaodeprecoses`: `cr40f_composicaodeprecosid`, `new_valortotal`, `new_status` | ok |
| `new_status` da composição: 100000000, 100000001 | ok (Pendente, Concluido) |
| `cr40f_manutencoes`, entity set `cr40f_manutencoeses`: `cr40f_datamanutencao`, `cr40f_valor` | ok |
| `cr40f_multas`, entity set `cr40f_multases`: `cr40f_dataehorario`, `cr40f_status` | ok |
| `cr40f_multas.cr40f_status`: 202410000 | ok (Notificar o Condutor) |
| `cr40f_errooperacional`, entity set `cr40f_errooperacionals`: `cr40f_dataocorrencia` | ok |
| `cr40f_funcionarios`, entity set `cr40f_funcionarioses`: `cr40f_funcionariosid`, `cr40f_nomecompleto`, `cr40f_status`, `cr40f_validadedacnh` | ok |
| `cr40f_veiculos`, entity set `cr40f_veiculoses`: `cr40f_veiculosid`, `cr40f_statusdoveiculo`, `new_categoriadoveiculo` | ok |
| `cr40f_veiculos.new_categoriadoveiculo`: 100000000, 100000001 | ok (Próprio, Terceiro; existe também 100000002, Aluguel) |
