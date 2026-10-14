# Gestão de Frota — preventiva e custo total (`#/frota`)

Data: 14/10/2026 · Aprovado por Renan (brainstorm desta data).

## 1. Objetivo

Completar o módulo `#/frota` com o que o caderno de outubro pede em "Gestão de frota":

- **Entrega A — Manutenção preventiva** por km e por tempo, com lembrete em Pendências e no Dashboard.
- **Entrega B — Custo total por veículo** (manutenção + multas + combustível + documentos) com R$/km.

Fora do escopo: vistorias, status operacional ao vivo (posição/ignição), e-mail próprio da preventiva, abastecimento via Infleet, edição de despesas, nova rota ou módulo separado.

## 2. Estado atual (conferido no código e no DEV em 14/10/2026)

- `#/frota` já tem as abas Pendências, Veículos (ficha com "Custo de manutenção" e linha do tempo com posses), Manutenções, Multas e colisões, Indicadores. Padrão: `domain/` puro → `data/` (Source Dataverse/mock, mappers, schema) → `FrotaPage` → `views/` e `components/` com primitivas de `packages/ui`.
- Tabelas em uso: `cr40f_veiculos`, `cr40f_manutencoes`, `cr40f_multas`, `cr40f_infracaodetransito`, `cr40f_colisao_v2`, `new_possedeveiculo`.
- Manutenção tem `cr40f_kmatual` e o multi-select `new_servicosmanutencao` (catálogo em `domain/manutencaoCatalogo.json`). Não existe plano preventivo nem hodômetro do veículo.
- `cr40f_veiculos` já tem `new_infleetvehicleid` e `new_ultimasincronizacaoinfleet` (existe sync Infleet → Dataverse, por flow fora do repo). Infleet entrega `odometer` por placa (`detalhes_veiculo`); 15 veículos rastreados. Frota no DEV: 14 ativos próprios, 2 terceiros, 1 aluguel, 4 vendidos, 12 sem status.
- Telemetria Infleet já está no Dataverse: `new_telemetriadiariainfleet` (`new_distanciapercorridakm` por dia e veículo), `new_viageminfleet`, `new_eventoinfleet`; consumidas pelo Dashboard aba Frota.
- Combustível real: `cr40f_despesaoperacional` categoria "Abastecimento" (2.673 lançamentos, R$ 489 mil no DEV) com lookups `_cr40f_veiculo_value` e `_cr40f_categoria_value`. Infleet não registra abastecimento (zero no período testado).
- Documentos de frota (CRLV, IPVA, seguro) em `cr40f_documento` existem só na branch `claude/document-management-reminders-402b2e`, não mesclada.

## 3. Decisões

1. Núcleo: preventiva primeiro (A), custo total em seguida (B), ambos dentro de `#/frota`.
2. Km atual vem do Infleet sincronizado para `cr40f_veiculos` (flow), com fallback para o maior `cr40f_kmatual` das manutenções do veículo, marcado como estimado. O shell nunca chama a Infleet.
3. Plano preventivo é um só, padrão da frota (tabela `new_itemplanopreventivo`), aplicado a todo veículo Ativo e Próprio. Sem plano por veículo.
4. Última execução de um item deriva das manutenções Realizadas que contêm o serviço; não há tabela de histórico. `new_baselinepreventiva` cobre apenas itens sem manutenção registrada.
5. Lembrete: pendência tipo `preventiva` em `#/frota` e KPI na aba Frota do Dashboard. Sem e-mail nesta entrega; quando a central de avisos de Documentos (Entrega 2) existir, a preventiva entra como categoria.
6. Combustível por veículo vem das despesas operacionais categoria "Abastecimento". A estimativa Infleet (`new_custocombustivelconsumido`) não entra.
7. Despesas da categoria "Manutenção" não somam ao custo (evita dupla contagem com `cr40f_manutencoes`); as sem `_cr40f_manutencao_value` viram aviso na ficha.
8. Regra de aviso padrão por item: a vencer com ≤ 1.000 km ou ≤ 30 dias; vencido quando passou km ou data; vence pelo que chegar primeiro.

## 4. Schema (DEV; `pnpm push` cria, inclui na solução e publica)

### 4.1 `cr40f_veiculos` (colunas novas)

| Coluna | Tipo | Uso |
| --- | --- | --- |
| `new_hodometro` | Whole number (km) | odômetro lido na Infleet |
| `new_hodometroem` | DateTime | instante da leitura |

