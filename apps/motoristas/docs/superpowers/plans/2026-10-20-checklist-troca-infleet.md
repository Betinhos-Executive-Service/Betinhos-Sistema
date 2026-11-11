# Checklist na troca de carro detectada pela Infleet — plano de implementação (entrega 2 de 3)

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** quando a sincronização Infleet troca o carro atual de um motorista para um carro da frota própria, quem **recebe** ganha na hora um checklist de origem "Troca", com "entregue por" vindo do histórico de motorista da Infleet.

**Arquitetura:** um step **assíncrono** novo (`HandoverChecklistPlugin`) no Update de `cr40f_funcionarios.cr40f_veiculoatual`, com pré-imagem, decide criar ou ignorar e usa a `ChecklistFactory` (extraída do `ChecklistCommandPlugin`) para criar, atribuir e disparar o push. O "entregue por" vem de `InfleetGraphQlGateway.PreviousDriver`, que consulta `listVehicleDriverHistories` e escolhe o motorista com uma regra pura (`VehicleHandover.PickPrevious`). O App Motoristas e a Gestão leem duas colunas novas e a opção nova de origem.

**Stack:** C# (.NET Framework 4.6.2, plugin Dataverse, xUnit), TypeScript/React (Vite single-file, `node --test`), PowerShell (Web API), Power Automate (definição gerada por script).

**Spec:** `docs/superpowers/specs/2026-10-20-checklist-troca-infleet-design.md` (autoridade). Formato e nomes seguem o plano da entrega 1 (`docs/superpowers/plans/2026-10-20-checklist-ok-nao-ok.md`). A entrega 3 (`2026-10-20-checklist-padroes-gestao-design.md`) depende desta.

## Conferido na metadata do DEV e na Infleet (20/10/2026)

- `new_checklistveiculo` hoje: `new_origem` com só `100000000=Quinzenal` e `100000001=Manual`; **não existem** `new_entreguepor` nem `new_trocadetectadaem`. Lookups existentes: `new_motorista`, `new_veiculo`, `new_modelo`. Também existem `new_chaveunica` (chave alternativa), `new_solicitadoem`, `new_estado`, `new_motivocancelamento`, `new_canceladoem`, `new_pushstatus`, `new_temproblema`, `new_qtdproblemas`.
- `cr40f_funcionarios`: `cr40f_veiculoatual` (Lookup), `new_veiculoatualdesde` (DateTime), `new_origemveiculoatual` (Picklist: `100000000=Infleet`, `100000001=Motorista`, `100000002=Operação`), `new_infleetdriverid` (String), `cr40f_emailmicrosoft`, `cr40f_nomecompleto`, `cr40f_status`, `cr40f_tipodevinculo`.
- `cr40f_veiculos`: `new_categoriadoveiculo` (`100000000=Próprio`, `100000001=Terceiro`, `100000002=Aluguel`), `new_propriedade` (`100000000=Proprio`, `100000001=Alugado`), `new_infleetvehicleid` (String), `cr40f_placa`, `cr40f_statusdoveiculo` (ativo = `202410001`). Dos 17 ativos, 14 têm categoria Próprio e só 9 têm `new_propriedade` = Próprio; os 14 próprios têm `new_infleetvehicleid` preenchido.
- Steps atuais em `cr40f_funcionarios`: só `DriverRecordSharing - Funcionarios Create/Update` (síncronos, filtro `cr40f_emailmicrosoft`). Nenhum step reage a `cr40f_veiculoatual` hoje.
- Infleet `listVehicleDriverHistories(filter: ListVehicleDriverHistoriesFilterInput, limit, offset)`: filtro aceita `vehicleId`, `startedAt`, `endedAt`, `categories`, `tokenId`, `context`. Cada item traz `driverId`, `occurredAt`, `createdAt`, `category`. A consulta com `categories:[VEHICLE_TOKEN_USED, VEHICLE_DRIVER_RECOGNIZED, FACE_ID_DETECTED, BLUETOOTH_VEHICLE_DRIVER_ADDED, MANUAL_VEHICLE_DRIVER_ADDED]` funcionou e voltou em ordem decrescente; num carro real apareceu a troca de um motorista para outro em 16/10.

## Decisões deste plano (onde a spec precisava de detalhe)

1. **Frota própria = `new_categoriadoveiculo` = Próprio (`100000000`)**, ativo (`statecode = 0`) e `cr40f_statusdoveiculo = 202410001`. A spec cita `new_propriedade`, mas diz "como no quinzenal", e o quinzenal (`ChecklistCommandPlugin.Process`) e a Gestão usam a categoria. Com `new_propriedade`, 5 carros próprios ficariam de fora no DEV. No PROD (consulta somente leitura em 20/10/2026), `new_propriedade` está **vazia em todos os 28 veículos ativos**, e a categoria está preenchida (16 Próprio, 8 Terceiro, 4 Aluguel). Com `new_propriedade`, nenhum carro do PROD teria checklist de troca. Decisão do Renan (20/10/2026): `new_propriedade` é legado; use **só** `new_categoriadoveiculo` e não leia `new_propriedade` em nenhuma parte desta entrega.
2. **Só mudança com origem Infleet:** o plugin ignora o Update quando o `Target` não traz `new_origemveiculoatual = 100000000`. A sincronização grava os três campos no mesmo patch (`SyncCurrentVehiclePlugin.cs:51-54`); a escolha manual do motorista e a da operação não geram checklist de troca.
3. **Motorista anterior:** histórico do veículo nos últimos **7 dias**, até 200 eventos de identificação. Regra (`VehicleHandover.PickPrevious`):
   - o primeiro `driverId` diferente do recebedor, do mais recente para o mais antigo → **Encontrado**;
   - há eventos, mas todos do recebedor → **Mesmo motorista** → não cria (o carro não mudou de mãos);
   - sem eventos, recebedor sem `new_infleetdriverid` ou Infleet fora → **Não identificado** → cria com "entregue por" vazio.
   Confirmado com o Renan (20/10/2026): quem fica com o carro, sem troca, segue só no checklist quinzenal.
   O `driverId` encontrado vira funcionário por `new_infleetdriverid` (um único ativo); sem correspondência, fica vazio.
4. **Janela de 2 h:** procura checklist de troca com o mesmo veículo e recebedor solicitado nas últimas 2 h, pelo prefixo da `new_chaveunica` (`{veiculo}:T:{recebedor}:`), em qualquer estado. Não depende de `new_motorista`, que fica vazio quando a atribuição falha.
5. **Chave única da troca:** `{veiculoId}:T:{funcionarioId}:{yyyyMMddHHmm UTC}` (88 caracteres; limite 120).
6. **Atribuição direta ao recebedor**, não pela regra "quem pegou por último" (`CurrentDriver`). Se o recebedor não tiver usuário Microsoft único ativo, o checklist fica "Aguardando motorista" com `new_erroatribuicao` (mesma mensagem de hoje). Na rotina diária e no "Reatribuir", o checklist de troca **com motorista definido** não é reatribuído a outra pessoa; um checklist de troca que nunca foi atribuído segue a regra normal.
7. **Falha da Infleet não impede o checklist** (spec: "se não der para identificar, cria assim mesmo"). Falta de modelo padrão faz o job assíncrono falhar com a mensagem atual do `LoadTemplate`, e isso fica no log do sistema.
8. **Push:** o flow existente (`Flow Push Checklist | Motoristas`, gerado por `scripts/provision-checklist-flows.ps1`) passa a escolher o texto pela origem. Na troca: "Você recebeu o carro {placa}. Faça o checklist de recebimento.", com a placa vinda do valor formatado de `_new_veiculo_value`. Nos outros casos, o texto atual.
9. **Gestão, filtro por origem (decidido pelo Renan em 20/10/2026):** o filtro da lista de checklists ganha um quinto botão, **"Trocas"**, depois de "Cancelados" e antes de "Todos": Abertos · Enviados · Cancelados · Trocas · Todos. "Trocas" mostra todos os checklists de origem Troca, em qualquer estado, com a contagem no botão como os outros. A busca também passa a casar o nome de quem entregou. O rótulo "Troca" aparece na coluna, na mesma linha onde hoje aparecem "Quinzenal" e "Solicitado".

## Restrições globais

