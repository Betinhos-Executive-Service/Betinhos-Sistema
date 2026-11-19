# Minha nota (Infleet) no App Motoristas — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Goal:** o motorista abre "Minha nota" no App Motoristas e vê a nota de condução da Infleet dos últimos 90 dias, as notas por comportamento e a evolução dos últimos 6 meses.

**Architecture:** Custom API unbound `new_NotaInfleet` no assembly `Betinhos.DriverRecordSharing`. O plugin resolve o motorista pelo usuário, lê `new_infleetdriverid`, faz uma consulta GraphQL com aliases (`p90`, `m0..m5`) e devolve um JSON pronto (`schema: 1`). A lógica pura (períodos, consulta, montagem) fica em `NotaInfleet.cs` e é testada sem rede. No App, `features/minha-nota/` chama a API, valida e mostra; fora do Dataverse usa dados fictícios.

**Tech Stack:** C# net462 (xunit, `JavaScriptSerializer`), PowerShell (registrador), React + TS no `apps/motoristas` (testes `node --test --experimental-strip-types tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-19-nota-infleet-app-design.md`

## Global Constraints

- Textos em pt-BR com acentos, UTF-8.
- Faixas: ≥90 "Ótima", 75–89 "Boa", <75 "Atenção" (sobre a nota arredondada).
- Mínimo para nota: 50 km nos 90 dias; abaixo → `em_formacao`.
- Fuso: fronteiras dos meses em 00:00 America/Sao_Paulo (UTC−3, sem horário de verão), convertidas para UTC.
- Trace nunca leva token nem resposta crua da Infleet.
- Nada de registro, push ou script contra o Dataverse a partir do worktree; o registrador só é escrito.
- Token: `InfleetGraphQlGateway.ReadToken(system, null, tracing)`. A Custom API não tem step, então não há configuração segura: o token precisa estar na tabela `cr40f_segredo` (`infleet.token`) de cada ambiente.
- Testes C#: `~/.dotnet/dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --filter <Classe>`.
- Testes do App: `cd apps/motoristas && pnpm test` (e `pnpm typecheck` se existir).

---

### Task 1: lógica pura `NotaInfleet` (C#)

