# Carro atual do motorista e link de acompanhamento — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com `- [ ]`.

**Objetivo:** a operação saber, no dia do serviço, qual carro está com cada motorista (próprio pela Infleet, terceiro pelo app), mostrar na Operacional, copiar mensagem ao cliente e gerar o link de acompanhamento.

**Arquitetura:** o carro atual fica no funcionário (`cr40f_veiculoatual`). Um flow a cada 5 min chama a Custom API `new_SincronizarVeiculoAtual` (plugin `DriverRecordSharing`), que lê a Infleet e cadastra carros novos. O terceiro escolhe o carro no App Motoristas. A Operacional lê o carro atual e chama `new_GerarLinkAcompanhamento`, que envia ao Worker do link (`POST /api/links`).

**Stack:** C# net462 + xUnit (plugin), React/TS + node:test (App Motoristas), React/TS + vitest (Sistema Betinhos), Cloudflare Worker ESM + node:test (Link), PowerShell + Web API (provisionamento).

**Spec:** `docs/superpowers/specs/2026-10-13-carro-atual-do-motorista-design.md`

## Restrições globais

- Ambiente: DEV `https://org23b93544.crm2.dynamics.com/`, solução `AppBetinhos`. PROD somente leitura.
- Repositórios e branches:
  - App Motoristas: worktree `.worktrees/infleet-veiculo-finalizacao` (branch `feat/infleet-veiculo-finalizacao`).
  - Sistema Betinhos: worktree `.claude/worktrees/automate-vehicle-swaps-8937f3` (branch `claude/automate-vehicle-swaps-8937f3`).
  - Link: `C:\Users\mendo\Desktop\vscode\Link Acompanhamento de Motorista`; criar a branch `feat/api-links` antes de editar.
- Choices: `new_origemveiculoatual` Infleet 100000000 · Motorista 100000001 · Operação 100000002. `cr40f_tipodevinculo` Colaborador 0 · Terceiro 1. `new_categoriadoveiculo` Próprio 100000000 · Terceiro 100000001 · Aluguel 100000002. `new_propriedade` Proprio 100000000 · Alugado 100000001. `cr40f_statusdoveiculo` Ativo 202410001.
- Segredos (token Infleet, segredo do link) só em configuração segura de step ou `wrangler secret`; nunca em log, commit ou resposta.
- Scripts `.ps1` sem acento em literal (Windows PowerShell 5.1 lê como ANSI): usar `[char]0x00E1` etc.
- Exibição do carro: só modelo, cor e placa (`describeVehicle`/`descreverCarro`), sem "desde" nem origem.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Repo | Arquivo | Responsabilidade |
| --- | --- | --- |
| App Motoristas | `plugins/DriverRecordSharing/InfleetVehicleInfo.cs` (novo) | Dados de veículo vindos da Infleet. |
| App Motoristas | `plugins/DriverRecordSharing/VehicleRegistrar.cs` (novo) | Monta o `cr40f_veiculos` a partir da Infleet. |
| App Motoristas | `plugins/DriverRecordSharing/CurrentVehicleSyncPlanner.cs` (novo) | Decide o que cadastrar e quais funcionários mudar. |
| App Motoristas | `plugins/DriverRecordSharing/SyncCurrentVehiclePlugin.cs` (novo) | Custom API `new_SincronizarVeiculoAtual`. |
| App Motoristas | `plugins/DriverRecordSharing/TrackingLinkRequest.cs` (novo) | Valida e monta o pedido do link. |
| App Motoristas | `plugins/DriverRecordSharing/GenerateTrackingLinkPlugin.cs` (novo) | Custom API `new_GerarLinkAcompanhamento`. |
| App Motoristas | `plugins/DriverRecordSharing/InfleetGateway.cs`, `ServiceVehicleResolver.cs`, `ResolveServiceVehiclePlugin.cs`, `PluginConfig.cs` | Consultas novas e cadastro automático na finalização. |
| App Motoristas | `scripts/provision-current-vehicle.ps1` (novo), `scripts/push-dev.ps1` | Schema, Custom APIs, steps e flow. |
| App Motoristas | `src/lib/myVehicle.ts` (novo), `src/screens/MyVehicleScreen.tsx` (novo), `src/lib/dataverse.ts`, `src/App.tsx`, `src/screens/InitialScreen.tsx`, `src/types.ts`, `src/app/navigation.ts` | "Meu carro" e finalização do terceiro. |
| Link | `src/api-links.mjs` (novo), `src/worker.mjs`, `tests/api-links.test.mjs` (novo), `package.json`, `README.md` | Rota `POST /api/links`. |
| Sistema Betinhos | `apps/shell/src/pages/operacional/domain/carro.ts` (novo) + teste, `domain/types.ts`, `data/queries.ts`, `data/source.ts`, `data/mock.ts`, `components/ServiceDetail.tsx`, `OperacionalPage.tsx` | Carro, mensagem e link na Operacional. |
| Skill | `Skill Agendamento/skill-ajustada/Betinhos-Skill-Assistente/references/campos.md`, `rastreamento.md`, `programacao.md` | Documentação do assistente. |

---

## Parte A — Plugin (App Motoristas)

Comandos de teste do plugin: `cd plugins/DriverRecordSharing.Tests && dotnet test` (a chave `DriverRecordSharing.snk` já está na worktree).

### Task 1: Cadastro de veículo a partir da Infleet

**Files:** Create `plugins/DriverRecordSharing/InfleetVehicleInfo.cs`, `plugins/DriverRecordSharing/VehicleRegistrar.cs`; Modify `PluginConfig.cs`; Test `plugins/DriverRecordSharing.Tests/VehicleRegistrarTests.cs`

**Interfaces — Produces:** `InfleetVehicleInfo(string id, string plate, string brand, string model, string year, string modelYear, string ownershipType)`; `VehicleRegistrar.BuildNewVehicle(InfleetVehicleInfo info, DateTime nowUtc) : Entity`.

- [ ] **Step 1: Teste que falha**

```csharp
using System;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleRegistrarTests
    {
        private static readonly DateTime Now = new DateTime(2026, 10, 13, 15, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void OwnedVehicle_MapsAllInfleetFields()
        {
            var info = new InfleetVehicleInfo("v1", "rti-7g00", "CHEV", "CRUZE LT NB AT", "2022", "2023", "OWNED");

            var e = VehicleRegistrar.BuildNewVehicle(info, Now);

            Assert.Equal("cr40f_veiculos", e.LogicalName);
            Assert.Equal("RTI7G00", e["cr40f_placa"]);
            Assert.Equal("RTI7G00", e["new_placanormalizada"]);
            Assert.Equal("RTI7G00", e["cr40f_id"]);
            Assert.Equal("CHEV", e["cr40f_marca"]);
            Assert.Equal("CRUZE LT NB AT", e["cr40f_modelo"]);
            Assert.Equal(2022, e["cr40f_anodefabricacao"]);
            Assert.Equal(2023, e["cr40f_anodemodelo"]);
            Assert.Equal(100000000, ((OptionSetValue)e["new_propriedade"]).Value);
            Assert.Equal(100000000, ((OptionSetValue)e["new_categoriadoveiculo"]).Value);
            Assert.Equal(202410001, ((OptionSetValue)e["cr40f_statusdoveiculo"]).Value);
            Assert.Equal("v1", e["new_infleetvehicleid"]);
            Assert.Equal(Now, e["new_ultimasincronizacaoinfleet"]);
            Assert.Equal("Cadastrado pela Infleet em 13/10/2026; falta cor", e["cr40f_comentariosextras"]);
            Assert.False(e.Contains("cr40f_cor"));
            Assert.False(e.Contains("cr40f_chassi"));
            Assert.False(e.Contains("cr40f_renavam"));
        }

        [Fact]
        public void RentedVehicle_IsAluguel()
        {
            var e = VehicleRegistrar.BuildNewVehicle(new InfleetVehicleInfo("v2", "ABC1D23", null, null, null, null, "RENTED"), Now);

            Assert.Equal(100000001, ((OptionSetValue)e["new_propriedade"]).Value);
            Assert.Equal(100000002, ((OptionSetValue)e["new_categoriadoveiculo"]).Value);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("20x2")]
        [InlineData("1890")]
        public void InvalidYearOrOwnership_IsNotWritten(string year)
        {
            var e = VehicleRegistrar.BuildNewVehicle(new InfleetVehicleInfo("v3", "ABC1D23", "", "", year, year, null), Now);

            Assert.False(e.Contains("cr40f_anodefabricacao"));
            Assert.False(e.Contains("cr40f_anodemodelo"));
            Assert.False(e.Contains("new_propriedade"));
            Assert.False(e.Contains("new_categoriadoveiculo"));
            Assert.False(e.Contains("cr40f_marca"));
        }
    }
}
```

- [ ] **Step 2:** `dotnet test` → FAIL (tipos não existem).
- [ ] **Step 3: Implementação**

`InfleetVehicleInfo.cs`:
```csharp
namespace Betinhos.DriverRecordSharing
{
    public sealed class InfleetVehicleInfo
    {
        public InfleetVehicleInfo(string id, string plate, string brand, string model, string year, string modelYear, string ownershipType)
        {
            Id = id; Plate = plate; Brand = brand; Model = model; Year = year; ModelYear = modelYear; OwnershipType = ownershipType;
        }

        public string Id { get; }
        public string Plate { get; }
        public string Brand { get; }
        public string Model { get; }
        public string Year { get; }
        public string ModelYear { get; }
        public string OwnershipType { get; }
    }
}
```