- Valor da choice: `new_origem` **`100000002` "Troca"**. Constantes: C# `ChecklistFactory.Troca = 100000002`; TS `CHECKLIST_ORIGEM.troca = 100000002`.
- Colunas: `new_entreguepor` (lookup para `cr40f_funcionarios`, opcional; relacionamento `new_cr40f_funcionarios_EntreguePor_new_checklistveiculo`) e `new_trocadetectadaem` (data e hora, comportamento UserLocal).
- Textos exatos: push `Você recebeu o carro {placa}. Faça o checklist de recebimento.`; motivo do cancelamento `Substituído pelo checklist da troca`; card do app `RECEBIMENTO DO CARRO` e `Veículo {placa} · entregue por {nome}`, ou `entregue por: não identificado`; Gestão `Troca`, `Entregue por`, `Troca detectada pela Infleet`.
- Janelas: 2 h para duplicidade e 7 dias de histórico Infleet, com limite de 200 eventos.
- Step: `Update` de `cr40f_funcionarios`, PostOperation (stage 40), **assíncrono** (mode 1, `asyncautodelete = true`), filtro `cr40f_veiculoatual`, pré-imagem `pre` com `cr40f_veiculoatual`, configuração segura com o mesmo `INFLEET_TOKEN` do `SyncCurrentVehiclePlugin`.
- Compatibilidade: checklists antigos sem `new_entreguepor`/`new_trocadetectadaem` continuam válidos; `entreguePorNome` vazio e `trocaDetectadaEm` nulo.
- Publicação no DEV só a partir da `main`, no checkout principal, com a branch do plugin sincronizada com `origin/main` (o assembly `DriverRecordSharing` é único). Ordem: plugin → schema/step (`provision-checklists.ps1`) → flow de push → App Motoristas → Gestão.
- Antes de cada PR: `qualidade-antes-do-pr` e `verificacao-manter` (skills `verificar-checklists-backend`, `verificar-checklists-app` e a de verificação da Gestão).
- Nada nesta entrega escreve em PROD.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `plugins/DriverRecordSharing/ChecklistFactory.cs` (novo) | modelo padrão, snapshot dos itens, criação, atribuição (atual e direta), push pendente, cancelamento por troca |
| `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs` | passa a usar a `ChecklistFactory`; Custom APIs sem mudança de contrato |
| `plugins/DriverRecordSharing/VehicleHandover.cs` (novo) | regra pura: `PickPrevious`, chave única, constantes da troca |
| `plugins/DriverRecordSharing/InfleetGateway.cs` | `IVehicleHistoryGateway` e `InfleetGraphQlGateway.PreviousDriver` |
| `plugins/DriverRecordSharing/HandoverChecklistPlugin.cs` (novo) | step assíncrono: filtros, entregador, cancelamento do pendente, criação |
| `plugins/DriverRecordSharing.Tests/ChecklistFakeService.cs` (novo) | `FakeService` hoje aninhado no teste do checklist, agora compartilhado |
| `plugins/DriverRecordSharing.Tests/HandoverChecklistPluginTests.cs` (novo) | decisão de criar/ignorar, entregador, janela, cancelamento |
| `plugins/DriverRecordSharing.Tests/VehicleHandoverTests.cs` (novo) | `PickPrevious` |
| `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs` | troca conta como vistoria; rotina não reatribui troca |
| `scripts/lib/infleet-token.ps1` (novo) | `Find-InfleetEnv` e `Read-InfleetToken`, hoje em `provision-current-vehicle.ps1` |
| `scripts/provision-current-vehicle.ps1` | passa a importar `lib/infleet-token.ps1` (sem mudança de comportamento) |
| `scripts/provision-checklists.ps1` | opção Troca, colunas, relacionamento, PluginType e step assíncrono com pré-imagem e token |
| `scripts/provision-checklist-flows.ps1` | texto do push pela origem |
| `scripts/smoke-checklists-dev.ps1` | confere step, schema e (com `-SimularTroca`) a troca de ponta a ponta no DEV |
| `src/lib/checklists.ts`, `src/components/checklists/ChecklistAgendaCard.tsx`, `tests/checklists.test.ts` | origem Troca, colunas novas, texto do card |
| Gestão: `src/lib/gestaoChecklists.ts`, `src/gestao/GestaoChecklists.tsx`, `src/gestao/gestao.css`, `tests/gestaoChecklists.test.ts` | rótulo, botão "Trocas" no filtro, busca, detalhe com "Entregue por" e horário da troca |
| `.claude/skills/verificar-checklists-backend/SKILL.md`, `.claude/skills/verificar-checklists-app/SKILL.md` | roteiros novos |

---

### Tarefa 1: `ChecklistFactory` (refatoração sem mudança de comportamento)

**Arquivos:** criar `plugins/DriverRecordSharing/ChecklistFactory.cs`; modificar `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs` (constantes `:15-34`, `LoadTemplate` `:129-147`, `TemplateItems` `:149-179`, `CreateChecklist` `:181-196`, `AssignCurrentDriver`/`CurrentDriver` `:257-334`); testes em `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs` e novo `ChecklistFakeService.cs`.

**Interfaces produzidas (todas `public static` em `ChecklistFactory`):**
- Constantes: `TemplateTable`, `TemplateItemTable`, `ChecklistTable`, `VehicleTable`, `DriverTable`; `Quinzenal = 100000000`, `Manual = 100000001`, `Troca = 100000002`; `AguardandoMotorista`, `Pendente`, `Concluido`, `Cancelado`; `PushPendente`, `PushEnviado`, `PushFalhou`; `VeiculoAtivo = 202410001`, `VeiculoProprio = 100000000`.
- `Entity LoadTemplate(IOrganizationService system, Guid? templateId)`
- `Guid CreateChecklist(IOrganizationService system, Entity vehicle, Entity template, int origin, DateTime now, Guid requestedBy, string uniqueKey, IDictionary<string, object> extra = null)`
- `bool AssignCurrentDriver(IOrganizationService system, Guid checklistId)` (comportamento atual)
- `bool AssignDriver(IOrganizationService system, Guid checklistId, Guid driverId)` (atribuição direta, usada na troca)
- `bool IsOpen(Entity checklist)`, `bool IsOwnActiveVehicle(Entity vehicle)`

- [ ] **Passo 1: Mover o `FakeService` para um arquivo próprio**

Recorte a classe aninhada `FakeService` de `ChecklistCommandPluginTests.cs` (linhas ~441-580) para `plugins/DriverRecordSharing.Tests/ChecklistFakeService.cs`, como `internal sealed class ChecklistFakeService : IOrganizationService`, no mesmo namespace. Copie para ela as constantes que usa (`Foto`, `Numero`, `Texto`, `OkNok`). No topo de `ChecklistCommandPluginTests.cs`:

```csharp
using FakeService = Betinhos.DriverRecordSharing.Tests.ChecklistFakeService;
```

Inclua no fake, ainda nesta tarefa, o que as Tarefas 2 e 3 usam:

```csharp
// Vehicle: id Infleet previsível para os testes da troca.
public Entity Vehicle(string plate, bool proprio = true, int? hodometro = null) => Add(new Entity("cr40f_veiculos")
{
    ["cr40f_hodometro"] = hodometro,
    ["cr40f_placa"] = plate,
    ["cr40f_statusdoveiculo"] = new OptionSetValue(202410001),
    ["new_categoriadoveiculo"] = new OptionSetValue(proprio ? 100000000 : 100000001),
    ["new_infleetvehicleid"] = "inf-" + plate
});

public Entity Driver(string name, string email, Entity vehicle, DateTime? since, string infleetDriverId = null) => Add(new Entity("cr40f_funcionarios")
{
    ["cr40f_nomecompleto"] = name,
    ["cr40f_emailmicrosoft"] = email,
    ["cr40f_veiculoatual"] = vehicle?.ToEntityReference(),
    ["new_veiculoatualdesde"] = since,
    ["new_infleetdriverid"] = infleetDriverId,
    ["cr40f_status"] = 0,
    ["cr40f_tipodevinculo"] = 0
});
```

No `RetrieveMultiple` do fake, um `case` novo para o prefixo da chave única:

```csharp
case ConditionOperator.Like:
    return Convert.ToString(Value(row, condition.AttributeName), CultureInfo.InvariantCulture)?
        .StartsWith(Convert.ToString(condition.Values[0], CultureInfo.InvariantCulture).TrimEnd('%'), StringComparison.Ordinal) == true;
```

Use o nome real do helper que o fake já usa para ler o valor da linha (o mesmo dos `case Equal`/`GreaterThan`).

- [ ] **Passo 2: `Invoke` dos testes procura também na fábrica**

```csharp
private static void Invoke(string method, params object[] args)
{
    var flags = BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public;
    var target = typeof(ChecklistCommandPlugin).GetMethod(method, flags) ?? typeof(ChecklistFactory).GetMethod(method, flags);
    target.Invoke(null, args);
}
```

Como `AssignCurrentDriver` passa a ser público e lança a exceção direto (sem `TargetInvocationException`), confira que nenhum teste de `AssignCurrentDriver` usa `AssertPluginError`. Hoje nenhum usa.

- [ ] **Passo 3: Rodar a suíte antes de mexer no plugin**

```bash
cd plugins/DriverRecordSharing.Tests && dotnet test --filter "FullyQualifiedName~ChecklistCommandPluginTests" -v q
```

Esperado: `Com falha: 0` (só mudou o lugar do fake). Em worktree, copie antes a `DriverRecordSharing.snk` do checkout principal (veja `verificar-checklists-backend`).

- [ ] **Passo 4: Criar `ChecklistFactory.cs`**

Mova para lá, **sem mudar a lógica**, `LoadTemplate`, `TemplateItems`, `CreateChecklist`, `AssignCurrentDriver`, `CurrentDriver`, `Since`, `Choice`, `Limit`, `BrazilDate`, `IsOpen` e as constantes. Mudanças além do lugar:

```csharp
public static Guid CreateChecklist(IOrganizationService system, Entity vehicle, Entity template, int origin, DateTime now, Guid requestedBy, string uniqueKey, IDictionary<string, object> extra = null)
{
    // ...corpo atual até montar `checklist`...
    if (extra != null) foreach (var pair in extra) checklist[pair.Key] = pair.Value;
    return system.Create(checklist);
}

public static bool IsOwnActiveVehicle(Entity vehicle) =>
    vehicle.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0
    && Choice(vehicle, "cr40f_statusdoveiculo") == VeiculoAtivo
    && Choice(vehicle, "new_categoriadoveiculo") == VeiculoProprio;
```

Divida `CurrentDriver` em duas partes, para a atribuição direta reaproveitar a busca do usuário:

```csharp
// Usuário Microsoft único e ativo do funcionário; null com o motivo em `error`.
public static Entity UserForDriver(IOrganizationService system, Entity driver, out string error)
{
    var email = (driver.GetAttributeValue<string>("cr40f_emailmicrosoft") ?? "").Trim();
    var name = driver.GetAttributeValue<string>("cr40f_nomecompleto");
    if (email.Length == 0) { error = "Motorista " + name + " sem e-mail Microsoft."; return null; }
    var users = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("systemuserid") };
    users.Criteria.AddCondition("internalemailaddress", ConditionOperator.Equal, email);
    users.Criteria.AddCondition("isdisabled", ConditionOperator.Equal, false);
    var found = system.RetrieveMultiple(users).Entities;
    if (found.Count != 1) { error = "Motorista " + name + " sem usuário Microsoft único ativo."; return null; }
    error = "";
    return found[0];
}
```

`CurrentDriver` continua escolhendo o funcionário (lista vazia, empate) e chama `UserForDriver`. A parte final de `AssignCurrentDriver` (a partir de `update["new_erroatribuicao"] = ""`) vira:

```csharp
private static bool ApplyAssignment(IOrganizationService system, Entity checklist, Entity update, Entity driver, Entity user)
{
    update["new_erroatribuicao"] = "";
    var current = checklist.GetAttributeValue<EntityReference>("new_motorista");
    if (Choice(checklist, "new_estado") == Pendente && current != null && current.Id == driver.Id)
    {
        system.Update(update);
        return false;
    }
    update["new_motorista"] = new EntityReference(DriverTable, driver.Id);
    update["ownerid"] = new EntityReference("systemuser", user.Id);
    update["new_estado"] = new OptionSetValue(Pendente);
    update["new_atribuidoem"] = DateTime.UtcNow;
    update["new_pushstatus"] = new OptionSetValue(PushPendente);
    update["new_pusherro"] = "";
    system.Update(update);
    return true;
}

public static bool AssignDriver(IOrganizationService system, Guid checklistId, Guid driverId)
{
    var checklist = system.Retrieve(ChecklistTable, checklistId, new ColumnSet("new_estado", "new_motorista", "new_veiculo"));
    if (!IsOpen(checklist)) return false;
    var update = OdometerUpdate(system, checklist);
    var driver = system.Retrieve(DriverTable, driverId, new ColumnSet("cr40f_nomecompleto", "cr40f_emailmicrosoft"));
    var user = UserForDriver(system, driver, out var error);
    if (user == null)
    {
        update["new_erroatribuicao"] = Limit(error, 500);
        system.Update(update);
        return false;
    }
    return ApplyAssignment(system, checklist, update, driver, user);
}
```

`OdometerUpdate` é o trecho atual que lê `cr40f_hodometro` do veículo e devolve o `Entity` de update com `new_odometroinfleet`, usado também por `AssignCurrentDriver`.

- [ ] **Passo 5: `ChecklistCommandPlugin` usa a fábrica**

Troque as chamadas por `ChecklistFactory.LoadTemplate`, `ChecklistFactory.CreateChecklist`, `ChecklistFactory.AssignCurrentDriver`, `ChecklistFactory.IsOpen`, `ChecklistFactory.Manual`, `ChecklistFactory.Quinzenal` etc. Mantenha no plugin só o que é dele: roteamento das mensagens, `Request`, `Process`, `RequestAssignment`, `ChecklistForCaller`, `Conclude`, `Cancel`, `RetryPush` e as travas. As fotos (`PhotoTable`) continuam no plugin.

- [ ] **Passo 6: Suíte inteira**

```bash
cd plugins/DriverRecordSharing.Tests && dotnet test -v q
```

Esperado: `Com falha: 0`, com o mesmo número de testes de antes.

- [ ] **Passo 7: Commit** — `refactor: extrai ChecklistFactory do ChecklistCommandPlugin para reuso na troca`

---

### Tarefa 2: Motorista anterior pela Infleet (regra pura + gateway)

**Arquivos:** criar `plugins/DriverRecordSharing/VehicleHandover.cs` e `plugins/DriverRecordSharing.Tests/VehicleHandoverTests.cs`; modificar `plugins/DriverRecordSharing/InfleetGateway.cs`.

**Interfaces produzidas:**

```csharp
public sealed class DriverHistoryEntry { public DriverHistoryEntry(string driverId, DateTime occurredAtUtc); public string DriverId { get; } public DateTime OccurredAtUtc { get; } }
public enum PreviousDriverKind { Found, SameDriver, Unknown }
public sealed class PreviousDriverResult { public PreviousDriverKind Kind { get; } public string InfleetDriverId { get; } public static readonly PreviousDriverResult Unknown; public static readonly PreviousDriverResult SameDriver; public static PreviousDriverResult Found(string infleetDriverId); }
public interface IVehicleHistoryGateway { PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc); }
public static class VehicleHandover { LookbackDays = 7; DedupeHours = 2; CancelReason; PickPrevious(...); UniqueKeyPrefix(...); UniqueKey(...) }
```

- [ ] **Passo 1: Testes que falham** (`VehicleHandoverTests.cs`)

```csharp
using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleHandoverTests
    {
        private static readonly DateTime T0 = new DateTime(2026, 10, 16, 12, 0, 0, DateTimeKind.Utc);
        private static DriverHistoryEntry E(string driver, int minutes) => new DriverHistoryEntry(driver, T0.AddMinutes(minutes));

        [Fact]
        public void AnteriorEhOPrimeiroOutroMotoristaDoMaisRecenteParaOMaisAntigo()
        {
            var result = VehicleHandover.PickPrevious(new[] { E("antigo", -300), E("recebe", 10), E("meio", -60), E("recebe", 0) }, "recebe");
            Assert.Equal(PreviousDriverKind.Found, result.Kind);
            Assert.Equal("meio", result.InfleetDriverId);
        }

        [Fact]
        public void HistoricoSoDoRecebedorEhMesmoMotorista()
        {
            Assert.Equal(PreviousDriverKind.SameDriver, VehicleHandover.PickPrevious(new[] { E("RECEBE", -10), E("recebe", 0) }, "recebe").Kind);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public void SemRecebedorInfleetNaoIdentifica(string receiver)
        {
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new[] { E("outro", 0) }, receiver).Kind);
        }

        [Fact]
        public void SemEventosOuSemDriverIdNaoIdentifica()
        {
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new DriverHistoryEntry[0], "recebe").Kind);
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new[] { E(null, 0), E(" ", -5) }, "recebe").Kind);
        }

        [Fact]
        public void ChaveUnicaDaTrocaTemPrefixoPorVeiculoERecebedor()
        {
            var vehicle = Guid.Parse("11111111-1111-1111-1111-111111111111");
            var receiver = Guid.Parse("22222222-2222-2222-2222-222222222222");
            var key = VehicleHandover.UniqueKey(vehicle, receiver, T0);
            Assert.StartsWith(VehicleHandover.UniqueKeyPrefix(vehicle, receiver), key);
            Assert.Equal("11111111-1111-1111-1111-111111111111:T:22222222-2222-2222-2222-222222222222:202610161200", key);
            Assert.True(key.Length <= 120);
        }
    }
}
```

- [ ] **Passo 2: Rodar e ver falhar** — `dotnet test --filter "FullyQualifiedName~VehicleHandoverTests" -v q` → erro de compilação (`VehicleHandover` não existe).

- [ ] **Passo 3: Implementar `VehicleHandover.cs`**

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    public sealed class DriverHistoryEntry
    {
        public DriverHistoryEntry(string driverId, DateTime occurredAtUtc) { DriverId = driverId; OccurredAtUtc = occurredAtUtc; }
        public string DriverId { get; }
        public DateTime OccurredAtUtc { get; }
    }

    public enum PreviousDriverKind { Found, SameDriver, Unknown }

    public sealed class PreviousDriverResult
    {
        private PreviousDriverResult(PreviousDriverKind kind, string infleetDriverId) { Kind = kind; InfleetDriverId = infleetDriverId; }
        public PreviousDriverKind Kind { get; }
        public string InfleetDriverId { get; }
        public static readonly PreviousDriverResult Unknown = new PreviousDriverResult(PreviousDriverKind.Unknown, null);
        public static readonly PreviousDriverResult SameDriver = new PreviousDriverResult(PreviousDriverKind.SameDriver, null);
        public static PreviousDriverResult Found(string infleetDriverId) => new PreviousDriverResult(PreviousDriverKind.Found, infleetDriverId);
    }

    // Troca de carro detectada pela Infleet: regras sem I/O usadas pelo HandoverChecklistPlugin.
    public static class VehicleHandover
    {
        public const int LookbackDays = 7;
        public const int DedupeHours = 2;
        public const string CancelReason = "Substituído pelo checklist da troca";

        // Quem estava com o carro antes do recebedor: o primeiro outro motorista, do evento mais recente para o mais antigo.
        public static PreviousDriverResult PickPrevious(IEnumerable<DriverHistoryEntry> entries, string receiverInfleetDriverId)
        {
            var receiver = (receiverInfleetDriverId ?? "").Trim();
            var known = (entries ?? Enumerable.Empty<DriverHistoryEntry>())
                .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.DriverId))
                .OrderByDescending(entry => entry.OccurredAtUtc)
                .ToList();
            if (receiver.Length == 0 || known.Count == 0) return PreviousDriverResult.Unknown;
            var other = known.FirstOrDefault(entry => !string.Equals(entry.DriverId.Trim(), receiver, StringComparison.OrdinalIgnoreCase));
            return other == null ? PreviousDriverResult.SameDriver : PreviousDriverResult.Found(other.DriverId.Trim());
        }

        public static string UniqueKeyPrefix(Guid vehicleId, Guid receiverId) => vehicleId.ToString("D") + ":T:" + receiverId.ToString("D") + ":";

        public static string UniqueKey(Guid vehicleId, Guid receiverId, DateTime nowUtc) =>
            UniqueKeyPrefix(vehicleId, receiverId) + nowUtc.ToString("yyyyMMddHHmm", CultureInfo.InvariantCulture);
    }
}
```

- [ ] **Passo 4: Gateway** (`InfleetGateway.cs`)

Depois de `IInfleetGateway`:

```csharp
// Histórico de motorista do veículo (identificações no rastreador), para saber quem entregou o carro.
public interface IVehicleHistoryGateway
{
    PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc);
}
```

A classe passa a ser `public sealed class InfleetGraphQlGateway : IInfleetGateway, IVehicleHistoryGateway` e ganha:

```csharp
private const string IdentificationCategories = "[VEHICLE_TOKEN_USED, VEHICLE_DRIVER_RECOGNIZED, FACE_ID_DETECTED, BLUETOOTH_VEHICLE_DRIVER_ADDED, MANUAL_VEHICLE_DRIVER_ADDED]";

public PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc)
{
    if (string.IsNullOrWhiteSpace(infleetVehicleId)) return PreviousDriverResult.Unknown;
    var data = Execute(
        "query($v:ID,$s:DateTime,$e:DateTime){ h: listVehicleDriverHistories(filter:{vehicleId:$v, startedAt:$s, endedAt:$e, categories:" + IdentificationCategories + "}, limit:200){ vehicleDriverHistories{ driverId occurredAt createdAt } } }",
        new Dictionary<string, object> { ["v"] = infleetVehicleId.Trim(), ["s"] = Iso(atUtc.AddDays(-VehicleHandover.LookbackDays)), ["e"] = Iso(atUtc) });
    var entries = List(Dict(data, "h"), "vehicleDriverHistories").OfType<Dictionary<string, object>>()
        .Select(item => new DriverHistoryEntry(Str(item, "driverId"), Date(Str(item, "occurredAt")) ?? Date(Str(item, "createdAt")) ?? DateTime.MinValue));
    return VehicleHandover.PickPrevious(entries, receiverInfleetDriverId);
}
```

Erros da Infleet continuam saindo como `InfleetUnavailableException` (o `Execute` já faz isso); quem decide o que fazer é o plugin.

- [ ] **Passo 5: Conferir a consulta real (somente leitura)** — no MCP `infleet`, `consultar_graphql` com o mesmo documento e as variáveis `v` = um `new_infleetvehicleid` de carro próprio do DEV, `s`/`e` cobrindo 7 dias. Esperado: lista com `driverId` e `occurredAt` preenchidos, sem `errors`.

- [ ] **Passo 6: Testes** — `dotnet test -v q` → `Com falha: 0`.

- [ ] **Passo 7: Commit** — `feat: motorista anterior do veículo pelo histórico da Infleet`

---

### Tarefa 3: `HandoverChecklistPlugin` (step assíncrono)

**Arquivos:** criar `plugins/DriverRecordSharing/HandoverChecklistPlugin.cs` e `plugins/DriverRecordSharing.Tests/HandoverChecklistPluginTests.cs`; modificar `plugins/DriverRecordSharing/ChecklistFactory.cs` (cancelamento por troca e "não reatribuir troca") e `ChecklistCommandPlugin.cs` (`Process`, `RequestAssignment`).

**Interfaces:**
- Consome: `ChecklistFactory.*` (Tarefa 1), `VehicleHandover.*`, `IVehicleHistoryGateway`, `PreviousDriverResult` (Tarefa 2), `PluginConfig.EmployeeTable`, `PluginConfig.EmployeeCurrentVehicle`, `PluginConfig.EmployeeCurrentVehicleOrigin`, `PluginConfig.EmployeeCurrentVehicleOriginInfleet`, `PluginConfig.EmployeeCurrentVehicleSince`, `PluginConfig.EmployeeInfleetDriverId`, `PluginConfig.VehicleInfleetId`.
- Produz: `HandoverChecklistPlugin(string unsecureConfig, string secureConfig)`; `public static string HandoverChecklistPlugin.Handle(IPluginExecutionContext context, IOrganizationService system, IVehicleHistoryGateway gateway, DateTime now, ITracingService tracing)`, que devolve `"criado:{id}"` ou `"ignorado:{motivo}"`; `ChecklistFactory.CancelOpenForHandover(IOrganizationService system, Guid vehicleId, DateTime now)`; `ChecklistFactory.KeepsReceiver(Entity checklist)`.

- [ ] **Passo 1: Testes que falham** (`HandoverChecklistPluginTests.cs`)

```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class HandoverChecklistPluginTests
    {
        private const int Troca = 100000002;
        private const int AguardandoMotorista = 100000000;
        private const int Pendente = 100000001;
        private const int Cancelado = 100000003;
        private const int PushPendente = 100000000;
        private const int OrigemInfleet = 100000000;
        private const int OrigemMotorista = 100000001;
        private static readonly DateTime Now = new DateTime(2026, 10, 20, 15, 0, 0, DateTimeKind.Utc);

        private sealed class FakeHistory : IVehicleHistoryGateway
        {
            public PreviousDriverResult Result = PreviousDriverResult.Unknown;
            public bool Fail;
            public string AskedVehicle;
            public string AskedReceiver;
            public PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc)
            {
                AskedVehicle = infleetVehicleId; AskedReceiver = receiverInfleetDriverId;
                if (Fail) throw new InfleetUnavailableException("Infleet não respondeu a tempo.");
                return Result;
            }
        }

        private sealed class Scene
        {
            public ChecklistFakeService Service = new ChecklistFakeService();
            public FakeHistory History = new FakeHistory();
            public Entity Vehicle, OldVehicle, Receiver, ReceiverUser, Giver;
        }

        private static Scene NewScene(bool proprio = true)
        {
            var s = new Scene();
            s.Service.Template(padrao: true);
            s.Vehicle = s.Service.Vehicle("ABC1D23", proprio);
            s.OldVehicle = s.Service.Vehicle("XYZ9K88");
            s.Giver = s.Service.Driver("Entregador", "e@empresa.test", null, null, "inf-entregador");
            s.Receiver = s.Service.Driver("Recebedor", "r@empresa.test", s.Vehicle, Now, "inf-recebedor");
            s.ReceiverUser = s.Service.User("r@empresa.test");
            s.History.Result = PreviousDriverResult.Found("inf-entregador");
            return s;
        }

        private static string Run(Scene s, Entity newVehicle, Entity oldVehicle, int origem = OrigemInfleet, DateTime? now = null)
        {
            var target = new Entity("cr40f_funcionarios", s.Receiver.Id)
            {
                ["cr40f_veiculoatual"] = newVehicle?.ToEntityReference(),
                ["new_veiculoatualdesde"] = now ?? Now,
                ["new_origemveiculoatual"] = new OptionSetValue(origem)
            };
            var pre = new Entity("cr40f_funcionarios", s.Receiver.Id) { ["cr40f_veiculoatual"] = oldVehicle?.ToEntityReference() };
            var context = new RemoteExecutionContext { MessageName = "Update", PrimaryEntityName = "cr40f_funcionarios", InitiatingUserId = Guid.NewGuid() };
            context.InputParameters["Target"] = target;
            context.PreEntityImages["pre"] = pre;
            return HandoverChecklistPlugin.Handle(context, s.Service, s.History, now ?? Now, null);
        }

        private static Entity Created(Scene s) => s.Service.Rows("new_checklistveiculo").Single(row => row.GetAttributeValue<OptionSetValue>("new_origem")?.Value == Troca);
        private static int Choice(Entity e, string name) => e.GetAttributeValue<OptionSetValue>(name)?.Value ?? -1;

        [Fact]
        public void TrocaPelaInfleetCriaChecklistParaQuemRecebeComEntreguePor()
        {
            var s = NewScene();
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            var row = Created(s);
            Assert.Equal(s.Vehicle.Id, row.GetAttributeValue<EntityReference>("new_veiculo").Id);
            Assert.Equal(s.Receiver.Id, row.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(s.ReceiverUser.Id, row.GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal(s.Giver.Id, row.GetAttributeValue<EntityReference>("new_entreguepor").Id);
            Assert.Equal(Now, row.GetAttributeValue<DateTime>("new_trocadetectadaem"));
            Assert.Equal(Pendente, Choice(row, "new_estado"));
            Assert.Equal(PushPendente, Choice(row, "new_pushstatus"));
            Assert.Equal(VehicleHandover.UniqueKey(s.Vehicle.Id, s.Receiver.Id, Now), row.GetAttributeValue<string>("new_chaveunica"));
            Assert.Equal("inf-ABC1D23", s.History.AskedVehicle);
            Assert.Equal("inf-recebedor", s.History.AskedReceiver);
        }

        [Fact]
        public void EntregadorNaoIdentificadoCriaComCampoVazio()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.Unknown;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
        }

        [Fact]
        public void EntregadorSemFuncionarioCorrespondenteCriaComCampoVazio()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.Found("inf-desconhecido");
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
        }

        [Fact]
        public void InfleetForaCriaComEntregadorVazio()
        {
            var s = NewScene();
            s.History.Fail = true;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
        }

        [Fact]
        public void MesmoMotoristaNaInfleetNaoCria()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.SameDriver;
            Assert.Equal("ignorado:mesmo-motorista", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
        }

        [Theory]
        [InlineData("vazio")]
        [InlineData("mesmo")]
        [InlineData("origem")]
        [InlineData("terceiro")]
        public void MudancaQueNaoEhTrocaDaFrotaPropriaNaoCria(string caso)
        {
            var s = NewScene(proprio: caso != "terceiro");
            var result = caso == "vazio" ? Run(s, null, s.OldVehicle)
                : caso == "mesmo" ? Run(s, s.Vehicle, s.Vehicle)
                : caso == "origem" ? Run(s, s.Vehicle, s.OldVehicle, OrigemMotorista)
                : Run(s, s.Vehicle, s.OldVehicle);
            Assert.StartsWith("ignorado:", result);
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
        }

        [Fact]
        public void TrocaRepetidaEmDuasHorasNaoDuplicaEDepoisCria()
        {
            var s = NewScene();
            Run(s, s.Vehicle, s.OldVehicle);
            Assert.Equal("ignorado:troca-recente", Run(s, s.Vehicle, s.OldVehicle, now: Now.AddMinutes(90)));
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle, now: Now.AddHours(3)));
        }

        [Fact]
        public void ChecklistAbertoDoVeiculoEhCanceladoComMotivo()
        {
            var s = NewScene();
            var aberto = s.Service.Checklist(s.Vehicle, Pendente, s.Giver);
            var outroVeiculo = s.Service.Checklist(s.OldVehicle, Pendente);
            Run(s, s.Vehicle, s.OldVehicle);
            Assert.Equal(Cancelado, Choice(aberto, "new_estado"));
            Assert.Equal("Substituído pelo checklist da troca", aberto.GetAttributeValue<string>("new_motivocancelamento"));
            Assert.Equal(Now, aberto.GetAttributeValue<DateTime>("new_canceladoem"));
            Assert.Equal(Pendente, Choice(outroVeiculo, "new_estado"));
        }

        [Fact]
        public void RecebedorSemUsuarioMicrosoftFicaAguardandoComErro()
        {
            var s = NewScene();
            s.ReceiverUser["isdisabled"] = true;
            Run(s, s.Vehicle, s.OldVehicle);
            var row = Created(s);
            Assert.Equal(AguardandoMotorista, Choice(row, "new_estado"));
            Assert.Contains("sem usuário Microsoft único ativo", row.GetAttributeValue<string>("new_erroatribuicao"));
        }
    }
}
```

Em `ChecklistCommandPluginTests.cs`, dois testes novos, no padrão dos atuais:

```csharp
[Fact]
public void RotinaContaChecklistDeTrocaConcluidoComoVistoria()
{
    var service = new FakeService();
    service.Template(padrao: true);
    var vehicle = service.Vehicle("ABC1D23");
    var troca = service.Checklist(vehicle, Concluido);
    troca["new_origem"] = new OptionSetValue(100000002);
    troca["new_concluidoem"] = DateTime.UtcNow.AddDays(-3);
    Invoke("Process", Context(), service, DateTime.UtcNow);
    Assert.Single(service.Rows("new_checklistveiculo"));
}

