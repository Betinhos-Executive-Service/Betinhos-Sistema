# Relatório de combustível do motorista — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`, tarefa por tarefa, em TDD. Passos com checkbox (`- [ ]`).

**Objetivo:** ao entrar em Despesas, o motorista vê o painel do próprio abastecimento — nota 0–100, gráficos, economia perdida contra postos próximos e insights do Claude — calculado no servidor.

**Arquitetura:** o app salva o CNPJ do cupom; um plugin assíncrono do `DriverRecordSharing` cria/geocodifica o posto (BrasilAPI + Nominatim), compara o preço por litro com abastecimentos a ≤ 3 km nos 7 dias anteriores e grava o resultado na despesa e num resumo mensal. Uma Custom API devolve o relatório ao motorista logado; um Flow noturno chama outra Custom API que pede ao Claude Haiku os textos de insight a partir dos números já calculados.

**Stack:** C# net462 + xunit (`plugins/DriverRecordSharing*`), React 18 + TypeScript + `node --test` (app), PowerShell (provisionamento DEV), Node 24 com `--experimental-strip-types` (scripts da Fase 0), Power Automate.

**Spec:** `docs/superpowers/specs/2026-11-03-relatorio-combustivel-motorista-design.md` (regras e números exatos; leia antes de qualquer tarefa).

## Global Constraints

- Categoria alvo: **Combustível** (decisão do Renan em 03/11/2026: é o nome no PROD; chave do app `local-abastecimento`). Filtrar pelo nome normalizado `combustivel` (aceitar também `abastecimento` por compatibilidade). Sem tipo de combustível: preço sempre comparável. Referências excluem o mesmo posto e o mesmo motorista.
- Raio 3.000 m; janela 7 dias antes até o mesmo dia; mínimo 2 referências; preço por litro válido em [3,00; 12,00].
- Nota: preço 50 (−2% → 50, +5% → 0), consumo 30 (r ≥ 1,05 → 30, r ≤ 0,85 → 0), registro 20 (CNPJ 8, km 8, lançado ≤ 2 dias 4); só com ≥ 4 abastecimentos no mês; normalizada pelos pesos disponíveis.
- Modelo de IA: `claude-haiku-5-5`, endpoint `https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, timeout 8000 ms, tool use com schema. Nunca logar chave, texto do cupom ou insight; trace só tamanho, ms, tokens e motivo.
- Chave Anthropic: variável de ambiente **Secret** (Key Vault) `new_AnthropicKeyCombustivel`; leitura por `RetrieveEnvironmentVariableSecretValue`.
- Nominatim: `User-Agent: BetinhosAppMotoristas/1.0 (+https://betinhos.com.br)`, ≤ 1 requisição/s, 1 chamada por posto novo (resultado gravado, nunca repetido).
- Ambiente: provisionamento só no DEV (`https://org23b93544.crm2.dynamics.com/`, `Assert-DevEnvironment`). PROD só leitura (Fase 0 e reprocessamento leem; escrita em PROD só por `scripts/deploy-prod.ps1`, fora deste plano).
- Dados pessoais (imagens de cupom, CSVs com motorista) ficam em `%USERPROFILE%\.betinhos\combustivel\`, nunca no repo.
- Dinheiro em BRL, datas em America/Sao_Paulo (UTC−3, sem horário de verão). Textos de UI em pt-BR com acentos, UTF-8.
- Gates humanos (Renan): **G0** escolher DEV ou PROD (leitura) para a Fase 0; **G1** aprovar resultado da Fase 0; **G2** criar o segredo no Key Vault; **G3** antes de `npm run push`; **G4** teste no celular.
- Commits em português, escopo pequeno, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Antes de PR: `qualidade-antes-do-pr` e `verificacao-manter` (`verificar-gastos`). Merge do `origin/main` antes de publicar plugin (assembly único).
- Gate de entrega de cada tarefa de app: `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`. De plugin: `dotnet test plugins/DriverRecordSharing.Tests`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/combustivel/geo.ts` | Funções puras da Fase 0: normalizar CNPJ, montar URLs BrasilAPI/Nominatim, ler respostas, haversine, métricas do relatório |
| `scripts/combustivel/exportar-abastecimentos.ps1` | Fase 0: exporta (só leitura) abastecimentos de 6 meses + baixa cupons do SharePoint |
| `scripts/combustivel/ler-cnpj-cupons.ts` | Fase 0: lê CNPJ de cada cupom com o Claude (visão) → `cnpjs.csv` |
| `scripts/combustivel/testar-geocodificacao.ts` | Fase 0: BrasilAPI + Nominatim por CNPJ → `postos.csv`, `amostra.csv`, `relatorio.md` |
| `scripts/combustivel/avaliar-amostra.ts` | Fase 0: erro em metros da amostra conferida → veredito ≥ 85% < 300 m |
| `plugins/DriverRecordSharing/FuelSchema.cs` | Nomes lógicos de tabelas/colunas usados pelo plugin (fonte única) |
| `plugins/DriverRecordSharing/FuelMath.cs` | Preço por litro, haversine, mediana, interpolação linear |
| `plugins/DriverRecordSharing/FuelComparison.cs` | Comparação de um abastecimento com as referências |
| `plugins/DriverRecordSharing/FuelScore.cs` | Nota mensal (preço, consumo, registro) |
| `plugins/DriverRecordSharing/PostoGeocoder.cs` | BrasilAPI + Nominatim (HTTP injetável) |
| `plugins/DriverRecordSharing/SecretReader.cs` | Lê variável Secret (Key Vault) com fallback String |
| `plugins/DriverRecordSharing/FuelRepository.cs` | Consultas e gravações no Dataverse |
| `plugins/DriverRecordSharing/FuelExpensePlugin.cs` | Step assíncrono Create/Update da despesa |
| `plugins/DriverRecordSharing/FuelInsightWriter.cs` | Prompt, chamada e guarda dos insights |
| `plugins/DriverRecordSharing/FuelReportPlugin.cs` | Custom API `new_ObterRelatorioCombustivel` |
| `plugins/DriverRecordSharing/FuelInsightsPlugin.cs` | Custom API `new_GerarInsightsCombustivel` |
| `scripts/provision-relatorio-combustivel.ps1` | Schema, Custom APIs, variável Secret, steps no DEV |
| `scripts/provision-relatorio-combustivel-flow.ps1` | Flow noturno de insights no DEV |
| `scripts/combustivel/reprocessar-historico.ps1` | Grava CNPJ dos 6 meses nas despesas (DEV) e dispara o recálculo |
| `src/lib/fuelReport.ts` | Tipos e parse do JSON do relatório, formatação, selos |
| `src/lib/fuelReportMock.ts` | Relatório de exemplo para localhost |
| `src/components/fuelCharts.tsx` | Gráficos SVG (linha da nota, faixa de preço, barras mensais) |
| `src/screens/ExpenseDashboardScreen.tsx` | Painel de Despesas |
| Modificar `src/lib/expenses.types.ts`, `expenses.reference.ts`, `expenses.payload.ts`, `receiptQuickRead.ts` | CNPJ no rascunho e no payload |
| Modificar `src/app/navigation.ts`, `src/App.tsx` | Tile Despesas abre o painel |
| Modificar `scripts/register-driver-record-sharing-plugin-webapi.ps1`, `scripts/push-dev.ps1` | Registrar step e provisionador |

---

# Fase 0 — teste de cobertura e precisão (gate G1)

Nada de schema, plugin ou app antes do G1. Esta fase é só leitura no Dataverse.

### Task 0.1: funções puras de geocodificação

**Files:**
- Create: `scripts/combustivel/geo.ts`
- Test: `tests/combustivelGeo.test.ts`

**Interfaces:**
- Produces:
  - `normalizeCnpj(raw: string | null | undefined): string | null` (14 dígitos com DV válido ou `null`)
  - `brasilApiUrl(cnpj: string): string`
  - `parseBrasilApi(body: unknown): Endereco | null`
  - `nominatimUrl(e: Endereco): string` (busca estruturada)
  - `parseNominatim(body: unknown): Geo | null`
  - `haversineMeters(a: {lat:number;lon:number}, b: {lat:number;lon:number}): number`
  - `summarize(rows: PostoRow[]): Resumo`
  - `verdict(errorsMeters: number[]): { ok: boolean; share: number }`
  - tipos `Endereco = { nome: string; logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string }`, `Geo = { lat: number; lon: number; precisao: "rua" | "bairro" | "cidade" }`, `PostoRow = { cnpj: string; brasilApi: boolean; geo: Geo | null }`, `Resumo = { total: number; encontrados: number; geocodificados: number; rua: number }`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { brasilApiUrl, haversineMeters, normalizeCnpj, nominatimUrl, parseBrasilApi, parseNominatim, summarize, verdict } from "../scripts/combustivel/geo.ts";

test("normalizeCnpj aceita pontuação e rejeita DV inválido", () => {
  assert.equal(normalizeCnpj("07.108.241/0001-06"), "07108241000106");
  assert.equal(normalizeCnpj("07.108.241/0001-07"), null);
  assert.equal(normalizeCnpj("11111111111111"), null);
  assert.equal(normalizeCnpj(null), null);
});

test("brasilApiUrl usa só dígitos", () => {
  assert.equal(brasilApiUrl("07108241000106"), "https://brasilapi.com.br/api/cnpj/v1/07108241000106");
});

test("parseBrasilApi junta tipo e logradouro e prefere nome fantasia", () => {
  const e = parseBrasilApi({ razao_social: "AUTO POSTO X LTDA", nome_fantasia: "Posto X", descricao_tipo_de_logradouro: "AVENIDA", logradouro: "PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" });
  assert.deepEqual(e, { nome: "Posto X", logradouro: "AVENIDA PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" });
  assert.equal(parseBrasilApi({ message: "CNPJ não encontrado" }), null);
});

test("nominatimUrl monta busca estruturada no Brasil", () => {
  const url = new URL(nominatimUrl({ nome: "Posto X", logradouro: "AVENIDA PAULISTA", numero: "1000", bairro: "BELA VISTA", municipio: "SAO PAULO", uf: "SP", cep: "01310100" }));
  assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/search");
  assert.equal(url.searchParams.get("street"), "1000 AVENIDA PAULISTA");
  assert.equal(url.searchParams.get("city"), "SAO PAULO");
  assert.equal(url.searchParams.get("state"), "SP");
  assert.equal(url.searchParams.get("postalcode"), "01310100");
  assert.equal(url.searchParams.get("countrycodes"), "br");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("limit"), "1");
});

test("parseNominatim classifica precisão pelo place_rank", () => {
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 30 }]), { lat: -23.56, lon: -46.65, precisao: "rua" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 26 }]), { lat: -23.56, lon: -46.65, precisao: "rua" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 20 }]), { lat: -23.56, lon: -46.65, precisao: "bairro" });
  assert.deepEqual(parseNominatim([{ lat: "-23.56", lon: "-46.65", place_rank: 12 }]), { lat: -23.56, lon: -46.65, precisao: "cidade" });
  assert.equal(parseNominatim([]), null);
});

test("haversineMeters mede ~1,11 km por 0,01° de latitude", () => {
  const d = haversineMeters({ lat: -23.55, lon: -46.63 }, { lat: -23.56, lon: -46.63 });
  assert.ok(Math.abs(d - 1112) < 5, String(d));
});

test("summarize conta encontrados, geocodificados e nível de rua", () => {
  assert.deepEqual(summarize([
    { cnpj: "a", brasilApi: true, geo: { lat: 0, lon: 0, precisao: "rua" } },
    { cnpj: "b", brasilApi: true, geo: { lat: 0, lon: 0, precisao: "bairro" } },
    { cnpj: "c", brasilApi: true, geo: null },
    { cnpj: "d", brasilApi: false, geo: null }
  ]), { total: 4, encontrados: 3, geocodificados: 2, rua: 1 });
});