`PluginConfig.cs` (junto das constantes de veículo):
```csharp
        public const string VehicleNormalizedPlate = "new_placanormalizada";
        public const string VehicleCode = "cr40f_id";
        public const string VehicleBrand = "cr40f_marca";
        public const string VehicleManufactureYear = "cr40f_anodefabricacao";
        public const string VehicleModelYear = "cr40f_anodemodelo";
        public const string VehicleOwnership = "new_propriedade";
        public const string VehicleCategory = "new_categoriadoveiculo";
        public const string VehicleStatus = "cr40f_statusdoveiculo";
        public const string VehicleInfleetId = "new_infleetvehicleid";
        public const string VehicleInfleetSyncedAt = "new_ultimasincronizacaoinfleet";
        public const string VehicleNotes = "cr40f_comentariosextras";
        public const int VehicleStatusActive = 202410001;
        public const int VehicleCategoryOwn = 100000000;
        public const int VehicleCategoryThirdParty = 100000001;
        public const int VehicleCategoryRental = 100000002;
        public const int VehicleOwnershipOwn = 100000000;
        public const int VehicleOwnershipRented = 100000001;
        public const string EmployeeLinkType = "cr40f_tipodevinculo";
        public const int EmployeeLinkTypeThirdParty = 1;
        public const string EmployeeCurrentVehicle = "cr40f_veiculoatual";
        public const string EmployeeCurrentVehicleSince = "new_veiculoatualdesde";
        public const string EmployeeCurrentVehicleOrigin = "new_origemveiculoatual";
        public const int EmployeeCurrentVehicleOriginInfleet = 100000000;
        public const string ServiceTrackingLink = "new_linkacompanhamento";
        public const string ServiceTrackingLinkExpiresAt = "new_linkacompanhamentoexpiraem";
        public const string ServiceCode = "cr40f_id";
        public const string ServiceDepartureAddress = "cr40f_endereodesada";
        public const string ServiceDestinationAddress = "cr40f_destino";
```

`VehicleRegistrar.cs`:
```csharp
using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Cadastra em cr40f_veiculos um carro que a Infleet conhece e o Dataverse não.
    // A Infleet não tem cor; o chassi vem mascarado e o Renavam vazio, então não são gravados.
    public static class VehicleRegistrar
    {
        private static readonly TimeSpan Brt = TimeSpan.FromHours(-3);

        public static Entity BuildNewVehicle(InfleetVehicleInfo info, DateTime nowUtc)
        {
            var plate = ServiceVehicleResolver.NormalizePlate(info.Plate);
            var e = new Entity(PluginConfig.VehicleTable);
            e[PluginConfig.VehiclePlate] = plate;
            e[PluginConfig.VehicleNormalizedPlate] = plate;
            e[PluginConfig.VehicleCode] = plate;
            SetText(e, PluginConfig.VehicleBrand, info.Brand);
            SetText(e, PluginConfig.VehicleModel, info.Model);
            SetYear(e, PluginConfig.VehicleManufactureYear, info.Year);
            SetYear(e, PluginConfig.VehicleModelYear, info.ModelYear);
            if (string.Equals(info.OwnershipType, "OWNED", StringComparison.OrdinalIgnoreCase))
            {
                e[PluginConfig.VehicleOwnership] = new OptionSetValue(PluginConfig.VehicleOwnershipOwn);
                e[PluginConfig.VehicleCategory] = new OptionSetValue(PluginConfig.VehicleCategoryOwn);
            }
            else if (string.Equals(info.OwnershipType, "RENTED", StringComparison.OrdinalIgnoreCase))
            {
                e[PluginConfig.VehicleOwnership] = new OptionSetValue(PluginConfig.VehicleOwnershipRented);
                e[PluginConfig.VehicleCategory] = new OptionSetValue(PluginConfig.VehicleCategoryRental);
            }
            e[PluginConfig.VehicleStatus] = new OptionSetValue(PluginConfig.VehicleStatusActive);
            e[PluginConfig.VehicleInfleetId] = info.Id;
            e[PluginConfig.VehicleInfleetSyncedAt] = nowUtc;
            e[PluginConfig.VehicleNotes] = "Cadastrado pela Infleet em " + (nowUtc + Brt).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + "; falta cor";
            return e;
        }

        private static void SetText(Entity e, string field, string value)
        {
            if (!string.IsNullOrWhiteSpace(value)) e[field] = value.Trim();
        }

        private static void SetYear(Entity e, string field, string value)
        {
            if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var year) && year >= 1980 && year <= 2100) e[field] = year;
        }
    }
}
```
- [ ] **Step 4:** `dotnet test` → PASS.
- [ ] **Step 5:** commit `feat: cadastro de veículo a partir dos dados da Infleet`.

### Task 2: Planejador da sincronização do carro atual

**Files:** Create `plugins/DriverRecordSharing/CurrentVehicleSyncPlanner.cs`; Test `plugins/DriverRecordSharing.Tests/CurrentVehicleSyncPlannerTests.cs`

**Interfaces — Consumes:** `InfleetVehicleInfo`. **Produces:**
```csharp
CurrentVehicleSyncPlanner.Plan(
  IEnumerable<CurrentVehicleSyncPlanner.DriverVehicle> infleet,
  IEnumerable<CurrentVehicleSyncPlanner.Employee> employees,
  IDictionary<string, Guid> fleetByPlate) : CurrentVehicleSyncPlanner.SyncPlan
// DriverVehicle(string infleetDriverId, InfleetVehicleInfo vehicle)
// Employee(Guid id, string infleetDriverId, bool isThirdParty, Guid? currentVehicleId)
// SyncPlan { IReadOnlyList<InfleetVehicleInfo> ToRegister; IReadOnlyList<Change> Changes; int IgnoredThirdParty; int Unchanged }
// Change(Guid employeeId, string plate)   // plate normalizada
```

- [ ] **Step 1: Teste que falha**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class CurrentVehicleSyncPlannerTests
    {
        private static readonly Guid Joao = Guid.NewGuid();
        private static readonly Guid Terceiro = Guid.NewGuid();
        private static readonly Guid Rti = Guid.NewGuid();
        private static readonly Guid Ruh = Guid.NewGuid();

        private static InfleetVehicleInfo V(string plate) => new InfleetVehicleInfo("id-" + plate, plate, "B", "M", "2022", "2022", "OWNED");

        private static CurrentVehicleSyncPlanner.SyncPlan Plan(Guid? joaoCurrent, params CurrentVehicleSyncPlanner.DriverVehicle[] infleet) =>
            CurrentVehicleSyncPlanner.Plan(
                infleet,
                new[]
                {
                    new CurrentVehicleSyncPlanner.Employee(Joao, "d-joao", false, joaoCurrent),
                    new CurrentVehicleSyncPlanner.Employee(Terceiro, "d-terc", true, null)
                },
                new Dictionary<string, Guid> { ["RTI7G00"] = Rti, ["RUH7G45"] = Ruh });

        [Fact]
        public void ChangedVehicle_IsUpdated()
        {
            var plan = Plan(Ruh, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("RTI-7G00")));

            var change = Assert.Single(plan.Changes);
            Assert.Equal(Joao, change.EmployeeId);
            Assert.Equal("RTI7G00", change.Plate);
            Assert.Empty(plan.ToRegister);
        }

        [Fact]
        public void SameVehicle_IsUnchanged()
        {
            var plan = Plan(Rti, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("RTI7G00")));

            Assert.Empty(plan.Changes);
            Assert.Equal(1, plan.Unchanged);
        }

        [Fact]
        public void UnknownPlate_IsRegisteredOnceAndAssigned()
        {
            var plan = Plan(null,
                new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("ABC1D23")),
                new CurrentVehicleSyncPlanner.DriverVehicle("d-sem-cadastro", V("abc-1d23")));

            Assert.Equal(new[] { "ABC1D23" }, plan.ToRegister.Select(v => ServiceVehicleResolver.NormalizePlate(v.Plate)));
            Assert.Equal("ABC1D23", Assert.Single(plan.Changes).Plate);
        }

        [Fact]
        public void ThirdPartyEmployee_IsNeverChanged()
        {
            var plan = Plan(null, new CurrentVehicleSyncPlanner.DriverVehicle("d-terc", V("RTI7G00")));

            Assert.Empty(plan.Changes);
            Assert.Equal(1, plan.IgnoredThirdParty);
        }

        [Fact]
        public void DriverWithoutVehicleOrEmployee_IsSkipped()
        {
            var plan = Plan(Rti,
                new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", null),
                new CurrentVehicleSyncPlanner.DriverVehicle("d-ninguem", V("RUH7G45")));

            Assert.Empty(plan.Changes);
            Assert.Empty(plan.ToRegister);
        }
    }
}
```

- [ ] **Step 2:** `dotnet test` → FAIL.
- [ ] **Step 3: Implementação**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Decide, sem I/O, quais carros cadastrar e quais funcionários trocam de carro atual.
    public static class CurrentVehicleSyncPlanner
    {
        public sealed class DriverVehicle
        {
            public DriverVehicle(string infleetDriverId, InfleetVehicleInfo vehicle) { InfleetDriverId = infleetDriverId; Vehicle = vehicle; }
            public string InfleetDriverId { get; }
            public InfleetVehicleInfo Vehicle { get; }
        }

        public sealed class Employee
        {
            public Employee(Guid id, string infleetDriverId, bool isThirdParty, Guid? currentVehicleId)
            {
                Id = id; InfleetDriverId = infleetDriverId; IsThirdParty = isThirdParty; CurrentVehicleId = currentVehicleId;
            }
            public Guid Id { get; }
            public string InfleetDriverId { get; }
            public bool IsThirdParty { get; }
            public Guid? CurrentVehicleId { get; }
        }

        public sealed class Change
        {
            public Change(Guid employeeId, string plate) { EmployeeId = employeeId; Plate = plate; }
            public Guid EmployeeId { get; }
            public string Plate { get; }
        }

        public sealed class SyncPlan
        {
            public SyncPlan(IReadOnlyList<InfleetVehicleInfo> toRegister, IReadOnlyList<Change> changes, int ignoredThirdParty, int unchanged)
            {
                ToRegister = toRegister; Changes = changes; IgnoredThirdParty = ignoredThirdParty; Unchanged = unchanged;
            }
            public IReadOnlyList<InfleetVehicleInfo> ToRegister { get; }
            public IReadOnlyList<Change> Changes { get; }
            public int IgnoredThirdParty { get; }
            public int Unchanged { get; }
        }

        public static SyncPlan Plan(IEnumerable<DriverVehicle> infleet, IEnumerable<Employee> employees, IDictionary<string, Guid> fleetByPlate)
        {
            var byDriver = (employees ?? Enumerable.Empty<Employee>())
                .Where(e => !string.IsNullOrWhiteSpace(e.InfleetDriverId))
                .GroupBy(e => e.InfleetDriverId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var toRegister = new Dictionary<string, InfleetVehicleInfo>(StringComparer.OrdinalIgnoreCase);
            var changes = new List<Change>();
            int ignored = 0, unchanged = 0;

            foreach (var item in infleet ?? Enumerable.Empty<DriverVehicle>())
            {
                if (item?.Vehicle == null || !byDriver.TryGetValue(item.InfleetDriverId ?? "", out var employee)) continue;
                if (employee.IsThirdParty) { ignored++; continue; }
                var plate = ServiceVehicleResolver.NormalizePlate(item.Vehicle.Plate);
                if (plate.Length == 0) continue;
                if (fleetByPlate.TryGetValue(plate, out var vehicleId))
                {
                    if (employee.CurrentVehicleId == vehicleId) { unchanged++; continue; }
                }
                else if (!toRegister.ContainsKey(plate))
                {
                    toRegister[plate] = item.Vehicle;
                }
                changes.Add(new Change(employee.Id, plate));
            }
            return new SyncPlan(toRegister.Values.ToList(), changes, ignored, unchanged);
        }
    }
}
```
- [ ] **Step 4:** `dotnet test` → PASS.
- [ ] **Step 5:** commit `feat: planejador da sincronização do carro atual`.