### 4.2 `new_itemplanopreventivo` (nova, escopo organização)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `new_name` | Texto (primária) | nome exibido, ex.: "Troca de óleo" |
| `new_servico` | Choice, single | mesmos valores do catálogo `new_servicosmanutencao` |
| `new_intervalokm` | Whole number | opcional |
| `new_intervalomeses` | Whole number | opcional; ao menos um dos dois intervalos obrigatório (validação no shell) |
| `new_avisokm` | Whole number | padrão 1000 |
| `new_avisodias` | Whole number | padrão 30 |
| `statecode`/`statuscode` | padrão | inativar em vez de excluir |

### 4.3 `new_baselinepreventiva` (nova, escopo organização)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `new_name` | Texto (primária) | "placa · item", gerado pelo shell |
| `new_veiculo` | Lookup `cr40f_veiculos` | obrigatório |
| `new_item` | Lookup `new_itemplanopreventivo` | obrigatório |
| `new_km` | Whole number | km da última execução conhecida |
| `new_data` | DateOnly | data da última execução conhecida |

Uma linha por veículo × item (o shell faz upsert: procura antes de criar).

### 4.4 Flow Infleet → hodômetro

Editar o flow existente de sincronização Infleet (fora do repo) para gravar `new_hodometro` e `new_hodometroem` em cada sync, usando `odometer` e `location.fixTime` de `detalhes_veiculo`, casando por `new_infleetvehicleid`. Se o Renan preferir flow separado, muda só este item do plano. Nomes lógicos reais devem ser confirmados por `describe` antes dos mappers.

## 5. Domínio

### 5.1 `domain/preventiva.ts` (puro)

Entrada: veículos, manutenções, itens do plano, baselines, hoje. Para cada veículo com `status = Ativo` e `categoria = Próprio` × item ativo:

- **Última execução:** manutenção `Realizado` mais recente do veículo cujo `servicos` inclui `new_servico`; usa `km` e `dataManutencao`. Sem nenhuma, usa o baseline; sem baseline, estado `sem_base`.
- **Km atual:** `new_hodometro` se existir; senão maior `cr40f_kmatual` entre as manutenções do veículo (`kmEstimado: true`). Sem nenhum, aplica só a regra por tempo.
- **Próxima:** `kmProxima = últimoKm + intervaloKm` (se houver intervalo km); `dataProxima = últimaData + intervaloMeses` (se houver intervalo meses). `faltamKm = kmProxima − kmAtual`; `faltamDias = dataProxima − hoje`.
- **Estado:** `vencido` se `faltamKm < 0` ou `faltamDias < 0`; `a_vencer` se `faltamKm ≤ avisoKm` ou `faltamDias ≤ avisoDias`; senão `em_dia`.
- **Em andamento:** se existe manutenção `Solicitado`, `Aprovado` ou `Programado` do veículo contendo o serviço, o item não gera pendência (`emAndamento: true`), mas continua na ficha.

```ts
type EstadoPreventiva = 'vencido' | 'a_vencer' | 'em_dia' | 'sem_base'
type Preventiva = {
  veiculo: Ref; item: ItemPlano; estado: EstadoPreventiva; emAndamento: boolean
  kmAtual: number | null; kmEstimado: boolean
  kmProxima: number | null; dataProxima: string | null; faltamKm: number | null; faltamDias: number | null
  ultima: { km: number | null; data: string | null; origem: 'manutencao' | 'baseline'; manutencaoId: string | null } | null
}
```

### 5.2 Pendências

`buildPendencias` recebe também as preventivas. `vencido` e `a_vencer` sem `emAndamento` geram `Pendencia` tipo `preventiva` (novo em `PendenciaTipo`, ordem entre `aprovar` e `programar`), título "Item · PLACA", `prazo = dataProxima`, texto "em X km" quando só há regra por km. Abrir a pendência abre a ficha do veículo em `?ficha=<id>&secao=preventivas`. O Dashboard aba Frota usa a mesma função para contar vencidas/a vencer.

### 5.3 `domain/custoTotal.ts` (puro)

Período padrão: últimos 12 meses (`ultimos12Meses`, seletor atual da ficha).

- manutenção: `cr40f_manutencoes` `Realizado` com `valor`, por `dataManutencao`;
- multas: `cr40f_multas` do veículo com infração e `infracao.valor`, por `dataHora`, exceto `Finalizado` sem valor;
- combustível: despesas categoria "Abastecimento" do veículo, por `cr40f_datagasto`;
- documentos: IPVA e seguro de `cr40f_documento` do veículo (função pronta, retorna vazio enquanto a tabela não existir na main);
- `kmRodado`: soma de `new_distanciapercorridakm` da telemetria diária do veículo no período; `custoPorKm = total / kmRodado` ou `null` sem telemetria.