test("verdict aprova com 85% abaixo de 300 m", () => {
  const ok = [...Array(17).fill(120), 450, 900, 2000];
  assert.deepEqual(verdict(ok), { ok: true, share: 0.85 });
  const ruim = [...Array(16).fill(120), 450, 900, 2000, 3000];
  assert.deepEqual(verdict(ruim), { ok: false, share: 0.8 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/combustivelGeo.test.ts`
Expected: FAIL — `Cannot find module '../scripts/combustivel/geo.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Funções puras da Fase 0 (BrasilAPI + Nominatim). Sem rede aqui: quem chama faz o fetch.
export type Endereco = { nome: string; logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string };
export type Geo = { lat: number; lon: number; precisao: "rua" | "bairro" | "cidade" };
export type PostoRow = { cnpj: string; brasilApi: boolean; geo: Geo | null };
export type Resumo = { total: number; encontrados: number; geocodificados: number; rua: number };

const DV_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const DV_WEIGHTS_2 = [6, ...DV_WEIGHTS_1];

function checkDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function normalizeCnpj(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return null;
  const ok = checkDigit(digits, DV_WEIGHTS_1) === Number(digits[12]) && checkDigit(digits, DV_WEIGHTS_2) === Number(digits[13]);
  return ok ? digits : null;
}

export const brasilApiUrl = (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;

const text = (value: unknown) => String(value ?? "").trim();

export function parseBrasilApi(body: unknown): Endereco | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!text(b.logradouro) || !text(b.municipio)) return null;
  return {
    nome: text(b.nome_fantasia) || text(b.razao_social),
    logradouro: [text(b.descricao_tipo_de_logradouro), text(b.logradouro)].filter(Boolean).join(" "),
    numero: text(b.numero),
    bairro: text(b.bairro),
    municipio: text(b.municipio),
    uf: text(b.uf),
    cep: text(b.cep).replace(/\D/g, "")
  };
}

export function nominatimUrl(e: Endereco): string {
  const params = new URLSearchParams({
    street: [e.numero, e.logradouro].filter(Boolean).join(" "),
    city: e.municipio,
    state: e.uf,
    postalcode: e.cep,
    countrycodes: "br",
    format: "jsonv2",
    limit: "1"
  });
  return `https://nominatim.openstreetmap.org/search?${params}`;
}

export function parseNominatim(body: unknown): Geo | null {
  const first = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rank = Number(first.place_rank);
  const precisao = rank >= 26 ? "rua" : rank >= 16 ? "bairro" : "cidade";
  return { lat, lon, precisao };
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function summarize(rows: PostoRow[]): Resumo {
  return {
    total: rows.length,
    encontrados: rows.filter((r) => r.brasilApi).length,
    geocodificados: rows.filter((r) => r.geo).length,
    rua: rows.filter((r) => r.geo?.precisao === "rua").length
  };
}

export function verdict(errorsMeters: number[]): { ok: boolean; share: number } {
  const share = errorsMeters.length ? errorsMeters.filter((m) => m < 300).length / errorsMeters.length : 0;
  return { ok: share >= 0.85, share: Math.round(share * 100) / 100 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/combustivelGeo.test.ts`
Expected: PASS (8 testes). Rode também `npm test` (o glob `tests/*.test.ts` já inclui o arquivo).

- [ ] **Step 5: Commit**

```bash
git add scripts/combustivel/geo.ts tests/combustivelGeo.test.ts
git commit -m "feat(combustivel): funções puras de CNPJ e geocodificação para o teste da Fase 0"
```

### Task 0.2: exportar abastecimentos e cupons (somente leitura)

**Files:**
- Create: `scripts/combustivel/exportar-abastecimentos.ps1`

**Interfaces:**
- Produces: `%USERPROFILE%\.betinhos\combustivel\abastecimentos.csv` com colunas `despesaId,dataGasto,valor,litros,km,motoristaId,veiculoId,modelo,estabelecimento,cidade,createdOn,arquivo` e imagens em `%USERPROFILE%\.betinhos\combustivel\cupons\<despesaId>.<ext>`.

- [ ] **Step 1: G0 — perguntar a Renan** se a leitura é no DEV ou no PROD (somente leitura). Gravar a URL escolhida no parâmetro `-EnvironmentUrl`.

- [ ] **Step 2: Confirmar nomes lógicos na metadata** (antes de escrever a consulta):

Run (PowerShell, autenticado):
```powershell
$attrs = Invoke-Dv GET "EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes?`$select=LogicalName,AttributeType&`$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup'"
$attrs.value | Select-Object LogicalName
```
Expected: lookups de motorista, categoria, veículo e cidade. Anote os nomes reais; o resto do script usa `$lk.motorista`, `$lk.categoria`, `$lk.veiculo`, `$lk.cidade`.

- [ ] **Step 3: Escrever o script**

```powershell
param(
  [Parameter(Mandatory)] [string] $EnvironmentUrl,
  [int] $Meses = 6,
  [switch] $DeviceCode
)
$ErrorActionPreference = "Stop"
# Somente leitura: nenhuma chamada POST/PATCH/DELETE neste arquivo.
$out = Join-Path $env:USERPROFILE ".betinhos\combustivel"
$cupons = Join-Path $out "cupons"
New-Item -ItemType Directory -Force -Path $cupons | Out-Null

# Autenticação: copie o bloco New-MsalClientApplication/Get-MsalToken e as funções Invoke-Dv/Get-Rows
# de scripts/provision-observacao-organizada.ps1 (mesmo ClientId e Authority), sem Assert-DevEnvironment
# quando a leitura for no PROD. Obtenha também um token Graph com escopo "https://graph.microsoft.com/Files.Read.All".

$lk = @{ motorista = "cr40f_motorista"; categoria = "cr40f_categoria"; veiculo = "cr40f_veiculo"; cidade = "cr40f_cidade" } # ajuste com o Step 2
$desde = (Get-Date).AddMonths(-$Meses).ToString("yyyy-MM-dd")

$cat = Get-Rows "cr40f_categoriadespesaoperacionals?`$select=cr40f_categoriadespesaoperacionalid,cr40f_nome"
$abast = $cat | Where-Object { ($_.cr40f_nome -replace '[^\p{L}]', '').ToLowerInvariant() -like "abastecimento*" }
if (-not $abast) { throw "Categoria Abastecimento não encontrada." }
$catId = $abast[0].cr40f_categoriadespesaoperacionalid

$select = "cr40f_despesaoperacionalid,cr40f_datagasto,cr40f_valor,cr40f_litros,cr40f_kminformado,cr40f_estabelecimento,createdon,_$($lk.motorista)_value,_$($lk.veiculo)_value,_$($lk.cidade)_value"
$filter = "_$($lk.categoria)_value eq $catId and cr40f_datagasto ge $desde"
$despesas = Get-Rows "cr40f_despesaoperacionals?`$select=$select&`$filter=$filter&`$expand=$($lk.veiculo)(`$select=cr40f_modelo)"

$linhas = foreach ($d in $despesas) {
  $id = $d.cr40f_despesaoperacionalid
  $anexo = Get-Rows "cr40f_anexodespesaoperacionals?`$select=cr40f_sharelink,cr40f_urlsharepoint,cr40f_mimetype&`$filter=_cr40f_despesa_value eq $id and cr40f_tipo eq 100000000&`$top=1"
  $arquivo = ""
  if ($anexo -and $anexo[0].cr40f_sharelink) {
    $share = "u!" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($anexo[0].cr40f_sharelink)).TrimEnd('=').Replace('/', '_').Replace('+', '-'))
    $ext = if ($anexo[0].cr40f_mimetype -like "*png*") { "png" } else { "jpg" }
    $arquivo = Join-Path $cupons "$id.$ext"
    if (-not (Test-Path $arquivo)) {
      Invoke-WebRequest -Uri "https://graph.microsoft.com/v1.0/shares/$share/driveItem/content" -Headers @{ Authorization = "Bearer $graphToken" } -OutFile $arquivo
    }
  }
  [pscustomobject]@{
    despesaId = $id; dataGasto = $d.cr40f_datagasto; valor = $d.cr40f_valor; litros = $d.cr40f_litros; km = $d.cr40f_kminformado
    motoristaId = $d."_$($lk.motorista)_value"; veiculoId = $d."_$($lk.veiculo)_value"; modelo = $d.($lk.veiculo).cr40f_modelo
    estabelecimento = $d.cr40f_estabelecimento; cidade = $d."_$($lk.cidade)_value@OData.Community.Display.V1.FormattedValue"; createdOn = $d.createdon; arquivo = $arquivo
  }
}
$linhas | Export-Csv -Path (Join-Path $out "abastecimentos.csv") -NoTypeInformation -Encoding UTF8
Write-Host "[combustivel] $($linhas.Count) abastecimentos; $(@($linhas | Where-Object arquivo).Count) com cupom baixado em $cupons"
```

Para o `FormattedValue` funcionar, `Invoke-Dv` precisa do header `Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"` (adicione no bloco copiado).

- [ ] **Step 4: Rodar e conferir**

Run: `pwsh scripts/combustivel/exportar-abastecimentos.ps1 -EnvironmentUrl <URL do G0>`
Expected: linha `[combustivel] N abastecimentos; M com cupom...` com N > 0 e o CSV aberto mostrando datas dos últimos 6 meses. `git status` não mostra nada em `%USERPROFILE%`.

- [ ] **Step 5: Commit**

```bash
git add scripts/combustivel/exportar-abastecimentos.ps1
git commit -m "feat(combustivel): exportação somente leitura dos abastecimentos e cupons de 6 meses"
```

### Task 0.3: ler o CNPJ dos cupons com o Claude

**Files:**
- Create: `scripts/combustivel/ler-cnpj-cupons.ts`
- Modify: `scripts/combustivel/geo.ts` (exportar `buildCnpjVisionRequest`, `parseCnpjVisionResponse`)
- Test: `tests/combustivelGeo.test.ts`

**Interfaces:**
- Consumes: `normalizeCnpj` (Task 0.1), `abastecimentos.csv` (Task 0.2)
- Produces: `buildCnpjVisionRequest(base64: string, mediaType: "image/jpeg" | "image/png"): object`, `parseCnpjVisionResponse(body: unknown): string | null`; arquivo `%USERPROFILE%\.betinhos\combustivel\cnpjs.csv` (`despesaId,cnpj`).

- [ ] **Step 1: Write the failing test** (acrescentar ao arquivo)

```ts
import { buildCnpjVisionRequest, parseCnpjVisionResponse } from "../scripts/combustivel/geo.ts";

test("buildCnpjVisionRequest força a ferramenta ler_cnpj no Haiku", () => {
  const body = buildCnpjVisionRequest("QUJD", "image/jpeg") as Record<string, any>;
  assert.equal(body.model, "claude-haiku-5-5");
  assert.deepEqual(body.tool_choice, { type: "tool", name: "ler_cnpj" });
  assert.equal(body.messages[0].content[0].source.data, "QUJD");
});

test("parseCnpjVisionResponse devolve CNPJ válido do tool_use", () => {
  assert.equal(parseCnpjVisionResponse({ content: [{ type: "tool_use", name: "ler_cnpj", input: { cnpj: "07.108.241/0001-06" } }] }), "07108241000106");
  assert.equal(parseCnpjVisionResponse({ content: [{ type: "tool_use", name: "ler_cnpj", input: { cnpj: null } }] }), null);
  assert.equal(parseCnpjVisionResponse({ content: [] }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/combustivelGeo.test.ts`
Expected: FAIL — `buildCnpjVisionRequest` não exportado.

- [ ] **Step 3: Implementar em `geo.ts`**

```ts
export function buildCnpjVisionRequest(base64: string, mediaType: "image/jpeg" | "image/png") {
  return {
    model: "claude-haiku-5-5",
    max_tokens: 100,
    tools: [{
      name: "ler_cnpj",
      description: "CNPJ do estabelecimento emissor do cupom fiscal de combustível.",
      input_schema: { type: "object", properties: { cnpj: { type: ["string", "null"] } }, required: ["cnpj"] }
    }],
    tool_choice: { type: "tool", name: "ler_cnpj" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Leia o CNPJ do emissor (posto). Se não estiver legível, devolva null. Não invente." }
      ]
    }]
  };
}

export function parseCnpjVisionResponse(body: unknown): string | null {
  const content = ((body ?? {}) as { content?: Array<{ type?: string; name?: string; input?: { cnpj?: unknown } }> }).content ?? [];
  const tool = content.find((c) => c.type === "tool_use" && c.name === "ler_cnpj");
  return normalizeCnpj(typeof tool?.input?.cnpj === "string" ? tool.input.cnpj : null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/combustivelGeo.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o executor `ler-cnpj-cupons.ts`**

```ts
// Uso: ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/combustivel/ler-cnpj-cupons.ts
// Lê abastecimentos.csv, chama o Claude por cupom (1 por vez) e grava cnpjs.csv. Retoma de onde parou.
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { buildCnpjVisionRequest, parseCnpjVisionResponse } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("Defina ANTHROPIC_API_KEY.");

const parseCsv = (file: string) => {
  const [head, ...lines] = readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.replace(/"/g, ""));
  return lines.map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    return Object.fromEntries(cols.map((c, i) => [c, values[i] ?? ""]));
  });
};

const out = join(dir, "cnpjs.csv");
const done = new Set(existsSync(out) ? parseCsv(out).map((r) => r.despesaId) : []);
if (!existsSync(out)) appendFileSync(out, "despesaId,cnpj\n");

let lidos = 0;
let nulos = 0;
for (const row of parseCsv(join(dir, "abastecimentos.csv"))) {
  if (!row.arquivo || done.has(row.despesaId)) continue;
  const mediaType = extname(row.arquivo) === ".png" ? "image/png" : "image/jpeg";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(buildCnpjVisionRequest(readFileSync(row.arquivo).toString("base64"), mediaType))
  });
  const cnpj = response.ok ? parseCnpjVisionResponse(await response.json()) : null;
  if (!response.ok) console.error(`[combustivel] HTTP ${response.status} em ${row.despesaId}`);
  appendFileSync(out, `${row.despesaId},${cnpj ?? ""}\n`);
  cnpj ? lidos++ : nulos++;
}
console.log(`[combustivel] CNPJ lido: ${lidos}; sem CNPJ: ${nulos}; arquivo: ${out}`);
```

- [ ] **Step 6: Rodar**

Run: `ANTHROPIC_API_KEY=<chave local> node --experimental-strip-types scripts/combustivel/ler-cnpj-cupons.ts`
Expected: `[combustivel] CNPJ lido: X; sem CNPJ: Y`. Estimativa de custo: centavos de real por cupom no Haiku.

- [ ] **Step 7: Commit**

```bash
git add scripts/combustivel/geo.ts scripts/combustivel/ler-cnpj-cupons.ts tests/combustivelGeo.test.ts
git commit -m "feat(combustivel): leitura do CNPJ dos cupons antigos com o Claude Haiku"
```

### Task 0.4: geocodificar e gerar o relatório da Fase 0

**Files:**
- Create: `scripts/combustivel/testar-geocodificacao.ts`, `scripts/combustivel/avaliar-amostra.ts`

**Interfaces:**
- Consumes: `brasilApiUrl`, `parseBrasilApi`, `nominatimUrl`, `parseNominatim`, `summarize`, `haversineMeters`, `verdict` (Task 0.1); `cnpjs.csv` (Task 0.3)
- Produces: `postos.csv` (`cnpj,nome,logradouro,numero,bairro,municipio,uf,cep,lat,lon,precisao`), `amostra.csv` (20 postos sorteados entre os geocodificados, com coluna `conferido` vazia e link do Google Maps), `relatorio.md`.

- [ ] **Step 1: Escrever `testar-geocodificacao.ts`**

```ts
// Uso: node --experimental-strip-types scripts/combustivel/testar-geocodificacao.ts
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { brasilApiUrl, nominatimUrl, parseBrasilApi, parseNominatim, summarize, type Endereco, type Geo, type PostoRow } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const UA = "BetinhosAppMotoristas/1.0 (+https://betinhos.com.br)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const cnpjs = [...new Set(readFileSync(join(dir, "cnpjs.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")[1]).filter(Boolean))];
const rows: Array<PostoRow & { endereco: Endereco | null }> = [];
for (const cnpj of cnpjs) {
  const br = await fetch(brasilApiUrl(cnpj), { headers: { "user-agent": UA } });
  const endereco = br.ok ? parseBrasilApi(await br.json()) : null;
  let geo: Geo | null = null;
  if (endereco) {
    await sleep(1100); // política do Nominatim: no máximo 1 req/s
    const nm = await fetch(nominatimUrl(endereco), { headers: { "user-agent": UA, "accept-language": "pt-BR" } });
    geo = nm.ok ? parseNominatim(await nm.json()) : null;
  }
  rows.push({ cnpj, brasilApi: Boolean(endereco), geo, endereco });
  await sleep(400);
}

writeFileSync(join(dir, "postos.csv"), ["cnpj,nome,logradouro,numero,bairro,municipio,uf,cep,lat,lon,precisao",
  ...rows.map((r) => [r.cnpj, r.endereco?.nome, r.endereco?.logradouro, r.endereco?.numero, r.endereco?.bairro, r.endereco?.municipio, r.endereco?.uf, r.endereco?.cep, r.geo?.lat, r.geo?.lon, r.geo?.precisao].map(csv).join(","))].join("\n"));

const geocoded = rows.filter((r) => r.geo);
const sample = [...geocoded].sort(() => Math.random() - 0.5).slice(0, 20);
writeFileSync(join(dir, "amostra.csv"), ["cnpj,nome,endereco,lat,lon,maps,conferido",
  ...sample.map((r) => [r.cnpj, r.endereco!.nome, `${r.endereco!.logradouro}, ${r.endereco!.numero} - ${r.endereco!.bairro}, ${r.endereco!.municipio}/${r.endereco!.uf}`, r.geo!.lat, r.geo!.lon,
    `https://www.google.com/maps/search/${encodeURIComponent(`${r.endereco!.nome} ${r.endereco!.logradouro} ${r.endereco!.numero} ${r.endereco!.municipio}`)}`, ""].map(csv).join(","))].join("\n"));

const s = summarize(rows);
const pct = (n: number) => (s.total ? `${Math.round((n / s.total) * 100)}%` : "0%");
writeFileSync(join(dir, "relatorio.md"), `# Fase 0 — cobertura\n\n- Postos distintos: ${s.total}\n- Encontrados na BrasilAPI: ${s.encontrados} (${pct(s.encontrados)})\n- Geocodificados: ${s.geocodificados} (${pct(s.geocodificados)})\n- Nível de rua: ${s.rua} (${pct(s.rua)})\n\nPróximo passo: preencher a coluna \`conferido\` de amostra.csv com "lat,lon" do Google Maps e rodar avaliar-amostra.ts.\n`);
console.log(`[combustivel] ${JSON.stringify(s)}`);
```

- [ ] **Step 2: Escrever `avaliar-amostra.ts`**

```ts
// Uso: node --experimental-strip-types scripts/combustivel/avaliar-amostra.ts
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { haversineMeters, verdict } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const lines = readFileSync(join(dir, "amostra.csv"), "utf8").trim().split(/\r?\n/).slice(1);
const errors = lines.map((line) => {
  const cells = line.match(/"([^"]|"")*"/g)!.map((c) => c.slice(1, -1).replace(/""/g, '"'));
  const [lat, lon, conferido] = [Number(cells[3]), Number(cells[4]), cells[6]];
  const [cLat, cLon] = conferido.split(",").map((v) => Number(v.trim()));
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) throw new Error(`Amostra sem conferência: ${cells[0]}`);
  return Math.round(haversineMeters({ lat, lon }, { lat: cLat, lon: cLon }));
});
const v = verdict(errors);
const text = `\n## Precisão (amostra de ${errors.length})\n\n- Erros (m): ${errors.sort((a, b) => a - b).join(", ")}\n- < 300 m: ${Math.round(v.share * 100)}%\n- Veredito: **${v.ok ? "APROVADO" : "REPROVADO"}** (critério ≥ 85% < 300 m)\n`;
appendFileSync(join(dir, "relatorio.md"), text);
console.log(text);
```

- [ ] **Step 3: Rodar a geocodificação**

Run: `node --experimental-strip-types scripts/combustivel/testar-geocodificacao.ts`
Expected: `[combustivel] {"total":..,"encontrados":..,"geocodificados":..,"rua":..}` e os três arquivos em `%USERPROFILE%\.betinhos\combustivel\`.

- [ ] **Step 4: Renan confere a amostra** — para cada linha de `amostra.csv`, abrir o link `maps`, clicar no posto e colar `lat,lon` na coluna `conferido`.

- [ ] **Step 5: Avaliar**

Run: `node --experimental-strip-types scripts/combustivel/avaliar-amostra.ts`
Expected: veredito impresso e anexado ao `relatorio.md`.

- [ ] **Step 6: G1** — mostrar a Renan o `relatorio.md` (sem CNPJ nem nome de motorista no chat). **APROVADO** → seguir para a Fase 1. **REPROVADO** → parar e decidir com Renan (Google Geocoding como reserva para quem falhar); este plano não segue sem essa decisão.

- [ ] **Step 7: Commit**

```bash
git add scripts/combustivel/testar-geocodificacao.ts scripts/combustivel/avaliar-amostra.ts
git commit -m "feat(combustivel): relatório de cobertura e precisão BrasilAPI + Nominatim (Fase 0)"
```

---

# Fase 1 — núcleo de cálculo no plugin (C#, sem Dataverse)

### Task 1.1: `FuelMath` e `FuelComparison`

**Files:**
- Create: `plugins/DriverRecordSharing/FuelMath.cs`, `plugins/DriverRecordSharing/FuelComparison.cs`
- Test: `plugins/DriverRecordSharing.Tests/FuelComparisonTests.cs`

**Interfaces:**
- Produces:
  - `FuelMath.PricePerLiter(decimal valor, decimal litros) : decimal?` (3 casas; `null` fora de [3; 12] ou litros ≤ 0)
  - `FuelMath.HaversineMeters(double lat1, double lon1, double lat2, double lon2) : double`
  - `FuelMath.Median(IReadOnlyList<decimal> values) : decimal`
  - `FuelMath.Lerp(decimal x, decimal xAtMax, decimal xAtZero, decimal max) : decimal` (`x ≤ xAtMax` → max; `x ≥ xAtZero` → 0; linear)
  - `FuelComparison.Fueling(Guid Id, DateTime DataGastoUtc, decimal PrecoLitro, decimal Litros, Guid? PostoId, string PostoNome, double? Lat, double? Lon)`
  - `FuelComparison.Compare(Fueling target, IEnumerable<Fueling> others) : FuelComparison.Result` com `Status` (`"sem_cnpj" | "posto_pendente" | "sem_referencia" | "comparado"`), `Referencias`, `Mediana`, `MenorPreco`, `PostoMaisBaratoId`, `PostoMaisBaratoNome`, `DistanciaMetros`, `EconomiaPerdida`
  - constantes `RaioMetros = 3000`, `JanelaDias = 7`, `MinReferencias = 2`

- [ ] **Step 1: Write the failing test**

```csharp
using System;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelComparisonTests
    {
        private static readonly DateTime Dia = new DateTime(2026, 11, 3, 15, 0, 0, DateTimeKind.Utc);
        private static readonly Guid PostoA = Guid.NewGuid();
        private static readonly Guid PostoB = Guid.NewGuid();
        private static readonly Guid PostoC = Guid.NewGuid();

        // Av. Paulista ~(-23.5614, -46.6559); 0,01° de latitude ≈ 1.112 m.
        private static FuelComparison.Fueling F(decimal preco, int diasAntes, Guid posto, string nome, double dLat, decimal litros = 40m) =>
            new FuelComparison.Fueling(Guid.NewGuid(), Dia.AddDays(-diasAntes), preco, litros, posto, nome, -23.5614 + dLat, -46.6559);

        [Fact]
        public void PricePerLiter_RejectsOutOfRange()
        {
            Assert.Equal(6.700m, FuelMath.PricePerLiter(268m, 40m));
            Assert.Null(FuelMath.PricePerLiter(40m, 40m));
            Assert.Null(FuelMath.PricePerLiter(100m, 0m));
        }

        [Fact]
        public void Median_EvenAndOdd()
        {
            Assert.Equal(6.5m, FuelMath.Median(new[] { 6.4m, 6.6m }));
            Assert.Equal(6.49m, FuelMath.Median(new[] { 6.70m, 6.49m, 6.30m }));
        }

        [Fact]
        public void Compare_UserExample_QuantifiesLoss()
        {
            var target = F(6.70m, 0, PostoA, "Posto A", 0);
            var others = new[] { F(6.49m, 3, PostoB, "Posto B", 0.01), F(6.59m, 1, PostoC, "Posto C", 0.005) };

            var r = FuelComparison.Compare(target, others);

            Assert.Equal("comparado", r.Status);
            Assert.Equal(2, r.Referencias);
            Assert.Equal(6.49m, r.MenorPreco);
            Assert.Equal(6.54m, r.Mediana);
            Assert.Equal(PostoB, r.PostoMaisBaratoId);
            Assert.InRange(r.DistanciaMetros.Value, 1100, 1125);
            Assert.Equal(8.40m, r.EconomiaPerdida); // 40 L × (6,70 − 6,49)
        }

        [Fact]
        public void Compare_IgnoresFarOldFutureAndSelf()
        {
            var target = F(6.70m, 0, PostoA, "Posto A", 0);
            var others = new[]
            {
                F(6.10m, 0, PostoB, "Longe", 0.05),      // ~5,5 km
                F(6.10m, 8, PostoB, "Antigo", 0.001),    // 8 dias antes
                F(6.10m, -1, PostoB, "Futuro", 0.001),   // depois
                target,
                F(6.60m, 2, PostoC, "Perto", 0.001)
            };

            var r = FuelComparison.Compare(target, others);

            Assert.Equal("sem_referencia", r.Status);
            Assert.Equal(1, r.Referencias);
            Assert.Null(r.EconomiaPerdida);
        }

        [Fact]
        public void Compare_CheapestPaid_HasZeroLoss()
        {
            var target = F(6.30m, 0, PostoA, "Posto A", 0);
            var r = FuelComparison.Compare(target, new[] { F(6.49m, 3, PostoB, "B", 0.001), F(6.59m, 1, PostoC, "C", 0.001) });
            Assert.Equal(0m, r.EconomiaPerdida);
        }

        [Fact]
        public void Compare_StatusWithoutPostoOrGeo()
        {
            var semCnpj = new FuelComparison.Fueling(Guid.NewGuid(), Dia, 6.7m, 40m, null, null, null, null);
            var pendente = new FuelComparison.Fueling(Guid.NewGuid(), Dia, 6.7m, 40m, PostoA, "A", null, null);
            Assert.Equal("sem_cnpj", FuelComparison.Compare(semCnpj, Enumerable.Empty<FuelComparison.Fueling>()).Status);
            Assert.Equal("posto_pendente", FuelComparison.Compare(pendente, Enumerable.Empty<FuelComparison.Fueling>()).Status);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelComparisonTests`
Expected: FAIL — `FuelMath`/`FuelComparison` não existem (erro de compilação).

- [ ] **Step 3: Write minimal implementation**

`plugins/DriverRecordSharing/FuelMath.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    public static class FuelMath
    {
        public const decimal MinPrice = 3m;
        public const decimal MaxPrice = 12m;

        public static decimal? PricePerLiter(decimal valor, decimal litros)
        {
            if (litros <= 0m) return null;
            var price = Math.Round(valor / litros, 3, MidpointRounding.AwayFromZero);
            return price < MinPrice || price > MaxPrice ? (decimal?)null : price;
        }

        public static double HaversineMeters(double lat1, double lon1, double lat2, double lon2)
        {
            double Rad(double deg) => deg * Math.PI / 180.0;
            var dLat = Rad(lat2 - lat1);
            var dLon = Rad(lon2 - lon1);
            var h = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Pow(Math.Sin(dLon / 2), 2);
            return 2 * 6371000.0 * Math.Asin(Math.Sqrt(h));
        }

        public static decimal Median(IReadOnlyList<decimal> values)
        {
            if (values.Count == 0) throw new ArgumentException("Lista vazia.", nameof(values));
            var sorted = values.OrderBy(v => v).ToList();
            var mid = sorted.Count / 2;
            return sorted.Count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2m;
        }

        // x <= xAtMax → max; x >= xAtZero → 0; linear entre os dois. Funciona com xAtMax < xAtZero ou o contrário.
        public static decimal Lerp(decimal x, decimal xAtMax, decimal xAtZero, decimal max)
        {
            var t = (x - xAtMax) / (xAtZero - xAtMax);
            if (t <= 0m) return max;
            if (t >= 1m) return 0m;
            return max * (1m - t);
        }
    }
}
```

`plugins/DriverRecordSharing/FuelComparison.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Compara o preço por litro de um abastecimento com outros a até 3 km nos 7 dias anteriores.
    public static class FuelComparison
    {
        public const double RaioMetros = 3000;
        public const int JanelaDias = 7;
        public const int MinReferencias = 2;

        public sealed class Fueling
        {
            public Fueling(Guid id, DateTime dataGastoUtc, decimal precoLitro, decimal litros, Guid? postoId, string postoNome, double? lat, double? lon)
            {
                Id = id; DataGastoUtc = dataGastoUtc; PrecoLitro = precoLitro; Litros = litros; PostoId = postoId; PostoNome = postoNome; Lat = lat; Lon = lon;
            }
            public Guid Id { get; }
            public DateTime DataGastoUtc { get; }
            public decimal PrecoLitro { get; }
            public decimal Litros { get; }
            public Guid? PostoId { get; }
            public string PostoNome { get; }
            public double? Lat { get; }
            public double? Lon { get; }
        }

        public sealed class Result
        {
            public string Status;
            public int Referencias;
            public decimal? Mediana;
            public decimal? MenorPreco;
            public Guid? PostoMaisBaratoId;
            public string PostoMaisBaratoNome;
            public int? DistanciaMetros;
            public decimal? EconomiaPerdida;
        }

        public static Result Compare(Fueling target, IEnumerable<Fueling> others)
        {
            if (target.PostoId == null) return new Result { Status = "sem_cnpj" };
            if (target.Lat == null || target.Lon == null) return new Result { Status = "posto_pendente" };

            var from = target.DataGastoUtc.Date.AddDays(-JanelaDias);
            var until = target.DataGastoUtc.Date.AddDays(1);
            var refs = others
                .Where(o => o.Id != target.Id && o.Lat != null && o.Lon != null)
                .Where(o => o.DataGastoUtc >= from && o.DataGastoUtc < until)
                .Select(o => new { o, d = FuelMath.HaversineMeters(target.Lat.Value, target.Lon.Value, o.Lat.Value, o.Lon.Value) })
                .Where(x => x.d <= RaioMetros)
                .ToList();

            if (refs.Count < MinReferencias) return new Result { Status = "sem_referencia", Referencias = refs.Count };

            var cheapest = refs.OrderBy(x => x.o.PrecoLitro).ThenBy(x => x.d).First();
            var loss = Math.Max(0m, target.PrecoLitro - cheapest.o.PrecoLitro) * target.Litros;
            return new Result
            {
                Status = "comparado",
                Referencias = refs.Count,
                Mediana = FuelMath.Median(refs.Select(x => x.o.PrecoLitro).ToList()),
                MenorPreco = cheapest.o.PrecoLitro,
                PostoMaisBaratoId = cheapest.o.PostoId,
                PostoMaisBaratoNome = cheapest.o.PostoNome,
                DistanciaMetros = (int)Math.Round(cheapest.d),
                EconomiaPerdida = Math.Round(loss, 2, MidpointRounding.AwayFromZero)
            };
        }
    }
}
```

Nota: a janela usa `Date` em UTC; `DataGastoUtc` vem do app gravado ao meio-dia UTC (`toDataverseDate`), então o dia civil bate com o de Brasília.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelComparisonTests`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add plugins/DriverRecordSharing/FuelMath.cs plugins/DriverRecordSharing/FuelComparison.cs plugins/DriverRecordSharing.Tests/FuelComparisonTests.cs
git commit -m "feat(combustivel): comparação de preço por litro com postos a até 3 km em 7 dias"
```

### Task 1.2: `FuelScore` (nota mensal)

**Files:**
- Create: `plugins/DriverRecordSharing/FuelScore.cs`
- Test: `plugins/DriverRecordSharing.Tests/FuelScoreTests.cs`

**Interfaces:**
- Consumes: `FuelMath.Lerp`, `FuelMath.Median` (Task 1.1)
- Produces:
  - `FuelScore.Entry(decimal PrecoLitro, decimal Litros, decimal? Mediana, bool TemCnpj, int? Km, Guid? VeiculoId, DateTime DataGastoUtc, DateTime CriadoEmUtc)`
  - `FuelScore.VehicleKml(Guid VeiculoId, decimal Kml)` — usado como referência da frota
  - `FuelScore.Month(IReadOnlyList<Entry> mine, string modelo, IReadOnlyList<VehicleKml> sameModelOthers) : FuelScore.Result` com `Qtd`, `NotaPreco` (decimal?), `NotaConsumo` (decimal?), `NotaRegistro` (decimal?), `Nota` (int?), `Kml` (decimal?), `KmlReferencia` (decimal?), `KmRodados` (int?)
  - `FuelScore.KmlOf(IEnumerable<Entry> entriesOfOneVehicle) : (decimal? kml, int? km)` — usado também no cálculo da referência da frota
  - constante `MinAbastecimentos = 4`

- [ ] **Step 1: Write the failing test**

```csharp
using System;
using System.Collections.Generic;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelScoreTests
    {
        private static readonly Guid Carro = Guid.NewGuid();
        private static readonly DateTime D = new DateTime(2026, 11, 2, 15, 0, 0, DateTimeKind.Utc);

        private static FuelScore.Entry E(decimal preco, decimal? mediana, int? km, int dia, bool cnpj = true, int atrasoDias = 0, decimal litros = 40m) =>
            new FuelScore.Entry(preco, litros, mediana, cnpj, km, Carro, D.AddDays(dia), D.AddDays(dia + atrasoDias));

        [Fact]
        public void Lerp_PriceAnchors()
        {
            Assert.Equal(50m, FuelMath.Lerp(-0.03m, -0.02m, 0.05m, 50m));
            Assert.Equal(0m, FuelMath.Lerp(0.06m, -0.02m, 0.05m, 50m));
            Assert.Equal(25m, FuelMath.Lerp(0.015m, -0.02m, 0.05m, 50m));
        }

        [Fact]
        public void Month_BelowMinimum_HasNoNota()
        {
            var r = FuelScore.Month(new[] { E(6.5m, 6.5m, 1000, 0), E(6.5m, 6.5m, 1400, 3), E(6.5m, 6.5m, 1800, 6) }, "Corolla", new FuelScore.VehicleKml[0]);
            Assert.Equal(3, r.Qtd);
            Assert.Null(r.Nota);
        }

        [Fact]
        public void Month_FullScore_WhenCheapEfficientAndComplete()
        {
            var mine = new[] { E(6.30m, 6.50m, 10000, 0), E(6.30m, 6.50m, 10500, 5), E(6.30m, 6.50m, 11000, 10), E(6.30m, 6.50m, 11500, 15) };
            // 1.500 km / 120 L (3 abastecimentos depois do primeiro) = 12,5 km/l; referência 11 → r = 1,136 → 30.
            var others = new[] { new FuelScore.VehicleKml(Guid.NewGuid(), 11m), new FuelScore.VehicleKml(Guid.NewGuid(), 11m) };

            var r = FuelScore.Month(mine, "Corolla", others);

            Assert.Equal(12.5m, r.Kml);
            Assert.Equal(11m, r.KmlReferencia);
            Assert.Equal(1500, r.KmRodados);
            Assert.Equal(50m, r.NotaPreco);
            Assert.Equal(30m, r.NotaConsumo);
            Assert.Equal(20m, r.NotaRegistro);
            Assert.Equal(100, r.Nota);
        }

        [Fact]
        public void Month_NormalizesWhenConsumptionMissing()
        {
            // Sem km: consumo fica fora; registro perde 8 por abastecimento (sem km) → 12.
            var mine = new[] { E(6.50m, 6.50m, null, 0), E(6.50m, 6.50m, null, 5), E(6.50m, 6.50m, null, 10), E(6.50m, 6.50m, null, 15) };

            var r = FuelScore.Month(mine, "Corolla", new FuelScore.VehicleKml[0]);

            // d = 0 → preço = 50 × (1 − 0,02/0,07) = 35,71
            Assert.Equal(35.71m, r.NotaPreco);
            Assert.Null(r.NotaConsumo);
            Assert.Equal(12m, r.NotaRegistro);
            Assert.Equal(68, r.Nota); // round((35,71 + 12) × 100 / 70)
        }

        [Fact]
        public void Registro_PenalizesLateAndNoCnpj()
        {
            var mine = new[] { E(6.5m, null, 1000, 0, cnpj: false), E(6.5m, null, 1400, 3, atrasoDias: 3), E(6.5m, null, 1800, 6), E(6.5m, null, 2200, 9) };
            var r = FuelScore.Month(mine, "Corolla", new FuelScore.VehicleKml[0]);
            Assert.Equal(17m, r.NotaRegistro); // (12 + 16 + 20 + 20) / 4
            Assert.Null(r.NotaPreco);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelScoreTests`
Expected: FAIL (compilação: `FuelScore` não existe).

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Nota mensal 0–100: preço 50, consumo 30, registro 20. Componente sem dado fica fora e a nota é normalizada.
    public static class FuelScore
    {
        public const int MinAbastecimentos = 4;
        public const decimal PesoPreco = 50m, PesoConsumo = 30m, PesoRegistro = 20m;

        public sealed class Entry
        {
            public Entry(decimal precoLitro, decimal litros, decimal? mediana, bool temCnpj, int? km, Guid? veiculoId, DateTime dataGastoUtc, DateTime criadoEmUtc)
            {
                PrecoLitro = precoLitro; Litros = litros; Mediana = mediana; TemCnpj = temCnpj; Km = km; VeiculoId = veiculoId; DataGastoUtc = dataGastoUtc; CriadoEmUtc = criadoEmUtc;
            }
            public decimal PrecoLitro { get; }
            public decimal Litros { get; }
            public decimal? Mediana { get; }
            public bool TemCnpj { get; }
            public int? Km { get; }
            public Guid? VeiculoId { get; }
            public DateTime DataGastoUtc { get; }
            public DateTime CriadoEmUtc { get; }
        }

        public sealed class VehicleKml
        {
            public VehicleKml(Guid veiculoId, decimal kml) { VeiculoId = veiculoId; Kml = kml; }
            public Guid VeiculoId { get; }
            public decimal Kml { get; }
        }

        public sealed class Result
        {
            public int Qtd;
            public decimal? NotaPreco, NotaConsumo, NotaRegistro, Kml, KmlReferencia;
            public int? Nota, KmRodados;
        }

        // km/l de um veículo no mês: (kmMax − kmMin) / litros dos abastecimentos depois do primeiro (precisa de ≥ 2 com km).
        public static (decimal? kml, int? km) KmlOf(IEnumerable<Entry> entriesOfOneVehicle)
        {
            var withKm = entriesOfOneVehicle.Where(e => e.Km != null).OrderBy(e => e.Km).ToList();
            if (withKm.Count < 2) return (null, null);
            var km = withKm.Last().Km.Value - withKm.First().Km.Value;
            var litros = withKm.Skip(1).Sum(e => e.Litros);
            if (km <= 0 || litros <= 0m) return (null, null);
            return (Math.Round(km / litros, 2, MidpointRounding.AwayFromZero), km);
        }

        public static Result Month(IReadOnlyList<Entry> mine, string modelo, IReadOnlyList<VehicleKml> sameModelOthers)
        {
            var result = new Result { Qtd = mine.Count };
            if (mine.Count == 0) return result;

            var priced = mine.Where(e => e.Mediana != null && e.Mediana > 0m).ToList();
            if (priced.Count > 0)
            {
                var weighted = priced.Sum(e => FuelMath.Lerp((e.PrecoLitro - e.Mediana.Value) / e.Mediana.Value, -0.02m, 0.05m, PesoPreco) * e.Litros);
                result.NotaPreco = Math.Round(weighted / priced.Sum(e => e.Litros), 2, MidpointRounding.AwayFromZero);
            }

            var mainVehicle = mine.Where(e => e.VeiculoId != null).GroupBy(e => e.VeiculoId).OrderByDescending(g => g.Count()).FirstOrDefault();
            if (mainVehicle != null)
            {
                var (kml, km) = KmlOf(mainVehicle);
                result.Kml = kml;
                result.KmRodados = km;
                var refs = sameModelOthers.Where(v => v.VeiculoId != mainVehicle.Key).Select(v => v.Kml).ToList();
                if (kml != null && refs.Count >= 2)
                {
                    result.KmlReferencia = FuelMath.Median(refs);
                    result.NotaConsumo = Math.Round(FuelMath.Lerp(-(kml.Value / result.KmlReferencia.Value), -1.05m, -0.85m, PesoConsumo), 2, MidpointRounding.AwayFromZero);
                }
            }

            result.NotaRegistro = Math.Round(mine.Average(e =>
                (e.TemCnpj ? 8m : 0m) + (e.Km != null ? 8m : 0m) + ((e.CriadoEmUtc - e.DataGastoUtc).TotalDays <= 2 ? 4m : 0m)), 2, MidpointRounding.AwayFromZero);

            if (mine.Count < MinAbastecimentos) return result;
            var obtained = (result.NotaPreco ?? 0m) + (result.NotaConsumo ?? 0m) + (result.NotaRegistro ?? 0m);
            var available = (result.NotaPreco != null ? PesoPreco : 0m) + (result.NotaConsumo != null ? PesoConsumo : 0m) + (result.NotaRegistro != null ? PesoRegistro : 0m);
            result.Nota = available > 0m ? (int?)Math.Round(obtained * 100m / available, MidpointRounding.AwayFromZero) : null;
            return result;
        }
    }
}
```

O consumo usa `Lerp` com sinais invertidos para que **maior km/l = mais pontos** (`-r ≤ -1,05` → 30; `-r ≥ -0,85` → 0). O parâmetro `modelo` fica na assinatura só para documentar que `sameModelOthers` já vem filtrado pelo mesmo `cr40f_modelo` (o filtro é do `FuelRepository`).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelScoreTests`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add plugins/DriverRecordSharing/FuelScore.cs plugins/DriverRecordSharing.Tests/FuelScoreTests.cs
git commit -m "feat(combustivel): nota mensal de preço, consumo e registro com normalização"
```

### Task 1.3: `PostoGeocoder` (BrasilAPI + Nominatim no plugin)

**Files:**
- Create: `plugins/DriverRecordSharing/PostoGeocoder.cs`
- Test: `plugins/DriverRecordSharing.Tests/PostoGeocoderTests.cs`

**Interfaces:**
- Produces:
  - `PostoGeocoder.Get` delegate `string Get(string url, int timeoutMs)` (lança em erro HTTP)
  - `PostoGeocoder.Posto` (`Nome, Logradouro, Numero, Bairro, Municipio, Uf, Cep, Lat (double?), Lon (double?), Precisao ("rua"|"bairro"|"cidade"|null), Status ("geocodificado"|"pendente")`)
  - `PostoGeocoder.Resolve(string cnpj, Get get) : Posto` (nunca lança; falha → `Status="pendente"`)
  - `PostoGeocoder.HttpGet(string url, int timeoutMs) : string` (real, com o User-Agent da Global Constraints)

- [ ] **Step 1: Write the failing test**

```csharp
using System;
using System.Net;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PostoGeocoderTests
    {
        private const string Brasil = "{\"razao_social\":\"AUTO POSTO X LTDA\",\"nome_fantasia\":\"Posto X\",\"descricao_tipo_de_logradouro\":\"AVENIDA\",\"logradouro\":\"PAULISTA\",\"numero\":\"1000\",\"bairro\":\"BELA VISTA\",\"municipio\":\"SAO PAULO\",\"uf\":\"SP\",\"cep\":\"01310100\"}";
        private const string Nominatim = "[{\"lat\":\"-23.5614\",\"lon\":\"-46.6559\",\"place_rank\":30}]";

        [Fact]
        public void Resolve_FullSuccess()
        {
            string nominatimUrl = null;
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) =>
            {
                if (url.StartsWith("https://brasilapi.com.br/api/cnpj/v1/07108241000106")) return Brasil;
                nominatimUrl = url;
                return Nominatim;
            });

            Assert.Equal("geocodificado", posto.Status);
            Assert.Equal("Posto X", posto.Nome);
            Assert.Equal("AVENIDA PAULISTA", posto.Logradouro);
            Assert.Equal("BELA VISTA", posto.Bairro);
            Assert.Equal(-23.5614, posto.Lat);
            Assert.Equal("rua", posto.Precisao);
            Assert.Contains("street=1000%20AVENIDA%20PAULISTA", nominatimUrl);
            Assert.Contains("countrycodes=br", nominatimUrl);
        }

        [Fact]
        public void Resolve_BrasilApiFails_IsPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => throw new WebException("404"));
            Assert.Equal("pendente", posto.Status);
            Assert.Null(posto.Lat);
        }

        [Fact]
        public void Resolve_NominatimEmpty_KeepsAddressPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => url.Contains("brasilapi") ? Brasil : "[]");
            Assert.Equal("pendente", posto.Status);
            Assert.Equal("Posto X", posto.Nome);
        }

        [Fact]
        public void Resolve_CityLevel_IsPending()
        {
            var posto = PostoGeocoder.Resolve("07108241000106", (url, ms) => url.Contains("brasilapi") ? Brasil : "[{\"lat\":\"-23.5\",\"lon\":\"-46.6\",\"place_rank\":12}]");
            Assert.Equal("pendente", posto.Status);
            Assert.Equal("cidade", posto.Precisao);
        }
    }
}
```

Regra: só `rua` vira `geocodificado` (o raio de 3 km não tolera centro de cidade). `bairro`/`cidade` gravam as coordenadas mas ficam `pendente` para o gestor conferir.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter PostoGeocoderTests`
Expected: FAIL (compilação).

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Web.Script.Serialization;

namespace Betinhos.DriverRecordSharing
{
    // Endereço do posto pela BrasilAPI e coordenadas pelo Nominatim. Nunca lança: falha vira "pendente".
    public static class PostoGeocoder
    {
        public const string UserAgent = "BetinhosAppMotoristas/1.0 (+https://betinhos.com.br)";
        public const int TimeoutMs = 6000;

        public delegate string Get(string url, int timeoutMs);

        public sealed class Posto
        {
            public string Nome, Logradouro, Numero, Bairro, Municipio, Uf, Cep, Precisao, Status = "pendente";
            public double? Lat, Lon;
        }

        public static Posto Resolve(string cnpj, Get get)
        {
            var posto = new Posto();
            Dictionary<string, object> b;
            try { b = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(get("https://brasilapi.com.br/api/cnpj/v1/" + cnpj, TimeoutMs)); }
            catch (Exception) { return posto; }

            string T(string key) => b != null && b.TryGetValue(key, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture).Trim() : "";
            if (T("logradouro") == "" || T("municipio") == "") return posto;
            posto.Nome = T("nome_fantasia") != "" ? T("nome_fantasia") : T("razao_social");
            posto.Logradouro = (T("descricao_tipo_de_logradouro") + " " + T("logradouro")).Trim();
            posto.Numero = T("numero");
            posto.Bairro = T("bairro");
            posto.Municipio = T("municipio");
            posto.Uf = T("uf");
            posto.Cep = T("cep").Replace("-", "").Replace(".", "");

            var url = "https://nominatim.openstreetmap.org/search?street=" + Uri.EscapeDataString((posto.Numero + " " + posto.Logradouro).Trim())
                + "&city=" + Uri.EscapeDataString(posto.Municipio) + "&state=" + Uri.EscapeDataString(posto.Uf)
                + "&postalcode=" + Uri.EscapeDataString(posto.Cep) + "&countrycodes=br&format=jsonv2&limit=1";
            try
            {
                var list = new JavaScriptSerializer().DeserializeObject(get(url, TimeoutMs)) as object[];
                if (list == null || list.Length == 0 || !(list[0] is Dictionary<string, object> first)) return posto;
                posto.Lat = double.Parse(Convert.ToString(first["lat"], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                posto.Lon = double.Parse(Convert.ToString(first["lon"], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                var rank = first.TryGetValue("place_rank", out var r) ? Convert.ToInt32(r, CultureInfo.InvariantCulture) : 0;
                posto.Precisao = rank >= 26 ? "rua" : rank >= 16 ? "bairro" : "cidade";
                posto.Status = posto.Precisao == "rua" ? "geocodificado" : "pendente";
            }
            catch (Exception) { /* sem coordenadas: fica pendente com o endereço */ }
            return posto;
        }

        public static string HttpGet(string url, int timeoutMs)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = timeoutMs;
            request.UserAgent = UserAgent;
            request.Headers["Accept-Language"] = "pt-BR";
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return reader.ReadToEnd();
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter PostoGeocoderTests`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add plugins/DriverRecordSharing/PostoGeocoder.cs plugins/DriverRecordSharing.Tests/PostoGeocoderTests.cs
git commit -m "feat(combustivel): cadastro automático do posto por BrasilAPI e Nominatim"
```

### Task 1.4: `FuelInsightWriter` (Claude só narra)

**Files:**
- Create: `plugins/DriverRecordSharing/FuelInsightWriter.cs`
- Test: `plugins/DriverRecordSharing.Tests/FuelInsightWriterTests.cs`

**Interfaces:**
- Consumes: `ObservationOrganizer.Post` delegate e `ObservationOrganizer.HttpPost` (existentes, mesmo endpoint/headers)
- Produces:
  - `FuelInsightWriter.Facts` (`Mes`, `Nota` int?, `NotaPreco`, `NotaConsumo`, `NotaRegistro` decimal?, `Qtd` int, `Litros`, `Gasto`, `EconomiaPerdida` decimal, `Kml`, `KmlReferencia` decimal?, `PiorAbastecimento` string — já formatado, ex.: "Posto A: R$ 6,70/L; Posto B a 1,1 km: R$ 6,49/L, 3 dias antes", `MesAnteriorNota` int?)
  - `FuelInsightWriter.BuildRequestBody(Facts f) : string`
  - `FuelInsightWriter.ParseResponse(string body, Facts f) : Result` (`Ok`, `Insights` List<string> 2–4 itens, `Motivo`, `InputTokens`, `OutputTokens`)
  - `FuelInsightWriter.Write(string apiKey, Facts f, ObservationOrganizer.Post post, ITracingService tracing) : Result`
  - `FuelInsightWriter.AllowedNumbers(Facts f) : HashSet<string>`

- [ ] **Step 1: Write the failing test**

```csharp
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelInsightWriterTests
    {
        private static FuelInsightWriter.Facts Facts() => new FuelInsightWriter.Facts
        {
            Mes = "2026-11", Nota = 72, NotaPreco = 31.5m, NotaConsumo = 24m, NotaRegistro = 16.5m, Qtd = 6, Litros = 240m, Gasto = 1590.4m,
            EconomiaPerdida = 18.4m, Kml = 10.8m, KmlReferencia = 11.6m, PiorAbastecimento = "Posto A: R$ 6,70/L; Posto B a 1,1 km: R$ 6,49/L, 3 dias antes", MesAnteriorNota = 65
        };

        private static string Tool(params string[] insights) =>
            "{\"content\":[{\"type\":\"tool_use\",\"name\":\"escrever_insights\",\"input\":{\"insights\":[" + string.Join(",", insights.Select(i => "\"" + i + "\"")) + "]}}],\"usage\":{\"input_tokens\":300,\"output_tokens\":90}}";

        [Fact]
        public void Body_UsesHaikuToolAndFacts()
        {
            var body = FuelInsightWriter.BuildRequestBody(Facts());
            Assert.Contains("\"model\":\"claude-haiku-5-5\"", body);
            Assert.Contains("\"name\":\"escrever_insights\"", body);
            Assert.Contains("R$ 18,40", body);
            Assert.DoesNotContain("motorista", body.ToLowerInvariant().Replace("o motorista", ""));
        }

        [Fact]
        public void Parse_KeepsInsightsWithKnownNumbers()
        {
            var r = FuelInsightWriter.ParseResponse(Tool(
                "Você deixou de economizar R$ 18,40 este mês.",
                "Sua nota subiu de 65 para 72.",
                "No Posto B, a 1,1 km, o litro saiu R$ 6,49."), Facts());
            Assert.True(r.Ok);
            Assert.Equal(3, r.Insights.Count);
        }

        [Fact]
        public void Parse_DropsInsightWithInventedNumber()
        {
            var r = FuelInsightWriter.ParseResponse(Tool(
                "Você deixou de economizar R$ 18,40 este mês.",
                "Abastecer às terças economiza R$ 50,00.",
                "Sua nota subiu de 65 para 72."), Facts());
            Assert.True(r.Ok);
            Assert.Equal(2, r.Insights.Count);
            Assert.DoesNotContain(r.Insights, i => i.Contains("50,00"));
        }

        [Fact]
        public void Parse_FailsWhenFewerThanTwoSurvive()
        {
            var r = FuelInsightWriter.ParseResponse(Tool("Economize R$ 99,00.", "Gaste 3,14 a menos."), Facts());
            Assert.False(r.Ok);
            Assert.Equal("insights_invalidos", r.Motivo);
        }

        [Fact]
        public void Write_WithoutKey_DoesNotCall()
        {
            var called = false;
            var r = FuelInsightWriter.Write(null, Facts(), (b, k, t) => { called = true; return ""; }, null);
            Assert.False(r.Ok);
            Assert.Equal("sem_chave", r.Motivo);
            Assert.False(called);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelInsightWriterTests`
Expected: FAIL (compilação).

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Escreve 2–4 insights a partir de números já calculados. Insight com número fora dos fatos é descartado.
    // Trace só com motivo, ms e tokens; nunca o texto nem a chave.
    public static class FuelInsightWriter
    {
        public const string Model = "claude-haiku-5-5";
        public const string ToolName = "escrever_insights";
        public const int MaxTokens = 500;
        private static readonly CultureInfo Br = new CultureInfo("pt-BR");
        private static readonly Regex NumberToken = new Regex(@"\d+(?:[.,]\d+)?", RegexOptions.Compiled);

        private const string SystemPrompt =
            "Você é um consultor de custos de uma empresa de transporte executivo e fala com um motorista sobre os abastecimentos dele. " +
            "Escreva de 2 a 4 frases curtas (até 160 caracteres cada), em português do Brasil, tom respeitoso e prático. " +
            "Use SOMENTE os números dos fatos, copiados exatamente como estão. Não calcule números novos. " +
            "Nunca cite outros motoristas; pode citar postos. Termine com uma sugestão concreta.";

        public sealed class Facts
        {
            public string Mes, PiorAbastecimento;
            public int? Nota, MesAnteriorNota;
            public int Qtd;
            public decimal? NotaPreco, NotaConsumo, NotaRegistro, Kml, KmlReferencia;
            public decimal Litros, Gasto, EconomiaPerdida;
        }

        public sealed class Result
        {
            public bool Ok;
            public List<string> Insights = new List<string>();
            public string Motivo;
            public long Ms;
            public int InputTokens, OutputTokens;
        }

        private static string Money(decimal v) => "R$ " + v.ToString("N2", Br);
        private static string Num(decimal v) => v.ToString("0.##", Br);

        public static List<string> FactLines(Facts f)
        {
            var lines = new List<string>
            {
                "Mês: " + f.Mes,
                "Abastecimentos: " + f.Qtd,
                "Litros: " + Num(f.Litros),
                "Gasto: " + Money(f.Gasto),
                "Economia perdida contra o posto mais barato próximo: " + Money(f.EconomiaPerdida)
            };
            lines.Add(f.Nota != null ? "Nota: " + f.Nota + " de 100" : "Nota: em formação (menos de 4 abastecimentos)");
            if (f.MesAnteriorNota != null) lines.Add("Nota do mês anterior: " + f.MesAnteriorNota);
            if (f.NotaPreco != null) lines.Add("Pontos de preço: " + Num(f.NotaPreco.Value) + " de 50");
            if (f.NotaConsumo != null) lines.Add("Pontos de consumo: " + Num(f.NotaConsumo.Value) + " de 30");
            if (f.NotaRegistro != null) lines.Add("Pontos de registro: " + Num(f.NotaRegistro.Value) + " de 20");
            if (f.Kml != null) lines.Add("Consumo: " + Num(f.Kml.Value) + " km/l");
            if (f.KmlReferencia != null) lines.Add("Consumo de referência do mesmo modelo: " + Num(f.KmlReferencia.Value) + " km/l");
            if (!string.IsNullOrWhiteSpace(f.PiorAbastecimento)) lines.Add("Abastecimento mais caro do mês: " + f.PiorAbastecimento);
            return lines;
        }

        public static HashSet<string> AllowedNumbers(Facts f) =>
            new HashSet<string>(FactLines(f).SelectMany(l => NumberToken.Matches(l).Cast<Match>().Select(m => m.Value)));

        public static string BuildRequestBody(Facts f)
        {
            var schema = new Dictionary<string, object>
            {
                ["type"] = "object",
                ["properties"] = new Dictionary<string, object>
                {
                    ["insights"] = new Dictionary<string, object>
                    {
                        ["type"] = "array", ["minItems"] = 2, ["maxItems"] = 4,
                        ["items"] = new Dictionary<string, object> { ["type"] = "string", ["maxLength"] = 160 }
                    }
                },
                ["required"] = new[] { "insights" }
            };
            var body = new Dictionary<string, object>
            {
                ["model"] = Model,
                ["max_tokens"] = MaxTokens,
                ["system"] = SystemPrompt,
                ["tools"] = new[] { new Dictionary<string, object> { ["name"] = ToolName, ["description"] = "Insights do mês para o motorista.", ["input_schema"] = schema } },
                ["tool_choice"] = new Dictionary<string, object> { ["type"] = "tool", ["name"] = ToolName },
                ["messages"] = new[] { new Dictionary<string, object> { ["role"] = "user", ["content"] = "Fatos:\n- " + string.Join("\n- ", FactLines(f)) } }
            };
            return new JavaScriptSerializer().Serialize(body);
        }

        public static Result ParseResponse(string responseBody, Facts f)
        {
            var result = new Result();
            try
            {
                var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(responseBody);
                if (root.TryGetValue("usage", out var u) && u is Dictionary<string, object> usage)
                {
                    result.InputTokens = Convert.ToInt32(usage["input_tokens"], CultureInfo.InvariantCulture);
                    result.OutputTokens = Convert.ToInt32(usage["output_tokens"], CultureInfo.InvariantCulture);
                }
                var tool = ((IEnumerable)root["content"]).OfType<Dictionary<string, object>>()
                    .FirstOrDefault(c => (c["type"] as string) == "tool_use" && (c["name"] as string) == ToolName);
                var raw = tool != null ? ((IEnumerable)((Dictionary<string, object>)tool["input"])["insights"]).OfType<string>() : Enumerable.Empty<string>();
                var allowed = AllowedNumbers(f);
                result.Insights = raw.Select(s => s.Trim()).Where(s => s.Length > 0 && s.Length <= 160)
                    .Where(s => NumberToken.Matches(s).Cast<Match>().All(m => allowed.Contains(m.Value))).Take(4).ToList();
            }
            catch (Exception) { result.Motivo = "resposta_invalida"; return result; }
            result.Ok = result.Insights.Count >= 2;
            if (!result.Ok) result.Motivo = "insights_invalidos";
            return result;
        }

        public static Result Write(string apiKey, Facts f, ObservationOrganizer.Post post, ITracingService tracing)
        {
            if (string.IsNullOrWhiteSpace(apiKey)) return new Result { Motivo = "sem_chave" };
            var watch = Stopwatch.StartNew();
            Result result;
            try { result = ParseResponse(post(BuildRequestBody(f), apiKey, ObservationOrganizer.TimeoutMs), f); }
            catch (Exception error) { result = new Result { Motivo = "falha_http:" + error.GetType().Name }; }
            result.Ms = watch.ElapsedMilliseconds;
            tracing?.Trace("InsightsCombustivel: ok={0} motivo={1} ms={2} in={3} out={4}", result.Ok, result.Motivo, result.Ms, result.InputTokens, result.OutputTokens);
            return result;
        }
    }
}
```

O teste `Body_UsesHaikuToolAndFacts` confere que os fatos não carregam a palavra "motorista" fora do prompt do sistema. O JSON serializado escapa acentos como `ç`; se o `Assert.Contains("R$ 18,40", body)` falhar por escape, compare com `"R$ 18,40"` depois de `new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(body)` em `messages[0].content`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelInsightWriterTests`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add plugins/DriverRecordSharing/FuelInsightWriter.cs plugins/DriverRecordSharing.Tests/FuelInsightWriterTests.cs
git commit -m "feat(combustivel): insights do Claude Haiku presos aos números calculados"
```

### Task 1.5: `SecretReader` (Key Vault)

**Files:**
- Create: `plugins/DriverRecordSharing/SecretReader.cs`
- Modify: `plugins/DriverRecordSharing/OrganizeObservationPlugin.cs` (linha `apiKey = EnvironmentVariables.Read(...)`)
- Test: `plugins/DriverRecordSharing.Tests/SecretReaderTests.cs`

**Interfaces:**
- Consumes: `EnvironmentVariables.Read(IOrganizationService, string)` (existente)
- Produces: `SecretReader.Read(IOrganizationService system, string schemaName) : string` — tenta `RetrieveEnvironmentVariableSecretValue` (`EnvironmentVariableName` → `EnvironmentVariableSecretValue`); se a variável não for Secret (falha da mensagem), cai em `EnvironmentVariables.Read`.

- [ ] **Step 1: Write the failing test**

```csharp
using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class SecretReaderTests
    {
        private sealed class Svc : IOrganizationService
        {
            public bool SecretWorks;
            public string LastRequest;
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                LastRequest = request.RequestName + ":" + request.Parameters["EnvironmentVariableName"];
                if (!SecretWorks) throw new InvalidPluginExecutionException("not a secret");
                var response = new OrganizationResponse();
                response.Results["EnvironmentVariableSecretValue"] = "sk-secret";
                return response;
            }
            public EntityCollection RetrieveMultiple(QueryBase query) => new EntityCollection();
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
            public void Disassociate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
        }

        [Fact]
        public void Read_UsesSecretMessage()
        {
            var svc = new Svc { SecretWorks = true };
            Assert.Equal("sk-secret", SecretReader.Read(svc, "new_AnthropicKeyCombustivel"));
            Assert.Equal("RetrieveEnvironmentVariableSecretValue:new_AnthropicKeyCombustivel", svc.LastRequest);
        }

        [Fact]
        public void Read_FallsBackToStringVariable()
        {
            Assert.Null(SecretReader.Read(new Svc { SecretWorks = false }, "new_AnthropicKeyCombustivel"));
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter SecretReaderTests`
Expected: FAIL (compilação).

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Lê variável de ambiente tipo Secret (Azure Key Vault). Durante a migração, variável String ainda funciona.
    public static class SecretReader
    {
        public static string Read(IOrganizationService system, string schemaName)
        {
            try
            {
                var request = new OrganizationRequest("RetrieveEnvironmentVariableSecretValue");
                request.Parameters["EnvironmentVariableName"] = schemaName;
                var value = system.Execute(request).Results["EnvironmentVariableSecretValue"] as string;
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            catch (Exception) { /* não é Secret ou Key Vault indisponível: tenta String */ }
            return EnvironmentVariables.Read(system, schemaName);
        }
    }
}
```

Em `OrganizeObservationPlugin.cs`, trocar `EnvironmentVariables.Read(factory.CreateOrganizationService(null), EnvApiKey)` por `SecretReader.Read(factory.CreateOrganizationService(null), EnvApiKey)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests`
Expected: PASS (suíte inteira, inclusive `ObservationOrganizerTests`).

- [ ] **Step 5: Commit**

```bash
git add plugins/DriverRecordSharing/SecretReader.cs plugins/DriverRecordSharing/OrganizeObservationPlugin.cs plugins/DriverRecordSharing.Tests/SecretReaderTests.cs
git commit -m "feat(seguranca): leitura de chave por variável Secret do Key Vault com fallback"
```

---

# Fase 2 — schema, repositório e plugins (DEV)

### Task 2.1: provisionar schema no DEV

**Files:**
- Create: `scripts/provision-relatorio-combustivel.ps1`
- Create: `plugins/DriverRecordSharing/FuelSchema.cs`
- Modify: `scripts/push-dev.ps1` (chamar o provisionador depois de `provision-observacao-organizada.ps1`)

**Interfaces:**
- Produces (nomes lógicos, fonte única em `FuelSchema.cs`):
  - Tabela `new_postocombustivel` (`new_postocombustivels`): `new_name` (nome), `new_cnpj` (texto 14, chave alternativa `new_postocombustivel_cnpj`), `new_logradouro`, `new_numero`, `new_bairro`, `new_municipio`, `new_uf`, `new_cep`, `new_latitude` e `new_longitude` (decimal, precisão 6), `new_precisaogeo` (texto 10), `new_statusgeo` (choice: `100000000` pendente, `100000001` geocodificado, `100000002` corrigido manualmente).
  - Despesa `cr40f_despesaoperacional`, colunas novas: `new_cnpjposto` (texto 14), `new_precolitro` (decimal 3), `new_posto` (lookup `new_postocombustivel`), `new_statuscomparacao` (choice: `100000000` sem_cnpj, `100000001` posto_pendente, `100000002` sem_referencia, `100000003` comparado), `new_referenciascomparacao` (inteiro), `new_medianaregiao` (decimal 3), `new_menorprecoproximo` (decimal 3), `new_postomaisbarato` (lookup `new_postocombustivel`), `new_distanciapostobarato` (inteiro, metros), `new_economiaperdida` (moeda).
  - Tabela `new_resumocombustivelmensal` (`new_resumocombustivelmensals`), propriedade da organização: `new_name` (`<funcionarioId>|2026-11`, chave alternativa), `new_motorista` (lookup `cr40f_funcionarios`), `new_mes` (texto 7), `new_qtdabastecimentos` (inteiro), `new_litros` (decimal 3), `new_gastototal` e `new_economiaperdida` (moeda), `new_kmrodados` (inteiro), `new_kml` e `new_kmlreferencia` (decimal 2), `new_notapreco`, `new_notaconsumo`, `new_notaregistro` (decimal 2), `new_nota` (inteiro, opcional), `new_insightsjson` (texto multilinha 4000), `new_insightsgeradoem` (data/hora), `new_precisainsight` (sim/não).
  - Variável de ambiente `new_AnthropicKeyCombustivel` tipo **Secret** (`type = 100000005`).
  - Custom APIs (sem parâmetro de entrada, função = false, `bindingtype=0`): `new_ObterRelatorioCombustivel` (resposta `new_RelatorioJson` String) e `new_GerarInsightsCombustivel` (resposta `new_ResultadoJson` String). Plugin types: `Betinhos.DriverRecordSharing.FuelReportPlugin` e `Betinhos.DriverRecordSharing.FuelInsightsPlugin`.

- [ ] **Step 1: Confirmar nomes dos lookups da despesa** com a mesma consulta da Task 0.2 Step 2, agora no DEV. Gravar em `FuelSchema.cs`:

```csharp
namespace Betinhos.DriverRecordSharing
{
    // Nomes lógicos do relatório de combustível. Confirmados na metadata do DEV em <data da execução>.
    public static class FuelSchema
    {
        public const string Despesa = "cr40f_despesaoperacional";
        public const string DespesaMotorista = "cr40f_motorista";   // confirmar
        public const string DespesaCategoria = "cr40f_categoria";   // confirmar
        public const string DespesaVeiculo = "cr40f_veiculo";       // confirmar
        public const string Categoria = "cr40f_categoriadespesaoperacional";
        public const string CategoriaAbastecimento = "abastecimento"; // nome normalizado
        public const string Veiculo = "cr40f_veiculos";
        public const string VeiculoModelo = "cr40f_modelo";
        public const string Funcionario = "cr40f_funcionarios";

        public const string Posto = "new_postocombustivel";
        public const string Resumo = "new_resumocombustivelmensal";

        public const int StatusGeoPendente = 100000000, StatusGeoGeocodificado = 100000001, StatusGeoManual = 100000002;
        public const int ComparacaoSemCnpj = 100000000, ComparacaoPostoPendente = 100000001, ComparacaoSemReferencia = 100000002, ComparacaoComparado = 100000003;

        public const string EnvApiKey = "new_AnthropicKeyCombustivel";
    }
}
```

Substitua os três `// confirmar` pelos nomes reais e apague o comentário. O `Funcionario` e o `Veiculo` acima são nomes de tabela (`cr40f_funcionarios` é o nome lógico da tabela de funcionário — confirme se o lógico é singular e ajuste).

- [ ] **Step 2: Escrever `provision-relatorio-combustivel.ps1`** seguindo a estrutura de `scripts/provision-observacao-organizada.ps1`: mesmos parâmetros (`-EnvironmentUrl`, `-SolutionUniqueName AppBetinhos`, `-Apply`, `-SomenteValidar`, `-DeviceCode`), `Assert-DevEnvironment`, `Invoke-Dv`, `Get-Rows`, `Add-SolutionComponent`, sem `-Apply` só lista o que criaria. Para cada item da lista de Interfaces acima: consultar se existe (`EntityDefinitions(LogicalName='...')`, `Attributes(LogicalName='...')`, `environmentvariabledefinitions?$filter=schemaname eq '...'`, `customapis?$filter=uniquename eq '...'`) e criar só o que faltar. Colunas por `POST EntityDefinitions(LogicalName='<tabela>')/Attributes` com `@odata.type` `Microsoft.Dynamics.CRM.StringAttributeMetadata` / `DecimalAttributeMetadata` (`Precision`, `MinValue 0`, `MaxValue 1000000`) / `IntegerAttributeMetadata` / `MoneyAttributeMetadata` / `PicklistAttributeMetadata` (OptionSet local com os valores acima, rótulos pt-BR `1046`) / `BooleanAttributeMetadata` / `DateTimeAttributeMetadata`; lookups por `POST RelationshipDefinitions` (`OneToManyRelationshipMetadata` com `Lookup` `LookupAttributeMetadata`). Chaves alternativas por `POST EntityDefinitions(LogicalName='...')/Keys`. Variável Secret: igual à do observação, mas com `type = 100000005` e sem valor. Ao final, `PublishAllXml` e validação: reconsulta cada item e falha com a lista do que faltou.

Bloco de validação final (obrigatório no script):
```powershell
$faltando = @()
foreach ($col in $colunasDespesa) {
  try { Invoke-Dv GET "EntityDefinitions(LogicalName='cr40f_despesaoperacional')/Attributes(LogicalName='$col')?`$select=LogicalName" | Out-Null }
  catch { $faltando += "cr40f_despesaoperacional.$col" }
}
foreach ($t in @("new_postocombustivel", "new_resumocombustivelmensal")) {
  try { Invoke-Dv GET "EntityDefinitions(LogicalName='$t')?`$select=LogicalName" | Out-Null } catch { $faltando += $t }
}
foreach ($api in @("new_ObterRelatorioCombustivel", "new_GerarInsightsCombustivel")) {
  if (-not (Get-Rows "customapis?`$select=customapiid&`$filter=uniquename eq '$api'")) { $faltando += $api }
}
if ($faltando.Count) { throw "Provisionamento incompleto: $($faltando -join ', ')" }
Write-Host "[combustivel] schema e Custom APIs OK em $EnvironmentUrl"
```

- [ ] **Step 3: Rodar em modo validação** (lista sem criar)

Run: `pwsh scripts/provision-relatorio-combustivel.ps1`
Expected: lista de itens "criaria ..." e nenhuma escrita.

- [ ] **Step 4: Rodar com `-Apply` no DEV** (local, autenticado; nunca em sessão cloud)

Run: `pwsh scripts/provision-relatorio-combustivel.ps1 -Apply`
Expected: `[combustivel] schema e Custom APIs OK em https://org23b93544.crm2.dynamics.com/`. Rodar de novo: nada a criar (idempotente).

- [ ] **Step 5: G2 — Key Vault.** Renan cria o segredo `anthropic-combustivel` no Key Vault (com a política de acesso ao Dataverse) e define o valor da variável `new_AnthropicKeyCombustivel` como `/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<cofre>/secrets/anthropic-combustivel`. Repetir para `new_AnthropicKeyObservacaoMotorista` (convertendo para Secret) só depois de testar o combustível.

- [ ] **Step 6: Chamar no `push-dev.ps1`**, logo depois do bloco `provision observacao organizada`:

```powershell
Write-Step "provision relatorio de combustivel (schema, Custom APIs, variavel Secret) in DEV"
& (Join-Path $PSScriptRoot "provision-relatorio-combustivel.ps1") `
  -EnvironmentUrl $EnvironmentUrl -SolutionUniqueName $solutionUniqueName -Apply @authArgs
if ($LASTEXITCODE) { throw "provision-relatorio-combustivel falhou" }
```

Use os mesmos nomes de variável (`$EnvironmentUrl`, `$solutionUniqueName`, args de autenticação) que o bloco vizinho já usa no arquivo.

- [ ] **Step 7: Commit**

```bash
git add scripts/provision-relatorio-combustivel.ps1 scripts/push-dev.ps1 plugins/DriverRecordSharing/FuelSchema.cs
git commit -m "feat(combustivel): provisionamento de postos, resumo mensal, colunas da despesa e Custom APIs no DEV"
```

### Task 2.2: `FuelRepository` + `FuelExpensePlugin` (step assíncrono)

**Files:**
- Create: `plugins/DriverRecordSharing/FuelRepository.cs`, `plugins/DriverRecordSharing/FuelExpensePlugin.cs`
- Modify: `scripts/register-driver-record-sharing-plugin-webapi.ps1` (lista `$specs`)
- Test: `plugins/DriverRecordSharing.Tests/FuelExpensePluginTests.cs` (+ fake `FuelFakeService.cs`)

**Interfaces:**
- Consumes: `FuelSchema`, `FuelMath`, `FuelComparison`, `FuelScore`, `PostoGeocoder` (Tasks 1.1–1.3, 2.1)
- Produces:
  - `FuelRepository(IOrganizationService system)` com: `Entity LoadExpense(Guid id)`, `bool IsFuel(Entity expense)`, `Entity EnsurePosto(string cnpj, PostoGeocoder.Get get)`, `IList<FuelComparison.Fueling> LoadNeighbors(DateTime dataGastoUtc)` (despesas de abastecimento de **todos** os motoristas com `new_precolitro` e posto, de `dataGasto − 7 dias` até `dataGasto + 1 dia`, com lat/lon do posto por `LinkEntity`), `void SaveComparison(Guid expenseId, decimal? preco, Guid? postoId, FuelComparison.Result r)`, `void RecomputeMonth(Guid motoristaId, string mes)` (carrega o mês, calcula `FuelScore.Month`, faz upsert do resumo pela chave `new_name` e marca `new_precisainsight = true`).
  - `FuelExpensePlugin : IPlugin` — Create/Update assíncrono da despesa.
  - `FuelExpensePlugin.Process(IOrganizationService system, Guid expenseId, PostoGeocoder.Get get, ITracingService tracing)` (estático, testável)

- [ ] **Step 1: Write the failing test** (fake em memória com as três tabelas)

```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelExpensePluginTests
    {
        private const string Brasil = "{\"nome_fantasia\":\"Posto A\",\"descricao_tipo_de_logradouro\":\"AVENIDA\",\"logradouro\":\"PAULISTA\",\"numero\":\"1000\",\"bairro\":\"BELA VISTA\",\"municipio\":\"SAO PAULO\",\"uf\":\"SP\",\"cep\":\"01310100\"}";
        private const string Geo = "[{\"lat\":\"-23.5614\",\"lon\":\"-46.6559\",\"place_rank\":30}]";

        [Fact]
        public void Process_CreatesPostoComparesAndRecomputesMonth()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var colega = svc.Driver();
            var postoB = svc.Posto("11222333000181", "Posto B", -23.5514, -46.6559);
            var postoC = svc.Posto("11444777000161", "Posto C", -23.5564, -46.6559);
            svc.Fuel(colega, 6.49m, 40m, new DateTime(2026, 10, 31, 12, 0, 0, DateTimeKind.Utc), postoB);
            svc.Fuel(colega, 6.59m, 40m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), postoC);
            var alvo = svc.FuelRaw(motorista, valor: 268m, litros: 40m, new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), cnpj: "07108241000106");

            FuelExpensePlugin.Process(svc, alvo, (url, ms) => url.Contains("brasilapi") ? Brasil : Geo, null);

            var despesa = svc.Get("cr40f_despesaoperacional", alvo);
            Assert.Equal(6.700m, despesa.GetAttributeValue<decimal>("new_precolitro"));
            Assert.Equal(FuelSchema.ComparacaoComparado, despesa.GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
            Assert.Equal(8.40m, despesa.GetAttributeValue<Money>("new_economiaperdida").Value);
            Assert.Equal(postoB, despesa.GetAttributeValue<EntityReference>("new_postomaisbarato").Id);
            Assert.Single(svc.Rows("new_postocombustivel").Where(p => p.GetAttributeValue<string>("new_cnpj") == "07108241000106"));
            var resumo = svc.Rows("new_resumocombustivelmensal").Single(r => r.GetAttributeValue<EntityReference>("new_motorista").Id == motorista);
            Assert.Equal("2026-11", resumo.GetAttributeValue<string>("new_mes"));
            Assert.True(resumo.GetAttributeValue<bool>("new_precisainsight"));
        }

        [Fact]
        public void Process_ReusesExistingPosto_WithoutHttp()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            svc.Posto("07108241000106", "Posto A", -23.5614, -46.6559);
            var alvo = svc.FuelRaw(motorista, 268m, 40m, new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), "07108241000106");

            FuelExpensePlugin.Process(svc, alvo, (url, ms) => throw new InvalidOperationException("não deveria chamar HTTP"), null);

            Assert.Equal(FuelSchema.ComparacaoSemReferencia, svc.Get("cr40f_despesaoperacional", alvo).GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
        }

        [Fact]
        public void Process_IgnoresNonFuelCategory()
        {
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 50m, 0m, new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), null, categoria: "Estacionamento");
            FuelExpensePlugin.Process(svc, alvo, (url, ms) => throw new InvalidOperationException(), null);
            Assert.Empty(svc.Updated);
        }

        [Fact]
        public void Process_WithoutCnpj_MarksSemCnpj()
        {
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 268m, 40m, new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), null);
            FuelExpensePlugin.Process(svc, alvo, (url, ms) => throw new InvalidOperationException(), null);
            Assert.Equal(FuelSchema.ComparacaoSemCnpj, svc.Get("cr40f_despesaoperacional", alvo).GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
        }
    }
}
```

`FuelFakeService` (em `plugins/DriverRecordSharing.Tests/FuelFakeService.cs`) segue o padrão de `ChecklistFakeService.cs`: dicionário `table → List<Entity>`, listas `Created`/`Updated`, `Create`/`Update`/`Retrieve`/`RetrieveMultiple` em memória. `RetrieveMultiple` precisa avaliar `QueryExpression` com `ConditionOperator.Equal`, `GreaterEqual`, `LessThan`, `NotNull` e `LinkEntities` de um nível (posto). Helpers: `Guid Driver()`, `Guid Posto(string cnpj, string nome, double lat, double lon)`, `Guid Fuel(Guid motorista, decimal preco, decimal litros, DateTime data, Guid posto)` (já com `new_precolitro` e `new_posto`), `Guid FuelRaw(Guid motorista, decimal valor, decimal litros, DateTime data, string cnpj, string categoria = "Abastecimento")`, `Entity Get(string table, Guid id)`, `IEnumerable<Entity> Rows(string table)`. A categoria "Abastecimento" é criada no construtor.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelExpensePluginTests`
Expected: FAIL (compilação: `FuelExpensePlugin` não existe).