### Task 3: Gateway Infleet — carro atual dos motoristas e dados do veículo

**Files:** Modify `plugins/DriverRecordSharing/InfleetGateway.cs`; Modify fakes em `plugins/DriverRecordSharing.Tests/ServiceVehicleResolverTests.cs` (classe `FakeGateway`).

**Interfaces — Produces (em `IInfleetGateway`):**
```csharp
IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> ListDriverCurrentVehicles();
InfleetVehicleInfo FindVehicleByPlate(string plate);   // null se não achar
```

- [ ] **Step 1:** adicionar os dois métodos à interface e à `FakeGateway` dos testes (`ListDriverCurrentVehicles() => new CurrentVehicleSyncPlanner.DriverVehicle[0]`; `FindVehicleByPlate(p) => null`). `dotnet build` → FAIL em `InfleetGraphQlGateway`.
- [ ] **Step 2: Implementação em `InfleetGraphQlGateway`**

```csharp
        private const string VehicleInfoFields = "id plate brand model year modelYear ownershipType";

        public IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> ListDriverCurrentVehicles()
        {
            var data = Execute("query{ drivers: listDriversPaginated(limit:500){ id vehicle{ " + VehicleInfoFields + " } } }", null);
            return List(data, "drivers").OfType<Dictionary<string, object>>()
                .Select(d => new CurrentVehicleSyncPlanner.DriverVehicle(Str(d, "id"), ToVehicleInfo(Dict(d, "vehicle"))))
                .Where(d => !string.IsNullOrEmpty(d.InfleetDriverId))
                .ToList();
        }

        public InfleetVehicleInfo FindVehicleByPlate(string plate)
        {
            var data = Execute(
                "query($f: ListVehiclesFilterInput){ listVehicles(filter:$f, limit:5){ " + VehicleInfoFields + " } }",
                new Dictionary<string, object> { ["f"] = new Dictionary<string, object> { ["plateOrDisplayName"] = plate } });
            var normalized = ServiceVehicleResolver.NormalizePlate(plate);
            return List(data, "listVehicles").OfType<Dictionary<string, object>>()
                .Select(ToVehicleInfo)
                .FirstOrDefault(v => v != null && ServiceVehicleResolver.NormalizePlate(v.Plate) == normalized);
        }

        private static InfleetVehicleInfo ToVehicleInfo(Dictionary<string, object> v) =>
            v == null || string.IsNullOrEmpty(Str(v, "plate"))
                ? null
                : new InfleetVehicleInfo(Str(v, "id"), Str(v, "plate"), Str(v, "brand"), Str(v, "model"), Str(v, "year"), Str(v, "modelYear"), Str(v, "ownershipType"));
```
- [ ] **Step 3:** `dotnet test` → PASS (124 + novos). Validar as duas queries com o MCP Infleet (`consultar_graphql`) usando o mesmo texto.
- [ ] **Step 4:** commit `feat: gateway Infleet lista o carro atual dos motoristas e busca veículo por placa`.

### Task 4: Custom API `new_SincronizarVeiculoAtual`

**Files:** Create `plugins/DriverRecordSharing/SyncCurrentVehiclePlugin.cs`

**Interfaces — Consumes:** Tasks 1–3. **Produces:** mensagem `new_SincronizarVeiculoAtual`, saída `new_ResumoJson` (`{"atualizados":n,"cadastrados":n,"semMudanca":n,"terceirosIgnorados":n,"erros":[...]}`); construtor `(string unsecure, string secure)` com o token Infleet em `secure`.

- [ ] **Step 1: Implementação** (orquestração fina; a lógica testada está no planner e no registrar)

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_SincronizarVeiculoAtual: grava no funcionário o carro com que a Infleet o vê agora.
    public sealed class SyncCurrentVehiclePlugin : IPlugin
    {
        public const string MessageName = "new_SincronizarVeiculoAtual";
        public const string ResultParameter = "new_ResumoJson";
        private readonly string _infleetToken;

        public SyncCurrentVehiclePlugin(string unsecureConfig, string secureConfig) { _infleetToken = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var system = factory.CreateOrganizationService(null);
            if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada.");

            var errors = new List<string>();
            var now = DateTime.UtcNow;
            IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> infleet;
            try { infleet = new InfleetGraphQlGateway(_infleetToken).ListDriverCurrentVehicles(); }
            catch (InfleetUnavailableException error) { throw new InvalidPluginExecutionException("Infleet indisponível: " + error.Message); }

            var fleet = LoadFleet(system);
            var plan = CurrentVehicleSyncPlanner.Plan(infleet, LoadEmployees(system), fleet);

            var created = 0;
            foreach (var info in plan.ToRegister)
            {
                try
                {
                    fleet[ServiceVehicleResolver.NormalizePlate(info.Plate)] = system.Create(VehicleRegistrar.BuildNewVehicle(info, now));
                    created++;
                }
                catch (Exception error) { errors.Add("cadastro " + info.Plate + ": " + error.Message); }
            }

            var updated = 0;
            foreach (var change in plan.Changes)
            {
                if (!fleet.TryGetValue(change.Plate, out var vehicleId)) continue;
                var patch = new Entity(PluginConfig.EmployeeTable, change.EmployeeId);
                patch[PluginConfig.EmployeeCurrentVehicle] = new EntityReference(PluginConfig.VehicleTable, vehicleId);
                patch[PluginConfig.EmployeeCurrentVehicleSince] = now;
                patch[PluginConfig.EmployeeCurrentVehicleOrigin] = new OptionSetValue(PluginConfig.EmployeeCurrentVehicleOriginInfleet);
                try { system.Update(patch); updated++; }
                catch (Exception error) { errors.Add("funcionario " + change.EmployeeId + ": " + error.Message); }
            }

            tracing?.Trace("SyncCurrentVehicle atualizados={0} cadastrados={1} erros={2}.", updated, created, errors.Count);
            context.OutputParameters[ResultParameter] = ServiceVehicleResolver.ToJson(new Dictionary<string, object>
            {
                ["atualizados"] = updated,
                ["cadastrados"] = created,
                ["semMudanca"] = plan.Unchanged,
                ["terceirosIgnorados"] = plan.IgnoredThirdParty,
                ["erros"] = errors.ToArray()
            });
        }

        private static IDictionary<string, Guid> LoadFleet(IOrganizationService service)
        {
            var query = new QueryExpression(PluginConfig.VehicleTable) { ColumnSet = new ColumnSet(PluginConfig.VehiclePlate, PluginConfig.VehicleNormalizedPlate), NoLock = true };
            var fleet = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            foreach (var v in service.RetrieveMultiple(query).Entities)
            {
                foreach (var raw in new[] { v.GetAttributeValue<string>(PluginConfig.VehicleNormalizedPlate), v.GetAttributeValue<string>(PluginConfig.VehiclePlate) })
                {
                    var plate = ServiceVehicleResolver.NormalizePlate(raw);
                    if (plate.Length > 0 && !fleet.ContainsKey(plate)) fleet[plate] = v.Id;
                }
            }
            return fleet;
        }

        private static IEnumerable<CurrentVehicleSyncPlanner.Employee> LoadEmployees(IOrganizationService service)
        {
            var query = new QueryExpression(PluginConfig.EmployeeTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.EmployeeInfleetDriverId, PluginConfig.EmployeeLinkType, PluginConfig.EmployeeCurrentVehicle),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.NotNull);
            return service.RetrieveMultiple(query).Entities.Select(e => new CurrentVehicleSyncPlanner.Employee(
                e.Id,
                e.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId),
                e.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeLinkType)?.Value == PluginConfig.EmployeeLinkTypeThirdParty,
                e.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle)?.Id)).ToList();
        }
    }
}
```
- [ ] **Step 2:** `dotnet build` e `dotnet test` → PASS.
- [ ] **Step 3:** commit `feat: Custom API new_SincronizarVeiculoAtual`.

### Task 5: Finalização cadastra carro desconhecido

**Files:** Modify `plugins/DriverRecordSharing/ServiceVehicleResolver.cs`, `ResolveServiceVehiclePlugin.cs`; Test `plugins/DriverRecordSharing.Tests/ServiceVehicleResolverTests.cs`

**Interfaces — Produces:** `ServiceVehicleResolver.Input.RegisterMissing : Func<string, FleetVehicle>` (placa normalizada → carro criado ou `null`).

- [ ] **Step 1: Teste que falha** (em `ServiceVehicleResolverTests`):
```csharp
        [Fact]
        public void UnknownDominantVehicle_IsRegisteredAndChosenAutomatically()
        {
            var created = Guid.NewGuid();
            var gateway = new FakeGateway(new VehicleUsageCalculator.Trip("v9", "ABC1D23", Brt(14), Brt(16), Driver));
            var input = Input();
            input.RegisterMissing = plate => plate == "ABC1D23" ? new ServiceVehicleResolver.FleetVehicle(created, "VERSA", null) : null;

            var result = ServiceVehicleResolver.Resolve(input, () => gateway);

            Assert.Equal("automatico", result["decisao"]);
            Assert.Equal(created.ToString("D"), ((Dictionary<string, object>)result["escolhido"])["veiculoId"]);
        }
