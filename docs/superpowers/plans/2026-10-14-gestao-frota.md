# Gestão de Frota (preventiva + custo total) — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos usam `- [ ]`.

**Objetivo:** dentro de `#/frota`, manutenção preventiva por km/tempo com lembrete em Pendências e no Dashboard (Entrega A) e custo total por veículo com R$/km (Entrega B).

**Arquitetura:** o módulo já segue `domain/` puro → `data/` (DataSource Dataverse e mock, mappers, schema) → `FrotaPage` → `views/` e `components/`. Entram dois domínios novos (`preventiva.ts`, `custoTotal.ts`), quatro conjuntos novos em `FrotaData`, uma aba, duas seções na ficha e um tipo de pendência. O Dashboard reaproveita o domínio da preventiva para um KPI. Schema novo é criado por script PowerShell (molde de Documentos), e o hodômetro chega por flow Power Automate.

**Stack:** React 19 + TypeScript, Vitest + Testing Library (jsdom), `@betinhos/ui`, Xrm.WebApi, PowerShell 5.1 para schema.

**Spec:** `docs/superpowers/specs/2026-10-14-gestao-frota-design.md`. **Base:** branch `claude/xenodochial-payne-bca064`, HEAD `3e04db1`.

## Restrições globais

- pt-BR em UI, testes e commits; UTF-8 com acentos. Commits detalhados em português terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Só `apps/shell/src/pages/frota/**`, `apps/shell/src/pages/dashboard/**` (Tarefa 12) e `packages/deploy/provision-frota-preventiva.ps1`. Nada em `packages/ui`.
- Design System: ler `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` antes das tarefas de UI (8–11, 13). Sem gradiente, sem cor nova, status sempre cor + texto, superfícies neutras `#FCFCFB` via tokens já usados em `frota.css`. Reutilizar classes existentes (`frota-group`, `frota-kpi`, `frota-detail`, `frota-muted`, `frota-cluster`, `frota-link`).
- Nomes lógicos: `cr40f_itemplanopreventivo`, `cr40f_baselinepreventiva`, `cr40f_veiculos.cr40f_hodometro` / `cr40f_hodometroem` (a Tarefa 1 confirma por `describe` no DEV; se o publisher gerar outro prefixo, ajustar `schema.ts` e nada mais).
- Comandos (na raiz do monorepo): testes `pnpm --filter @betinhos/shell test -- <caminho>`; suíte completa `pnpm --filter @betinhos/shell test`; `pnpm --filter @betinhos/shell typecheck`. Filtrar saída (`| tail -30`).
- Datas: `todaySP`, `daysBetween`, `addMonths`, `diaSP`, `formatBR` de `data/dates.ts`; dinheiro com `brl` de `data/format.ts`. Status de manutenção pelas constantes `MANUT` de `data/schema.ts`.
- Cada tarefa: testes escritos antes do código, suíte do arquivo verde, typecheck verde, commit.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `packages/deploy/provision-frota-preventiva.ps1` (novo) | cria colunas do veículo e as duas tabelas no DEV, inclui na solução, publica |
| `frota/data/types.ts` | `Veiculo` ganha hodômetro; tipos `ItemPlano`, `Baseline`, `DespesaCombustivel`, `TelemetriaKm`; `FrotaData` com 4 chaves novas |
| `frota/data/schema.ts` | nomes lógicos novos em `TABLE`, `ITEM_PLANO`, `BASELINE`, `DESPESA`, `TELEMETRIA` |
| `frota/data/mappers.ts` | `SELECT` e `map*` dos conjuntos novos |
| `frota/data/source.ts` | `DataSource` com `salvarItemPlano`, `inativarItemPlano`, `salvarBaseline`; `EMPTY_DATA` |
| `frota/data/dataverse.ts` | loaders e escritas reais |
| `frota/data/mock.ts` | seed dos estados de preventiva e custo; escritas em memória |
| `frota/domain/preventiva.ts` (novo) | cálculo puro das preventivas e resumo |
| `frota/domain/pendencias.ts` | tipo `preventiva` |
| `frota/domain/custoTotal.ts` (novo) | custo total por veículo e por mês/veículo |
| `frota/views/PlanoPreventivo.tsx` (novo) | aba com tabela e drawer do item |
| `frota/components/ItemPlanoDrawer.tsx` (novo) | formulário do item do plano |
| `frota/components/BaselineDrawer.tsx` (novo) | "Informar última execução" |
| `frota/components/Preventivas.tsx` (novo) | seção da ficha |
| `frota/components/CustoTotal.tsx` (novo) | seção da ficha |
| `frota/components/FichaVeiculo.tsx` | monta as duas seções; rola para `secao=preventivas` |
| `frota/views/Pendencias.tsx` | rótulo, ícone e abertura da pendência `preventiva` |
| `frota/views/Indicadores.tsx` | card "Custo por veículo" e série mensal empilhada |
| `frota/FrotaPage.tsx` | aba `plano`, parâmetro `secao`, badge |
| `frota/components/Ui.tsx` | `TABLE_LABEL` dos conjuntos novos |
| `dashboard/data/queries.ts`, `data/source.ts`, `data/mock.ts`, `domain/types.ts`, `domain/abas/frota.ts`, `components/abas/FrotaTab.tsx` | conjunto `preventivas` e KPI |

---

### Tarefa 1: schema no DEV (script de provisionamento)

**Arquivos:** criar `packages/deploy/provision-frota-preventiva.ps1`.

**Produz:** colunas `cr40f_hodometro` (Integer, 0..9.999.999), `cr40f_hodometroem` (DateTime UserLocal) em `cr40f_veiculos`; tabela `cr40f_itemplanopreventivo` (primária `cr40f_name`; `cr40f_servico` Picklist com os mesmos valores e rótulos de `domain/manutencaoCatalogo.json → servicos`; `cr40f_intervalokm` Integer 1..500000; `cr40f_intervalomeses` Integer 1..120; `cr40f_avisokm` Integer 0..100000 padrão 1000; `cr40f_avisodias` Integer 0..365 padrão 30); tabela `cr40f_baselinepreventiva` (primária `cr40f_name`; lookups `cr40f_veiculo` → `cr40f_veiculos` e `cr40f_item` → `cr40f_itemplanopreventivo`, ambos obrigatórios, delete `Restrict`; `cr40f_km` Integer; `cr40f_data` DateOnly). Ambas `OwnershipType = OrganizationOwned`, na solução `DV_SOLUTION`, publicadas.

- [ ] **Passo 1:** copiar o molde: `git show claude/document-management-reminders-402b2e:packages/deploy/provision-documentos.ps1 > packages/deploy/provision-frota-preventiva.ps1`. Manter as funções `Read-DotEnv`, `Get-Setting`, `Get-AccessToken`, `Invoke-Dataverse`, `Get-Rows`, `Add-SolutionComponent`, `Get-EntityId`, `Get-AttributeId`, `Picklist`, `Text`, `DateOnly`, `Ensure-AttributeOn`, `Ensure-Table`, `Ensure-Lookup`, `Label`. Trocar o prefixo das mensagens para `[frota-preventiva]`. Apagar o corpo específico de Documentos (tudo após as funções).
- [ ] **Passo 2:** gerar as opções do Picklist a partir do JSON (sem digitar à mão). No topo do corpo:

```powershell
$catalogo = Get-Content -LiteralPath (Join-Path $root "apps\shell\src\pages\frota\domain\manutencaoCatalogo.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$opcoesServico = @($catalogo.servicos | ForEach-Object { @{ Value = [int]$_.value; Label = Label $_.label } })
```