- [ ] **Step 3: Implementar `FuelExpensePlugin`**

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Step assíncrono Create/Update de cr40f_despesaoperacional (filtro: valor, litros, km, data, CNPJ).
    // Só age em Abastecimento. Grava a comparação na despesa e recalcula o resumo do mês.
    public sealed class FuelExpensePlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.Depth > 2 || context.PrimaryEntityName != FuelSchema.Despesa) return;
            Process(factory.CreateOrganizationService(null), context.PrimaryEntityId, PostoGeocoder.HttpGet, tracing);
        }

        public static void Process(IOrganizationService system, Guid expenseId, PostoGeocoder.Get get, ITracingService tracing)
        {
            var repo = new FuelRepository(system);
            var expense = repo.LoadExpense(expenseId);
            if (expense == null || !repo.IsFuel(expense)) return;

            var valor = expense.GetAttributeValue<decimal?>("cr40f_valor") ?? expense.GetAttributeValue<Money>("cr40f_valor")?.Value ?? 0m;
            var litros = expense.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m;
            var preco = FuelMath.PricePerLiter(valor, litros);
            var cnpj = expense.GetAttributeValue<string>("new_cnpjposto");
            var data = expense.GetAttributeValue<DateTime>("cr40f_datagasto");

            Entity posto = string.IsNullOrWhiteSpace(cnpj) ? null : repo.EnsurePosto(cnpj, get);
            var target = new FuelComparison.Fueling(expenseId, data, preco ?? 0m, litros, posto?.Id, posto?.GetAttributeValue<string>("new_name"),
                (double?)posto?.GetAttributeValue<decimal?>("new_latitude"), (double?)posto?.GetAttributeValue<decimal?>("new_longitude"));
            if (posto != null && posto.GetAttributeValue<OptionSetValue>("new_statusgeo")?.Value == FuelSchema.StatusGeoPendente)
                target = new FuelComparison.Fueling(expenseId, data, target.PrecoLitro, litros, posto.Id, target.PostoNome, null, null);

            var result = preco == null
                ? new FuelComparison.Result { Status = posto == null ? "sem_cnpj" : "sem_referencia" }
                : FuelComparison.Compare(target, repo.LoadNeighbors(data));
            repo.SaveComparison(expenseId, preco, posto?.Id, result);

            var motorista = expense.GetAttributeValue<EntityReference>(FuelSchema.DespesaMotorista);
            if (motorista != null) repo.RecomputeMonth(motorista.Id, data.ToString("yyyy-MM"));
            tracing?.Trace("Combustivel: despesa={0} status={1} refs={2}", expenseId, result.Status, result.Referencias);
        }
    }
}
```

- [ ] **Step 4: Implementar `FuelRepository`** com as assinaturas de Interfaces. Pontos obrigatórios:
  - `IsFuel`: lê a categoria (lookup `FuelSchema.DespesaCategoria`), normaliza o nome (sem acento, minúsculo) e compara com `"abastecimento"`.
  - `EnsurePosto`: busca por `new_cnpj`; se não existir, chama `PostoGeocoder.Resolve(cnpj, get)` e cria com `new_statusgeo` = geocodificado/pendente. Se existir, **não** chama HTTP (mesmo pendente; quem corrige é o gestor, que muda para `100000002`, tratado como geocodificado).
  - `LoadNeighbors`: `QueryExpression` em `cr40f_despesaoperacional` com `cr40f_datagasto >= data.Date−7d`, `< data.Date+1d`, `new_precolitro NotNull`, `new_posto NotNull`; `LinkEntity` para `new_postocombustivel` (`new_latitude`, `new_longitude`, `new_name`, `new_statusgeo`), descartando postos pendentes.
  - `SaveComparison`: `Update` só com `new_precolitro`, `new_posto`, `new_statuscomparacao` (mapear string → choice de `FuelSchema`), `new_referenciascomparacao`, `new_medianaregiao`, `new_menorprecoproximo`, `new_postomaisbarato`, `new_distanciapostobarato`, `new_economiaperdida` (`Money`). Esses campos **não** estão no filtro do step, então não há laço.
  - `RecomputeMonth`: carrega as despesas de abastecimento do motorista no mês (Brasília: `yyyy-MM-01T03:00Z` até o mês seguinte), monta `FuelScore.Entry` (`TemCnpj` = `new_cnpjposto` preenchido, `Km` = `cr40f_kminformado`, `CriadoEmUtc` = `createdon`); para a referência de consumo, carrega as despesas do mês de outros veículos com o mesmo `cr40f_modelo` e aplica `FuelScore.KmlOf` por veículo. Upsert do resumo pela chave `new_name = "<motoristaId>|<mes>"` com `UpsertRequest`, gravando também `new_qtdabastecimentos`, `new_litros`, `new_gastototal`, `new_economiaperdida` (soma) e `new_precisainsight = true`.

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test plugins/DriverRecordSharing.Tests`
Expected: PASS (suíte inteira).