```
- [ ] **Step 2:** `dotnet test` → FAIL.
- [ ] **Step 3: Implementação**
  - Em `Input`: `public Func<string, FleetVehicle> RegisterMissing { get; set; }`.
  - Trocar as chamadas `Lookup(input.Fleet, plate)` por `Find(input, plate)` e adicionar:
```csharp
        private static FleetVehicle Find(Input input, string plate)
        {
            var found = Lookup(input.Fleet, plate);
            if (found != null || input.RegisterMissing == null) return found;
            var normalized = NormalizePlate(plate);
            var created = input.RegisterMissing(normalized);
            if (created != null && input.Fleet != null) input.Fleet[normalized] = created;
            return created;
        }
```
   Os métodos `Ask` e `Candidates` passam a receber `Input input` em vez de `IDictionary<string, FleetVehicle> fleet` e usam `Find`.
  - Em `ResolveServiceVehiclePlugin.Execute`, criar uma instância única de gateway e:
```csharp
                var gateway = new InfleetGraphQlGateway(_infleetToken);
                input.RegisterMissing = plate =>
                {
                    var info = gateway.FindVehicleByPlate(plate);
                    if (info == null) return null;
                    var id = system.Create(VehicleRegistrar.BuildNewVehicle(info, DateTime.UtcNow));
                    return new ServiceVehicleResolver.FleetVehicle(id, info.Model, null);
                };
                var result = ServiceVehicleResolver.Resolve(input, () => gateway);