e uma função `PicklistComValores([string] $Schema, [string] $Display, [string] $Description, [object[]] $Options)` igual à `Picklist` do molde, mas com `OptionSet = @{ IsGlobal = $false; OptionSetType = "Picklist"; Options = $Options }`.

- [ ] **Passo 3:** corpo, nesta ordem (todas idempotentes: `Ensure-*` só cria o que falta):

```powershell
$veic = "cr40f_veiculos"; $item = "cr40f_itemplanopreventivo"; $base = "cr40f_baselinepreventiva"
Ensure-AttributeOn $veic @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Hodometro"; DisplayName = Label "Hodômetro (km)"; Description = Label "Última leitura do odômetro na Infleet"; MinValue = 0; MaxValue = 9999999; Format = "None" }
Ensure-AttributeOn $veic @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; SchemaName = "cr40f_HodometroEm"; DisplayName = Label "Hodômetro lido em"; Description = Label "Instante da leitura do odômetro"; Format = "DateAndTime"; DateTimeBehavior = @{ Value = "UserLocal" } }

Ensure-Table $item "cr40f_ItemPlanoPreventivo" "Item do plano preventivo" "Itens do plano preventivo" "Regra de manutenção preventiva da frota (intervalo em km e/ou meses)"
Ensure-AttributeOn $item (PicklistComValores "cr40f_Servico" "Serviço" "Serviço do catálogo de manutenção que executa este item" $opcoesServico)
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_IntervaloKm"; DisplayName = Label "Intervalo (km)"; Description = Label "Repetir a cada X km"; MinValue = 1; MaxValue = 500000; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_IntervaloMeses"; DisplayName = Label "Intervalo (meses)"; Description = Label "Repetir a cada X meses"; MinValue = 1; MaxValue = 120; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_AvisoKm"; DisplayName = Label "Avisar faltando (km)"; Description = Label "A vencer quando faltar até X km"; MinValue = 0; MaxValue = 100000; Format = "None" }
Ensure-AttributeOn $item @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_AvisoDias"; DisplayName = Label "Avisar faltando (dias)"; Description = Label "A vencer quando faltar até X dias"; MinValue = 0; MaxValue = 365; Format = "None" }

Ensure-Table $base "cr40f_BaselinePreventiva" "Baseline de preventiva" "Baselines de preventiva" "Última execução conhecida de um item quando não há manutenção registrada"
Ensure-Lookup "cr40f_veiculos_cr40f_baselinepreventiva_veiculo" $veic $base "cr40f_Veiculo" "Veículo" "Veículo da baseline" "Restrict" "ApplicationRequired"
Ensure-Lookup "cr40f_itemplanopreventivo_cr40f_baselinepreventiva_item" $item $base "cr40f_Item" "Item do plano" "Item do plano preventivo" "Restrict" "ApplicationRequired"
Ensure-AttributeOn $base @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; SchemaName = "cr40f_Km"; DisplayName = Label "Km da última execução"; Description = Label "Odômetro na última execução conhecida"; MinValue = 0; MaxValue = 9999999; Format = "None" }
Ensure-AttributeOn $base (DateOnly "cr40f_Data" "Data da última execução" "Data da última execução conhecida")

foreach ($t in @($item, $base)) { Add-SolutionComponent (Get-EntityId $t) 1 $t -IncludeSubcomponents }
foreach ($a in @("cr40f_hodometro", "cr40f_hodometroem")) { Add-SolutionComponent (Get-AttributeId $veic $a) 2 "$veic.$a" }
Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$veic</entity><entity>$item</entity><entity>$base</entity></entities></importexportxml>" } | Out-Null
Write-Step "Concluido. Confira no DEV: $item, $base e as colunas de hodometro em $veic."
```

- [ ] **Passo 4:** conferir sintaxe sem executar: `powershell.exe -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw packages/deploy/provision-frota-preventiva.ps1)) | Out-Null; 'ok'"`. Esperado: `ok`.
- [ ] **Passo 5:** **pedir ao Renan** para executar (precisa do `.env` e do login dele): `powershell.exe -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-frota-preventiva.ps1 -DeviceCode`. Depois confirmar com o MCP `Dataverse_DEV` `describe('tables/cr40f_itemplanopreventivo')`, `describe('tables/cr40f_baselinepreventiva')` e `describe('tables/cr40f_veiculos')` (colunas `cr40f_hodometro`, `cr40f_hodometroem`). Anotar os nomes lógicos reais; se divergirem do plano, corrigir `schema.ts` na Tarefa 3.
- [ ] **Passo 6: commit** — `deploy: script que cria o schema da manutenção preventiva no DEV (hodômetro do veículo, item do plano e baseline)`.

---

### Tarefa 2: flow do hodômetro (configuração, sem código no repo)

**Produz:** `cr40f_veiculos.cr40f_hodometro` e `cr40f_hodometroem` preenchidos para os veículos com `new_infleetvehicleid`.

- [ ] **Passo 1:** no Power Automate do DEV, abrir o flow que hoje grava `new_ultimasincronizacaoinfleet` (procurar por esse nome na ação "Atualizar uma linha" de `cr40f_veiculos`). Registrar no ledger o nome do flow.
- [ ] **Passo 2:** na mesma ação de atualização do veículo, mapear `Hodômetro (km)` = `int(body('Detalhes_do_veiculo')?['odometer'])` (arredondar: `int(formatNumber(...,'0'))`) e `Hodômetro lido em` = `body('Detalhes_do_veiculo')?['location']?['fixTime']`. Se o flow ainda não chama o endpoint de detalhes do veículo (`GET /vehicles/{id}` da API Infleet, o mesmo que o MCP `detalhes_veiculo` usa), adicionar essa chamada antes da atualização, por veículo. Se o Renan preferir flow separado, criar "Infleet — hodômetro diário" (recorrência diária 06:00 America/Sao_Paulo) com a mesma lógica.
- [ ] **Passo 3:** rodar o flow manualmente e verificar no MCP: `read_query("SELECT cr40f_placa, cr40f_hodometro, cr40f_hodometroem FROM cr40f_veiculos WHERE new_infleetvehicleid IS NOT NULL")`. Esperado: 15 linhas com km e data de hoje. Registrar o resultado no ledger; nada a commitar.

---

### Tarefa 3: tipos, schema, mappers e `EMPTY_DATA`

**Arquivos:** modificar `frota/data/types.ts`, `frota/data/schema.ts`, `frota/data/mappers.ts`, `frota/data/source.ts` (só `EMPTY_DATA`), `frota/components/Ui.tsx` (`TABLE_LABEL`). Teste: `frota/data/mappers.test.ts`.

**Produz:**