- [ ] **Step 6: Registrar o step** — em `scripts/register-driver-record-sharing-plugin-webapi.ps1`, acrescentar à lista `$specs`:

```powershell
[pscustomobject]@{ Label = "Combustivel Create"; Entity = "cr40f_despesaoperacional"; Message = "Create"; Mode = 1; Filtering = ""; PreImage = @(); PluginType = "Betinhos.DriverRecordSharing.FuelExpensePlugin" },
[pscustomobject]@{ Label = "Combustivel Update"; Entity = "cr40f_despesaoperacional"; Message = "Update"; Mode = 1; Filtering = "cr40f_valor,cr40f_litros,cr40f_kminformado,cr40f_datagasto,new_cnpjposto"; PreImage = @(); PluginType = "Betinhos.DriverRecordSharing.FuelExpensePlugin" },
```

Confira no arquivo como o tipo do plugin é associado a cada entrada; se `$specs` não tiver `PluginType` (um único tipo para todos), siga o padrão do arquivo para tipos adicionais (ex.: como `ServiceDriverSharePlugin` e `SyncCurrentVehiclePlugin` são separados) em vez de inventar a propriedade.

- [ ] **Step 7: Commit**

```bash
git add plugins/DriverRecordSharing/FuelRepository.cs plugins/DriverRecordSharing/FuelExpensePlugin.cs plugins/DriverRecordSharing.Tests/FuelExpensePluginTests.cs plugins/DriverRecordSharing.Tests/FuelFakeService.cs scripts/register-driver-record-sharing-plugin-webapi.ps1
git commit -m "feat(combustivel): plugin assíncrono compara o abastecimento e recalcula o resumo do mês"
```