```
   (o construtor de `InfleetGraphQlGateway` lança `InfleetUnavailableException` sem token: envolver a criação no mesmo `try` que já devolve `indisponivel`, ou criar dentro da factory como hoje e montar `RegisterMissing` com `Lazy<InfleetGraphQlGateway>`.)
- [ ] **Step 4:** `dotnet test` → PASS.
- [ ] **Step 5:** commit `feat: finalização cadastra pela Infleet o carro que não existe no Dataverse`.

### Task 6: Custom API `new_GerarLinkAcompanhamento`

**Files:** Create `plugins/DriverRecordSharing/TrackingLinkRequest.cs`, `GenerateTrackingLinkPlugin.cs`; Test `plugins/DriverRecordSharing.Tests/TrackingLinkRequestTests.cs`

**Interfaces — Produces:** `TrackingLinkRequest.Build(TrackingLinkRequest.Input input, DateTime nowUtc) : TrackingLinkRequest.Result` com `Result.Error` (string ou null) e `Result.Payload` (`Dictionary<string, object>`, chaves do contrato do Worker: `placa, embarque, destinoFinal, horarioAgendado, titulo, corVeiculo, modeloVeiculo, validadeHoras`). Saída da Custom API: `new_LinkJson` = `{"ok":true,"link":"…","expiraEm":"…"}` ou `{"ok":false,"erro":"…"}`. Configuração segura do step: JSON `{"url":"https://<worker>/api/links","segredo":"…"}`.

- [ ] **Step 1: Teste que falha**
```csharp
using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkRequestTests
    {
        private static readonly DateTime Now = new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);

        private static TrackingLinkRequest.Input Valid() => new TrackingLinkRequest.Input
        {
            ServiceCode = "OS-1909",
            DepartureAddress = "Av. Paulista, 1000 - São Paulo",
            DestinationAddress = "Aeroporto de Guarulhos",
            DepartureUtc = Now.AddHours(2),
            IsThirdParty = false,
            VehiclePlate = "RUH7G45",
            VehicleModel = "Corolla",
            VehicleColor = "Prata",
            VehicleHasInfleet = true
        };

        [Fact]
        public void ValidRequest_BuildsWorkerPayload()
        {
            var result = TrackingLinkRequest.Build(Valid(), Now);

            Assert.Null(result.Error);
            Assert.Equal("RUH7G45", result.Payload["placa"]);
            Assert.Equal("Av. Paulista, 1000 - São Paulo", result.Payload["embarque"]);
            Assert.Equal("Aeroporto de Guarulhos", result.Payload["destinoFinal"]);
            Assert.Equal("2026-10-13T14:00:00Z", result.Payload["horarioAgendado"]);
            Assert.Equal("Embarque OS-1909", result.Payload["titulo"]);
            Assert.Equal("Prata", result.Payload["corVeiculo"]);
            Assert.Equal("Corolla", result.Payload["modeloVeiculo"]);
            Assert.Equal(6.0, result.Payload["validadeHoras"]);
        }

        [Fact]
        public void Validity_IsClampedBetweenHalfHourAndOneDay()
        {
            var past = Valid(); past.DepartureUtc = Now.AddHours(-10);
            var far = Valid(); far.DepartureUtc = Now.AddDays(3);

            Assert.Equal(0.5, TrackingLinkRequest.Build(past, Now).Payload["validadeHoras"]);
            Assert.Equal(24.0, TrackingLinkRequest.Build(far, Now).Payload["validadeHoras"]);
        }

        [Theory]
        [InlineData("terceiro", "Motorista terceiro sem rastreador.")]
        [InlineData("semCarro", "Motorista sem carro atual.")]
        [InlineData("semInfleet", "Carro sem rastreador na Infleet.")]
        [InlineData("semEmbarque", "Serviço sem endereço de embarque.")]
        public void InvalidRequest_ReturnsReason(string caso, string erro)
        {
            var input = Valid();
            if (caso == "terceiro") input.IsThirdParty = true;
            if (caso == "semCarro") input.VehiclePlate = null;
            if (caso == "semInfleet") input.VehicleHasInfleet = false;
            if (caso == "semEmbarque") input.DepartureAddress = " ";

            var result = TrackingLinkRequest.Build(input, Now);

            Assert.Equal(erro, result.Error);
            Assert.Null(result.Payload);
        }
    }
}
```
- [ ] **Step 2:** `dotnet test` → FAIL.
- [ ] **Step 3: Implementação `TrackingLinkRequest.cs`**
```csharp
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Betinhos.DriverRecordSharing
{
    public static class TrackingLinkRequest
    {
        public sealed class Input
        {
            public string ServiceCode { get; set; }
            public string DepartureAddress { get; set; }
            public string DestinationAddress { get; set; }
            public DateTime? DepartureUtc { get; set; }
            public bool IsThirdParty { get; set; }
            public string VehiclePlate { get; set; }
            public string VehicleModel { get; set; }
            public string VehicleColor { get; set; }
            public bool VehicleHasInfleet { get; set; }
        }

        public sealed class Result
        {
            public Result(string error, Dictionary<string, object> payload) { Error = error; Payload = payload; }
            public string Error { get; }
            public Dictionary<string, object> Payload { get; }
        }

        public static Result Build(Input input, DateTime nowUtc)
        {
            if (input.IsThirdParty) return Fail("Motorista terceiro sem rastreador.");
            if (string.IsNullOrWhiteSpace(input.VehiclePlate)) return Fail("Motorista sem carro atual.");
            if (!input.VehicleHasInfleet) return Fail("Carro sem rastreador na Infleet.");
            if (string.IsNullOrWhiteSpace(input.DepartureAddress)) return Fail("Serviço sem endereço de embarque.");

            var departure = input.DepartureUtc ?? nowUtc;
            var hours = Math.Max(0.5, Math.Min(24.0, Math.Round((departure.AddHours(4) - nowUtc).TotalHours, 1)));
            var payload = new Dictionary<string, object>
            {
                ["placa"] = ServiceVehicleResolver.NormalizePlate(input.VehiclePlate),
                ["embarque"] = input.DepartureAddress.Trim(),
                ["destinoFinal"] = string.IsNullOrWhiteSpace(input.DestinationAddress) ? null : input.DestinationAddress.Trim(),
                ["horarioAgendado"] = input.DepartureUtc?.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                ["titulo"] = string.IsNullOrWhiteSpace(input.ServiceCode) ? "Embarque" : "Embarque " + input.ServiceCode,
                ["corVeiculo"] = input.VehicleColor,
                ["modeloVeiculo"] = input.VehicleModel,
                ["validadeHoras"] = hours
            };
            return new Result(null, payload);
        }

        private static Result Fail(string error) => new Result(error, null);
    }
}
```
- [ ] **Step 4: Implementação `GenerateTrackingLinkPlugin.cs`** — mesmo esqueleto do `ResolveServiceVehiclePlugin`:
  1. Lê `new_ReservaId` (Guid) e a reserva com o usuário chamador: `cr40f_id`, `cr40f_endereodesada`, `cr40f_destino`, `cr40f_dataehorriodesada`, `cr40f_motorista`.
  2. Com o serviço de sistema, lê o funcionário (`cr40f_tipodevinculo`, `cr40f_veiculoatual`) e o veículo atual (`cr40f_placa`, `cr40f_modelo`, `cr40f_cor`, `new_infleetvehicleid`).
  3. `TrackingLinkRequest.Build`; com `Error`, devolve `{"ok":false,"erro":Error}` sem chamar o Worker.
  4. `POST` JSON para `url` da configuração segura com `Authorization: Bearer <segredo>`, `HttpWebRequest`, timeout 15 s (mesmo padrão do `InfleetGraphQlGateway.Execute`, sem retry).
  5. Resposta `{"link":"…","expiraEm":"…"}`: grava `new_linkacompanhamento` e `new_linkacompanhamentoexpiraem` na reserva e devolve `{"ok":true,"link","expiraEm"}`.
  6. Erro HTTP ou rede: `{"ok":false,"erro":"Não foi possível gerar o link agora."}` e `tracing` com o status, nunca com o segredo.
- [ ] **Step 5:** `dotnet test` → PASS; commit `feat: Custom API new_GerarLinkAcompanhamento`.

### Task 7: Provisionamento no DEV (schema, Custom APIs, steps e flow)

**Files:** Create `scripts/provision-current-vehicle.ps1`; Modify `scripts/push-dev.ps1`

Reaproveitar as funções `Invoke-Dv`, `Get-Rows`, `Add-SolutionComponent`, `Ensure-Column`, `Ensure-ChoiceOption` e `Read-InfleetToken` de `scripts/provision-infleet-vehicle.ps1` (copiar para o novo script; acentos por `[char]`).

- [ ] **Step 1: Schema**
  - `cr40f_funcionarios.new_VeiculoAtualDesde` (datetime) e `new_OrigemVeiculoAtual` (choice local: 100000000 "Infleet", 100000001 "Motorista", 100000002 "Opera$([char]0x00E7)$([char]0x00E3)o").
  - `cr40f_reservadeveculos.new_LinkAcompanhamento` (string 500) e `new_LinkAcompanhamentoExpiraEm` (datetime).
  - Adicionar `"datetime"` e `"string"` ao `switch` de `Ensure-Column` (DateTimeAttributeMetadata `Format = "DateAndTime"`, `DateTimeBehavior = @{ Value = "UserLocal" }`; StringAttributeMetadata `MaxLength = 500`, `FormatName = @{ Value = "Url" }`).
- [ ] **Step 2: Custom APIs** (sem plugin principal, `allowedcustomprocessingsteptype = 2`, como `new_ResolverVeiculoDoServico`):
  - `new_SincronizarVeiculoAtual`, sem parâmetros, resposta `new_ResumoJson` (type 10).
  - `new_GerarLinkAcompanhamento`, parâmetro `new_ReservaId` (type 12), resposta `new_LinkJson` (type 10).
- [ ] **Step 3: Steps PostOperation síncronos com configuração segura**
  - `Betinhos.DriverRecordSharing.SyncCurrentVehiclePlugin` em `new_SincronizarVeiculoAtual`, com o token Infleet (`-InfleetTokenFile`, mesmo padrão).
  - `Betinhos.DriverRecordSharing.GenerateTrackingLinkPlugin` em `new_GerarLinkAcompanhamento`, com `{"url":"<-LinkApiUrl>","segredo":"<conteúdo de -LinkSecretFile>"}`. O segredo é gerado na Task 10 e gravado em um arquivo local fora do repositório.
- [ ] **Step 4: Flow agendado** — criar em `workflows` (category 5, type 1, `statecode` 1 ao final) usando a referência de conexão `new_sharedcommondataserviceforapps_25a23`:
```json
{
  "properties": {
    "connectionReferences": {
      "shared_commondataserviceforapps": {
        "runtimeSource": "embedded",
        "connection": { "connectionReferenceLogicalName": "new_sharedcommondataserviceforapps_25a23" },
        "api": { "name": "shared_commondataserviceforapps" }
      }
    },
    "definition": {
      "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      "contentVersion": "1.0.0.0",
      "parameters": { "$connections": { "defaultValue": {}, "type": "Object" }, "$authentication": { "defaultValue": {}, "type": "SecureObject" } },
      "triggers": { "A_cada_5_minutos": { "type": "Recurrence", "recurrence": { "frequency": "Minute", "interval": 5, "timeZone": "E. South America Standard Time" } } },
      "actions": {
        "Sincronizar_veiculo_atual": {
          "type": "OpenApiConnection",
          "inputs": {
            "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "PerformUnboundAction", "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
            "parameters": { "actionName": "new_SincronizarVeiculoAtual" },
            "authentication": "@parameters('$authentication')"
          }
        }
      }
    }
  },
  "schemaVersion": "1.0.0.0"
}
```
  Nome: "Infleet - Sincronizar carro atual dos motoristas". Criar desligado (`statecode` 0), validar uma execução manual e então ativar (`PATCH statecode = 1, statuscode = 2`). Se a ativação falhar por conexão, parar e pedir ao Renan para abrir o flow no Power Automate e confirmar a conexão (um clique).
- [ ] **Step 5:** `push-dev.ps1`: chamar `provision-current-vehicle.ps1 -Apply` após `provision-infleet-vehicle.ps1`; incluir `new_SincronizarVeiculoAtual`, `new_GerarLinkAcompanhamento`, `new_ResumoJson` e `new_LinkJson` na validação do ZIP.
- [ ] **Step 6:** rodar em dry run (`-DeviceCode` sem `-Apply`), conferir a saída; commit `feat: provisionamento do carro atual e do link de acompanhamento`.

## Parte B — App Motoristas

Comandos: `npm test` e `node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters` (o `node_modules` da worktree é junction do principal).

### Task 8: "Meu carro" para terceiros

**Files:** Create `src/lib/myVehicle.ts`, `src/screens/MyVehicleScreen.tsx`, `tests/myVehicle.test.ts`; Modify `src/lib/dataverse.ts`, `src/types.ts`, `src/app/navigation.ts`, `src/screens/InitialScreen.tsx`, `src/App.tsx`, `src/styles.css`

**Interfaces — Produces:**
```ts
// src/lib/myVehicle.ts
export const DRIVER_LINK_THIRD_PARTY = 1;
export const CURRENT_VEHICLE_ORIGIN_DRIVER = 100000001;
export function isThirdPartyDriver(funcionario: Record<string, unknown> | null | undefined): boolean;
export function buildCurrentVehiclePatch(vehicleId: string, vehicleBind: (id: string) => string, now?: Date): Record<string, unknown>;
// src/lib/dataverse.ts
export async function loadMyVehiclesRemote(driver: DriverContext): Promise<FleetVehicle[]>;
export async function setMyCurrentVehicleRemote(driver: DriverContext, vehicleId: string): Promise<void>;
```

- [ ] **Step 1: Teste que falha** `tests/myVehicle.test.ts`:
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildCurrentVehiclePatch, CURRENT_VEHICLE_ORIGIN_DRIVER, isThirdPartyDriver } from "../src/lib/myVehicle.ts";

test("só terceiro vê Meu carro", () => {
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: 1 }), true);
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: "1" }), true);
  assert.equal(isThirdPartyDriver({ cr40f_tipodevinculo: 0 }), false);
  assert.equal(isThirdPartyDriver(null), false);
});

test("troca do carro grava lookup, horário e origem Motorista", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const patch = buildCurrentVehiclePatch("ABC", (id) => `/cr40f_veiculoses(${id})`, now);
  assert.deepEqual(patch, {
    "cr40f_VeiculoAtual@odata.bind": "/cr40f_veiculoses(ABC)",
    new_veiculoatualdesde: "2026-10-13T12:00:00.000Z",
    new_origemveiculoatual: CURRENT_VEHICLE_ORIGIN_DRIVER
  });
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implementação**
  - `src/lib/myVehicle.ts`:
```ts
// Carro atual do motorista terceiro, escolhido por ele no app (sem rastreador).
export const DRIVER_LINK_THIRD_PARTY = 1;
export const CURRENT_VEHICLE_ORIGIN_DRIVER = 100000001;

export function isThirdPartyDriver(funcionario: Record<string, unknown> | null | undefined) {
  return Number(funcionario?.cr40f_tipodevinculo) === DRIVER_LINK_THIRD_PARTY;
}

export function buildCurrentVehiclePatch(vehicleId: string, vehicleBind: (id: string) => string, now = new Date()) {
  return {
    "cr40f_VeiculoAtual@odata.bind": vehicleBind(vehicleId),
    new_veiculoatualdesde: now.toISOString(),
    new_origemveiculoatual: CURRENT_VEHICLE_ORIGIN_DRIVER
  };
}
```
  - Antes de codar, confirmar o nome da navegação do lookup na metadata: `GET EntityDefinitions(LogicalName='cr40f_funcionarios')/ManyToOneRelationships?$filter=ReferencingAttribute eq 'cr40f_veiculoatual'&$select=ReferencingEntityNavigationPropertyName`. Se não for `cr40f_VeiculoAtual`, ajustar o teste e a implementação.
  - `dataverse.ts`:
```ts
export async function loadMyVehiclesRemote(driver: DriverContext): Promise<FleetVehicle[]> {
  const result = await retrieveMultiple(
    DATAVERSE.veiculos,
    [
      "$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor",
      `$filter=statecode eq 0 and new_categoriadoveiculo eq 100000001 and _cr40f_motoristaatual_value eq ${cleanGuid(driver.id)}`,
      "$orderby=cr40f_modelo asc"
    ].join("&")
  );
  return result.entities
    .map((r) => ({ id: cleanODataGuid(r.cr40f_veiculosid), placa: String(r.cr40f_placa ?? "").trim(), modelo: String(r.cr40f_modelo ?? "").trim(), cor: String(r.cr40f_cor ?? "").trim() }))
    .filter((v) => v.id && v.placa);
}