```ts
// types.ts
export type Veiculo = { /* campos atuais */; hodometro: number | null; hodometroEm: string | null }
export type ItemPlano = { id: string; nome: string; servico: number | null; intervaloKm: number | null; intervaloMeses: number | null; avisoKm: number; avisoDias: number; ativo: boolean }
export type Baseline = { id: string; veiculo: Ref | null; item: Ref | null; km: number | null; data: string | null }
/** Despesa operacional de combustível ou de manutenção (esta só para o aviso de dupla contagem). */
export type DespesaCombustivel = { id: string; dia: string | null; valor: number | null; veiculo: Ref | null; manutencao: Ref | null; categoria: 'combustivel' | 'manutencao' }
export type TelemetriaKm = { dia: string; veiculoId: string; km: number }
export type FrotaData = { veiculos; manutencoes; multas; infracoes; colisoes; posses; planoPreventivo: ItemPlano[]; baselines: Baseline[]; despesasCombustivel: DespesaCombustivel[]; telemetriaKm: TelemetriaKm[] }
// schema.ts
TABLE.planoPreventivo = 'cr40f_itemplanopreventivo'; TABLE.baselines = 'cr40f_baselinepreventiva'; TABLE.despesasCombustivel = 'cr40f_despesaoperacional'; TABLE.telemetriaKm = 'new_telemetriadiariainfleet'
export const CATEGORIA_DESPESA_TABLE = 'cr40f_categoriadespesaoperacional'
export const ITEM_PLANO = { nome: 'cr40f_name', servico: 'cr40f_servico', intervaloKm: 'cr40f_intervalokm', intervaloMeses: 'cr40f_intervalomeses', avisoKm: 'cr40f_avisokm', avisoDias: 'cr40f_avisodias' } as const
export const BASELINE = { nome: 'cr40f_name', veiculo: 'cr40f_Veiculo@odata.bind', item: 'cr40f_Item@odata.bind', km: 'cr40f_km', data: 'cr40f_data' } as const
export const AVISO_PADRAO = { km: 1000, dias: 30 } as const
// mappers.ts
export function mapItemPlano(row: Row): ItemPlano
export function mapBaseline(row: Row): Baseline
export function mapDespesaCombustivel(row: Row, categoriaDe: (id: string) => 'combustivel' | 'manutencao' | null): DespesaCombustivel | null  // null quando a categoria não é uma das duas
export function mapTelemetriaKm(row: Row): TelemetriaKm | null  // null sem veículo ou sem km
```

- [ ] **Passo 1: testes** em `mappers.test.ts` (acrescentar ao `describe` existente):

```ts
it('mapeia veículo com hodômetro', () => {
  const v = mapVeiculo({ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_hodometro: 175233, cr40f_hodometroem: '2026-10-14T13:37:38Z' })
  expect(v.hodometro).toBe(175233); expect(v.hodometroEm).toBe('2026-10-14T13:37:38Z')
  expect(mapVeiculo({ cr40f_veiculosid: 'V2', cr40f_placa: 'X' }).hodometro).toBeNull()
})
it('mapeia item do plano com avisos padrão quando vazios', () => {
  const item = mapItemPlano({ cr40f_itemplanopreventivoid: 'I1', cr40f_name: 'Troca de óleo', cr40f_servico: 100000000, cr40f_intervalokm: 10000, cr40f_intervalomeses: null, cr40f_avisokm: null, cr40f_avisodias: 15, statecode: 0 })
  expect(item).toEqual({ id: 'i1', nome: 'Troca de óleo', servico: 100000000, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 15, ativo: true })
  expect(mapItemPlano({ cr40f_itemplanopreventivoid: 'I2', statecode: 1 }).ativo).toBe(false)
})
it('mapeia baseline com lookups', () => {
  const b = mapBaseline({ cr40f_baselinepreventivaid: 'B1', _cr40f_veiculo_value: 'V1', '_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue': 'ABC1D23', _cr40f_item_value: 'I1', cr40f_km: 160000, cr40f_data: '2026-05-10' })
  expect(b).toEqual({ id: 'b1', veiculo: { id: 'v1', label: 'ABC1D23' }, item: { id: 'i1', label: '' }, km: 160000, data: '2026-05-10' })
})
it('mapeia despesa só nas categorias combustível e manutenção', () => {
  const cat = (id: string) => (id === 'c1' ? 'combustivel' : id === 'c2' ? 'manutencao' : null)
  expect(mapDespesaCombustivel({ cr40f_despesaoperacionalid: 'D1', cr40f_datagasto: '2026-09-01T10:00:00Z', cr40f_valor: 250.5, _cr40f_veiculo_value: 'V1', _cr40f_categoria_value: 'c1' }, cat)).toEqual({ id: 'd1', dia: '2026-09-01', valor: 250.5, veiculo: { id: 'v1', label: '' }, manutencao: null, categoria: 'combustivel' })
  expect(mapDespesaCombustivel({ cr40f_despesaoperacionalid: 'D2', _cr40f_categoria_value: 'c9' }, cat)).toBeNull()
})
it('mapeia telemetria diária e descarta linha sem veículo', () => {
  expect(mapTelemetriaKm({ new_data: '2026-09-01', _new_veiculo_value: 'V1', new_distanciapercorridakm: 120.4 })).toEqual({ dia: '2026-09-01', veiculoId: 'v1', km: 120.4 })
  expect(mapTelemetriaKm({ new_data: '2026-09-01', new_distanciapercorridakm: 5 })).toBeNull()
})
```

`dia` da despesa usa `diaSP(str(row.cr40f_datagasto))`.

- [ ] **Passo 2:** rodar `pnpm --filter @betinhos/shell test -- src/pages/frota/data/mappers.test.ts`. Esperado: falha (funções inexistentes / campos ausentes).
- [ ] **Passo 3:** implementar: `SELECT.veiculos` += `cr40f_hodometro, cr40f_hodometroem`; `SELECT.planoPreventivo = ['cr40f_itemplanopreventivoid','cr40f_name','cr40f_servico','cr40f_intervalokm','cr40f_intervalomeses','cr40f_avisokm','cr40f_avisodias','statecode']`; `SELECT.baselines = ['cr40f_baselinepreventivaid','_cr40f_veiculo_value','_cr40f_item_value','cr40f_km','cr40f_data']`; `SELECT.despesasCombustivel = ['cr40f_despesaoperacionalid','cr40f_datagasto','cr40f_valor','_cr40f_veiculo_value','_cr40f_manutencao_value','_cr40f_categoria_value']`; `SELECT.telemetriaKm = ['new_data','_new_veiculo_value','new_distanciapercorridakm']`. `avisoKm = num(row.cr40f_avisokm) ?? AVISO_PADRAO.km` (idem dias). `EMPTY_DATA` ganha as 4 listas vazias. `TABLE_LABEL` em `Ui.tsx`: `planoPreventivo: 'Plano preventivo', baselines: 'Baselines de preventiva', despesasCombustivel: 'Despesas de combustível', telemetriaKm: 'Telemetria Infleet'`.
- [ ] **Passo 4:** `pnpm --filter @betinhos/shell typecheck`. Vai apontar todos os literais de `Veiculo`/`FrotaData` nos testes e no mock sem os campos novos (`FrotaPage.test.tsx`, `FichaVeiculo.test.tsx`, `views/Veiculos.test.tsx`, `domain/*.test.ts`, `data/mock.ts`, `data/dataverse.test.ts`): acrescentar `hodometro: null, hodometroEm: null` nos veículos e usar `...EMPTY_DATA` onde `FrotaData` é montado à mão. Em `mock.ts` acrescentar as 4 chaves vazias por enquanto (a Tarefa 6 preenche). Rodar `pnpm --filter @betinhos/shell test -- src/pages/frota` e typecheck: verdes.
- [ ] **Passo 5: commit** — `Frota: tipos, nomes lógicos e mappers do plano preventivo, baseline, despesas de combustível e telemetria`.

---

### Tarefa 4: domínio da preventiva

**Arquivos:** criar `frota/domain/preventiva.ts`, `frota/domain/preventiva.test.ts`.

**Produz:**