### Task 2.3: Custom APIs de relatório e de insights

**Files:**
- Create: `plugins/DriverRecordSharing/FuelReportPlugin.cs`, `plugins/DriverRecordSharing/FuelInsightsPlugin.cs`
- Test: `plugins/DriverRecordSharing.Tests/FuelReportPluginTests.cs`

**Interfaces:**
- Consumes: `FuelRepository`, `FuelInsightWriter`, `SecretReader`, `DriverResolver.ResolveFromUser(EntityReference)` (existente)
- Produces:
  - `new_ObterRelatorioCombustivel` → `new_RelatorioJson`:
    ```json
    {
      "ok": true,
      "meses": [{ "mes": "2026-11", "qtd": 6, "litros": 240, "gasto": 1590.4, "economiaPerdida": 18.4, "nota": 72, "notaPreco": 31.5, "notaConsumo": 24, "notaRegistro": 16.5, "kml": 10.8, "kmlReferencia": 11.6 }],
      "abastecimentos": [{ "id": "guid", "data": "2026-11-03", "posto": "Posto A", "precoLitro": 6.7, "litros": 40, "valor": 268, "status": "comparado", "mediana": 6.54, "menorPreco": 6.49, "postoMaisBarato": "Posto B", "distanciaMetros": 1112, "economiaPerdida": 8.4, "temCnpj": true, "temKm": true }],
      "insights": ["..."],
      "insightsGeradoEm": "2026-11-03T05:00:00Z"
    }
    ```
    `meses`: últimos 6 meses do motorista logado (mais recente primeiro). `abastecimentos`: mês corrente e anterior. Sem motorista vinculado ao usuário → `{"ok":false,"motivo":"sem_motorista"}`.
  - `FuelReportPlugin.BuildJson(IList<Entity> resumos, IList<Entity> despesas, IDictionary<Guid,string> nomesPostos) : string` (estático, testável)
  - `new_GerarInsightsCombustivel` → `new_ResultadoJson` `{"processados": n, "pendentes": m}`; processa até **8** resumos com `new_precisainsight = true` por chamada (8 × 8 s < 2 min do sandbox), grava `new_insightsjson` (array JSON), `new_insightsgeradoem` e `new_precisainsight = false`; falha da IA mantém `true` para a próxima noite.