[Fact]
public void RotinaNaoReatribuiChecklistDeTrocaDeQuemRecebeu()
{
    var service = new FakeService();
    service.Template(padrao: true);
    var vehicle = service.Vehicle("ABC1D23");
    var receiver = service.Driver("Recebedor", "r@empresa.test", null, null);
    var receiverUser = service.User("r@empresa.test");
    service.Driver("Outro", "o@empresa.test", vehicle, DateTime.UtcNow);
    service.User("o@empresa.test");
    var troca = service.Checklist(vehicle, Pendente, receiver, receiverUser);
    troca["new_origem"] = new OptionSetValue(100000002);
    Invoke("Process", Context(), service, DateTime.UtcNow);
    Assert.Equal(receiver.Id, troca.GetAttributeValue<EntityReference>("new_motorista").Id);
}
```

Confira a assinatura real de `Process` no teste existente `RotinaCriaSomenteParaVeiculoProprioAtivoSemChecklistRecenteOuAberto` e use a mesma forma de chamada.

- [ ] **Passo 2: Rodar e ver falhar** — `dotnet test --filter "FullyQualifiedName~Handover|FullyQualifiedName~ChecklistCommandPluginTests" -v q` → erro de compilação (`HandoverChecklistPlugin` não existe).

- [ ] **Passo 3: Fábrica — cancelamento e "não reatribuir troca"**

```csharp
// Troca cancela o que ainda estava aberto para o veículo: o checklist novo é de quem recebeu.
public static int CancelOpenForHandover(IOrganizationService system, Guid vehicleId, DateTime now)
{
    var query = new QueryExpression(ChecklistTable) { ColumnSet = new ColumnSet("new_estado") };
    query.Criteria.AddCondition("new_veiculo", ConditionOperator.Equal, vehicleId);
    query.Criteria.AddCondition("new_estado", ConditionOperator.In, AguardandoMotorista, Pendente);
    var open = system.RetrieveMultiple(query).Entities;
    foreach (var row in open)
    {
        var update = new Entity(ChecklistTable, row.Id);
        update["new_estado"] = new OptionSetValue(Cancelado);
        update["new_canceladoem"] = now;
        update["new_motivocancelamento"] = VehicleHandover.CancelReason;
        system.Update(update);
    }
    return open.Count;
}

// Checklist de troca já atribuído é de quem recebeu o carro; a rotina e o "Reatribuir" não o passam adiante.
public static bool KeepsReceiver(Entity checklist) =>
    Choice(checklist, "new_origem") == Troca && checklist.GetAttributeValue<EntityReference>("new_motorista") != null;
```

Em `AssignCurrentDriver`, inclua `"new_origem"` no `ColumnSet` do `Retrieve` e, logo depois de `if (!IsOpen(checklist)) return false;`, `if (KeepsReceiver(checklist)) return false;`. Isso cobre a rotina (`Process`) e o `RequestAssignment` sem mexer neles.

- [ ] **Passo 4: Implementar `HandoverChecklistPlugin.cs`**

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Step assíncrono no Update de cr40f_funcionarios.cr40f_veiculoatual (pré-imagem "pre").
    // Quando a sincronização Infleet passa um carro da frota própria para outro motorista, quem recebe
    // ganha um checklist de origem Troca. Roda fora da transação da sincronização: falha aqui não a desfaz.
    public sealed class HandoverChecklistPlugin : IPlugin
    {
        private readonly string _infleetToken;

        public HandoverChecklistPlugin(string unsecureConfig, string secureConfig) { _infleetToken = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != PluginConfig.UpdateMessage || context.PrimaryEntityName != PluginConfig.EmployeeTable) return;

            IVehicleHistoryGateway gateway = null;
            try { gateway = new InfleetGraphQlGateway(_infleetToken); }
            catch (InfleetUnavailableException error) { tracing?.Trace("HandoverChecklist sem Infleet: {0}", error.Message); }

            var result = Handle(context, factory.CreateOrganizationService(null), gateway, DateTime.UtcNow, tracing);
            tracing?.Trace("HandoverChecklist {0}", result);
        }

        public static string Handle(IPluginExecutionContext context, IOrganizationService system, IVehicleHistoryGateway gateway, DateTime now, ITracingService tracing)
        {
            var target = context.InputParameters.Contains(PluginConfig.TargetParameterName) ? context.InputParameters[PluginConfig.TargetParameterName] as Entity : null;
            if (target == null || !target.Contains(PluginConfig.EmployeeCurrentVehicle)) return "ignorado:sem-mudanca";
            var newVehicle = target.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle);
            if (newVehicle == null) return "ignorado:veiculo-vazio";
            if (target.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeCurrentVehicleOrigin)?.Value != PluginConfig.EmployeeCurrentVehicleOriginInfleet) return "ignorado:origem-nao-infleet";
            var pre = context.PreEntityImages.Contains(PluginConfig.PreImageAlias) ? context.PreEntityImages[PluginConfig.PreImageAlias] : null;
            if (pre?.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle)?.Id == newVehicle.Id) return "ignorado:mesmo-veiculo";

            var vehicle = system.Retrieve(PluginConfig.VehicleTable, newVehicle.Id, new ColumnSet("cr40f_placa", "statecode", PluginConfig.VehicleStatus, PluginConfig.VehicleCategory, PluginConfig.VehicleInfleetId));
            if (!ChecklistFactory.IsOwnActiveVehicle(vehicle)) return "ignorado:frota-nao-propria";
            var receiver = system.Retrieve(PluginConfig.EmployeeTable, target.Id, new ColumnSet(PluginConfig.EmployeeInfleetDriverId));
            if (RecentHandoverExists(system, vehicle.Id, receiver.Id, now)) return "ignorado:troca-recente";

            var previous = PreviousDriverResult.Unknown;
            try
            {
                if (gateway != null)
                    previous = gateway.PreviousDriver(vehicle.GetAttributeValue<string>(PluginConfig.VehicleInfleetId), receiver.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId), now);
            }
            catch (InfleetUnavailableException error) { tracing?.Trace("HandoverChecklist entregador nao identificado: {0}", error.Message); }
            if (previous.Kind == PreviousDriverKind.SameDriver) return "ignorado:mesmo-motorista";
            var giver = previous.Kind == PreviousDriverKind.Found ? EmployeeByInfleetId(system, previous.InfleetDriverId) : null;
            if (giver != null && giver.Id == receiver.Id) return "ignorado:mesmo-motorista";

            var template = ChecklistFactory.LoadTemplate(system, null);
            ChecklistFactory.CancelOpenForHandover(system, vehicle.Id, now);
            var extra = new Dictionary<string, object>
            {
                ["new_trocadetectadaem"] = target.GetAttributeValue<DateTime?>(PluginConfig.EmployeeCurrentVehicleSince) ?? now
            };
            if (giver != null) extra["new_entreguepor"] = new EntityReference(PluginConfig.EmployeeTable, giver.Id);
            var id = ChecklistFactory.CreateChecklist(system, vehicle, template, ChecklistFactory.Troca, now, context.InitiatingUserId, VehicleHandover.UniqueKey(vehicle.Id, receiver.Id, now), extra);
            ChecklistFactory.AssignDriver(system, id, receiver.Id);
            return "criado:" + id.ToString("D");
        }

        private static bool RecentHandoverExists(IOrganizationService system, Guid vehicleId, Guid receiverId, DateTime now)
        {
            var query = new QueryExpression(ChecklistFactory.ChecklistTable) { ColumnSet = new ColumnSet("new_chaveunica"), TopCount = 1 };
            query.Criteria.AddCondition("new_origem", ConditionOperator.Equal, ChecklistFactory.Troca);
            query.Criteria.AddCondition("new_veiculo", ConditionOperator.Equal, vehicleId);
            query.Criteria.AddCondition("new_chaveunica", ConditionOperator.Like, VehicleHandover.UniqueKeyPrefix(vehicleId, receiverId) + "%");
            query.Criteria.AddCondition("new_solicitadoem", ConditionOperator.GreaterThan, now.AddHours(-VehicleHandover.DedupeHours));
            return system.RetrieveMultiple(query).Entities.Count > 0;
        }

        private static Entity EmployeeByInfleetId(IOrganizationService system, string infleetDriverId)
        {
            var query = new QueryExpression(PluginConfig.EmployeeTable) { ColumnSet = new ColumnSet(PluginConfig.EmployeeName) };
            query.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.Equal, infleetDriverId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var matches = system.RetrieveMultiple(query).Entities;
            return matches.Count == 1 ? matches[0] : null;
        }
    }
}
```

Se o fake não aplicar `TopCount`, ignore; a contagem continua certa. Se o `Retrieve` do fake não devolver `statecode` para veículo, faça `IsOwnActiveVehicle` aceitar `statecode` ausente como ativo **só se** o teste `SolicitacaoManualCopiaItensDoModeloPadraoEAguardaMotorista` mostrar que o fake não o preenche (o `Request` atual já exige `statecode = 0`, então o fake deve preencher).

- [ ] **Passo 5: Testes** — `cd plugins/DriverRecordSharing.Tests && dotnet test -v q` → `Com falha: 0`.

- [ ] **Passo 6: Commit** — `feat: HandoverChecklistPlugin cria o checklist de recebimento quando a Infleet detecta troca de motorista`

---

### Tarefa 4: Schema, step assíncrono e texto do push

**Arquivos:** criar `scripts/lib/infleet-token.ps1`; modificar `scripts/provision-current-vehicle.ps1` (remover `Find-InfleetEnv`/`Read-InfleetToken`, linhas ~125-152, e importar a lib), `scripts/provision-checklists.ps1` (parâmetros, bloco de colunas `:307-330`, bloco de steps `:339-358`), `scripts/provision-checklist-flows.ps1` (`:139`), `scripts/smoke-checklists-dev.ps1`.

- [ ] **Passo 1: Lib do token**

Mova `Find-InfleetEnv` e `Read-InfleetToken` de `provision-current-vehicle.ps1` para `scripts/lib/infleet-token.ps1`, sem mudar o código (ASCII, sem acentos). Nos dois scripts:

```powershell
. (Join-Path $PSScriptRoot "lib/infleet-token.ps1")
```

`Find-InfleetEnv` sobe a partir de `$PSScriptRoot`; confira que o caminho relativo continua achando `Skill Agendamento\infleet-mcp\.env` agora que a função mora em `scripts/lib` (se ela usar `$PSScriptRoot`, passe a raiz como parâmetro ou suba um nível a mais).

- [ ] **Passo 2: Schema** (`provision-checklists.ps1`)

Parâmetro novo, igual ao do `provision-current-vehicle.ps1`:

```powershell
  # Arquivo com INFLEET_TOKEN=...; o valor nunca e exibido. Vazio: procura "Skill Agendamento\infleet-mcp\.env".
  [string] $InfleetTokenFile = "",
```

Depois de `Ensure-Column $checklist "new_QtdProblemas" ...`:

```powershell
Ensure-Column $checklist "new_TrocaDetectadaEm" "Troca detectada em" "datetime"
```

Depois do `Ensure-Relationship ... Motorista ...`:

```powershell
Ensure-Relationship "new_cr40f_funcionarios_EntreguePor_new_checklistveiculo" "cr40f_funcionarios" $checklist "new_EntreguePor" "Entregue por" $false
```

Depois de `Ensure-ChoiceOption $item "new_tipo" 100000003 ...`:

```powershell
Ensure-ChoiceOption $checklist "new_origem" 100000002 "Troca"
```

Atenção ao `Ensure-Relationship`: ele cria com `Delete = "Restrict"`. Para `new_entreguepor` isso impediria excluir um funcionário que entregou um carro. Passe um parâmetro opcional `[string] $DeleteBehavior = "Restrict"` e use `"RemoveLink"` neste relacionamento.

- [ ] **Passo 3: Step assíncrono com pré-imagem e token**

No bloco `if ($pluginTypes.Count -eq 1) { ... }`, depois das travas, a função nova (no estilo de `Ensure-PluginStep` do `provision-current-vehicle.ps1`, mais a pré-imagem):

```powershell
# Step assincrono do HandoverChecklistPlugin: Update de cr40f_funcionarios filtrado em cr40f_veiculoatual,
# pre-imagem "pre" e token Infleet em configuracao segura (o mesmo do SyncCurrentVehiclePlugin).
function Ensure-HandoverStep([guid] $AssemblyId) {
  $typeName = "Betinhos.DriverRecordSharing.HandoverChecklistPlugin"
  $types = @(Get-Rows "plugintypes" "plugintypeid,typename" "typename eq '$typeName'")
  if ($types.Count -eq 0 -and $Apply) {
    Invoke-Dv "POST" "plugintypes" @{ name = "HandoverChecklistPlugin"; friendlyname = "HandoverChecklistPlugin"; typename = $typeName; "pluginassemblyid@odata.bind" = "/pluginassemblies($AssemblyId)" } | Out-Null
    $types = @(Get-Rows "plugintypes" "plugintypeid,typename" "typename eq '$typeName'")
  }
  if ($types.Count -ne 1) { if ($Apply) { throw "PluginType $typeName nao encontrado. Publique o assembly antes." }; Write-Step "DRY RUN criaria PluginType $typeName"; return }
  $typeId = [guid]$types[0].plugintypeid
  $messageId = [guid](@(Get-Rows "sdkmessages" "sdkmessageid" "name eq 'Update'")[0].sdkmessageid)
  $filterId = [guid](@(Get-Rows "sdkmessagefilters" "sdkmessagefilterid" "_sdkmessageid_value eq $messageId and primaryobjecttypecode eq 'cr40f_funcionarios'")[0].sdkmessagefilterid)
  $select = "sdkmessageprocessingstepid,stage,mode,filteringattributes,asyncautodelete,_sdkmessageprocessingstepsecureconfigid_value"
  $stepFilter = "_eventhandler_value eq $typeId and _sdkmessageid_value eq $messageId and _sdkmessagefilterid_value eq $filterId"
  $steps = @(Get-Rows "sdkmessageprocessingsteps" $select $stepFilter)
  if ($steps.Count -gt 1) { throw "Mais de um step do HandoverChecklistPlugin." }
  if (-not $Apply) { Write-Step "DRY RUN $(if ($steps.Count -eq 0) { 'criaria' } else { 'atualizaria' }) step assincrono do HandoverChecklistPlugin"; return }
  $secret = Read-InfleetToken $InfleetTokenFile
  if ($steps.Count -eq 0) {
    $secure = Invoke-Dv "POST" "sdkmessageprocessingstepsecureconfigs" @{ secureconfig = $secret }
    Invoke-Dv "POST" "sdkmessageprocessingsteps" @{
      name = "Checklists - checklist de recebimento na troca (Infleet)"
      description = "Cria o checklist de quem recebe o carro quando a sincronizacao Infleet troca o veiculo atual. Token em configuracao segura."
      "eventhandler_plugintype@odata.bind" = "/plugintypes($typeId)"
      "sdkmessageid@odata.bind" = "/sdkmessages($messageId)"
      "sdkmessagefilterid@odata.bind" = "/sdkmessagefilters($filterId)"
      "sdkmessageprocessingstepsecureconfigid@odata.bind" = "/sdkmessageprocessingstepsecureconfigs($($secure.sdkmessageprocessingstepsecureconfigid))"
      stage = 40; mode = 1; rank = 1; supporteddeployment = 0; asyncautodelete = $true; filteringattributes = "cr40f_veiculoatual"
    } | Out-Null
    $steps = @(Get-Rows "sdkmessageprocessingsteps" $select $stepFilter)
    Write-Step "step assincrono criado: HandoverChecklistPlugin"
  } else {
    $secureId = [string]$steps[0]._sdkmessageprocessingstepsecureconfigid_value
    if ($secureId) { Invoke-Dv "PATCH" "sdkmessageprocessingstepsecureconfigs($secureId)" @{ secureconfig = $secret } | Out-Null }
    else {
      $secure = Invoke-Dv "POST" "sdkmessageprocessingstepsecureconfigs" @{ secureconfig = $secret }
      Invoke-Dv "PATCH" "sdkmessageprocessingsteps($($steps[0].sdkmessageprocessingstepid))" @{ "sdkmessageprocessingstepsecureconfigid@odata.bind" = "/sdkmessageprocessingstepsecureconfigs($($secure.sdkmessageprocessingstepsecureconfigid))" } | Out-Null
    }
  }
  $secret = $null
  $step = $steps[0]
  if ([int]$step.stage -ne 40 -or [int]$step.mode -ne 1 -or [string]$step.filteringattributes -ne "cr40f_veiculoatual") { throw "Step do HandoverChecklistPlugin com contrato divergente." }
  $images = @(Get-Rows "sdkmessageprocessingstepimages" "sdkmessageprocessingstepimageid,attributes" "_sdkmessageprocessingstepid_value eq $($step.sdkmessageprocessingstepid) and imagetype eq 0 and entityalias eq 'pre'")
  $image = @{ name = "pre"; entityalias = "pre"; imagetype = 0; messagepropertyname = "Target"; attributes = "cr40f_veiculoatual"; "sdkmessageprocessingstepid@odata.bind" = "/sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" }
  if ($images.Count -eq 0) { Invoke-Dv "POST" "sdkmessageprocessingstepimages" $image | Out-Null }
  elseif ([string]$images[0].attributes -ne "cr40f_veiculoatual") { Invoke-Dv "PATCH" "sdkmessageprocessingstepimages($($images[0].sdkmessageprocessingstepimageid))" @{ attributes = "cr40f_veiculoatual" } | Out-Null }
  Add-SolutionComponent ([guid]$step.sdkmessageprocessingstepid) 92 "step HandoverChecklistPlugin"
}
```

Chamada, depois de `Ensure-TableGuard ... "Delete" ...`:

```powershell
  Ensure-HandoverStep ([guid](@(Get-Rows "pluginassemblies" "pluginassemblyid" "name eq 'Betinhos.DriverRecordSharing'")[0].pluginassemblyid))
```

O `push-dev.ps1` já chama `provision-checklists.ps1 -Apply` depois de publicar o plugin; não precisa de mudança. O token é achado sozinho (`Find-InfleetEnv`), como no `provision-current-vehicle.ps1`.

- [ ] **Passo 4: Texto do push pela origem** (`provision-checklist-flows.ps1:139`)

```powershell
"payload/message" = "@{if(equals(triggerOutputs()?['body/new_origem'], 100000002), concat('Voc$([char]0x00EA) recebeu o carro ', coalesce(triggerOutputs()?['body/_new_veiculo_value@OData.Community.Display.V1.FormattedValue'], ''), '. Fa$([char]0x00E7)a o checklist de recebimento.'), concat('Checklist do ve$([char]0x00ED)culo pendente: ', triggerOutputs()?['body/new_name']))}"
```

Se o script tiver uma checagem de contrato que compara o texto (procure por `payload/message` ou "Contrato verificado"), atualize-a para a expressão nova.

- [ ] **Passo 5: Smoke**

Em `smoke-checklists-dev.ps1`, somente leitura por padrão:
- confere a opção `new_origem = 100000002`, as colunas `new_entreguepor` e `new_trocadetectadaem` e o step `Checklists - checklist de recebimento na troca (Infleet)` com `mode = 1`, filtro `cr40f_veiculoatual`, pré-imagem `pre` e configuração segura vinculada → "Step da troca ativo no DEV".

Com `-SimularTroca -FuncionarioId <guid> -VeiculoId <guid>` (grava no DEV, só com autorização): faz `PATCH cr40f_funcionarioses(<id>)` com `cr40f_veiculoatual@odata.bind`, `new_veiculoatualdesde = agora` e `new_origemveiculoatual = 100000000`; espera até 120 s, em ciclos de 10 s, por um `new_checklistveiculo` com `new_origem = 100000002`, o mesmo veículo e `new_solicitadoem` depois do PATCH; mostra estado, motorista, entregue por, push e o resultado do `asyncoperation` do step (`statuscode`, `message`) se nada aparecer. Valide com `ParseFile` (0 erros).