export async function setMyCurrentVehicleRemote(driver: DriverContext, vehicleId: string) {
  await updateOne(DATAVERSE.funcionarios, driver.id, buildCurrentVehiclePatch(vehicleId, (id) => bind(DATAVERSE.veiculos, id)));
}
```
  - `types.ts`: adicionar `"meuCarro"` à união `Screen`. `navigation.ts`: `SCREEN_HASH_PATHS.meuCarro = "meu-carro"`, alias `"meu-carro": "meuCarro"`, profundidade 1, incluir em `isListScreen` se as telas de lista de 1 nível estiverem lá.
  - `InitialScreen.tsx`: módulo `{ id: "meuCarro", label: "Meu carro", detail: "Carro que você está usando", action: "Trocar carro", icon: "veiculo", tone: "neutral", disabled: false }`, incluído no `useMemo` de `modules` só quando `props.isThirdParty`; `screenAliases.meuCarro = ["meuCarro"]`; ícone reaproveita um existente de veículo (procurar `name === "` no arquivo e usar o de manutenção/carro).
  - `App.tsx`: aceitar `"meuCarro"` na whitelist de `navigateFromInitial`; passar `isThirdParty={isThirdPartyDriver(driverContext?.funcionario)}` ao `InitialScreen`; renderizar:
```tsx
  if (screen === "meuCarro") {
    return show(
      <MyVehicleScreen
        onBack={() => setScreen("inicio")}
        currentVehicleId={getDriverCurrentVehicleId(driverContext)}
        loadVehicles={async () => loadMyVehiclesRemote(driverContext ?? await getDriverContext())}
        saveVehicle={async (id) => {
          const driver = driverContext ?? await getDriverContext();
          await setMyCurrentVehicleRemote(driver, id);
          setDriverContext({ ...driver, funcionario: { ...(driver.funcionario ?? {}), _cr40f_veiculoatual_value: id } });
        }}
      />
    );
  }
```
  - `MyVehicleScreen.tsx`: cabeçalho igual ao de `IdeasScreen` (copiar a estrutura de topo e o botão Voltar), lista com as classes do diálogo (`vehicle-choice-list`, `vehicle-choice-option`, `vehicle-choice-name`, `vehicle-choice-plate`, `describeVehicle`), o carro atual com `data-selected`, toque salva e mostra "Carro atualizado." no `LocalToast`; estados carregando, erro com "Tentar de novo" e vazio "Nenhum carro cadastrado para você. Fale com a operação.".
- [ ] **Step 4:** `npm test` e `tsc` → PASS. Testar no mock (`?mockInfleet=` não se aplica; usar `isThirdParty` forçado pelo mock local de `getDriverContext` com `cr40f_tipodevinculo: 1` quando `?mockTerceiro=1`).
- [ ] **Step 5:** commit `feat: motorista terceiro escolhe o carro atual no app`.

### Task 9: Finalização do terceiro sem Infleet

**Files:** Modify `src/lib/serviceVehicleInfleet.ts`, `src/App.tsx`; Test `tests/serviceVehicleInfleet.test.ts`

**Interfaces — Produces:** `thirdPartyResolution(currentVehicle: FleetVehicle | null): InfleetVehicleResolution` e `DriverVehicleChoice.origem` aceita `"terceiro"`.

- [ ] **Step 1: Teste que falha**
```ts
test("terceiro com carro atual grava sem perguntar", () => {
  const resolution = thirdPartyResolution({ id: RTI, placa: "RTI7G00", modelo: "Cruze", cor: "Prata" });
  assert.equal(needsDriverChoice(resolution), true);
  const patch = buildInfleetServiceVehiclePatch(resolution, { veiculoId: RTI, placa: "RTI7G00", origem: "terceiro" }, bind);
  assert.equal(patch["cr40f_Veiculo@odata.bind"], bind(RTI));
  assert.equal(patch.new_origemveiculo, SERVICE_VEHICLE_ORIGIN_DRIVER_CHOSEN);
  assert.equal(JSON.parse(String(patch.new_evidenciaveiculoinfleet)).motivo, "motorista-terceiro");
});

test("terceiro sem carro atual escolhe na frota dele", () => {
  const resolution = thirdPartyResolution(null);
  assert.equal(needsFleetChoice(resolution), true);
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implementação**
  - `serviceVehicleInfleet.ts`: `origem: "candidato" | "frota" | "terceiro"`;
```ts
export function thirdPartyResolution(current: FleetVehicle | null): InfleetVehicleResolution {
  return { decisao: "indisponivel", motivo: "motorista-terceiro", totalSegundos: 0, candidatos: [], terceiroAtual: current ?? undefined };
}
```
   com `terceiroAtual?: FleetVehicle` em `InfleetVehicleResolution`; no `buildInfleetServiceVehiclePatch`, tratar `"terceiro"` igual a `"frota"` (percentual 0).
  - `App.tsx` (caminho remoto do `SERVICO`): se `isThirdPartyDriver(driverContext?.funcionario)`, não chama `resolveServiceVehicleRemote`. Monta `thirdPartyResolution(atual)` onde `atual` vem de `loadMyVehiclesRemote` filtrado por `getDriverCurrentVehicleId`. Com `atual`, `vehicleChoice = { veiculoId: atual.id, placa: atual.placa, origem: "terceiro" }` sem diálogo; sem `atual`, `askVehicleChoice(resolution, () => loadMyVehiclesRemote(driver))` e converte a escolha para `origem: "terceiro"`.
  - Mock local: cenário `?mockInfleet=terceiro` em `serviceVehicleInfleetMock.ts`, retornando `thirdPartyResolution(null)` e frota de dois carros.
- [ ] **Step 4:** `npm test` e `tsc` → PASS; mock `?mockInfleet=terceiro` mostra só os carros do terceiro.
- [ ] **Step 5:** commit `feat: finalização do terceiro usa o carro atual dele`.

## Parte C — Worker do link

Na pasta `C:\Users\mendo\Desktop\vscode\Link Acompanhamento de Motorista`: `git status` limpo, `git switch -c feat/api-links`.

### Task 10: Rota `POST /api/links`

**Files:** Create `src/api-links.mjs`, `tests/api-links.test.mjs`; Modify `src/worker.mjs`, `package.json`, `README.md`

**Interfaces — Produces:** `POST /api/links` com `Authorization: Bearer <LINK_API_SECRET>`; corpo = payload da Task 6; resposta 200 `{"link":"https://…/r/<64hex>","expiraEm":"ISO"}`, 401 sem/errado, 400 `{"erro":"…"}` inválido, 502 Infleet/geocode.

- [ ] **Step 1: Teste que falha** `tests/api-links.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { autorizado, criarLink, validarPedido } from "../src/api-links.mjs";

const req = (auth) => new Request("https://x/api/links", { method: "POST", headers: auth ? { Authorization: auth } : {} });

test("autoriza só o segredo exato", () => {
  assert.equal(autorizado(req("Bearer s3cr3t"), "s3cr3t"), true);
  assert.equal(autorizado(req("Bearer errado"), "s3cr3t"), false);
  assert.equal(autorizado(req(null), "s3cr3t"), false);
  assert.equal(autorizado(req("Bearer s3cr3t"), ""), false);
});

test("valida campos obrigatórios", () => {
  assert.equal(validarPedido({ embarque: "Av. Paulista" }).erro, "placa obrigatória");
  assert.equal(validarPedido({ placa: "RUH7G45" }).erro, "embarque obrigatório");
  assert.equal(validarPedido({ placa: "RUH7G45", embarque: "Av. Paulista", horarioAgendado: "ontem" }).erro, "horarioAgendado inválido");
  assert.equal(validarPedido({ placa: "ruh-7g45", embarque: "Av. Paulista", validadeHoras: 99 }).dados.validadeHoras, 24);
});

test("cria o link no KV com o contrato da página", async () => {
  const puts = [];
  const env = { TRACK_KV: { put: async (k, v, o) => puts.push({ k, v: JSON.parse(v), o }) } };
  const deps = {
    geocode: async (endereco) => ({ lat: -23.5, lon: -46.6, label: endereco }),
    acharVeiculo: async (placa) => ({ id: "veh-1", plate: placa }),
    agora: () => new Date("2026-10-13T12:00:00Z"),
    novoId: () => "a".repeat(64)
  };
  const { dados } = validarPedido({ placa: "RUH7G45", embarque: "Av. Paulista", destinoFinal: "GRU", horarioAgendado: "2026-10-13T14:00:00Z", titulo: "Embarque OS-1", corVeiculo: "Prata", modeloVeiculo: "Corolla", validadeHoras: 6 });

  const r = await criarLink(env, "https://link.test", dados, deps);

  assert.equal(r.link, `https://link.test/r/${"a".repeat(64)}`);
  assert.equal(r.expiraEm, "2026-10-13T18:00:00.000Z");
  assert.equal(puts[0].k, `track:${"a".repeat(64)}`);
  assert.equal(puts[0].o.expirationTtl, 21600);
  assert.deepEqual(Object.keys(puts[0].v).sort(), ["corVeiculo", "criadoPor", "destino", "destinoFinal", "expiraEm", "horarioAgendado", "modeloVeiculo", "placa", "titulo", "vehicleId"]);
  assert.equal(puts[0].v.vehicleId, "veh-1");
  assert.equal(puts[0].v.criadoPor, "operacional");
});
```
- [ ] **Step 2:** `node --test tests/` → FAIL.
- [ ] **Step 3: Implementação `src/api-links.mjs`**
```js
// Criação de link de acompanhamento pela Operacional (via Custom API do Dataverse).
import { gqlInfleet } from "./infleet.mjs";