**Files:**
- Create: `packages/plugins/Betinhos.DriverRecordSharing/NotaInfleet.cs`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/NotaInfleetTests.cs`

**Interfaces (Produces):**

```csharp
namespace Betinhos.DriverRecordSharing {
  public sealed class NotaPeriodo {
    public string Alias;      // "p90", "m0".."m5"
    public DateTime InicioUtc; public DateTime FimUtc;
    public int Ano; public int Mes; // 0 no p90
  }
  public static class NotaInfleet {
    public const int Schema = 1; public const int Dias = 90; public const int Meses = 6; public const double KmMinimo = 50;
    public static readonly IReadOnlyList<KeyValuePair<string, string>> Comportamentos; // chave Infleet -> rótulo pt-BR
    public static IReadOnlyList<NotaPeriodo> Periodos(DateTime agoraUtc);
    public static string Consulta(IReadOnlyList<NotaPeriodo> periodos); // usa variável $d:ID!
    public static Dictionary<string, object> Montar(Dictionary<string, object> data, IReadOnlyList<NotaPeriodo> periodos);
    public static Dictionary<string, object> SemCadastro(DateTime agoraUtc);
  }
}
```

Regras:
- `Periodos`: `p90` = `[agora − 90 dias, agora]`. `m0` = 1º dia do mês corrente em SP 00:00 (= 03:00Z) até `agora`; `m1..m5` = meses anteriores, do dia 1 00:00 SP até o dia 1 do mês seguinte 00:00 SP. Ordem da lista: `p90, m0, m1, ..., m5`.
- `Consulta`: `query($d: ID!) { p90: driverProfile(filters:{driverId:$d, period:{startAt:"<iso>", endAt:"<iso>"}}) { distanceTraveled currentDriverGrades { generalGrade <chaves> } } m0: ... }`. ISO `yyyy-MM-ddTHH:mm:ssZ`. Se a Infleet recusar `ID!`, troque para `String!` só depois de conferir na API (o gateway já usa uma das duas: siga o que `ListDriverVehicles` usa).
- `Comportamentos` (ordem fixa): `hardAcceleration` Aceleração brusca; `hardBraking` Frenagem brusca; `hardCornering` Curva brusca; `deviceOverspeed` Excesso de velocidade; `deviceIdle` Motor ocioso; `usingPhone` Uso do celular; `fatigue` Fadiga; `distraction` Distração; `seatbeltUnbuckled` Cinto desafivelado; `smoking` Cigarro; `eyesClosed` Olhos fechados; `yawning` Bocejo; `forwardCollision` Risco de colisão frontal; `laneDeparture` Saída de faixa; `vehicleTooClose` Distância do veículo à frente.
- `Montar(data, periodos)` devolve dicionário com `schema`, `situacao`, `periodo {inicio, fim}` (datas `yyyy-MM-dd` em SP do `p90`), `km` (arredondado 1 casa), `nota` (1 casa; ausente se `em_formacao`), `comportamentos` (só não nulos, `{chave, rotulo, nota}` com 1 casa, ordenados da menor para a maior nota; empate pela ordem fixa), `meses` (`{ano, mes, nota, km}` só com `km > 0` e nota não nula, cronológico: m5 → m0). `situacao` = `em_formacao` se km < 50 ou `generalGrade` nulo; senão `ok`. Alias ausente ou nulo em `data` conta como sem dados (não lança).
- Números vindos do `JavaScriptSerializer` podem ser `int`, `decimal` ou `double`: converta com `Convert.ToDouble(x, CultureInfo.InvariantCulture)`.
- `SemCadastro(agora)` = `{schema:1, situacao:"sem_cadastro", periodo, comportamentos:[], meses:[]}`.

- [ ] **Step 1: testes que falham** (`NotaInfleetTests.cs`, xunit, `agora = new DateTime(2026, 11, 19, 15, 0, 0, DateTimeKind.Utc)`):
  - `Periodos_p90_e_seis_meses`: 7 itens; `p90.InicioUtc == agora.AddDays(-90)`; `m0.InicioUtc == 2026-11-01T03:00Z`, `m0.FimUtc == agora`, `(m0.Ano, m0.Mes) == (2026, 11)`; `m1 == [2026-10-01T03:00Z, 2026-11-01T03:00Z)`; `m5.Mes == 6`.
  - `Periodos_viram_o_ano`: agora `2027-01-10T12:00Z` → `m1` = dezembro/2026, `m2` = novembro/2026.
  - `Consulta_tem_aliases_e_datas`: contém `p90: driverProfile`, `m5: driverProfile`, `"2026-11-01T03:00:00Z"`, `generalGrade`, `vehicleTooClose`, `$d`.
  - `Montar_ok`: `p90` com km 5156.24, nota 82.88, `hardBraking` 67, `hardAcceleration` 90.5, `usingPhone` null; `m0` km 100 nota 99.8; `m1` km 0 nota null; resto ausente → `situacao "ok"`, `nota 82.9`, `km 5156.2`, comportamentos `[hardBraking 67, hardAcceleration 90.5]`, meses só `{2026, 11, 99.8, 100}`.
  - `Montar_em_formacao_por_km`: km 30, nota 95 → `em_formacao`, sem chave `nota`.
  - `Montar_em_formacao_por_nota_nula` e `Montar_sem_alias` (data vazio → `em_formacao`, km 0, listas vazias).
  - `Montar_meses_cronologicos`: m2, m1 e m0 com dados → ordem m2, m1, m0.
  - `SemCadastro_formato`.
- [ ] **Step 2:** rode `--filter NotaInfleetTests` e confirme que falha por não compilar.
- [ ] **Step 3:** implemente `NotaInfleet.cs`.
- [ ] **Step 4:** rode de novo; tudo verde.
- [ ] **Step 5:** commit `feat(motoristas): lógica da nota da Infleet (períodos, consulta e montagem)`.

### Task 2: gateway, plugin `NotaInfleetPlugin` e registrador

**Files:**
- Modify: `packages/plugins/Betinhos.DriverRecordSharing/InfleetGateway.cs` (método público novo em `InfleetGraphQlGateway`)
- Create: `packages/plugins/Betinhos.DriverRecordSharing/NotaInfleetPlugin.cs`
- Create: `packages/plugins/scripts/register-notainfleet-customapi.ps1`
- Test: `packages/plugins/Betinhos.DriverRecordSharing.Tests/NotaInfleetPluginTests.cs`

**Interfaces:**
- Consumes: `NotaInfleet.Periodos/Consulta/Montar/SemCadastro` (Task 1); `DriverResolver.ResolveFromUser`, `PluginConfig.EmployeeInfleetDriverId`, `PluginConfig.UserTable`, `InfleetGraphQlGateway.ReadToken`, `InfleetUnavailableException`.
- Produces:
  - `public Dictionary<string, object> Query(string query, Dictionary<string, object> variables)` em `InfleetGraphQlGateway` (só delega ao `Execute` privado).
  - `public sealed class NotaInfleetPlugin : IPlugin` com `public const string ApiName = "new_NotaInfleet"; public const string ResultParameter = "new_Result";` e
    `public static string Resultado(string infleetDriverId, DateTime agoraUtc, Func<string, Dictionary<string, object>, Dictionary<string, object>> consultar)`:
    - `infleetDriverId` vazio → `SemCadastro` serializado, sem chamar `consultar`;
    - senão `consultar(NotaInfleet.Consulta(periodos), {["d"] = id.Trim()})` → `Montar` → JSON (`JavaScriptSerializer`);
    - `InfleetUnavailableException` → `InvalidPluginExecutionException("Não foi possível consultar a Infleet agora.")`.
  - `Execute`: confere `context.MessageName == ApiName`; `system = factory.CreateOrganizationService(null)`; `DriverResolver(...).ResolveFromUser(new EntityReference(PluginConfig.UserTable, context.InitiatingUserId))`; `EmployeeReference == null` → `InvalidPluginExecutionException("Motorista não encontrado para este usuário.")`; lê `new_infleetdriverid` do funcionário (`system.Retrieve(EmployeeReference.LogicalName, Id, new ColumnSet(PluginConfig.EmployeeInfleetDriverId))`); gateway só é criado (com `ReadToken(system, null, tracing)`) quando há ID; trace: só `"nota-infleet: situacao=<x>"` ou `"nota-infleet: infleet indisponível"`.

- [ ] **Step 1: testes que falham** (`NotaInfleetPluginTests.cs`):
  - `Sem_id_nao_chama_infleet`: `consultar` que faz `Assert.Fail` → JSON com `"situacao":"sem_cadastro"`.
  - `Com_id_passa_variavel_d_e_monta`: `consultar` captura variáveis e devolve `p90` com km 200 e nota 88 → JSON `"situacao":"ok"`, `"nota":88`; `variables["d"] == "abc"` para id `" abc "`.
  - `Infleet_fora_vira_mensagem_curta`: `consultar` lança `InfleetUnavailableException("HTTP 401 token xyz")` → `InvalidPluginExecutionException` com `Message == "Não foi possível consultar a Infleet agora."` (não contém "xyz").
- [ ] **Step 2:** rode `--filter NotaInfleetPluginTests`; falha.
- [ ] **Step 3:** implemente o método do gateway e o plugin.
- [ ] **Step 4:** rode `NotaInfleet` e o projeto de testes inteiro (`dotnet test ... -p:SignAssembly=false`); tudo verde.
- [ ] **Step 5:** escreva `register-notainfleet-customapi.ps1` copiando `register-provamidia-customapi.ps1` e ajustando: `$TypeName = "Betinhos.DriverRecordSharing.NotaInfleetPlugin"`, friendlyname `NotaInfleetPlugin`, API `new_NotaInfleet` (display "Nota Infleet do motorista"), **sem parâmetro de entrada** (remova o bloco `$Request`), resposta `new_Result` String; ids novos fixos (gere com `[guid]::NewGuid()` uma vez e grave no script). Cabeçalho explica: roda do checkout principal na develop depois do Deploy; exige `infleet.token` na `cr40f_segredo` (`gravar-segredo.ps1`). Não execute.
- [ ] **Step 6:** commit `feat(motoristas): Custom API new_NotaInfleet com a nota da Infleet do motorista`.

### Task 3: tela "Minha nota" no App Motoristas

**Files:**
- Create: `apps/motoristas/src/features/minha-nota/notaInfleet.ts`, `MinhaNotaScreen.tsx`, `minhaNota.css`, `rotas.tsx`
- Modify: `apps/motoristas/src/types.ts` (`| "minhaNota"` no `Screen`), `apps/motoristas/src/features/servicos/InitialScreen.tsx` (módulo, alias, handler vazio, ícone), `apps/motoristas/src/App.tsx` (lista de `screenName` em ~434 e `rotasMinhaNota` junto de `rotasMeuCarro` em ~482)
- Test: `apps/motoristas/tests/notaInfleet.test.ts`

**Interfaces:**
- Consumes: Custom API `new_NotaInfleet` → `{ new_Result: string }` (Task 2); `executeCustomApi` de `src/data/dataverse/customApi.ts`.
- Produces (`notaInfleet.ts`, imports com `.ts` como nos outros módulos testados):

```ts
export type Comportamento = { chave: string; rotulo: string; nota: number };
export type MesNota = { ano: number; mes: number; nota: number; km: number };
export type NotaInfleet =
  | { situacao: "ok"; inicio: string; fim: string; km: number; nota: number; comportamentos: Comportamento[]; meses: MesNota[] }
  | { situacao: "em_formacao"; inicio: string; fim: string; km: number; comportamentos: Comportamento[]; meses: MesNota[] }
  | { situacao: "sem_cadastro" };