- [ ] **Step 1: Write the failing test** (`BuildJson` puro)

```csharp
using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelReportPluginTests
    {
        [Fact]
        public void BuildJson_MapsMonthsFuelingsAndInsights()
        {
            var resumo = new Entity("new_resumocombustivelmensal", Guid.NewGuid());
            resumo["new_mes"] = "2026-11"; resumo["new_qtdabastecimentos"] = 6; resumo["new_litros"] = 240m;
            resumo["new_gastototal"] = new Money(1590.4m); resumo["new_economiaperdida"] = new Money(18.4m); resumo["new_nota"] = 72;
            resumo["new_insightsjson"] = "[\"Você deixou de economizar R$ 18,40.\",\"Sua nota subiu de 65 para 72.\"]";
            resumo["new_insightsgeradoem"] = new DateTime(2026, 11, 3, 5, 0, 0, DateTimeKind.Utc);

            var postoB = Guid.NewGuid();
            var despesa = new Entity("cr40f_despesaoperacional", Guid.NewGuid());
            despesa["cr40f_datagasto"] = new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc);
            despesa["new_precolitro"] = 6.7m; despesa["cr40f_litros"] = 40m; despesa["cr40f_valor"] = new Money(268m);
            despesa["new_statuscomparacao"] = new OptionSetValue(FuelSchema.ComparacaoComparado);
            despesa["new_menorprecoproximo"] = 6.49m; despesa["new_medianaregiao"] = 6.54m; despesa["new_distanciapostobarato"] = 1112;
            despesa["new_economiaperdida"] = new Money(8.4m); despesa["new_cnpjposto"] = "07108241000106";
            despesa["new_postomaisbarato"] = new EntityReference("new_postocombustivel", postoB);

            var json = FuelReportPlugin.BuildJson(new[] { resumo }, new[] { despesa }, new Dictionary<Guid, string> { [postoB] = "Posto B" });
            var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);

            Assert.True((bool)root["ok"]);
            var mes = (Dictionary<string, object>)((object[])root["meses"])[0];
            Assert.Equal("2026-11", mes["mes"]);
            Assert.Equal(72, mes["nota"]);
            var a = (Dictionary<string, object>)((object[])root["abastecimentos"])[0];
            Assert.Equal("2026-11-03", a["data"]);
            Assert.Equal("comparado", a["status"]);
            Assert.Equal("Posto B", a["postoMaisBarato"]);
            Assert.False((bool)a["temKm"]);
            Assert.Equal(2, ((object[])root["insights"]).Length);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test plugins/DriverRecordSharing.Tests --filter FuelReportPluginTests`