```ts
export type EstadoPreventiva = 'vencido' | 'a_vencer' | 'em_dia' | 'sem_base'
export type UltimaExecucao = { km: number | null; data: string | null; origem: 'manutencao' | 'baseline'; manutencaoId: string | null }
export type Preventiva = {
  veiculo: Ref; item: ItemPlano; estado: EstadoPreventiva; emAndamento: boolean
  kmAtual: number | null; kmEstimado: boolean
  kmProxima: number | null; dataProxima: string | null; faltamKm: number | null; faltamDias: number | null
  ultima: UltimaExecucao | null
}
export type VeiculoPrev = Pick<Veiculo, 'id' | 'placa' | 'status' | 'categoria' | 'hodometro' | 'hodometroEm'>
export type ManutencaoPrev = Pick<Manutencao, 'id' | 'status' | 'dataManutencao' | 'criadoEm' | 'km' | 'veiculo' | 'servicos'>
export type EntradaPreventiva = { veiculos: VeiculoPrev[]; manutencoes: ManutencaoPrev[]; itens: ItemPlano[]; baselines: Baseline[] }
export const ESTADO_ORDEM: EstadoPreventiva[] = ['vencido', 'a_vencer', 'em_dia', 'sem_base']
export const ESTADO_LABEL: Record<EstadoPreventiva, string> = { vencido: 'Vencido', a_vencer: 'A vencer', em_dia: 'Em dia', sem_base: 'Sem base' }
export const ESTADO_TONE: Record<EstadoPreventiva, 'danger' | 'warning' | 'success' | 'neutral'> = { vencido: 'danger', a_vencer: 'warning', em_dia: 'success', sem_base: 'neutral' }
/** Km atual do veículo: hodômetro Infleet; sem ele, o maior km das manutenções (estimado). */
export function kmAtualDe(veiculo: VeiculoPrev, manutencoes: ManutencaoPrev[]): { km: number | null; estimado: boolean }
/** Todas as preventivas de todo veículo Ativo e Próprio × item ativo, ordenadas por estado, depois por faltamDias/faltamKm. */
export function calcularPreventivas(entrada: EntradaPreventiva, today: string): Preventiva[]
export function preventivasDoVeiculo(entrada: EntradaPreventiva, veiculoId: string, today: string): Preventiva[]  // inclui veículo mesmo fora do escopo (ficha de carro vendido mostra vazio)
export function resumoPreventivas(lista: Preventiva[]): { vencidas: number; aVencer: number }  // só sem emAndamento
```

Regras (spec §5.1): escopo `status === VEICULO.ATIVO && categoria === 100000000` (constante `PROPRIO = 100000000` exportada em `schema.ts` se não existir). Última execução = manutenção `REALIZADO` do veículo com `servicos.includes(item.servico)` e maior `diaSP(dataManutencao ?? criadoEm)`; `km` e `data` dela. Sem ela → baseline do par (veículo, item) se `km` ou `data` preenchidos → `origem: 'baseline'`. Sem nada → `sem_base` com tudo `null`. `kmProxima = ultima.km + intervaloKm` só se ambos existem; `dataProxima = addMonths(ultima.data, intervaloMeses)` só se ambos existem. `faltamKm = kmProxima - kmAtual` (null sem um dos dois); `faltamDias = daysBetween(today, dataProxima)`. Estado: `vencido` se `faltamKm < 0 || faltamDias < 0`; `a_vencer` se `faltamKm <= item.avisoKm || faltamDias <= item.avisoDias`; senão `em_dia`. Se há última execução mas nenhum dos dois cálculos foi possível (ex.: item só por km e veículo sem km), estado `sem_base`. `emAndamento` = existe manutenção do veículo com status em `[MANUT.SOLICITADO, MANUT.APROVADO, MANUT.PROGRAMADO]` e `servicos.includes(item.servico)`. Ordenação: `ESTADO_ORDEM`, depois `faltamDias ?? Infinity`, depois `faltamKm ?? Infinity`, depois `veiculo.placa`.

- [ ] **Passo 1: testes** (`today = '2026-10-14'`; fábricas locais `veic(id, extra)`, `manut(id, extra)`, `item(id, extra)` com todos os campos preenchidos como em `pendencias.test.ts`):

```ts
it('última execução vem da manutenção realizada mais recente que contém o serviço', ...)  // duas realizadas (set/2026 e jun/2026) com o serviço, uma realizada sem o serviço → ultima.manutencaoId = a de set, origem 'manutencao'
it('usa o hodômetro Infleet e marca estimado quando só há km de manutenção', ...)  // kmAtualDe: {km: 175233, estimado: false}; sem hodômetro e manutenções km 50000 e 61000 → {km: 61000, estimado: true}
it('vencido por km, a vencer por data, em dia, vence pelo que chegar primeiro', ...)  // item 10000 km / 6 meses; última km 160000 data 2026-06-01; hodômetro 171000 → vencido (faltamKm -1000) mesmo com faltamDias 48; hodômetro 165500 → a_vencer por km (faltam 4500 > 1000? então ajustar: avisoKm 5000) …
it('sem manutenção usa a baseline; sem baseline fica sem_base', ...)
it('item só por tempo funciona sem km; item só por km sem km atual fica sem_base', ...)
it('ignora veículos vendidos, terceiros e sem status e itens inativos', ...)
it('emAndamento quando há manutenção solicitada/aprovada/programada com o serviço', ...)
it('ordena vencidos, depois a vencer por dias, e resumo conta só os que não estão em andamento', ...)
```

Escreva asserts exatos (`toEqual` em objetos parciais com `expect.objectContaining`).

- [ ] **Passo 2:** rodar o arquivo. Esperado: falha (módulo inexistente).
- [ ] **Passo 3:** implementar `preventiva.ts` (≤ 120 linhas, sem React, sem Date além dos utilitários de `dates.ts`).
- [ ] **Passo 4:** rodar o arquivo e typecheck: verdes.
- [ ] **Passo 5: commit** — `Frota: domínio da manutenção preventiva (última execução, km atual, próxima, estado e resumo)`.

---

### Tarefa 5: pendência `preventiva`

**Arquivos:** modificar `frota/domain/pendencias.ts`, `frota/domain/pendencias.test.ts`.

**Produz:** `PendenciaTipo` += `'preventiva'`; `Pendencia.kind: Kind | 'preventiva'`; `Pendencia.veiculoId: string | null` (novo campo, preenchido em todas); `buildPendencias(data: Pick<FrotaData, 'manutencoes' | 'multas' | 'colisoes' | 'veiculos' | 'planoPreventivo' | 'baselines'>, today)`. `PENDENCIA_ORDEM = ['aprovar', 'preventiva', 'programar', 'agendada', 'notificar', 'indicar', 'colisao']`; `PENDENCIA_LABEL.preventiva = 'Preventivas vencidas ou a vencer (plano da frota)'`.

Regra: para cada `Preventiva` com estado `vencido` ou `a_vencer` e `!emAndamento`: `{ tipo: 'preventiva', kind: 'preventiva', id: \`${veiculo.id}:${item.id}\`, titulo: \`${item.nome} · ${veiculo.placa}\`, veiculo, veiculoId: veiculo.id, pessoa: null, prazo: dataProxima, dias: faltamDias, peso: estado === 'vencido' ? -1000 + (faltamKm ?? faltamDias ?? 0) : (faltamDias ?? faltamKm ?? 0) }`. Quando só há km, `prazo = null` e `dias = null`; o texto "em X km" fica na view (Tarefa 10).