export type Faixa = { rotulo: "Ótima" | "Boa" | "Atenção"; tom: "otima" | "boa" | "atencao" };
export function lerNotaInfleet(json: string): NotaInfleet;         // lança Error("Resposta inesperada da nota.") se schema != 1 ou situacao desconhecida
export function faixaDaNota(nota: number): Faixa;                   // usa Math.round(nota)
export function oQueMelhorar(c: Comportamento[]): Comportamento[];  // até 2 com nota < 90, da pior para a melhor
export function rotuloMes(ano: number, mes: number): string;        // (2026, 11) -> "nov/26"
export const isMockNotaInfleet: () => boolean;                       // hostname localhost/127.0.0.1
export async function carregarNotaInfleet(): Promise<NotaInfleet>;  // mock: 400 ms e MOCK fixo; ?mockNota=formacao|sem|erro troca o caso
```

Tela (`MinhaNotaScreen`, props `{ onBack(): void; carregar?: () => Promise<NotaInfleet> }`):
- Cabeçalho com voltar, como `TreinamentosScreen`/`MyVehicleScreen` (reaproveite as classes de cabeçalho existentes).
- `ok`: nota grande arredondada + selo da faixa + "Últimos 90 dias · N km" (km com `toLocaleString("pt-BR", {maximumFractionDigits: 0})`); bloco "O que melhorar" (só se `oQueMelhorar` não vazio); lista de comportamentos com barra 0–100; "Evolução" com barras verticais em CSS por mês e rótulo `rotuloMes` (some se `meses` vazio).
- `em_formacao`: "Sua nota está em formação: precisa de pelo menos 50 km nos últimos 90 dias" + km atual; comportamentos/meses se vierem.
- `sem_cadastro`: "Seu cadastro ainda não está ligado à telemetria. Fale com a operação."
- carregando: skeleton; erro: "Não foi possível carregar sua nota. Verifique a internet." + botão "Tentar de novo".
- CSS com os tokens/variáveis já usados no App (veja `treinamentos.css`); sem `border-left` colorido em card; cores das faixas reaproveitando as de sucesso/alerta/erro do App.

Grade: módulo `{ id: "minhaNota", label: "Minha nota", detail: "Nota de condução", icon: "minhaNota", disabled: false }` como último item de `baseModules` (fica antes de "Boas ideias"); `screenAliases.minhaNota = ["minhaNota"]`; `moduleHandlers.minhaNota = []`; ícone Lucide `gauge` (`<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`, mesmo estilo de stroke dos outros).

- [ ] **Step 1: testes que falham** (`tests/notaInfleet.test.ts`, `node:test` + `assert/strict`):
  - `lerNotaInfleet` com `ok` completo mapeia `periodo.inicio/fim` para `inicio/fim`; `schema: 2` lança; `situacao: "x"` lança; `sem_cadastro` mínimo.
  - `faixaDaNota`: 89.6 → Ótima; 89.4 → Boa; 75 → Boa; 74.4 → Atenção.
  - `oQueMelhorar`: `[95, 60, 80, 70]` → `[60, 70]`; todos ≥ 90 → `[]`.
  - `rotuloMes(2026, 11) === "nov/26"`, `rotuloMes(2027, 1) === "jan/27"`.
- [ ] **Step 2:** `pnpm test` falha (módulo não existe).
- [ ] **Step 3:** implemente `notaInfleet.ts`; `pnpm test` verde.
- [ ] **Step 4:** tela, css, rotas, `Screen`, grade e `App.tsx`. Rode `pnpm test` e o typecheck/build do App (`pnpm -C apps/motoristas exec tsc --noEmit` ou o script existente).
- [ ] **Step 5:** commit `feat(motoristas): tela Minha nota com a nota da Infleet`.

### Depois das tarefas (orquestrador)

- `qualidade-antes-do-pr`, `verificacao-manter`, print da tela (mock) no chat e `ux-audit` Rápido.
- PR para a `develop`. Passos manuais do Renan, no checkout principal, depois do Deploy: gravar `infleet.token` na `cr40f_segredo` do DEV; rodar `register-notainfleet-customapi.ps1 -Apply`; abrir o App e comparar com o `driverProfile` de 90 dias.