Expected: FAIL (compilação).

- [ ] **Step 3: Implementar `FuelReportPlugin`** — `Execute`: valida `context.MessageName == "new_ObterRelatorioCombustivel"`; resolve o motorista com `new DriverResolver(system, tracing).ResolveFromUser(new EntityReference("systemuser", context.InitiatingUserId))`; sem motorista → JSON `sem_motorista`; carrega pelo `FuelRepository` (acrescentar `LoadMonthSummaries(Guid motoristaId, int months)`, `LoadFuelings(Guid motoristaId, DateTime fromUtc)` e `LoadPostoNames(IEnumerable<Guid>)`) e grava `context.OutputParameters["new_RelatorioJson"] = BuildJson(...)`. `BuildJson` mapeia as colunas acima (status pelo inverso das constantes de `FuelSchema`; `data` em `yyyy-MM-dd` de Brasília; `insights` = desserialização de `new_insightsjson` do resumo mais recente, ou lista vazia). Só lê dados do próprio motorista; o nome do colega nunca é carregado.

- [ ] **Step 4: Implementar `FuelInsightsPlugin`** — `Execute`: valida a mensagem; `apiKey = SecretReader.Read(system, FuelSchema.EnvApiKey)`; carrega até 8 resumos `new_precisainsight = true` (ordem `modifiedon`); para cada um, monta `FuelInsightWriter.Facts` (mês anterior pelo resumo `mes−1`; `PiorAbastecimento` = abastecimento do mês com maior `new_economiaperdida`, no formato `"<posto>: R$ x,xx/L; <posto mais barato> a <d> km: R$ y,yy/L, <n> dias antes"`); chama `FuelInsightWriter.Write(apiKey, facts, ObservationOrganizer.HttpPost, tracing)`; sucesso grava insights e `new_precisainsight = false`. Saída `{"processados":n,"pendentes":m}` com `m` = contagem restante.

- [ ] **Step 5: Run tests**

Run: `dotnet test plugins/DriverRecordSharing.Tests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/DriverRecordSharing/FuelReportPlugin.cs plugins/DriverRecordSharing/FuelInsightsPlugin.cs plugins/DriverRecordSharing/FuelRepository.cs plugins/DriverRecordSharing.Tests/FuelReportPluginTests.cs
git commit -m "feat(combustivel): Custom APIs do relatório do motorista e da geração noturna de insights"
```

### Task 2.4: Flow noturno de insights

**Files:**
- Create: `scripts/provision-relatorio-combustivel-flow.ps1`

**Interfaces:**
- Consumes: Custom API `new_GerarInsightsCombustivel` (Task 2.3)
- Produces: Flow de nuvem "Combustível — insights noturnos" na solução AppBetinhos: gatilho Recorrência diária 02:00 (`timeZone: "E. South America Standard Time"`); ação "Executar uma ação não vinculada" (conector Dataverse) `new_GerarInsightsCombustivel`; laço "Fazer até" `pendentes eq 0` ou 12 iterações, chamando a mesma ação.

- [ ] **Step 1:** Escrever o script seguindo `scripts/provision-checklist-planner-flow.ps1` (mesma criação de `workflow` com `category = 5`, `clientdata` JSON e referência de conexão Dataverse já existente na solução). `clientdata` mínimo:

```json
{
  "properties": {
    "definition": {
      "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      "contentVersion": "1.0.0.0",
      "parameters": { "$connections": { "defaultValue": {}, "type": "Object" }, "$authentication": { "defaultValue": {}, "type": "SecureObject" } },
      "triggers": { "Recorrencia": { "type": "Recurrence", "recurrence": { "frequency": "Day", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "hours": ["2"], "minutes": [0] } } } },
      "actions": {
        "Ate_zerar": {
          "type": "Until",
          "expression": "@equals(int(coalesce(json(coalesce(variables('ultimo'), '{\"pendentes\":1}'))?['pendentes'], 1)), 0)",
          "limit": { "count": 12, "timeout": "PT1H" },
          "actions": {
            "Gerar": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "PerformUnboundAction", "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": { "actionName": "new_GerarInsightsCombustivel" },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Guardar": { "type": "SetVariable", "runAfter": { "Gerar": ["Succeeded"] }, "inputs": { "name": "ultimo", "value": "@{outputs('Gerar')?['body/new_ResultadoJson']}" } }
          },
          "runAfter": { "Iniciar_ultimo": ["Succeeded"] }
        },
        "Iniciar_ultimo": { "type": "InitializeVariable", "inputs": { "variables": [{ "name": "ultimo", "type": "string", "value": "" }] }, "runAfter": {} }
      }
    },
    "connectionReferences": { "shared_commondataserviceforapps": { "runtimeSource": "embedded", "connection": { "connectionReferenceLogicalName": "<referência Dataverse existente na AppBetinhos>" }, "api": { "name": "shared_commondataserviceforapps" } } }
  },
  "schemaVersion": "1.0.0.0"
}
```

O script descobre a referência de conexão Dataverse existente na solução (`connectionreferences?$filter=connectorid eq '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'`) e injeta o `connectionreferencelogicalname` real no lugar do texto entre `< >`; sem referência, falha com mensagem explícita.

- [ ] **Step 2:** Rodar com `-Apply` no DEV, ativar o Flow (`statecode = 1`) e executar uma vez manualmente pelo portal. Expected: execução com sucesso, saída `{"processados":..,"pendentes":0}`.

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-relatorio-combustivel-flow.ps1
git commit -m "feat(combustivel): Flow noturno que gera os insights pendentes no DEV"
```

---

# Fase 3 — app (React)

### Task 3.1: salvar o CNPJ do cupom na despesa

**Files:**
- Modify: `src/lib/expenses.types.ts` (`ExpenseDraft`, `ExpenseFields`), `src/lib/expenses.reference.ts` (`normalizeExpenseFields`, rascunho vazio), `src/lib/expenses.payload.ts`, `src/lib/receiptQuickRead.ts` (aplicação da leitura)
- Test: `tests/expenses.test.ts`, `tests/receiptQuickRead.test.ts` (o arquivo que já testa `applyQuickRead`; confira com `rg -l applyQuickRead tests`)

**Interfaces:**
- Produces: `ExpenseDraft.cnpj: string` (só dígitos, vazio quando não lido); `ExpenseFields.cnpj?: string`; payload `new_cnpjposto` quando a categoria exige litros e o CNPJ é válido.

- [ ] **Step 1: Write the failing tests**

Em `tests/expenses.test.ts` (use o rascunho/referência de abastecimento já montado no arquivo; se não houver, crie com `findExpenseCategoryByName(referenceData, "Abastecimento")`):
```ts
test("payload de abastecimento grava o CNPJ lido do cupom", () => {
  const payload = buildExpenseCreatePayload({ ...fuelPayloadArgs, draft: { ...fuelDraft, cnpj: "07108241000106" } });
  assert.equal(payload.new_cnpjposto, "07108241000106");
});

test("payload sem CNPJ não envia a coluna", () => {
  const payload = buildExpenseCreatePayload({ ...fuelPayloadArgs, draft: { ...fuelDraft, cnpj: "" } });
  assert.equal("new_cnpjposto" in payload, false);
});
```

No teste da leitura rápida:
```ts
test("leitura rápida preenche o CNPJ só com dígitos e sem sobrescrever", () => {
  const filled = applyQuickRead(emptyDraft, { ...leituraBase, cnpj: "07.108.241/0001-06" }, referenceData);
  assert.equal(filled.draft.cnpj, "07108241000106");
  const kept = applyQuickRead({ ...emptyDraft, cnpj: "11222333000181" }, { ...leituraBase, cnpj: "07.108.241/0001-06" }, referenceData);
  assert.equal(kept.draft.cnpj, "11222333000181");
});
```
(Ajuste `applyQuickRead`/`filled.draft` ao nome e formato reais da função exportada em `receiptQuickRead.ts` por volta da linha 120.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `cnpj` ausente em `ExpenseDraft` e no payload.

- [ ] **Step 3: Implement**

- `expenses.types.ts`: `cnpj: string;` em `ExpenseDraft`; `cnpj?: string;` em `ExpenseFields`.
- `expenses.reference.ts`: rascunho vazio com `cnpj: ""`; em `normalizeExpenseFields`, `cnpj: rules.exigeLitros && /^\d{14}$/.test(draft.cnpj) ? draft.cnpj : undefined`.
- `expenses.payload.ts`, depois de `cr40f_litros`: `if (fields.cnpj) payload.new_cnpjposto = fields.cnpj;`
- `receiptQuickRead.ts`, junto do preenchimento de litros: `if (!next.cnpj && leitura.cnpj) next.cnpj = leitura.cnpj.replace(/\D/g, "").slice(0, 14);`

O CNPJ não aparece no formulário (campo oculto). O aviso "sem CNPJ" aparece no painel (Task 3.3).

- [ ] **Step 4: Run tests and type gate**

Run: `npm test && npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
Expected: PASS e 0 erros (corrija todos os pontos que montam `ExpenseDraft` literal — o `tsc` lista cada um).

- [ ] **Step 5: Commit**

```bash
git add src/lib/expenses.types.ts src/lib/expenses.reference.ts src/lib/expenses.payload.ts src/lib/receiptQuickRead.ts tests/
git commit -m "feat(despesas): grava o CNPJ do posto lido no cupom de abastecimento"
```

### Task 3.2: `fuelReport.ts` (tipos, parse, formatação) + mock

**Files:**
- Create: `src/lib/fuelReport.ts`, `src/lib/fuelReportMock.ts`
- Modify: `src/lib/dataverse.ts` (função `loadFuelReport`)
- Test: `tests/fuelReport.test.ts`

**Interfaces:**
- Consumes: `executeCustomApi(operationName, parameters)` de `src/lib/customApi.ts`
- Produces:
  - tipos `FuelMonth`, `FuelEntry`, `FuelReport = { meses: FuelMonth[]; abastecimentos: FuelEntry[]; insights: string[]; insightsGeradoEm: string | null }` (campos do JSON da Task 2.3)
  - `parseFuelReport(raw: unknown): FuelReport | null`
  - `fuelBadge(e: FuelEntry): { tone: "bom" | "acima" | "neutro"; label: string }`
  - `fuelWarning(e: FuelEntry): string | null`
  - `formatBrl(v: number): string`, `formatLiterPrice(v: number): string` (`R$ 6,700/L` → `R$ 6,70/L` com 2 casas), `formatDistance(m: number): string` (`1112` → `1,1 km`; `< 1000` → `850 m`)
  - `loadFuelReport(): Promise<FuelReport>` em `dataverse.ts` (localhost → `FUEL_REPORT_MOCK`)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatDistance, formatLiterPrice, fuelBadge, fuelWarning, parseFuelReport, type FuelEntry } from "../src/lib/fuelReport.ts";
import { FUEL_REPORT_MOCK_JSON } from "../src/lib/fuelReportMock.ts";

const base: FuelEntry = { id: "1", data: "2026-11-03", posto: "Posto A", precoLitro: 6.7, litros: 40, valor: 268, status: "comparado", mediana: 6.54, menorPreco: 6.49, postoMaisBarato: "Posto B", distanciaMetros: 1112, economiaPerdida: 8.4, temCnpj: true, temKm: true };

test("parseFuelReport lê o JSON da Custom API", () => {
  const report = parseFuelReport(FUEL_REPORT_MOCK_JSON);
  assert.ok(report);
  assert.ok(report.meses.length >= 1);
  assert.equal(typeof report.abastecimentos[0].precoLitro, "number");
});

test("parseFuelReport recusa ok=false e lixo", () => {
  assert.equal(parseFuelReport(JSON.stringify({ ok: false, motivo: "sem_motorista" })), null);
  assert.equal(parseFuelReport("{"), null);
  assert.equal(parseFuelReport(null), null);
});

test("fuelBadge marca acima com o valor perdido", () => {
  assert.deepEqual(fuelBadge(base), { tone: "acima", label: "R$ 8,40 a mais" });
  assert.deepEqual(fuelBadge({ ...base, precoLitro: 6.49, economiaPerdida: 0 }), { tone: "bom", label: "Bom preço" });
  assert.deepEqual(fuelBadge({ ...base, status: "sem_referencia", economiaPerdida: null }), { tone: "neutro", label: "Sem comparação" });
});

test("fuelWarning orienta o que faltou", () => {
  assert.equal(fuelWarning(base), null);
  assert.equal(fuelWarning({ ...base, temCnpj: false }), "Foto do cupom sem CNPJ legível: o preço não entrou na comparação.");
  assert.equal(fuelWarning({ ...base, temKm: false }), "Sem km informado: este abastecimento ficou fora do consumo.");
});