const norm = (s) => String(s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

export function autorizado(request, segredo) {
  if (!segredo) return false;
  const recebido = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (recebido.length !== segredo.length) return false;
  let diff = 0;
  for (let i = 0; i < segredo.length; i++) diff |= recebido.charCodeAt(i) ^ segredo.charCodeAt(i);
  return diff === 0;
}

export function validarPedido(body) {
  const placa = norm(body?.placa);
  if (!placa) return { erro: "placa obrigatória" };
  const embarque = String(body?.embarque ?? "").trim();
  if (!embarque) return { erro: "embarque obrigatório" };
  let horarioAgendado = null;
  if (body.horarioAgendado) {
    const d = new Date(body.horarioAgendado);
    if (isNaN(d)) return { erro: "horarioAgendado inválido" };
    horarioAgendado = d.toISOString();
  }
  const horas = Number(body.validadeHoras);
  const validadeHoras = Math.min(24, Math.max(0.5, Number.isFinite(horas) ? horas : 4));
  const texto = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
  return { dados: { placa, embarque, destinoFinal: texto(body.destinoFinal), horarioAgendado, titulo: texto(body.titulo), corVeiculo: texto(body.corVeiculo), modeloVeiculo: texto(body.modeloVeiculo), validadeHoras } };
}

export async function geocodeNominatim(endereco) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;
  const res = await fetch(url, { headers: { "User-Agent": "betinhos-acompanhamento/1.0", "Accept-Language": "pt-BR" } });
  const [hit] = res.ok ? await res.json() : [];
  if (!hit) throw new Error(`Endereço não encontrado: ${endereco}`);
  return { lat: Number(hit.lat), lon: Number(hit.lon), label: endereco };
}

export function acharVeiculoInfleet(token) {
  return async (placa) => {
    const d = await gqlInfleet(token, "query($f: ListVehiclesFilterInput){ listVehicles(filter:$f, limit:5){ id plate } }", { f: { plateOrDisplayName: placa } });
    const v = d.listVehicles.find((x) => norm(x.plate) === norm(placa));
    if (!v) throw new Error(`Veículo ${placa} não encontrado na Infleet`);
    return v;
  };
}

export async function criarLink(env, origem, dados, deps) {
  const veiculo = await deps.acharVeiculo(dados.placa);
  const destino = await deps.geocode(dados.embarque);
  const destinoFinal = dados.destinoFinal ? await deps.geocode(dados.destinoFinal).catch(() => null) : null;
  const id = deps.novoId();
  const expiraEm = new Date(deps.agora().getTime() + dados.validadeHoras * 3600e3).toISOString();
  await env.TRACK_KV.put(
    `track:${id}`,
    JSON.stringify({
      vehicleId: veiculo.id, placa: veiculo.plate, destino, destinoFinal, titulo: dados.titulo,
      horarioAgendado: dados.horarioAgendado, corVeiculo: dados.corVeiculo, modeloVeiculo: dados.modeloVeiculo,
      expiraEm, criadoPor: "operacional"
    }),
    { expirationTtl: Math.round(dados.validadeHoras * 3600) }
  );
  return { link: `${origem}/r/${id}`, expiraEm };
}

export async function rotaApiLinks(request, env, url) {
  if (url.pathname !== "/api/links") return null;
  if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });
  if (!autorizado(request, env.LINK_API_SECRET)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const { dados, erro } = validarPedido(await request.json().catch(() => null));
  if (erro) return Response.json({ erro }, { status: 400 });
  try {
    const r = await criarLink(env, url.origin, dados, {
      geocode: geocodeNominatim,
      acharVeiculo: acharVeiculoInfleet(env.INFLEET_TOKEN),
      agora: () => new Date(),
      novoId: () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "")
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ erro: String(e?.message ?? e).slice(0, 200) }, { status: 502 });
  }
}
```
  - `worker.mjs`: no `fetch`, antes do `if (request.method !== "GET")`:
```js
      const api = await rotaApiLinks(request, env, url);
      if (api) return api;
```
   com `import { rotaApiLinks } from "./api-links.mjs";`.
  - `package.json`: `"test": "node --test tests/"` e incluir `src/api-links.mjs` no `check`.
  - `README.md`: seção "Criar link pela Operacional" com rota, cabeçalho, corpo e respostas.
- [ ] **Step 4:** `pnpm test` e `pnpm check` → PASS.
- [ ] **Step 5: Segredo** — gerar 48 bytes aleatórios em arquivo local fora do repo (`C:\Users\mendo\.betinhos\link-api-secret.txt`), `Get-Content … | npx wrangler secret put LINK_API_SECRET`, `pnpm push`. Testar com `curl` sem cabeçalho → 401.
- [ ] **Step 6:** commit `feat: rota POST /api/links para a Operacional criar links de acompanhamento`.

## Parte D — Tela Operacional (Sistema Betinhos)

Comando: `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional`.

### Task 11: Domínio do carro e da mensagem

**Files:** Create `apps/shell/src/pages/operacional/domain/carro.ts`, `domain/carro.test.ts`; Modify `domain/types.ts`

**Interfaces — Produces:**
```ts
export type Veiculo = { id: string; placa: string; modelo: string; cor: string }
// Motorista ganha: veiculoAtualId: string | null; terceiro: boolean
// Reserva ganha: veiculoId: string | null; linkAcompanhamento: string; linkExpiraEm: Date | null
// OperacionalData ganha: veiculos: Veiculo[]
export function carroDoServico(reserva: Reserva, motorista: Motorista | undefined, veiculos: Veiculo[]): Veiculo | null
export function descreverCarro(v: Veiculo): string          // "Corolla Prata · RUH7G45"; cor vazia → "Corolla · cor não cadastrada · RUH7G45"
export function mensagemCliente(i: { motorista: string; carro: Veiculo | null; link: string | null }): string
export function linkValido(reserva: Reserva, now: Date): string | null
```
- [ ] **Step 1: Teste que falha**
```ts
import { describe, expect, it } from 'vitest'
import { carroDoServico, descreverCarro, linkValido, mensagemCliente } from './carro'
import type { Motorista, Reserva, Veiculo } from './types'

const ruh: Veiculo = { id: 'v1', placa: 'RUH7G45', modelo: 'Corolla', cor: 'Prata' }
const fcb: Veiculo = { id: 'v2', placa: 'FCB8B61', modelo: 'Compass', cor: 'PRETA' }
const motorista: Motorista = { id: 'm1', nome: 'João da Silva', apelido: 'João', celular: '', veiculoAtualId: 'v1', terceiro: false }
const base = { statusValue: 202410005, status: 'Programado', veiculoId: null, linkAcompanhamento: '', linkExpiraEm: null } as unknown as Reserva

describe('carroDoServico', () => {
  it('antes de concluir usa o carro atual do motorista', () => {
    expect(carroDoServico(base, motorista, [ruh, fcb])).toEqual(ruh)
  })
  it('depois de concluir usa o carro gravado no serviço', () => {
    const concluida = { ...base, statusValue: 202410008, status: 'Concluído', veiculoId: 'v2' }
    expect(carroDoServico(concluida, motorista, [ruh, fcb])).toEqual(fcb)
  })
  it('sem motorista ou sem carro devolve null', () => {
    expect(carroDoServico(base, undefined, [ruh])).toBeNull()
    expect(carroDoServico(base, { ...motorista, veiculoAtualId: null }, [ruh])).toBeNull()
  })
})

describe('descreverCarro', () => {
  it('modelo, cor e placa; caixa alta suavizada', () => {
    expect(descreverCarro(ruh)).toBe('Corolla Prata · RUH7G45')
    expect(descreverCarro(fcb)).toBe('Compass Preta · FCB8B61')
    expect(descreverCarro({ ...ruh, cor: '' })).toBe('Corolla · cor não cadastrada · RUH7G45')
  })
})

describe('mensagemCliente', () => {
  it('monta o texto do WhatsApp', () => {
    expect(mensagemCliente({ motorista: 'João', carro: ruh, link: 'https://l/r/x' })).toBe(
      '*Seu motorista:* João\n• *Carro:* Corolla Prata\n• *Placa:* RUH7G45\n• *Acompanhe:* https://l/r/x')
  })
  it('omite carro e link ausentes', () => {
    expect(mensagemCliente({ motorista: 'João', carro: null, link: null })).toBe('*Seu motorista:* João')
  })
})

describe('linkValido', () => {
  it('só devolve link não expirado', () => {
    const now = new Date('2026-10-13T12:00:00Z')
    expect(linkValido({ ...base, linkAcompanhamento: 'https://l', linkExpiraEm: new Date('2026-10-13T13:00:00Z') }, now)).toBe('https://l')
    expect(linkValido({ ...base, linkAcompanhamento: 'https://l', linkExpiraEm: new Date('2026-10-13T11:00:00Z') }, now)).toBeNull()
  })
})
```
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3: Implementação `domain/carro.ts`**
```ts
import type { Motorista, Reserva, Veiculo } from './types'

const STATUS_CONCLUIDO = 202410008

const suavizar = (t: string) =>
  t.length > 3 && t === t.toUpperCase() && t !== t.toLowerCase() ? t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase()) : t

const nomeDoCarro = (v: Veiculo) => [v.modelo, v.cor].map((p) => suavizar(p.trim())).filter(Boolean).join(' ')

/** Antes de concluir: carro atual do motorista. Depois: carro gravado no serviço (o do faturamento). */
export function carroDoServico(reserva: Reserva, motorista: Motorista | undefined, veiculos: Veiculo[]): Veiculo | null {
  const id = reserva.statusValue === STATUS_CONCLUIDO ? reserva.veiculoId : motorista?.veiculoAtualId
  return (id && veiculos.find((v) => v.id === id)) || null
}

export function descreverCarro(v: Veiculo) {
  const cor = v.cor.trim() ? '' : ' · cor não cadastrada'
  return `${nomeDoCarro(v) || v.modelo}${cor} · ${v.placa}`
}

export function mensagemCliente({ motorista, carro, link }: { motorista: string; carro: Veiculo | null; link: string | null }) {
  const linhas = [`*Seu motorista:* ${motorista}`]
  if (carro) linhas.push(`• *Carro:* ${nomeDoCarro(carro) || carro.modelo}`, `• *Placa:* ${carro.placa}`)
  if (link) linhas.push(`• *Acompanhe:* ${link}`)
  return linhas.join('\n')
}