- [ ] **Passo 6: Dry run no DEV (somente leitura)**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-checklists.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/
```

Esperado: `DRY RUN` só para a opção Troca, `new_trocadetectadaem`, o relacionamento `EntreguePor` e o PluginType/step do `HandoverChecklistPlugin`. `provision-checklist-flows.ps1` sem `-Apply` → "atualizaria" o flow de push. `provision-current-vehicle.ps1` sem `-Apply` → mesma saída de antes da lib.

- [ ] **Passo 7: Commit** — `feat: schema, step assíncrono e push do checklist de troca`

---

### Tarefa 5: App Motoristas — origem Troca e "entregue por"

**Arquivos:** `src/lib/checklists.ts` (`CHECKLIST_ORIGEM` `:7`, `ChecklistVeiculo` `:40-53`, `mapChecklist` `:126-143`, mock `:260-275`, `CHECKLIST_SELECT` `:287`), `src/components/checklists/ChecklistAgendaCard.tsx`, `tests/checklists.test.ts`.

**Interfaces produzidas** (o arquivo é compartilhado com a Gestão via `sync-shared`):
- `CHECKLIST_ORIGEM = { quinzenal: 100000000, manual: 100000001, troca: 100000002 }`
- `ChecklistVeiculo.entreguePorNome: string`, `ChecklistVeiculo.trocaDetectadaEm: string | null`
- `checklistCardTexto(item: ChecklistVeiculo): { label: string; descricao: string }`

- [ ] **Passo 1: Testes que falham** (`tests/checklists.test.ts`)

```ts
test("mapChecklist lê entregue por e horário da troca", () => {
  const item = mapChecklist({
    new_checklistveiculoid: "c1", new_origem: 100000002, new_estado: 100000001,
    "_new_veiculo_value@OData.Community.Display.V1.FormattedValue": "ABC1D23",
    _new_entreguepor_value: "f9", "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Carlos Andrade",
    new_trocadetectadaem: "2026-10-20T15:00:00Z"
  });
  assert.equal(item.origem, CHECKLIST_ORIGEM.troca);
  assert.equal(item.entreguePorNome, "Carlos Andrade");
  assert.equal(item.trocaDetectadaEm, "2026-10-20T15:00:00Z");
  const antigo = mapChecklist({ new_checklistveiculoid: "c2", new_origem: 100000000, new_estado: 100000001 });
  assert.equal(antigo.entreguePorNome, "");
  assert.equal(antigo.trocaDetectadaEm, null);
});

test("texto do card por origem", () => {
  const base = mapChecklist({ new_checklistveiculoid: "c", new_estado: 100000001, "_new_veiculo_value@OData.Community.Display.V1.FormattedValue": "ABC1D23" });
  assert.deepEqual(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "Carlos Andrade" }),
    { label: "RECEBIMENTO DO CARRO", descricao: "Veículo ABC1D23 · entregue por Carlos Andrade" });
  assert.deepEqual(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "" }),
    { label: "RECEBIMENTO DO CARRO", descricao: "Veículo ABC1D23 · entregue por: não identificado" });
  assert.equal(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.manual }).label, "SOLICITADO PELA OPERAÇÃO");
  assert.equal(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.quinzenal }).label, "VISTORIA QUINZENAL");
  assert.equal(checklistCardTexto({ ...base, estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.troca }).label, "CHECKLIST ENVIADO");
});
```

- [ ] **Passo 2: Rodar e ver falhar** — `npm test -- --test-name-pattern="entregue por|texto do card"` → falha de import (`checklistCardTexto`).

- [ ] **Passo 3: Implementar**

```ts
export const CHECKLIST_ORIGEM = { quinzenal: 100000000, manual: 100000001, troca: 100000002 } as const;
```

`ChecklistVeiculo` ganha `entreguePorNome: string; trocaDetectadaEm: string | null;`. Em `mapChecklist`:

```ts
entreguePorNome: String(row["_new_entreguepor_value@OData.Community.Display.V1.FormattedValue"] ?? ""),
trocaDetectadaEm: row.new_trocadetectadaem ? String(row.new_trocadetectadaem) : null,
```

`CHECKLIST_SELECT` ganha `,_new_entreguepor_value,new_trocadetectadaem`. Nos dois objetos do mock local, `entreguePorNome: ""` e `trocaDetectadaEm: null`; o pendente do mock passa a ser de troca (`origem: CHECKLIST_ORIGEM.troca`, `entreguePorNome: "Carlos Andrade"`, `trocaDetectadaEm: iso(0)`), para a verificação no navegador.

```ts
// Texto do card na agenda (Serviços). A troca diz de quem o carro veio.
export function checklistCardTexto(item: ChecklistVeiculo) {
  const placa = item.placa ? `Veículo ${item.placa}` : "Vistoria do veículo";
  if (!isChecklistPending(item)) return { label: "CHECKLIST ENVIADO", descricao: placa };
  if (item.origem === CHECKLIST_ORIGEM.troca) {
    return { label: "RECEBIMENTO DO CARRO", descricao: `${placa} · ${item.entreguePorNome ? `entregue por ${item.entreguePorNome}` : "entregue por: não identificado"}` };
  }
  return { label: item.origem === CHECKLIST_ORIGEM.manual ? "SOLICITADO PELA OPERAÇÃO" : "VISTORIA QUINZENAL", descricao: placa };
}
```

Em `ChecklistAgendaCard.tsx`, troque o cálculo de `label` e `description` por `const { label, descricao } = checklistCardTexto(item);` e use `description: descricao`. Remova o import de `CHECKLIST_ORIGEM` se ficar sem uso (o `tsc` estrito acusa).

- [ ] **Passo 4: Testes, tipos e build** — `npm test`, `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` e `npm run build` → verdes.

- [ ] **Passo 5: Verificação no navegador** — `npm run dev` (mock localhost), skill `verificar-checklists-app` em 375 px: o card do checklist pendente mostra "RECEBIMENTO DO CARRO" e "Veículo ABC1D23 · entregue por Carlos Andrade", sem cortar texto; abrir o checklist continua funcionando. `ux-audit` no modo Rápido, console sem erros.

- [ ] **Passo 6: Commit** — `feat: App Motoristas mostra o checklist de recebimento do carro com quem entregou`

---

### Tarefa 6: Gestão de Checklists (repositório `Tela Gestão de Checklists`)

**Pré-requisito:** a Tarefa 5 na `main` do App Motoristas. Rode `pnpm sync-shared` (ou `node scripts/sync-shared.cjs`) para trazer `src/lib/checklists.ts` com `CHECKLIST_ORIGEM.troca`, `entreguePorNome` e `trocaDetectadaEm`; o build falha com `--check` se ficar divergente.

**Arquivos:** `src/lib/gestaoChecklists.ts` (`origemLabel` `:142`, mock `:200-245`, `CHECKLIST_SELECT` `:316`), `src/gestao/GestaoChecklists.tsx` (`ChkFilter` `:39`, `CHK_FILTERS` `:50`, `matchChk` `:71-72`, busca `:112`, segmentado `:359`, detalhe `:519-560`), `src/gestao/gestao.css` (`:134-138`, `:321`), `tests/gestaoChecklists.test.ts`.

**Interfaces:** `origemLabel(item)` devolve `"Troca"` para `100000002`; `checklistBuscaTexto(item: ChecklistGestao): string`; `type ChkFilter = "abertos" | "enviados" | "cancelados" | "trocas" | "todos"`, `CHK_FILTERS` e `matchChk(filter, item)` passam do componente para `gestaoChecklists.ts`, exportados (o componente importa de lá).

- [ ] **Passo 1: Testes que falham**

```ts
test("origem Troca: rótulo e busca por origem e por quem entregou", () => {
  const item = checklist({ origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "Carlos Andrade", trocaDetectadaEm: "2026-10-20T15:00:00Z" });
  assert.equal(origemLabel(item), "Troca");
  assert.match(checklistBuscaTexto(item).toLowerCase(), /troca/);
  assert.match(checklistBuscaTexto(item).toLowerCase(), /carlos andrade/);
  assert.equal(origemLabel(checklist({ origem: CHECKLIST_ORIGEM.manual })), "Solicitado");
  assert.equal(origemLabel(checklist({ origem: CHECKLIST_ORIGEM.quinzenal })), "Quinzenal");
});

test("filtro Trocas mostra checklists de troca em qualquer estado", () => {
  const trocaAberta = checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.pendente });
  const trocaCancelada = checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.cancelado });
  const quinzenal = checklist({ origem: CHECKLIST_ORIGEM.quinzenal, estado: CHECKLIST_ESTADO.pendente });
  assert.deepEqual(CHK_FILTERS.map((item) => item.label), ["Abertos", "Enviados", "Cancelados", "Trocas", "Todos"]);
  assert.equal(matchChk("trocas", trocaAberta), true);
  assert.equal(matchChk("trocas", trocaCancelada), true);
  assert.equal(matchChk("trocas", quinzenal), false);
  assert.equal(matchChk("abertos", trocaAberta), true);
  assert.equal(matchChk("todos", quinzenal), true);
});

test("checklist de troca concluído reinicia o prazo do veículo", () => {
  const troca = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.troca, concluidoEm: "2026-10-19T12:00:00Z", temProblema: false, qtdProblemas: 0 });
  assert.equal(situacaoVeiculo(frota("v1"), [troca], 15, Date.parse("2026-10-20T12:00:00Z")).label, "Em dia");
});

test("Dataverse: checklists pedem entregue por e horário da troca", async () => {
  const queries: string[] = [];
  const previous = (globalThis as any).window;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (entity: string, query: string) => {
      queries.push(`${entity} ${query}`);
      if (entity === "new_checklistveiculo") return { entities: [{ new_checklistveiculoid: "c1", new_estado: 100000001, new_origem: 100000002, "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Carlos Andrade", new_trocadetectadaem: "2026-10-20T15:00:00Z" }] };
      return { entities: [] };
    } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const [row] = await loadChecklistsGestao();
    assert.equal(row.entreguePorNome, "Carlos Andrade");
    assert.equal(origemLabel(row), "Troca");
    const url = queries.find((item) => item.includes("new_checklistveiculoid")) ?? "";
    assert.match(url, /_new_entreguepor_value/);
    assert.match(url, /new_trocadetectadaem/);
  } finally {
    (globalThis as any).window = previous;
  }
});
```

O terceiro teste segue o arranjo do teste existente "Dataverse: modelos e checklists pedem as colunas do OK / Não OK" (linha ~224). Inclua `entreguePorNome: ""` e `trocaDetectadaEm: null` no helper `checklist(...)` do arquivo de teste.

- [ ] **Passo 2: Implementar**

```ts
export const origemLabel = (item: ChecklistVeiculo) =>
  item.origem === CHECKLIST_ORIGEM.troca ? "Troca" : item.origem === CHECKLIST_ORIGEM.manual ? "Solicitado" : "Quinzenal";

// Busca da lista de checklists: placa, motorista, modelo, origem e quem entregou (troca).
export const checklistBuscaTexto = (item: ChecklistGestao) =>
  `${item.placa} ${item.motoristaNome} ${item.modeloNome} ${origemLabel(item)} ${item.entreguePorNome}`;