- [ ] **Passo 1: testes** (acrescentar): pendência preventiva aparece entre `aprovar` e `programar`; vencida antes de a vencer; `em_dia` e `emAndamento` não geram; `id` composto e `veiculoId`. Atualizar a fábrica `build` do teste para passar `veiculos: [], planoPreventivo: [], baselines: []` por padrão.
- [ ] **Passo 2:** rodar: falha. **Passo 3:** implementar chamando `calcularPreventivas`. **Passo 4:** rodar `src/pages/frota` inteiro + typecheck (o `FrotaPage` já passa `data` inteiro; `Pendencias.tsx` quebra no `ICONE[item.kind]` e no `onOpen` — corrigir mínimo em `Pendencias.tsx`: `ICONE` ganha `preventiva: Gauge` de lucide, e `onOpen` só é chamado para `kind !== 'preventiva'`; a abertura real vem na Tarefa 10).
- [ ] **Passo 5: commit** — `Frota: pendência de preventiva vencida ou a vencer, ordenada logo após as aprovações`.

---

### Tarefa 6: DataSource (Dataverse e mock) com os conjuntos novos e escritas

**Arquivos:** modificar `frota/data/source.ts`, `frota/data/dataverse.ts`, `frota/data/mock.ts`, `frota/data/dataverse.test.ts`; atualizar `fakeSource` em `FrotaPage.test.tsx` e os `as unknown as DataSource` que precisarem.

**Produz (em `source.ts`):**

```ts
export type ItemPlanoInput = { nome: string; servico: number; intervaloKm: number | null; intervaloMeses: number | null; avisoKm: number; avisoDias: number }
export interface DataSource {
  /* existentes */
  salvarItemPlano(input: ItemPlanoInput, id?: string): Promise<void>          // cria sem id, atualiza com id
  inativarItemPlano(id: string, ativo: boolean): Promise<void>                 // statecode 1/0 + statuscode 2/1
  salvarBaseline(veiculoId: string, itemId: string, km: number | null, data: string | null): Promise<void>  // upsert por (veículo, item)
}
```

Dataverse:
- `ORDER`: `planoPreventivo: 'cr40f_name asc'`, `baselines: 'createdon desc'`, `despesasCombustivel: 'cr40f_datagasto desc'`, `telemetriaKm: 'new_data desc'`.
- `retrieveAll` ganha parâmetro opcional `filter` (padrão `statecode eq 0`). Loader `planoPreventivo`: filtro `statecode eq 0 or statecode eq 1` (inativos aparecem na aba). Loader `despesasCombustivel`: 1) `api.retrieveMultipleRecords(CATEGORIA_DESPESA_TABLE, "?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome&$filter=cr40f_nome eq 'Abastecimento' or cr40f_nome eq 'Manutenção'")` → mapa id → tipo; 2) despesas com `$filter=statecode eq 0 and cr40f_datagasto ge <ISO de addMonths(todaySP(), -12)>T00:00:00Z and (_cr40f_categoria_value eq <idAbast> or _cr40f_categoria_value eq <idManut>)`; sem categoria "Abastecimento" cadastrada → lança `Error('Categoria "Abastecimento" não encontrada nas despesas')` (vira `errors.despesasCombustivel`). Loader `telemetriaKm`: `$filter=new_data ge <addMonths(todaySP(), -12)>` (DateOnly, sem hora), `$orderby new_data desc`, sem `statecode`.
- `salvarItemPlano`: `api.createRecord(TABLE.planoPreventivo, patch)` / `updateRecord`; patch monta com `ITEM_PLANO`. `inativarItemPlano`: `updateRecord(TABLE.planoPreventivo, id, { statecode: ativo ? 0 : 1, statuscode: ativo ? 1 : 2 })`. `salvarBaseline`: `retrieveMultipleRecords(TABLE.baselines, "?$select=cr40f_baselinepreventivaid&$filter=_cr40f_veiculo_value eq <v> and _cr40f_item_value eq <i>")`; existe → `updateRecord` com `{ cr40f_km, cr40f_data }`; não existe → `createRecord` com `{ cr40f_name: '<placa> · <item>', 'cr40f_Veiculo@odata.bind': '/cr40f_veiculoses(<v>)', 'cr40f_Item@odata.bind': '/cr40f_itemplanopreventivos(<i>)', cr40f_km, cr40f_data }`. Os entity sets dos binds vêm de uma constante `ENTITY_SET = { veiculos: 'cr40f_veiculoses', planoPreventivo: 'cr40f_itemplanopreventivos' }` em `schema.ts` (a Tarefa 1 confirma pelo `describe`; ajustar se diferente). `XrmWebApi` em `xrm.ts` ganha `createRecord`.
- `cleanId` em todos os ids.

Mock (`seed`): `veiculos` v1 com `hodometro: 171000, hodometroEm: iso(0)`; v2 sem hodômetro. `planoPreventivo`: `i1` "Troca de óleo e filtro" servico 100000000, 10000 km / 6 meses, avisos 1000/30; `i2` "Pastilhas de freio" servico 100000007 só km 30000; `i3` "Revisão anual" só 12 meses; `i4` inativo. Manutenção `m4` (v1, realizada, servicos inclui 100000000) ganha `km: 160000` → i1 em v1 fica `vencido` por km (171000 − 170000). Manutenção `m1` (solicitada, v1, servicos [100000007]) deixa i2 em v1 `emAndamento`. `baselines`: `b1` (v2, i1, km 40000, data há 5 meses) → v2 sem hodômetro usa km 50000 de `m2`… v2 é Aluguel (fora do escopo): trocar `v2.categoria` para `100000000` (Próprio) e v4 para Aluguel, para ter dois veículos no plano. i3 em v2 → `sem_base`. `despesasCombustivel`: 6 despesas de combustível para v1 (R$ 300–450, meses diferentes dos últimos 6) e 2 para v2; 1 despesa "manutencao" sem vínculo para v1. `telemetriaKm`: 30 dias × v1 (120 km/dia) e 10 dias × v2. Escritas em memória com `delay()`; `salvarItemPlano` sem id gera `id = \`i${n}\``.

- [ ] **Passo 1: testes** em `dataverse.test.ts`: (a) `load` traz `planoPreventivo` com inativos e isola erro de `telemetriaKm`; (b) `despesasCombustivel` consulta a categoria antes e filtra pelos dois ids (inspecionar o `options` recebido por `retrieveMultipleRecords`); (c) `salvarBaseline` cria quando não existe e atualiza quando existe (`createRecord` vs `updateRecord`); (d) `inativarItemPlano` manda `statecode 1 / statuscode 2`.
- [ ] **Passo 2:** rodar: falha. **Passo 3:** implementar Dataverse e mock. **Passo 4:** `src/pages/frota` + typecheck verdes (atualizar `fakeSource` nos testes com os 3 métodos novos).
- [ ] **Passo 5: commit** — `Frota: carga do plano preventivo, baselines, despesas de combustível e telemetria; escritas de item e baseline; mock com os estados`.

---

### Tarefa 7: domínio do custo total

**Arquivos:** criar `frota/domain/custoTotal.ts`, `frota/domain/custoTotal.test.ts`.

**Produz:**