```ts
type CustoTotal = {
  total: number; porFonte: Record<'manutencao' | 'multas' | 'combustivel' | 'documentos', { valor: number; qtd: number; semValor: number; indisponivel: boolean }>
  kmRodado: number | null; custoPorKm: number | null; despesasManutencaoSemVinculo: number
}
```

Indicadores: `custoPorVeiculo(...)` (lista ordenável com total, R$/km e maior fonte) e `custoPorMes` estendido para empilhar as fontes.

## 6. Dados

- `FrotaData` ganha `planoPreventivo: ItemPlano[]`, `baselines: Baseline[]`, `despesasCombustivel: DespesaCombustivel[]`, `telemetriaKm: TelemetriaKm[]`; `TABLE`, `mappers`, `mock` e `source` acompanham.
- Despesas: `cr40f_despesaoperacional` filtrado no servidor por categoria "Abastecimento" (resolver o id da categoria por nome uma vez) e `cr40f_datagasto` nos últimos 12 meses; `$select` só `cr40f_valor`, `cr40f_datagasto`, `_cr40f_veiculo_value`, `_cr40f_manutencao_value`, `_cr40f_categoria_value`. Também traz categoria "Manutenção" sem vínculo só para o aviso.
- Telemetria: `new_telemetriadiariainfleet` com `new_data`, `_new_veiculo_value`, `new_distanciapercorridakm`, últimos 12 meses (mesma consulta do Dashboard).
- Escritas (via `DataSource`): criar/editar/inativar item do plano; upsert de baseline. Privilégio checado como em `RegistroDrawer`.
- `ViewGate` por aba: aba Plano exige só `planoPreventivo`; ficha não bloqueia por despesas ou telemetria (fonte marcada `indisponivel`, `custoPorKm = null`).
- Mock cobre os quatro estados da preventiva, item em andamento, veículo sem hodômetro (estimado) e veículo sem telemetria.

## 7. UI (segue `DESIGN_SYSTEM.md`; só componentes e classes já usados em `#/frota`)

- **Aba "Plano preventivo"** (`?aba=plano`): tabela neutra `#FCFCFB` com Item, Serviço, Intervalo (km / meses), Aviso, Ativo. "Novo item" abre `Drawer` com nome, serviço (Select do catálogo), km, meses, aviso km/dias; inativar no mesmo drawer. Botões de escrita só com privilégio.
- **Ficha do veículo**, seção "Preventivas" antes da linha do tempo: um item por linha com badge de estado (cor + texto: Vencido/erro, A vencer/aviso, Em dia/sucesso, Sem base/neutro, "Em andamento" como texto secundário), "faltam 850 km · 12 dias", última execução com link para a manutenção. `sem_base` mostra "Informar última execução" (drawer km + data → baseline). Linha "Hodômetro: 175.233 km · lido em 14/10 10:37" ou "km estimado pela última manutenção".
- **Ficha, seção "Custo total"** substitui "Custo de manutenção": KPI total e R$/km, quatro linhas por fonte (qtd, valor, "indisponível" quando a consulta falhou), aviso de despesas de manutenção sem vínculo. Classes `frota-kpi` e `frota-muted`; sem gráfico novo.
- **Pendências:** grupo "Preventivas" com os mesmos cartões; badge da aba soma.
- **Indicadores:** card "Custo por veículo" (tabela ordenável) e série mensal empilhada por fonte com as barras de `Charts`.
- **Dashboard aba Frota:** KPI "Preventivas vencidas / a vencer" com link para `#/frota`.
- Deep link: `#/frota?aba=veiculos&ficha=<id>&secao=preventivas` rola até a seção.

## 8. Verificação

- Testes: `preventiva`, `custoTotal`, `pendencias` (tipo novo), mappers e schema, Source (filtros e `$select`), componentes (aba Plano, seção Preventivas, Custo total, drawers), `FrotaPage` (abas e deep link), Dashboard (KPI). Suíte do shell e typecheck verdes.
- Metadata confirmada por `describe` no DEV antes de escrever mappers (nomes lógicos, choices, lookups).
- Mock no navegador: quatro estados, item em andamento, hodômetro estimado, fonte indisponível.
- Publicação em DEV com a versão informada; conferência autenticada da ficha e da aba Plano; flow do hodômetro validado separadamente (campo preenchido para os 15 veículos rastreados).

## 9. Ordem de implementação

1. Schema (colunas do veículo, duas tabelas) e flow do hodômetro.
2. Entrega A: domínio da preventiva, dados, aba Plano, seção na ficha, pendências, KPI do Dashboard.
3. Entrega B: Source de despesas e telemetria, domínio do custo total, seção na ficha, Indicadores.
4. Após a mesclagem de Documentos: ligar a fonte `documentos` e registrar a preventiva na central de avisos.