```

- `CHECKLIST_SELECT`: inclua `_new_entreguepor_value,new_trocadetectadaem`. `mapChecklistGestao` não muda (os campos vêm do `mapChecklist` compartilhado).
- Mock: `mockChecklist` preenche `entreguePorNome: ""` e `trocaDetectadaEm: null`; inclua um checklist pendente de troca (`origem: CHECKLIST_ORIGEM.troca`, `entreguePorNome: "Marcos Lima"`, `trocaDetectadaEm: iso(0)`) num veículo do mock que ainda não tenha checklist aberto.
- `GestaoChecklists.tsx:112`: `checklists.filter((item) => !chkTerm || checklistBuscaTexto(item).toLowerCase().includes(chkTerm))`.
- Filtro "Trocas": mova `ChkFilter`, `CHK_FILTERS` e `matchChk` do componente para `gestaoChecklists.ts`, exportados, e importe no componente:

```ts
export type ChkFilter = "abertos" | "enviados" | "cancelados" | "trocas" | "todos";
export const CHK_FILTERS: { id: ChkFilter; label: string }[] = [
  { id: "abertos", label: "Abertos" },
  { id: "enviados", label: "Enviados" },
  { id: "cancelados", label: "Cancelados" },
  { id: "trocas", label: "Trocas" },
  { id: "todos", label: "Todos" }
];
export const matchChk = (filter: ChkFilter, item: ChecklistGestao) =>
  filter === "todos" ? true
    : filter === "abertos" ? isOpen(item)
    : filter === "enviados" ? item.estado === CHECKLIST_ESTADO.concluido
    : filter === "trocas" ? item.origem === CHECKLIST_ORIGEM.troca
    : item.estado === CHECKLIST_ESTADO.cancelado;
```

  Confira os rótulos atuais de `CHK_FILTERS` no componente antes de mover e mantenha-os iguais; só "Trocas" é novo. No segmentado da lista (`:359`), troque `is-four` por `is-five`. O estado vazio (`:388`) com o filtro "trocas" diz "Nenhuma troca detectada" e "Quando a Infleet mostrar um carro passando para outro motorista, o checklist de recebimento aparece aqui.".
- `gestao.css`: ao lado das regras de `is-four`, sem valores visuais novos:

```css
.gestao-segmented.is-five { --count: 5; }
.gestao-segmented.is-five button { min-height: 32px; font-size: 12px; }
```

  e, no `@media` da linha ~321, `.gestao-segmented.is-five { min-width: 520px; }` (o `.gestao-segmented-scroll` já rola na horizontal no celular). O seletor de tipo de item do editor (`:659`) continua `is-four`.
- Detalhe (`ChecklistDetail`), primeiro passo da linha do tempo:

```tsx
const origemPasso = item.origem === CHECKLIST_ORIGEM.troca
  ? { label: "Troca detectada pela Infleet", time: `${formatDate(item.trocaDetectadaEm || item.solicitadoEm)} · Entregue por ${item.entreguePorNome || "não identificado"}`, done: true, error: false }
  : { label: item.origem === CHECKLIST_ORIGEM.manual ? "Solicitado pela operação" : "Criado pela rotina quinzenal", time: formatDate(item.solicitadoEm), done: true, error: false };
```

e use `origemPasso` no lugar do primeiro item de `steps`. Um cancelado pela troca já mostra o motivo "Substituído pelo checklist da troca" no passo "Cancelado" que existe hoje.

- [ ] **Passo 3: Testes, tipos e build** — `pnpm test`, `pnpm typecheck` (ou `npx tsc --noEmit`) e `pnpm build` → verdes.

- [ ] **Passo 4: Verificação** — `pnpm dev` (mock), em 1280 px e 375 px: o filtro mostra os cinco botões com contagem e o indicador desliza até "Trocas"; "Trocas" lista só o checklist de troca; no celular o filtro rola na horizontal sem cortar texto; a lista mostra "Troca · {modelo}"; buscar "troca" e "Marcos" filtra; o detalhe mostra "Troca detectada pela Infleet" com "Entregue por Marcos Lima". Skill de verificação da Gestão e `ux-audit` no modo Rápido.

- [ ] **Passo 5: Commit** — `feat: Gestão de Checklists mostra a origem Troca, quem entregou e o horário da troca`

---

### Tarefa 7: Publicação no DEV e prova ponta a ponta

**Arquivos:** skills `.claude/skills/verificar-checklists-backend/SKILL.md` e `.claude/skills/verificar-checklists-app/SKILL.md` (no mesmo commit da mudança que cobrem); nada mais de código.

- [ ] **Passo 1: Skills de verificação**
  - `verificar-checklists-backend`: incluir em "Cobre" `HandoverChecklistPlugin.cs`, `ChecklistFactory.cs`, `VehicleHandover.cs`, os dois arquivos de teste novos e `scripts/lib/infleet-token.ps1`; no roteiro, o filtro `dotnet test --filter "FullyQualifiedName~Handover|FullyQualifiedName~VehicleHandover"`, o dry run esperado da Tarefa 4, o smoke "Step da troca ativo no DEV" e o `-SimularTroca` (só com autorização); nos casos de borda, os da Tarefa 3.
  - `verificar-checklists-app`: roteiro do card "RECEBIMENTO DO CARRO" no mock e no DEV.

- [ ] **Passo 2: PRs e publicação (nesta ordem, cada um da `main` do checkout principal, depois do merge)**
  1. App Motoristas (Tarefas 1–5 e 7): branch sincronizada com `origin/main` antes do PR (memória "Publicar plugin só com branch sincronizada"); depois do merge, `npm run push` na `main` do checkout principal. Isso publica o assembly com `HandoverChecklistPlugin`, roda `provision-checklists.ps1 -Apply` (schema, PluginType, step e pré-imagem) e o webresource. Em seguida `provision-checklist-flows.ps1 -Apply` para o texto do push.
  2. Gestão (Tarefa 6): `pnpm push`.
  3. Repetir `provision-checklists.ps1` sem `-Apply` → nenhuma linha "criaria". `smoke-checklists-dev.ps1` → verde, com "Step da troca ativo no DEV".

- [ ] **Passo 3: Prova no DEV (grava dado; só com autorização do Renan)**
  - Escolha um funcionário de teste com usuário Microsoft (o próprio Renan, se tiver cadastro de motorista no DEV) e um carro de frota própria ativo diferente do atual dele.
  - `smoke-checklists-dev.ps1 -SimularTroca -FuncionarioId <id> -VeiculoId <id>` → checklist com origem Troca, estado Pendente, motorista = funcionário, `new_trocadetectadaem` preenchido e `new_entreguepor` igual ao último outro motorista daquele carro na Infleet (confira no MCP `infleet` com a mesma consulta da Tarefa 2), ou vazio se não houver. Um checklist aberto do carro, se havia, aparece Cancelado com "Substituído pelo checklist da troca".
  - Rodar de novo em menos de 2 h → nenhum checklist novo (o `asyncoperation` termina com sucesso e o trace "ignorado:troca-recente").
  - Push: no histórico do flow `Flow Push Checklist | Motoristas`, a execução mostra "Você recebeu o carro {placa}. Faça o checklist de recebimento." com a placa preenchida. Se a placa vier vazia, o trigger não traz o valor formatado: troque a expressão para ler a placa com uma ação "Get row" de `cr40f_veiculoses` antes do push e repita.
  - App Motoristas no DEV (Claude in Chrome, 375 px), logado como o funcionário: o card mostra "RECEBIMENTO DO CARRO" e "entregue por {nome}". Se o nome não aparecer para o motorista (falta de leitura no funcionário que entregou), registre e trate antes do merge: o valor formatado do lookup precisa chegar ao app.
  - Gestão no DEV: o checklist aparece com "Troca", e o detalhe mostra "Troca detectada pela Infleet" e "Entregue por".
  - Concluir o checklist pelo app e conferir que o veículo fica "Em dia" na Gestão e não recebe checklist quinzenal na próxima rotina.
  - Devolver o funcionário de teste ao carro anterior com origem **Operação** (`100000002`), para não gerar outro checklist de troca.
  - Informar as versões publicadas (App Motoristas e Gestão).

---

## Autorrevisão

- **Cobertura da spec:** gatilho e origem Infleet (T3, decisão 2); step assíncrono com pré-imagem fora da transação (T3, T4); só quem recebe (T3 `AssignDriver`, `KeepsReceiver`); entregue por pelo histórico Infleet e mapeamento por `new_infleetdriverid` (T2, T3); "não identificado" cria assim mesmo (T3 testes Unknown/sem funcionário/Infleet fora; T5 e T6 textos); filtros de frota própria, veículo vazio, mesmo motorista e 2 h (T3, decisões 1, 3 e 4); pendente cancelado com o motivo (T3); troca concluída reinicia os 15 dias (T3 teste da rotina, T6 teste da situação); push com o texto da spec (T4, T7); schema `new_origem` 100000002, `new_entreguepor`, `new_trocadetectadaem` e step pelo `push-dev.ps1` (T4); `ChecklistFactory` usada por quinzenal, manual e troca (T1, T3); `PreviousDriver` no gateway (T2); app e Gestão (T5, T6); testes de unidade e prova no DEV (T2, T3, T7); riscos (sem identificação: Unknown; identificação errada: Gestão cancela e janela de 2 h; atraso: assíncrono, sem mudança).
- **Divergências declaradas:** frota própria por `new_categoriadoveiculo` (decisão 1, confirmada no PROD). O "filtro por origem" da spec vira o botão "Trocas" no filtro existente (decisão 9, escolhida pelo Renan).
- **Nomes consistentes:** `Troca = 100000002` / `CHECKLIST_ORIGEM.troca`; `new_entreguepor` / `_new_entreguepor_value` / `entreguePorNome`; `new_trocadetectadaem` / `trocaDetectadaEm`; `HandoverChecklistPlugin.Handle`; `ChecklistFactory.AssignDriver`, `CancelOpenForHandover`, `KeepsReceiver`, `IsOwnActiveVehicle`; `VehicleHandover.PickPrevious`, `UniqueKey`, `UniqueKeyPrefix`, `CancelReason`; `IVehicleHistoryGateway.PreviousDriver`; `checklistCardTexto`; `checklistBuscaTexto`; `ChkFilter`/`CHK_FILTERS`/`matchChk` com `"trocas"`.