```ts
export type Fonte = 'manutencao' | 'multas' | 'combustivel' | 'documentos'
export const FONTES: Fonte[] = ['manutencao', 'multas', 'combustivel', 'documentos']
export const FONTE_LABEL: Record<Fonte, string> = { manutencao: 'Manutenção', multas: 'Multas', combustivel: 'Combustível', documentos: 'Documentos (IPVA e seguro)' }
export type ParcelaCusto = { valor: number; qtd: number; semValor: number; indisponivel: boolean }
export type CustoTotal = { total: number; porFonte: Record<Fonte, ParcelaCusto>; kmRodado: number | null; custoPorKm: number | null; despesasManutencaoSemVinculo: number }
/** Documento de frota com custo; vazio até a branch de Documentos ser mesclada. */
export type DocumentoCusto = { veiculoId: string; dia: string; valor: number | null }
export type EntradaCusto = Pick<FrotaData, 'manutencoes' | 'multas' | 'infracoes' | 'despesasCombustivel' | 'telemetriaKm'> & { documentos: DocumentoCusto[]; indisponiveis: Partial<Record<Fonte | 'telemetria', boolean>> }
export function custoTotalVeiculo(entrada: EntradaCusto, veiculoId: string, periodo: Periodo): CustoTotal
export type CustoVeiculo = { veiculoId: string; placa: string; total: number; custoPorKm: number | null; maiorFonte: Fonte | null }
export function custoPorVeiculo(entrada: EntradaCusto, veiculos: Pick<Veiculo, 'id' | 'placa'>[], periodo: Periodo): CustoVeiculo[]  // ordem: total desc, placa
export type CustoMesEmpilhado = { chave: string; porFonte: Record<Fonte, number>; total: number }
export function custoPorMesEmpilhado(entrada: EntradaCusto, periodo: Periodo): CustoMesEmpilhado[]  // todos os meses do período, como custoPorMes
```

Regras (spec §5.3): manutenção = `realizadas(...)` de `indicadores.ts` filtradas pelo veículo, `valor` (null conta em `semValor`); multas = `multasNoPeriodo` do veículo com `infracao.valor` (sem infração ou sem valor → `semValor`), exceto `status === MULTA.FINALIZADO` sem valor (não conta em nada); combustível = `despesasCombustivel` com `categoria === 'combustivel'`, `veiculo.id === veiculoId`, `dia` no período; documentos = `documentos` do veículo no período; `kmRodado` = soma de `telemetriaKm.km` do veículo no período, `null` se `indisponiveis.telemetria` ou nenhuma linha; `custoPorKm = kmRodado ? round(total / kmRodado, 2) : null`; `despesasManutencaoSemVinculo` = despesas `categoria === 'manutencao'` do veículo no período com `manutencao === null`. Arredondar a centavos como em `indicadores.ts`.

- [ ] **Passo 1: testes:** soma das 4 fontes com `semValor` por fonte; multa finalizada sem valor ignorada; combustível fora do período ignorado; `custoPorKm` com e sem telemetria; `indisponivel` propaga e não soma; aviso de manutenção sem vínculo; `custoPorVeiculo` ordena e aponta `maiorFonte`; `custoPorMesEmpilhado` preenche meses vazios.
- [ ] **Passo 2:** rodar: falha. **Passo 3:** implementar (≤ 100 linhas). **Passo 4:** verde + typecheck.
- [ ] **Passo 5: commit** — `Frota: domínio do custo total por veículo (manutenção, multas, combustível, documentos) com R$/km`.

---

### Tarefa 8: aba "Plano preventivo" com drawer do item

**Arquivos:** criar `frota/views/PlanoPreventivo.tsx`, `frota/views/PlanoPreventivo.test.tsx`, `frota/components/ItemPlanoDrawer.tsx`; modificar `frota/FrotaPage.tsx` (aba), `frota/frota.css` só se precisar de uma classe nova para o formulário (preferir `frota-cluster`/`frota-detail`).

**Produz:**

```tsx
export function PlanoPreventivo({ data, source, onReload }: { data: FrotaData; source: DataSource; onReload: () => void })
export function ItemPlanoDrawer({ source, item, onClose, onSaved }: { source: DataSource; item: ItemPlano | null; onClose: () => void; onSaved: () => void })
```

UI (spec §7): `Table<ItemPlano>` de `@betinhos/ui` com colunas Item (`nome`), Serviço (`label(SERVICOS_MANUT, servico)`), Intervalo (`"10.000 km · 6 meses"`, `"30.000 km"`, `"12 meses"`), Aviso (`"1.000 km · 30 dias"`), Situação (`StatusBadge` success "Ativo" / neutral "Inativo"); clique na linha abre o drawer com o item; `PageToolbar` com `Button` "Novo item" (ícone `Plus`). Drawer (`Drawer size="default"`, eyebrow "Plano preventivo", título "Novo item" ou `item.nome`): `Input` Nome (obrigatório, máx. 100), `Select` Serviço (opções de `SERVICOS_MANUT`, `searchable`, obrigatório), `Input type="number"` Intervalo km, Intervalo meses, Avisar faltando km (padrão 1000), Avisar faltando dias (padrão 30); validação inline: nome e serviço obrigatórios, ao menos um intervalo, inteiros ≥ 0 (intervalos ≥ 1); footer: "Cancelar", "Salvar" (`loading` enquanto grava) e, em item existente, "Inativar"/"Reativar" (`variant="secondary"`). Sucesso → `notify('success', 'Item salvo.')`, `onSaved()`; erro → `notify('error', errorMessage(reason))` e o drawer continua aberto com os valores. Ao fechar com alteração não salva: `Drawer` já trata se existir `dirty` prop; se não existir, usar `window.confirm('Descartar alterações?')` **não** — em vez disso manter o comportamento padrão do `Drawer` (conferir `DrawerProps` em `packages/ui/src/components/Drawer.tsx` e usar a prop de confirmação se existir; senão fechar direto e registrar no ledger).

`FrotaPage`: `Tab` += `'plano'`; `TABS` += `{ id: 'plano', label: 'Plano preventivo', tables: ['planoPreventivo'] }` (após `indicadores`); render `{route.tab === 'plano' && <PlanoPreventivo data={data} source={source} onReload={onReload} />}`. `TABS.pendencias.tables` += `'veiculos', 'planoPreventivo', 'baselines'`.

- [ ] **Passo 1: testes** (`PlanoPreventivo.test.tsx`, jsdom, `ToastProvider`): lista itens com intervalo formatado e badge Inativo; "Novo item" abre o drawer e salvar sem nome mostra erro inline e não chama `salvarItemPlano`; preenchido chama `salvarItemPlano({ nome, servico, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30 })` e `onReload`; clicar num item existente e "Inativar" chama `inativarItemPlano(id, false)`. Use `escolher('Serviço', 'Troca de óleo e filtro de óleo')` de `testUtils.ts`.
- [ ] **Passo 2:** rodar: falha. **Passo 3:** implementar. **Passo 4:** `FrotaPage.test.tsx` ganha um caso: aba "Plano preventivo" existe e mostra a tabela. Verde + typecheck.
- [ ] **Passo 5: commit** — `Frota: aba Plano preventivo com cadastro, edição e inativação dos itens`.

---

### Tarefa 9: seção "Preventivas" na ficha + drawer de baseline

**Arquivos:** criar `frota/components/Preventivas.tsx`, `frota/components/Preventivas.test.tsx`, `frota/components/BaselineDrawer.tsx`; modificar `frota/components/FichaVeiculo.tsx`, `frota/components/FichaVeiculo.test.tsx`, `frota/frota.css` (classe `.frota-prev` para a lista, se necessário: `display: grid; gap: var(--bt-space-2)`; linhas com `display: flex; align-items: center; gap: var(--bt-space-2); flex-wrap: wrap`).

**Produz:**

```tsx
export function Preventivas({ data, veiculoId, today, source, errors, onOpen, onReload }: { data: FrotaData; veiculoId: string; today: string; source: DataSource; errors: LoadResult['errors']; onOpen: (kind: Kind, id: string) => void; onReload: () => void })
export function BaselineDrawer({ source, veiculo, item, onClose, onSaved }: { source: DataSource; veiculo: Veiculo; item: ItemPlano; onClose: () => void; onSaved: () => void })
```