export function linkValido(reserva: Reserva, now: Date) {
  return reserva.linkAcompanhamento && reserva.linkExpiraEm && reserva.linkExpiraEm > now ? reserva.linkAcompanhamento : null
}
```
  e os campos novos em `types.ts`.
- [ ] **Step 4:** vitest → PASS (ajustar `mock.ts`/`fixtures.ts` para os campos novos até o `tsc` passar: `pnpm --filter @betinhos/shell exec tsc --noEmit`).
- [ ] **Step 5:** commit `feat(operacional): domínio do carro do serviço e da mensagem ao cliente`.

### Task 12: Dados, ações e tela

**Files:** Modify `data/queries.ts`, `data/source.ts`, `data/mock.ts`, `components/ServiceDetail.tsx`, `OperacionalPage.tsx`; Test `data/data.test.ts`, `components/ServiceDetail.test.tsx` (novo)

**Interfaces — Consumes:** Task 11. **Produces:** `Source.gerarLink(reservaId: string): Promise<{ ok: true; link: string; expiraEm: string } | { ok: false; erro: string }>`.

- [ ] **Step 1: Testes que falham**
  - `data.test.ts`: `mapReserva` lê `_cr40f_veiculo_value` em `veiculoId`, `new_linkacompanhamento` e `new_linkacompanhamentoexpiraem`; `mapMotorista` lê `_cr40f_veiculoatual_value` e `cr40f_tipodevinculo === 1` em `terceiro`; `loadOperacional` pede `cr40f_veiculos?$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo,cr40f_cor&$filter=statecode eq 0` e preenche `veiculos` (falha → `warnings`, lista vazia).
  - `ServiceDetail.test.tsx` (`// @vitest-environment jsdom`, padrão do `Copiar.test.tsx`): mostra "Corolla Prata · RUH7G45"; clicar "Copiar para o cliente" chama `navigator.clipboard.writeText` com o texto da `mensagemCliente`; motorista terceiro → botão "Gerar link" desativado com o título "Motorista terceiro sem rastreador"; clicar "Gerar link" chama `onGerarLink` e, com `{ ok: false, erro }`, mostra o erro em toast.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3: Implementação**
  - `queries.ts`: `EXTRA` ganha `'new_linkacompanhamento', 'new_linkacompanhamentoexpiraem'`; `mapReserva` ganha `veiculoId: id(row._cr40f_veiculo_value)`, `linkAcompanhamento: String(row.new_linkacompanhamento ?? '')`, `linkExpiraEm: row.new_linkacompanhamentoexpiraem ? new Date(String(row.new_linkacompanhamentoexpiraem)) : null`; select dos funcionários ganha `_cr40f_veiculoatual_value,cr40f_tipodevinculo`; `mapMotorista` ganha `veiculoAtualId: id(row._cr40f_veiculoatual_value)`, `terceiro: Number(row.cr40f_tipodevinculo) === 1`; `ENTITIES.veiculo = 'cr40f_veiculos'` e `loadVeiculos(client, entitySet, warnings)` no `Promise.all` do `loadOperacional`.
  - `source.ts`: `Source.gerarLink`. Dataverse:
```ts
    async gerarLink(reservaId) {
      const r = await host.client.request<{ new_LinkJson?: string }>('new_GerarLinkAcompanhamento', {
        method: 'POST',
        body: JSON.stringify({ new_ReservaId: reservaId }),
      })
      return JSON.parse(r.new_LinkJson ?? '{"ok":false,"erro":"Resposta vazia."}')
    },
```
   Mock: `async gerarLink(id) { await wait(500); return { ok: true, link: \`https://acompanhar-motorista.example/r/${'0'.repeat(64)}\`, expiraEm: new Date(Date.now() + 4 * 3600e3).toISOString() } }` e grava o link no `data` do mock.
  - `ServiceDetail.tsx`: novas props `veiculos: Veiculo[]`, `onGerarLink: () => Promise<{ ok: boolean; link?: string; erro?: string }>`. Logo abaixo de `<Info label="Veículo">`, acrescentar `<Info label="Carro">{carro ? descreverCarro(carro) : 'Carro não informado'}</Info>` e, na barra do detalhe, dois botões `variant="secondary"`: "Copiar para o cliente" (ícone `Copy`, usa `copyText` de `pagantes/components/QuickActions` e `useToast`) e "Gerar link" (ícone `MapPin`, `disabled={motorista?.terceiro}`, `title` com o motivo, estado de carregamento com `aria-busy`). Depois de gerar, o toast mostra "Link gerado." e copia a mensagem completa.
  - `OperacionalPage.tsx` (L149): passar `veiculos={op.data?.veiculos ?? []}` e `onGerarLink={() => source.gerarLink(r.id).then((res) => { if (res.ok) void op.refresh(); return res })}` (usar o nome real da função de recarga da página).
- [ ] **Step 4:** vitest e `tsc` → PASS. `pnpm dev` (porta já reservada do shell, `36472`) e conferir no mock: carro no detalhe, cópia e link.
- [ ] **Step 5:** commit `feat(operacional): carro do serviço, mensagem ao cliente e link de acompanhamento`.

## Parte E — Skill, publicação e validação

### Task 13: Documentação do Assistente Betinhos

**Files:** `Skill Agendamento/skill-ajustada/Betinhos-Skill-Assistente/references/campos.md` (L12), `programacao.md` (L41), `rastreamento.md` (L26, L44), `funcionarios.md` (L25)

- [ ] **Step 1:** `campos.md`: trocar a linha de `new_veiculoreal` por "`new_veiculoreal` | Obsoleto. Nunca leia nem grave; o carro usado fica em `cr40f_veiculo` após a finalização". `programacao.md` L41: manter "não envie `new_veiculoreal`" e acrescentar que o carro da reserva é gravado na finalização pela Infleet.
- [ ] **Step 2:** `rastreamento.md`: "Qual carro está indo" = `cr40f_veiculoatual` (modelo, cor, placa) do motorista da reserva; motorista terceiro informa no app. Link: preferir a Custom API `new_GerarLinkAcompanhamento` (`new_ReservaId`) pelo MCP do Dataverse; a ferramenta `link_acompanhamento` continua como alternativa.
- [ ] **Step 3:** `funcionarios.md` L25: `cr40f_veiculoatual` = carro com o motorista agora (Infleet a cada 5 min para próprios; app para terceiros); `new_veiculoatualdesde`, `new_origemveiculoatual`.
- [ ] **Step 4:** a pasta não é git: copiar os arquivos alterados também para o pacote `.skill` conforme o processo usado no projeto (perguntar ao Renan se deve reempacotar `assistente-betinhos.skill`).

### Task 14: Publicação e validação no DEV

- [ ] **Step 1:** App Motoristas: `npm run push -- -DeviceCode` **sem** publicar a Tela Funções Operacionais se aquele checkout estiver sujo (usar o script escopado da sessão anterior: backup, testes, `deploy-webresource.ps1`, `register-driver-record-sharing-plugin-webapi.ps1`, `provision-infleet-vehicle.ps1`, `provision-current-vehicle.ps1`, backup final). Anotar a versão publicada.
- [ ] **Step 2:** executar `new_SincronizarVeiculoAtual` pelo MCP `Dataverse_DEV` (`invoke_api`) e conferir o resumo; conferir `cr40f_veiculoatual` de quem bipou hoje (`listVehicleDriverHistories` do dia) contra o Dataverse.
- [ ] **Step 3:** cadastro automático: escolher uma placa da Infleet ausente no DEV (comparar `listVehicles` com `cr40f_veiculos`); rodar a sincronização; conferir o carro criado (marca, modelo, anos, propriedade, observação "falta cor").
- [ ] **Step 4:** ativar o flow e conferir duas execuções seguidas com sucesso no histórico.
- [ ] **Step 5:** terceiro: em um funcionário Terceiro do DEV, vincular dois carros (categoria Terceiro, `cr40f_motoristaatual`), trocar pelo app (Renan) e conferir na Operacional; finalizar um serviço dele sem diálogo.
- [ ] **Step 6:** Operacional (`pnpm push` do Sistema Betinhos): abrir um serviço de motorista próprio, conferir "Carro", "Copiar para o cliente" e "Gerar link"; abrir o link e ver a página com placa, modelo e cor.
- [ ] **Step 7:** limpar dados de teste com autorização do Renan; registrar versões publicadas.

## Autorrevisão

- Cobertura da spec: carro atual (T2–T4, T7), terceiro (T8–T9), cadastro automático (T1, T4, T5), Operacional (T11–T12), link (T6, T10, T12), assistente (T13), erros (T4 resumo, T6 mensagens, T10 status), testes DEV (T14). Pré-requisitos de dados (categorias dos 24 carros, vínculo de terceiros) ficam na T14 Step 5 e na nota da spec.
- Nomes conferidos entre tarefas: `InfleetVehicleInfo`, `VehicleRegistrar.BuildNewVehicle`, `CurrentVehicleSyncPlanner.Plan/DriverVehicle/Employee/Change/SyncPlan`, `IInfleetGateway.ListDriverCurrentVehicles/FindVehicleByPlate`, `ServiceVehicleResolver.Input.RegisterMissing`, `TrackingLinkRequest.Build`, `new_LinkJson`, `rotaApiLinks`, `Source.gerarLink`, `carroDoServico/descreverCarro/mensagemCliente/linkValido`, `thirdPartyResolution`, `isThirdPartyDriver/buildCurrentVehiclePatch/loadMyVehiclesRemote/setMyCurrentVehicleRemote`.
- Pontos a confirmar na execução (com comando indicado na própria tarefa): nome da navegação `cr40f_VeiculoAtual` (T8) e nome da função de recarga da Operacional (T12).