test("formatação de preço e distância", () => {
  assert.equal(formatLiterPrice(6.7), "R$ 6,70/L");
  assert.equal(formatDistance(1112), "1,1 km");
  assert.equal(formatDistance(850), "850 m");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/fuelReport.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement `fuelReport.ts`**

```ts
export type FuelStatus = "sem_cnpj" | "posto_pendente" | "sem_referencia" | "comparado";
export type FuelMonth = { mes: string; qtd: number; litros: number; gasto: number; economiaPerdida: number; nota: number | null; notaPreco: number | null; notaConsumo: number | null; notaRegistro: number | null; kml: number | null; kmlReferencia: number | null };
export type FuelEntry = { id: string; data: string; posto: string | null; precoLitro: number | null; litros: number; valor: number; status: FuelStatus; mediana: number | null; menorPreco: number | null; postoMaisBarato: string | null; distanciaMetros: number | null; economiaPerdida: number | null; temCnpj: boolean; temKm: boolean };
export type FuelReport = { meses: FuelMonth[]; abastecimentos: FuelEntry[]; insights: string[]; insightsGeradoEm: string | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseFuelReport(raw: unknown): FuelReport | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  const r = value as Partial<FuelReport> & { ok?: unknown };
  if (!r || r.ok !== true || !Array.isArray(r.meses) || !Array.isArray(r.abastecimentos)) return null;
  return {
    meses: r.meses.map((m) => ({ ...m, nota: num(m.nota), notaPreco: num(m.notaPreco), notaConsumo: num(m.notaConsumo), notaRegistro: num(m.notaRegistro), kml: num(m.kml), kmlReferencia: num(m.kmlReferencia) })),
    abastecimentos: r.abastecimentos.map((a) => ({ ...a, precoLitro: num(a.precoLitro), mediana: num(a.mediana), menorPreco: num(a.menorPreco), distanciaMetros: num(a.distanciaMetros), economiaPerdida: num(a.economiaPerdida) })),
    insights: Array.isArray(r.insights) ? r.insights.filter((i): i is string => typeof i === "string") : [],
    insightsGeradoEm: typeof r.insightsGeradoEm === "string" ? r.insightsGeradoEm : null
  };
}

export const formatBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const formatLiterPrice = (v: number) => `${formatBrl(v)}/L`;
export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

export function fuelBadge(e: FuelEntry): { tone: "bom" | "acima" | "neutro"; label: string } {
  if (e.status !== "comparado" || e.economiaPerdida === null) return { tone: "neutro", label: "Sem comparação" };
  return e.economiaPerdida > 0 ? { tone: "acima", label: `${formatBrl(e.economiaPerdida)} a mais` } : { tone: "bom", label: "Bom preço" };
}

export function fuelWarning(e: FuelEntry): string | null {
  if (!e.temCnpj) return "Foto do cupom sem CNPJ legível: o preço não entrou na comparação.";
  if (!e.temKm) return "Sem km informado: este abastecimento ficou fora do consumo.";
  return null;
}
```

`formatBrl` usa espaço não separável (`R$ 6,70`). Se o teste falhar por isso, normalize no próprio `formatBrl` com `.replace(/ /g, " ")`.

`fuelReportMock.ts`: exportar `FUEL_REPORT_MOCK_JSON` (string JSON no formato da Task 2.3, com 6 meses — notas 58, 61, 65, null, 70, 72 —, 6 abastecimentos do mês cobrindo os 4 status e um sem km, e 3 insights) e `FUEL_REPORT_MOCK = parseFuelReport(FUEL_REPORT_MOCK_JSON)!`. Use os números do exemplo do Renan (R$ 6,70 contra R$ 6,49 a 1,1 km, 3 dias antes).

`dataverse.ts`, junto das outras funções remotas:
```ts
export async function loadFuelReport(): Promise<FuelReport> {
  if (isLocalMockHost()) return FUEL_REPORT_MOCK;
  const response = await executeCustomApi("new_ObterRelatorioCombustivel", {});
  const report = parseFuelReport(response.new_RelatorioJson);
  if (!report) throw new Error("Relatório de abastecimento indisponível.");
  return report;
}
```
Use o helper de detecção de localhost que `dataverse.ts` já usa (procure por `localhost` no arquivo e reutilize o mesmo nome, em vez de `isLocalMockHost` se ele não existir).

- [ ] **Step 4: Run tests and type gate**

Run: `npm test && npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
Expected: PASS, 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fuelReport.ts src/lib/fuelReportMock.ts src/lib/dataverse.ts tests/fuelReport.test.ts
git commit -m "feat(despesas): leitura e formatação do relatório de abastecimento"
```

### Task 3.3: gráficos SVG e tela do painel

**Files:**
- Create: `src/components/fuelCharts.tsx`, `src/screens/ExpenseDashboardScreen.tsx`
- Modify: `src/app/navigation.ts:75` (`expenses: "gastos"` → `expenses: "gastos-painel"`), `src/App.tsx` (render de `"gastos-painel"` e `onBack` do formulário)
- Test: `tests/fuelCharts.test.ts`

**Interfaces:**
- Consumes: `FuelReport`, `FuelMonth`, `FuelEntry`, `fuelBadge`, `fuelWarning`, `formatBrl`, `formatLiterPrice`, `formatDistance` (Task 3.2); `loadFuelReport` (Task 3.2)
- Produces:
  - funções puras em `fuelCharts.tsx`: `scoreLinePoints(meses: FuelMonth[], w: number, h: number): string` (pontos SVG, pula meses sem nota), `barHeights(meses: FuelMonth[], h: number): Array<{ mes: string; gasto: number; perdido: number }>`, `priceDots(entries: FuelEntry[], w: number, h: number): Array<{ x: number; y: number; tone: "bom" | "acima" | "neutro" }>`
  - componentes `ScoreTrend`, `MonthlyBars`, `PriceBand` (SVG com `role="img"` e `aria-label` com o resumo em texto)
  - `ExpenseDashboardScreen({ onNew, onBack }: { onNew: () => void; onBack: () => void })`

- [ ] **Step 1: Write the failing test** (só funções puras)

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { barHeights, scoreLinePoints } from "../src/components/fuelCharts.tsx";
import type { FuelMonth } from "../src/lib/fuelReport.ts";

const m = (mes: string, nota: number | null, gasto: number, perdido: number): FuelMonth => ({ mes, qtd: 5, litros: 200, gasto, economiaPerdida: perdido, nota, notaPreco: null, notaConsumo: null, notaRegistro: null, kml: null, kmlReferencia: null });

test("scoreLinePoints ordena do mais antigo e pula mês sem nota", () => {
  const pts = scoreLinePoints([m("2026-11", 100, 0, 0), m("2026-10", null, 0, 0), m("2026-09", 0, 0, 0)], 200, 100);
  assert.equal(pts, "0,100 200,0");
});

test("barHeights escala pelo maior gasto", () => {
  assert.deepEqual(barHeights([m("2026-11", 70, 1000, 100), m("2026-10", 60, 500, 0)], 100), [
    { mes: "2026-10", gasto: 50, perdido: 0 },
    { mes: "2026-11", gasto: 100, perdido: 10 }
  ]);
});
```

O `.tsx` precisa rodar no `node --test` com strip-types: as funções puras ficam no topo do arquivo, sem JSX nelas. Se o Node recusar `.tsx`, mova as três funções para `src/lib/fuelChartMath.ts`, importe-as no componente e aponte o teste para lá.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/fuelCharts.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar as funções puras**

```ts
const chronological = (meses: FuelMonth[]) => [...meses].sort((a, b) => a.mes.localeCompare(b.mes));

export function scoreLinePoints(meses: FuelMonth[], w: number, h: number): string {
  const ordered = chronological(meses);
  const step = ordered.length > 1 ? w / (ordered.length - 1) : 0;
  return ordered
    .map((month, i) => (month.nota === null ? null : `${Math.round(i * step)},${Math.round(h - (month.nota / 100) * h)}`))
    .filter(Boolean)
    .join(" ");
}

export function barHeights(meses: FuelMonth[], h: number) {
  const ordered = chronological(meses);
  const max = Math.max(1, ...ordered.map((month) => month.gasto));
  return ordered.map((month) => ({ mes: month.mes, gasto: Math.round((month.gasto / max) * h), perdido: Math.round((month.economiaPerdida / max) * h) }));
}

export function priceDots(entries: FuelEntry[], w: number, h: number) {
  const priced = entries.filter((e) => e.precoLitro !== null);
  const values = priced.flatMap((e) => [e.precoLitro!, e.mediana ?? e.precoLitro!]);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = priced.length > 1 ? w / (priced.length - 1) : 0;
  return [...priced].sort((a, b) => a.data.localeCompare(b.data)).map((e, i) => ({ x: Math.round(i * step), y: Math.round(h - ((e.precoLitro! - min) / span) * h), tone: fuelBadge(e).tone }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/fuelCharts.test.ts`
Expected: PASS.

- [ ] **Step 5: Componentes e tela.** Antes de escrever, leia `src/screens/ExpenseScreen.tsx` (cabeçalho, `FormMenu`, `ActionBar`) e use os mesmos componentes e tokens do `@betinhos-executive-service/ui` (cores do DS, nada de cor solta). Estrutura de `ExpenseDashboardScreen`:
  1. Cabeçalho "Despesas" com voltar (`onBack`) e botão primário **"Lançar despesa"** fixo no topo (`onNew`).
  2. Estado de carregamento com `Skeleton`; erro com mensagem e "Tentar de novo" (o lançamento continua disponível).
  3. Card **Nota do mês**: número grande, ou "Nota em formação — faltam N abastecimentos" quando `nota === null`; três barras finas preço/consumo/registro com "x de 50/30/20"; `ScoreTrend` dos 6 meses.
  4. Card **Insights**: lista dos `insights`, rodapé "Atualizado em dd/mm/aaaa HH:mm" (America/Sao_Paulo). Lista vazia: "Os insights saem toda madrugada depois do primeiro abastecimento do mês."
  5. Card **Preço por litro**: `PriceBand` (pontos coloridos pelo selo sobre a faixa da mediana).
  6. Card **Gasto mensal**: `MonthlyBars` com a parte "poderia ter economizado" destacada e o total do mês em texto.
  7. **Abastecimentos**: lista com data, posto, `formatLiterPrice`, selo `fuelBadge`; se `acima`: "Posto B, a 1,1 km, saiu R$ 6,49/L"; `fuelWarning` em linha de aviso.
  - Valores monetários com `font-variant-numeric: tabular-nums`. A versão de build (`buildStamp`) continua visível no canto, como nas outras telas.

- [ ] **Step 6: Navegação.** Em `src/app/navigation.ts:75`, `expenses: "gastos-painel"` (adicione `"gastos-painel"` ao tipo das telas, se houver union). Em `src/App.tsx`, perto da linha 3434, renderizar:
```tsx
{screen === "gastos-painel" && (
  <ExpenseDashboardScreen onNew={() => setScreen("gastos")} onBack={() => setScreen("inicio")} />
)}
```
e trocar o `onBack` do `ExpenseScreen` para `setScreen("gastos-painel")`. Use a função real de navegação do `App.tsx` (o nome pode não ser `setScreen`; siga o padrão das linhas vizinhas). Os retornos existentes para `"gastos"` (linhas 2859, 2909, 2923, 3363, 3392) continuam indo para o formulário.

- [ ] **Step 7: Gates**

Run: `npm test && npx tsc --noEmit --noUnusedLocals --noUnusedParameters && npm run build`
Expected: tudo verde; build gera `dist/`.

- [ ] **Step 8: Verificação visual** — `npm run dev` (porta reservada do checkout) e, no Chromium, abrir Despesas no modo mock em 390×844 e 768×1024: painel abre primeiro, "Lançar despesa" leva ao formulário, voltar do formulário retorna ao painel, nenhum scroll horizontal, gráficos com `aria-label`. Rodar a skill `ux-audit` em modo **Fluxo** (tarefa: "ver por que paguei mais caro e lançar um abastecimento") e corrigir achados Critical/Serious.

- [ ] **Step 9: Commit**

```bash
git add src/components/fuelCharts.tsx src/screens/ExpenseDashboardScreen.tsx src/app/navigation.ts src/App.tsx tests/fuelCharts.test.ts
git commit -m "feat(despesas): painel de abastecimento com nota, gráficos, economia perdida e insights"
```

---

# Fase 4 — histórico, publicação e verificação

### Task 4.1: reprocessar os 6 meses (DEV)

**Files:**
- Create: `scripts/combustivel/reprocessar-historico.ps1`

**Interfaces:**
- Consumes: `cnpjs.csv` (Task 0.3); colunas da Task 2.1; step da Task 2.2
- Produces: despesas de abastecimento dos 6 meses com `new_cnpjposto` preenchido; o step assíncrono recalcula comparação e resumos.

- [ ] **Step 1:** Escrever o script: `-EnvironmentUrl` (DEV por padrão, com `Assert-DevEnvironment`), `-Apply`; lê `cnpjs.csv`; para cada linha com CNPJ, `PATCH cr40f_despesaoperacionals(<id>)` com `{ "new_cnpjposto": "<cnpj>" }` **somente se** a despesa existir no ambiente e `new_cnpjposto` estiver vazio; ordem por `cr40f_datagasto` crescente (as referências antigas existem antes das novas); pausa de 1,2 s entre despesas com CNPJ ainda sem posto (Nominatim ≤ 1 req/s). Sem `-Apply`: só conta. Ao final, segunda passada: `PATCH` com o mesmo `cr40f_litros` das despesas comparadas como `sem_referencia` (dispara o step de novo, agora com o histórico completo).

> Os IDs do `cnpjs.csv` vêm do ambiente lido na Fase 0. Se a Fase 0 leu o PROD, este script no DEV só atualiza as despesas que existem nos dois; para o PROD, o reprocessamento entra no `scripts/deploy-prod.ps1` como passo separado, com confirmação do Renan (fora deste plano).

- [ ] **Step 2:** Rodar sem `-Apply`, conferir a contagem; rodar com `-Apply` no DEV. Expected: `new_resumocombustivelmensal` com linhas para os motoristas com abastecimento nos 6 meses (conferir por `Get-Rows "new_resumocombustivelmensals?$select=new_mes,new_nota&$top=20"`).

- [ ] **Step 3: Commit**

```bash
git add scripts/combustivel/reprocessar-historico.ps1
git commit -m "feat(combustivel): reprocessamento dos CNPJs de 6 meses no DEV"
```

### Task 4.2: verificação, qualidade e publicação no DEV

**Files:**
- Create/Modify: `.claude/skills/verificar-gastos/SKILL.md` (acrescentar a seção do painel de abastecimento)

- [ ] **Step 1:** `qualidade-antes-do-pr` (2–3 passadas `/simplify` + `karpathy-coder`, `/code-review high --fix`).
- [ ] **Step 2:** `verificacao-manter`: atualizar `verificar-gastos` com o roteiro (modo mock: painel abre primeiro, 4 status na lista, nota em formação; DEV: lançar abastecimento com cupom → em até 1 min a despesa tem `new_statuscomparacao` e o painel mostra o selo; rodar o Flow → insights aparecem). Incluir no mesmo commit.
- [ ] **Step 3:** `git fetch origin && git merge origin/main` (assembly único do plugin) e rodar de novo `npm test`, `tsc`, `dotnet test`.
- [ ] **Step 4: G3** — com aprovação do Renan, `npm run push` no DEV (local, a partir da `main` atualizada depois do merge do PR, conforme AGENTS.md). Informar a versão publicada.
- [ ] **Step 5: Teste autenticado no DEV** (camadas separadas): (a) WebResource abre o painel; (b) metadata: colunas, tabelas e Custom APIs existem na AppBetinhos; (c) plugin: lançar abastecimento real de teste e conferir colunas calculadas; (d) Custom API devolve só dados do motorista logado (testar com dois usuários motoristas); (e) Flow executa e grava insights; (f) Key Vault: insight gerado com a variável Secret (trace `InsightsCombustivel: ok=True`).
- [ ] **Step 6: G4** — Renan testa no celular (PWA e Power Apps).
- [ ] **Step 7: PR** para `main` com: mudança para o motorista, comandos de validação, impacto Dataverse/Flow (2 tabelas, 10 colunas, 2 Custom APIs, 1 step async, 1 Flow, 1 variável Secret), screenshots do painel, nota de que `dist/` foi gerado e o que não foi verificado.

```bash
git add .claude/skills/verificar-gastos/SKILL.md
git commit -m "test(gastos): roteiro de verificação do painel de abastecimento"
```

---

## Fora deste plano (registrado para não se perder)

- Publicação no PROD (`scripts/deploy-prod.ps1`) e reprocessamento no PROD.
- Migração de `new_AnthropicKeyObservacaoMotorista` para Secret no PROD.
- Google Geocoding como reserva (só se a Fase 0 reprovar).
- Painel do gestor, ANP, outras categorias de despesa.
- Corrigir `scripts/repair-expense-schema-org23.ps1:274`, que usa `*combust*` e zera `exigeLitros` da categoria Abastecimento (bug real encontrado no levantamento; corrigir em PR separado).