UI (spec §7): linha de hodômetro: `"Hodômetro: 171.000 km · lido em 14/10/2026 10:37"` (`Intl.NumberFormat('pt-BR')` e `formatBR(diaSP(hodometroEm))` + hora local) ou `"Km estimado pela última manutenção: 61.000 km"` ou `"Sem km conhecido"`. Depois `<ul>` com uma `<li>` por preventiva: `StatusBadge tone={ESTADO_TONE[estado]}` com `ESTADO_LABEL[estado]`; `<strong>{item.nome}</strong>`; texto `"faltam 850 km · 12 dias"` / `"vencido há 1.000 km"` / `"vencido há 5 dias"` (o que estiver negativo primeiro); `emAndamento` → texto secundário "Em andamento"; última execução: `"Última: 10/06/2026 · 160.000 km"` como `button.frota-link` para a manutenção (`onOpen('manutencao', manutencaoId)`) quando origem `manutencao`, texto simples quando `baseline`; `sem_base` → `Button size="compact" variant="secondary"` "Informar última execução" que abre `BaselineDrawer`. Veículo fora do escopo (vendido/terceiro/sem status) → `frota-muted` "Plano preventivo vale só para veículos ativos e próprios." Plano vazio → "Nenhum item no plano preventivo." Erros em `planoPreventivo`/`baselines` → `Alert tone="danger"` como as outras seções da ficha. `BaselineDrawer`: título `item.nome`, eyebrow `veiculo.placa`, `Input type="number"` Km e `Input type="date"` Data (ao menos um), Salvar → `salvarBaseline(veiculo.id, item.id, km, data)`, toast, `onSaved`.

`FichaVeiculo`: nova `<section className="frota-group" id={\`${id}-preventivas\`} aria-labelledby=...>` com `<h3>Preventivas</h3>` antes da "Linha do tempo"; prop nova `secao?: 'preventivas' | null`; `useEffect` que, com `secao === 'preventivas'`, faz `document.getElementById(\`${id}-preventivas\`)?.scrollIntoView({ block: 'start' })`.

- [ ] **Passo 1: testes:** `Preventivas.test.tsx` — hodômetro Infleet e estimado; quatro estados com badge e texto; link da última execução chama `onOpen('manutencao', 'm4')`; "Informar última execução" abre drawer e salvar chama `salvarBaseline('v2', 'i3', 45000, '2026-04-01')`; veículo vendido mostra o aviso de escopo. `FichaVeiculo.test.tsx` — seção "Preventivas" renderiza (dados do teste ganham `planoPreventivo` com 1 item) e `secao="preventivas"` chama `scrollIntoView` (mockar `Element.prototype.scrollIntoView = vi.fn()`).
- [ ] **Passo 2:** falha. **Passo 3:** implementar. **Passo 4:** verde + typecheck.
- [ ] **Passo 5: commit** — `Frota: seção Preventivas na ficha do veículo, com hodômetro, estados e baseline manual`.

---

### Tarefa 10: Pendências e deep link `secao=preventivas`

**Arquivos:** modificar `frota/views/Pendencias.tsx`, `frota/FrotaPage.tsx`, `frota/FrotaPage.test.tsx`, `frota/views/Pendencias.test.tsx` (criar se não existir).

**Produz:** `CURTO.preventiva = 'Preventiva do plano'`; ícone `Gauge`; `Pendencias` recebe `onOpenVeiculo: (id: string, secao: 'preventivas') => void`; item `preventiva` chama `onOpenVeiculo(item.veiculoId!, 'preventivas')`; sem prazo mas com km, o badge mostra `"Em X km"` (tone `info`) ou `"Vencido há X km"` (tone `danger`): para isso `Pendencia` ganha `faltamKm: number | null` (preencher na Tarefa 5 → ajustar ali se já não estiver; os demais tipos `null`). `FrotaPage`: `useFrotaRota` lê `secao = lerOpcao(query, 'secao', ['preventivas'], null)`-equivalente (`query.get('secao') === 'preventivas' ? 'preventivas' : null`); `onOpenVeiculo(id, secao?)` grava `{ registro: null, ficha: id, secao: secao ?? null }`; fechar a ficha limpa `secao`; `FichaVeiculo` recebe `secao={route.secao}`. Badge da aba Pendências já soma (usa `buildPendencias`).

- [ ] **Passo 1: testes:** `Pendencias.test.tsx` — grupo "Preventiva do plano" com badge "Em 850 km"; clique chama `onOpenVeiculo('v1', 'preventivas')`. `FrotaPage.test.tsx` — com dados mock-like (1 veículo ativo próprio, 1 item, manutenção realizada km 160000, hodômetro 171000) a aba Pendências mostra o grupo e clicar abre a ficha (`dialog` com a placa) e a URL contém `secao=preventivas` (`window.location.hash`).
- [ ] **Passo 2:** falha. **Passo 3:** implementar. **Passo 4:** verde + typecheck.
- [ ] **Passo 5: commit** — `Frota: pendências de preventiva abrem a ficha do veículo na seção Preventivas`.

---

### Tarefa 11: seção "Custo total" na ficha e Indicadores

**Arquivos:** criar `frota/components/CustoTotal.tsx`, `frota/components/CustoTotal.test.tsx`; modificar `frota/components/FichaVeiculo.tsx` (substitui a seção "Custo de manutenção"), `frota/components/FichaVeiculo.test.tsx`, `frota/views/Indicadores.tsx`, `frota/views/Indicadores.test.tsx`, `frota/FrotaPage.tsx` (`TABS.veiculos.tables` e `TABS.indicadores.tables` += `'despesasCombustivel'`? **Não**: essas falhas não bloqueiam; ficam fora do `ViewGate` e aparecem como "indisponível").

**Produz:**

```tsx
export function CustoTotal({ data, errors, veiculoId, periodo, onPeriodo }: { data: FrotaData; errors: LoadResult['errors']; veiculoId: string; periodo: Periodo; onPeriodo: (p: Periodo) => void })
```

UI (spec §7): mantém os dois `Input type="date"` do período; `p.frota-kpi` com `<strong>{brl(total)}</strong><span>{custoPorKm === null ? 'R$/km indisponível (sem telemetria no período)' : \`${brl(custoPorKm)} por km · ${km} km rodados\`}</span>`; `dl.frota-detail` com 4 linhas `FONTE_LABEL[f]` → `"R$ 1.234,56 · 3 registros"`, `"Não informado"` quando `qtd>0 && qtd===semValor`, `"Indisponível"` quando `indisponivel`, `"— · 0 registros"` quando vazio; `semValor > 0` → `frota-muted` "2 sem valor"; `despesasManutencaoSemVinculo > 0` → `frota-muted` "3 despesas de manutenção sem vínculo com uma manutenção (não somadas)". `indisponiveis` = `{ combustivel: !!errors.despesasCombustivel, telemetria: !!errors.telemetriaKm, manutencao: !!errors.manutencoes, multas: !!errors.multas || !!errors.infracoes, documentos: false }`; `documentos: []` fixo nesta entrega (comentário apontando a spec §9.4).

Indicadores: KPI "Custo de manutenção no período" passa a "Custo total no período" com `hint` "manutenção + multas + combustível"; `Surface "Custo total por mês"` usa `Bars` com `items = custoPorMesEmpilhado(...).map(m => ({ label: mesLabel(m.chave), value: m.total, hint: \`${brl(m.porFonte.manutencao)} manut. · ${brl(m.porFonte.multas)} multas · ${brl(m.porFonte.combustivel)} comb.\` }))` (sem componente novo de barras empilhadas: YAGNI); `Surface "Custo por veículo"` vira `Table<CustoVeiculo>` ordenável por clique no cabeçalho de Total e R$/km (estado local `ordem: 'total' | 'custoPorKm'`, desc), colunas Veículo, Total, R$/km (`"—"` quando null), Maior fonte (`FONTE_LABEL`). Remover o `custoPor(... veiculo)` antigo e manter "Custo por tipo de reparo". CSV continua só manutenções (sem mudança).

- [ ] **Passo 1: testes:** `CustoTotal.test.tsx` — total e R$/km; fonte indisponível; sem telemetria; aviso de manutenção sem vínculo. `FichaVeiculo.test.tsx` — o caso existente que buscava "Custo de manutenção" passa a buscar `heading 'Custo total'` e `/200,00/`. `Indicadores.test.tsx` — tabela "Custo por veículo" ordena por R$/km ao clicar; KPI novo.
- [ ] **Passo 2:** falha. **Passo 3:** implementar. **Passo 4:** suíte `src/pages/frota` + typecheck verdes.
- [ ] **Passo 5: commit** — `Frota: custo total por veículo na ficha (R$/km) e nos Indicadores (por mês e por veículo)`.

---

### Tarefa 12: KPI de preventivas no Dashboard (aba Frota)

**Arquivos:** modificar `dashboard/domain/types.ts`, `dashboard/data/queries.ts`, `dashboard/data/source.ts`, `dashboard/data/mock.ts`, `dashboard/domain/abas/frota.ts`, `dashboard/domain/abas/frota.test.ts`, `dashboard/components/abas/FrotaTab.tsx`, `dashboard/data/data.test.ts`.

**Consome:** `calcularPreventivas`, `resumoPreventivas`, tipos `EntradaPreventiva` de `../../frota/domain/preventiva` (import relativo entre páginas, aceito aqui por ser módulo puro). **Produz:** `Conjunto` += `'preventivas'`; `Dados.preventivas: EntradaPreventiva` (vazio quando indisponível); `Frota.preventivas: { vencidas: number; aVencer: number } | null`.

Dados: `EntitySets` ganha `itemPlano: 'cr40f_itemplanopreventivo'`, `baseline: 'cr40f_baselinepreventiva'` (resolver como os demais em `resolverEntitySets`); paths: `itensPlanoPath(set) = \`${set}?$select=cr40f_itemplanopreventivoid,cr40f_name,cr40f_servico,cr40f_intervalokm,cr40f_intervalomeses,cr40f_avisokm,cr40f_avisodias&$filter=statecode eq 0\``; `baselinesPath(set) = \`${set}?$select=cr40f_baselinepreventivaid,_cr40f_veiculo_value,_cr40f_item_value,cr40f_km,cr40f_data\``; `veiculosPath` += `cr40f_hodometro,cr40f_hodometroem`; `manutencoesPreventivaPath(set) = \`${set}?$select=cr40f_manutencoesid,cr40f_status,cr40f_datamanutencao,createdon,cr40f_kmatual,_cr40f_placa_carro_value,new_servicosmanutencao&$filter=statecode eq 0 and (cr40f_status eq 202410002 or cr40f_status eq 0 or cr40f_status eq 202410001 or cr40f_status eq 202410005)\`` (sem janela: a preventiva precisa do histórico todo). Mapear para `VeiculoPrev`, `ManutencaoPrev` (`servicos` via `lerMulti` de `frota/domain/manutencaoCatalogo`), `ItemPlano`, `Baseline` com funções locais `mapVeiculoPrev`, `mapManutencaoPrev`, `mapItemPlanoDash`, `mapBaselineDash` (não importar os mappers da frota: os `Row` do dashboard vêm do `DataverseClient`, mesmo formato, mas mantemos o dashboard autossuficiente em `data/`). Qualquer uma das 4 consultas falhando → `'preventivas'` em `indisponiveis`.

Domínio: em `calcularFrota`, `preventivas = dados.indisponiveis.includes('preventivas') ? null : resumoPreventivas(calcularPreventivas(dados.preventivas, ctx.hoje))` (`ctx.hoje` ou o equivalente que o contexto já tem para "hoje em Brasília"; conferir em `domain/kpis.ts`). UI: `KpisFrota` passa de 5 para 6 colunas (`ColunasKpi` aceita 6) com `KpiCard rotulo="Preventivas" valor={vencidas} tom={vencidas ? 'warning' : 'success'} apoio={\`${aVencer} a vencer\`} acao={{ rotulo: 'Abrir frota', onAbrir: () => { location.hash = '#/frota' } }}` (conferir a forma exata de `acao` em `KpiCard.tsx` linhas 37–60); indisponível → `valor=null`, `apoio=naoRespondeu('O plano preventivo')`.

- [ ] **Passo 1: testes:** `frota.test.ts` — `preventivas` null quando indisponível; conta vencidas/a vencer com uma entrada mínima. `data.test.ts` — `carregarDataverse` marca `preventivas` indisponível quando a consulta de itens falha e preenche `dados.preventivas` quando tudo responde (seguir o molde dos testes existentes de conjuntos).
- [ ] **Passo 2:** falha. **Passo 3:** implementar; mock do dashboard ganha `preventivas` com 1 item e 1 veículo vencido. **Passo 4:** `pnpm --filter @betinhos/shell test -- src/pages/dashboard` + typecheck verdes.
- [ ] **Passo 5: commit** — `Dashboard: KPI de preventivas vencidas e a vencer na aba Frota, calculado pelo domínio da Frota`.

---

### Tarefa 13: verificação final, versão e publicação

- [ ] **Passo 1:** suíte completa `pnpm --filter @betinhos/shell test | tail -15` e `pnpm --filter @betinhos/shell typecheck`: verdes. Registrar contagem de testes no ledger.
- [ ] **Passo 2:** mock no navegador: `preview_start` com o dev server do shell (porta 36472, `launch.json`), abrir `#/frota`: Pendências mostra "Preventiva do plano" (v1 vencido por km); clicar abre a ficha rolada em "Preventivas"; ficha mostra hodômetro Infleet, estados Vencido / Em andamento / Sem base (v2), "Informar última execução" grava e muda o estado; "Custo total" com R$/km; aba "Plano preventivo" cria e inativa item; Indicadores com "Custo por veículo" ordenável; Dashboard aba Frota com o KPI. Screenshot de cada tela no ledger. Testar 375 px (mobile) na ficha e na aba Plano.
- [ ] **Passo 3:** `git log --oneline 3e04db1..HEAD` confere 11 commits de código; `git status` limpo.
- [ ] **Passo 4:** **pedir ao Renan** `pnpm --filter @betinhos/shell push` (device code). Informar a versão publicada (`apps/shell/package.json` após o bump). Conferir autenticado no DEV: aba Plano cria um item real; ficha de um veículo rastreado mostra hodômetro de hoje; Pendências e Dashboard respondem; despesas de combustível carregam (categoria "Abastecimento" encontrada).
- [ ] **Passo 5:** atualizar a memória `roadmap-caderno-outubro-2026.md` (Gestão de Frota: spec e plano prontos, estado da execução) e abrir PR da branch para `main` com resumo das duas entregas e o item pendente §9.4 da spec (documentos e central de avisos).
