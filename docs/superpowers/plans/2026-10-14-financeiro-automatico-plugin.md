# Financeiro automático — Plano 1: plugin, Custom API e steps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor de sincronização Pagante → OP → Reserva + CP como Custom API `cr40f_SincronizarFinanceiro` (modos `simular`/`aplicar`), tabela de log e steps automáticos em Pagante/OP, publicados em DEV. Cobre as Entregas 1 e 2 da spec.

**Architecture:** Projeto C# `packages/plugins/Cr40f.Financeiro.Plugin` com um motor puro (`SyncEngine`) que recebe um snapshot da OP e devolve mudanças; carregador (`SnapshotLoader`) e aplicador (`MudancaApplier`) isolam o Dataverse. Um registrador .NET 8 (`packages/plugins/tools/Cr40f.Financeiro.Registrar`) cria tabela de log, Custom API e steps, no molde do Gerar Pagantes. Tela e fechamento mensal ficam para os Planos 2 e 3.

**Tech Stack:** C# net462 (plugin, `Microsoft.CrmSdk.CoreAssemblies 9.0.2.60`, `Newtonsoft.Json 13.0.3`), xUnit em net48 (testes), .NET 8 + `Microsoft.PowerPlatform.Dataverse.Client 1.2.10` (registrador), PowerShell para publicação, MCP `Dataverse_DEV` para metadata.

**Spec:** `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md`

## Global Constraints

- Toda escrita financeira passa pelo plugin; nenhum `update` direto em OP, Reserva ou CP fora dele.
- Nunca rebaixar Reserva Pago cuja OP está Paga; nunca tocar em Reserva sem OP; só desfazer o que o motor marcou (prova = linha no log).
- Nada trava edição manual; a automação só escreve em evento de dinheiro (`cr40f_status` de Pagante ou OP).
- `aplicar` é idempotente: segunda execução gera zero mudanças.
- Comparações de dinheiro em centavos (`int`), arredondamento `MidpointRounding.AwayFromZero`.
- Ambiente: só DEV (`https://org23b93544.crm2.dynamics.com`, solução `appbetinhos`). PROD somente leitura.
- Chave de assinatura: `%USERPROFILE%\.codex\keys\Cr40f.Financeiro.Plugin.snk` (criada pelo script de push, como no Gerar Pagantes).
- Mensagens de commit em português, detalhadas, terminadas com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Molde de referência (somente leitura): `C:\Users\mendo\Desktop\vscode\Tela Gerar Pagantes\src\Plugins\Cr40f.GerarPagantes.Plugin` e `...\tools\Cr40f.GerarPagantes.PluginRegistrar\Program.cs`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/plugins/Cr40f.Financeiro.Plugin/Cr40f.Financeiro.Plugin.csproj` | plugin net462 assinado |
| `.../Codigos.cs` | nomes lógicos e valores de choice conferidos no Task 0 |
| `.../Snapshot.cs` | tipos puros: `OpSnapshot`, `PaganteSnap`, `ReservaSnap`, `Mudanca` |
| `.../SyncEngine.cs` | regras do §3 da spec, função pura |
| `.../SnapshotLoader.cs` | Dataverse → `OpSnapshot` |
| `.../MudancaApplier.cs` | `Mudanca` → updates + linhas de log |
| `.../Contracts.cs` | `SincronizarRequest`, `SincronizarResponse` |
| `.../SincronizarFinanceiroPlugin.cs` | Custom API (simular/aplicar) |
| `.../FinanceiroStepPlugin.cs` | step pós-Update de Pagante/OP com anti-loop |
| `packages/plugins/Cr40f.Financeiro.Plugin.Tests/*.cs` | xUnit do motor |
| `packages/plugins/tools/Cr40f.Financeiro.Registrar/Program.cs` | tabela de log, Custom API, steps, solução |
| `packages/plugins/scripts/push-financeiro-plugin.ps1` | build + registro em DEV |
| `package.json` (raiz) | script `push:plugin:financeiro:dev` |

---

### Task 0: Conferir metadata em DEV e fixar os códigos

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/Codigos.cs`
- Modify: `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md` (acrescentar seção "10. Metadata conferida")

**Interfaces:**
- Produces: classe estática `Codigos` usada por todos os tasks seguintes.

- [ ] **Step 1: Consultar metadata pelo MCP `Dataverse_DEV`** (`describe`; nunca `Dataverse_PROD`; nunca escrita). Confirmar e anotar:
  - `cr40f_reservadeveculos`: entity set; atributos `cr40f_statusdefaturamento` (todos os valores e rótulos; identificar qual representa "Pendente" ou "A faturar"), `cr40f_status` (valor de "Concluído"), lookups `cr40f_financeiro` (→ `cr40f_financeiro`) e `new_composicaodepreco` (→ `cr40f_composicaodeprecos`).
  - `cr40f_composicaodeprecos`: entity set; `new_status` (qual valor é Pendente, qual é Concluída), `new_valortotal` (Money), lookup `cr40f_servicorelacionadogeral` (→ reserva).
  - `cr40f_financeiro`: entity set; `cr40f_status` (confirmar 202410000 Aberta, 100000001 Pendente, 202410006 Parcial, 202410003 Paga, 202410004 Cancelada), `cr40f_valor` (Money), `cr40f_idfinanceiro`.
  - `cr40f_pagantes`: entity set; `cr40f_status` (202410001 Pendente, 202410002 Pago, 202410005 Cancelado, 202410007 Autorizado), `cr40f_valor` (Money), lookup `cr40f_financeiro`.
  - Prefixo de publisher da solução `appbetinhos` (esperado `cr40f`) e `customizationprefix`.
  - Flows (conferidos 14/10 em DEV): "Flow Dar Baixa Status Pagantes -> OP" (id 4c6a5e89-a706-f111-8406-7ced8da8aedd) é o substituído; "Flow Dar Baixa Status OP -> Pagantes" (id d0d43d01-2d43-f111-bec6-7ced8da82ee9) **permanece ativo** (trata marcação manual da OP).

- [ ] **Step 2: Se faltar qualquer item** (ex.: `cr40f_statusdefaturamento` sem valor "Pendente"), PARAR e reportar ao Renan com as opções reais; não inventar nome nem valor.

- [ ] **Step 3: Escrever `Codigos.cs` com os valores conferidos** (valores abaixo já conferidos em DEV em 14/10/2026 pelo controlador; copiar verbatim):

```csharp
namespace Cr40f.Financeiro.Plugin;

public static class Codigos
{
    public const string Reserva = "cr40f_reservadeveculos";
    public const string Composicao = "cr40f_composicaodeprecos";
    public const string Op = "cr40f_financeiro";
    public const string Pagante = "cr40f_pagantes";
    public const string Log = "cr40f_sincronizacaofinanceira";

    public const string ReservaFatStatus = "cr40f_statusdefaturamento";
    public const string ReservaOpLookup = "cr40f_financeiro";
    public const string ReservaCpLookup = "new_composicaodepreco";
    public const string CpStatus = "new_status";
    public const string CpValor = "new_valortotal";
    public const string CpReservaLookup = "cr40f_servicorelacionadogeral";
    public const string OpStatus = "cr40f_status";
    public const string OpValor = "cr40f_valor";
    public const string PaganteStatus = "cr40f_status";
    public const string PaganteValor = "cr40f_valor";
    public const string PaganteOpLookup = "cr40f_financeiro";

    public const int OpAberta = 202410000, OpPendente = 100000001, OpParcial = 202410006, OpPaga = 202410003, OpCancelada = 202410004;
    public const int PagPendente = 202410001, PagPago = 202410002, PagCancelado = 202410005, PagAutorizado = 202410007;
    public const int ReservaFatPago = 202410010, ReservaFatPagante = 202410006, ReservaFatMensal = 202410008;
    /// <summary>Sem OP (OP cancelada/desvinculada): "Pendente". Com OP ainda viva mas sem pagamento: "Pagamento Pendente" (é o que a Geral grava ao criar OP).</summary>
    public const int ReservaFatPendente = 202410005, ReservaFatPagamentoPendente = 202410007;
    public const int CpPendente = 100000000, CpConcluida = 100000001;
}
```

- [ ] **Step 4: Registrar na spec** a seção "10. Metadata conferida (DEV, dd/mm/aaaa)" com a tabela entidade → entity set → campo → valores, e o nome do flow "Pagantes → OP".

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Financeiro.Plugin/Codigos.cs docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md
git commit -m "financeiro: códigos de metadata conferidos em DEV para o plugin de sincronização"
```

---

### Task 1: Projetos do plugin e dos testes

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/Cr40f.Financeiro.Plugin.csproj`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/Snapshot.cs`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/Cr40f.Financeiro.Plugin.Tests.csproj`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/SmokeTests.cs`
- Create: `packages/plugins/Cr40f.Financeiro.sln`
- Modify: `.gitignore` (raiz): acrescentar `packages/plugins/**/bin/` e `packages/plugins/**/obj/`

**Interfaces:**
- Produces: tipos `OpSnapshot`, `PaganteSnap`, `ReservaSnap`, `Mudanca` (abaixo) usados por `SyncEngine`, `SnapshotLoader`, `MudancaApplier`.

- [ ] **Step 1: csproj do plugin**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <AssemblyName>Cr40f.Financeiro.Plugin</AssemblyName>
    <RootNamespace>Cr40f.Financeiro.Plugin</RootNamespace>
    <SignAssembly>true</SignAssembly>
    <AssemblyOriginatorKeyFile>$(UserProfile)\.codex\keys\Cr40f.Financeiro.Plugin.snk</AssemblyOriginatorKeyFile>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.60" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
</Project>
```

Criar `Properties/AssemblyInfo.cs` com `[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]` e `[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]`.

- [ ] **Step 2: `Snapshot.cs`**

```csharp
using System;
using System.Collections.Generic;

namespace Cr40f.Financeiro.Plugin;

public sealed class PaganteSnap
{
    public Guid Id { get; set; }
    public int? Status { get; set; }
    public int ValorCents { get; set; }
}

public sealed class ReservaSnap
{
    public Guid Id { get; set; }
    public int? FatStatus { get; set; }
    public Guid? CpId { get; set; }
    public int? CpStatus { get; set; }
    public int CpValorCents { get; set; }
    /// <summary>Há linha de log em que este motor marcou esta reserva como Pago por esta OP.</summary>
    public bool PagoPorEstaOp { get; set; }
}

public sealed class OpSnapshot
{
    public Guid Id { get; set; }
    public int? Status { get; set; }
    public int? ValorCents { get; set; }
    public List<PaganteSnap> Pagantes { get; } = new();
    public List<ReservaSnap> Reservas { get; } = new();
}

public sealed class Mudanca
{
    public string Entidade { get; set; } = "";
    public Guid Id { get; set; }
    public string Campo { get; set; } = "";
    public int? De { get; set; }
    public int? Para { get; set; }
    /// <summary>Para lookups: true = limpar o campo (De/Para ficam null).</summary>
    public bool LimparLookup { get; set; }
    public string Motivo { get; set; } = "";
}
```

- [ ] **Step 3: csproj dos testes** (net48 para referenciar o plugin net462)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net48</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\Cr40f.Financeiro.Plugin\Cr40f.Financeiro.Plugin.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 4: Teste de fumaça** `SmokeTests.cs`

```csharp
using Cr40f.Financeiro.Plugin;
using Xunit;

public class SmokeTests
{
    [Fact]
    public void SnapshotVazioNaoQuebra()
    {
        var op = new OpSnapshot { Id = System.Guid.NewGuid(), Status = Codigos.OpAberta };
        Assert.Empty(op.Pagantes);
    }
}
```

- [ ] **Step 5: Solução e build**

```bash
cd packages/plugins && dotnet new sln -n Cr40f.Financeiro && dotnet sln add Cr40f.Financeiro.Plugin/Cr40f.Financeiro.Plugin.csproj Cr40f.Financeiro.Plugin.Tests/Cr40f.Financeiro.Plugin.Tests.csproj
```

Se a chave `.snk` não existir ainda, criar antes do build (mesmo código do `push-plugin.ps1` do Gerar Pagantes):

```powershell
$p="$env:USERPROFILE\.codex\keys\Cr40f.Financeiro.Plugin.snk"; if(-not (Test-Path $p)){ [IO.Directory]::CreateDirectory((Split-Path $p))|Out-Null; $r=[Security.Cryptography.RSACryptoServiceProvider]::new(2048); [IO.File]::WriteAllBytes($p,$r.ExportCspBlob($true)); $r.Dispose() }
```

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: `Passed! - Failed: 0, Passed: 1`

- [ ] **Step 6: Commit**

```bash
git add .gitignore packages/plugins
git commit -m "financeiro: projetos do plugin de sincronização e dos testes xUnit (esqueleto e tipos de snapshot)"
```

---

### Task 2: Motor — OP totalmente paga

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/SyncEngine.cs`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/SyncEngineTests.cs`

**Interfaces:**
- Produces: `public static IReadOnlyList<Mudanca> SyncEngine.Compute(OpSnapshot op)`.

- [ ] **Step 1: Teste**

```csharp
using System;
using System.Linq;
using Cr40f.Financeiro.Plugin;
using Xunit;

public class SyncEngineTests
{
    internal static OpSnapshot Op(int? status, int? valor, params PaganteSnap[] pags)
    {
        var op = new OpSnapshot { Id = Guid.NewGuid(), Status = status, ValorCents = valor };
        op.Pagantes.AddRange(pags);
        return op;
    }
    internal static PaganteSnap Pag(int status, int cents) => new() { Id = Guid.NewGuid(), Status = status, ValorCents = cents };
    internal static ReservaSnap Res(int? fat, int? cp, bool pagoPorOp = false, int cpCents = 0) =>
        new() { Id = Guid.NewGuid(), FatStatus = fat, CpId = Guid.NewGuid(), CpStatus = cp, PagoPorEstaOp = pagoPorOp, CpValorCents = cpCents };

    [Fact]
    public void TodosPagosESomaCobreTotal_MarcaOpReservaECp()
    {
        var op = Op(Codigos.OpParcial, 10000, Pag(Codigos.PagPago, 6000), Pag(Codigos.PagAutorizado, 4000), Pag(Codigos.PagCancelado, 9999));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente));
        var m = SyncEngine.Compute(op);
        Assert.Contains(m, x => x.Entidade == Codigos.Op && x.Campo == Codigos.OpStatus && x.Para == Codigos.OpPaga);
        Assert.Contains(m, x => x.Entidade == Codigos.Reserva && x.Campo == Codigos.ReservaFatStatus && x.Para == Codigos.ReservaFatPago);
        Assert.Contains(m, x => x.Entidade == Codigos.Composicao && x.Campo == Codigos.CpStatus && x.Para == Codigos.CpConcluida);
        Assert.Equal(3, m.Count);
    }

    [Fact]
    public void TotalNuloUsaSomaDasCps()
    {
        var op = Op(Codigos.OpAberta, null, Pag(Codigos.PagPago, 5000));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente, cpCents: 5000));
        var m = SyncEngine.Compute(op);
        Assert.Contains(m, x => x.Entidade == Codigos.Op && x.Para == Codigos.OpPaga);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: erro de compilação `SyncEngine` não existe.

- [ ] **Step 3: Implementação mínima**

```csharp
using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Financeiro.Plugin;

public static class SyncEngine
{
    public static IReadOnlyList<Mudanca> Compute(OpSnapshot op)
    {
        var mudancas = new List<Mudanca>();
        if (op.Status == Codigos.OpCancelada) return mudancas; // Task 4
        var ativos = op.Pagantes.Where(p => p.Status != Codigos.PagCancelado).ToList();
        var pagos = ativos.Where(p => p.Status == Codigos.PagPago || p.Status == Codigos.PagAutorizado).ToList();
        var total = op.ValorCents ?? op.Reservas.Sum(r => r.CpValorCents);
        var somaPaga = pagos.Sum(p => p.ValorCents);
        var quitada = ativos.Count > 0 && pagos.Count == ativos.Count && somaPaga >= total && total > 0;

        if (quitada)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpPaga, "Todos os pagantes ativos pagos e soma cobre o total da OP.");
            foreach (var r in op.Reservas)
            {
                Set(mudancas, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, Codigos.ReservaFatPago, "OP paga.");
                if (r.CpId is { } cp) Set(mudancas, Codigos.Composicao, cp, Codigos.CpStatus, r.CpStatus, Codigos.CpConcluida, "OP paga.");
            }
        }
        return mudancas;
    }

    internal static void Set(List<Mudanca> list, string entidade, System.Guid id, string campo, int? de, int para, string motivo)
    {
        if (de == para) return; // idempotência: só grava o que muda
        list.Add(new Mudanca { Entidade = entidade, Id = id, Campo = campo, De = de, Para = para, Motivo = motivo });
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: `Failed: 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: motor de sincronização marca OP, reservas e composições quando todos os pagantes ativos estão pagos"
```

---

### Task 3: Motor — pagamento parcial e OP sem pagamento

**Files:**
- Modify: `packages/plugins/Cr40f.Financeiro.Plugin/SyncEngine.cs`
- Modify: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/SyncEngineTests.cs`

- [ ] **Step 1: Testes**

```csharp
    [Fact]
    public void AlgumPago_OpParcial_ReservaECpIntactas()
    {
        var op = Op(Codigos.OpAberta, 10000, Pag(Codigos.PagPago, 4000), Pag(Codigos.PagPendente, 6000));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente));
        var m = SyncEngine.Compute(op);
        Assert.Single(m);
        Assert.Equal(Codigos.OpParcial, m[0].Para);
    }

    [Fact]
    public void TodosPagosMasSomaMenorQueTotal_OpParcial()
    {
        var op = Op(Codigos.OpAberta, 10000, Pag(Codigos.PagPago, 4000));
        var m = SyncEngine.Compute(op);
        Assert.Single(m);
        Assert.Equal(Codigos.OpParcial, m[0].Para);
    }

    [Fact]
    public void NenhumPago_OpAberta_ReservaMarcadaPorEstaOpVoltaPendente()
    {
        var op = Op(Codigos.OpPaga, 10000, Pag(Codigos.PagCancelado, 10000));
        op.Reservas.Add(Res(Codigos.ReservaFatPago, Codigos.CpConcluida, pagoPorOp: true));
        var m = SyncEngine.Compute(op);
        Assert.Contains(m, x => x.Entidade == Codigos.Op && x.Para == Codigos.OpAberta);
        Assert.Contains(m, x => x.Entidade == Codigos.Reserva && x.Para == Codigos.ReservaFatPagamentoPendente);
        Assert.Contains(m, x => x.Entidade == Codigos.Composicao && x.Para == Codigos.CpPendente);
    }

    [Fact]
    public void NenhumPago_ReservaPagoNaMao_NaoRebaixa()
    {
        var op = Op(Codigos.OpAberta, 10000);
        op.Reservas.Add(Res(Codigos.ReservaFatPago, Codigos.CpConcluida, pagoPorOp: false));
        var m = SyncEngine.Compute(op);
        Assert.DoesNotContain(m, x => x.Entidade == Codigos.Reserva);
        Assert.DoesNotContain(m, x => x.Entidade == Codigos.Composicao);
    }

    [Fact]
    public void NenhumPago_ReservaInformativa_NaoMexe()
    {
        var op = Op(Codigos.OpAberta, 10000, Pag(Codigos.PagPendente, 10000));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente));
        Assert.Empty(SyncEngine.Compute(op));
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -8`
Expected: 4 falhas novas (parcial e aberta ainda não implementados).

- [ ] **Step 3: Implementar** — substituir o `if (quitada) {...}` por:

```csharp
        if (quitada)
        {
            // (bloco do Task 2, inalterado)
        }
        else if (pagos.Count > 0)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpParcial, "Há pagamento, mas não cobre todos os pagantes ou o total.");
        }
        else
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpAberta, "Nenhum pagante ativo pago.");
            Reverter(mudancas, op, Codigos.ReservaFatPagamentoPendente, "OP sem pagamento.");
        }
        return mudancas;
    }

    /// <summary>Desfaz só o que este motor marcou (PagoPorEstaOp); CP acompanha a reserva. `alvo` = status de faturamento de destino.</summary>
    internal static void Reverter(List<Mudanca> list, OpSnapshot op, int alvo, string motivo)
    {
        foreach (var r in op.Reservas.Where(r => r.PagoPorEstaOp && r.FatStatus == Codigos.ReservaFatPago))
        {
            Set(list, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, alvo, motivo);
            if (r.CpId is { } cp) Set(list, Codigos.Composicao, cp, Codigos.CpStatus, r.CpStatus, Codigos.CpPendente, motivo);
        }
    }
```

Observação: `OpPendente` (100000001) é faixa antiga; o motor o trata como "em aberto" e sempre normaliza para `OpAberta`.

- [ ] **Step 4: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: `Failed: 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: motor cobre pagamento parcial, OP sem pagamento e reversão só do que o próprio motor marcou"
```

---

### Task 4: Motor — OP cancelada e idempotência

**Files:**
- Modify: `packages/plugins/Cr40f.Financeiro.Plugin/SyncEngine.cs`
- Modify: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/SyncEngineTests.cs`

- [ ] **Step 1: Testes**

```csharp
    [Fact]
    public void OpCancelada_DesvinculaReservasERevertePagoPorEla()
    {
        var op = Op(Codigos.OpCancelada, 10000);
        var r1 = Res(Codigos.ReservaFatPago, Codigos.CpConcluida, pagoPorOp: true);
        var r2 = Res(Codigos.ReservaFatPagante, Codigos.CpPendente);
        op.Reservas.Add(r1); op.Reservas.Add(r2);
        var m = SyncEngine.Compute(op);
        Assert.DoesNotContain(m, x => x.Entidade == Codigos.Op);
        Assert.Equal(2, m.Count(x => x.Entidade == Codigos.Reserva && x.Campo == Codigos.ReservaOpLookup && x.LimparLookup));
        Assert.Contains(m, x => x.Id == r1.Id && x.Campo == Codigos.ReservaFatStatus && x.Para == Codigos.ReservaFatPendente);
        Assert.Contains(m, x => x.Id == r1.CpId && x.Para == Codigos.CpPendente);
        Assert.DoesNotContain(m, x => x.Id == r2.Id && x.Campo == Codigos.ReservaFatStatus);
    }

    [Fact]
    public void Idempotente_SegundaRodadaNaoMudaNada()
    {
        var op = Op(Codigos.OpAberta, 10000, Pag(Codigos.PagPago, 10000));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente));
        var primeira = SyncEngine.Compute(op);
        Assert.NotEmpty(primeira);
        foreach (var m in primeira)
        {
            if (m.Entidade == Codigos.Op) op.Status = m.Para;
            var r = op.Reservas.FirstOrDefault(x => x.Id == m.Id || x.CpId == m.Id);
            if (r != null && m.Entidade == Codigos.Reserva) { r.FatStatus = m.Para; r.PagoPorEstaOp = true; }
            if (r != null && m.Entidade == Codigos.Composicao) r.CpStatus = m.Para;
        }
        Assert.Empty(SyncEngine.Compute(op));
    }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: `OpCancelada_...` falha (retorna vazio).

- [ ] **Step 3: Implementar** — trocar a primeira linha de `Compute`:

```csharp
        if (op.Status == Codigos.OpCancelada)
        {
            foreach (var r in op.Reservas)
                mudancas.Add(new Mudanca { Entidade = Codigos.Reserva, Id = r.Id, Campo = Codigos.ReservaOpLookup, LimparLookup = true, Motivo = "OP cancelada." });
            Reverter(mudancas, op, Codigos.ReservaFatPendente, "OP cancelada.");
            return mudancas;
        }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -5`
Expected: `Failed: 0` (9 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: motor trata OP cancelada (desvincula reservas) e prova idempotência"
```

---

### Task 5: `SnapshotLoader` (Dataverse → snapshot)

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/SnapshotLoader.cs`

**Interfaces:**
- Produces: `public static OpSnapshot SnapshotLoader.Load(IOrganizationService service, Guid opId)`.
- Consumes: `Codigos`, tipos do Task 1. A tabela de log (Task 7) com colunas `cr40f_op` (lookup OP), `cr40f_reserva` (lookup reserva), `cr40f_campo`, `cr40f_para`.

Sem teste unitário (depende do Dataverse); validado no Task 8.

- [ ] **Step 1: Implementar**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

public static class SnapshotLoader
{
    public static OpSnapshot Load(IOrganizationService service, Guid opId)
    {
        var op = service.Retrieve(Codigos.Op, opId, new ColumnSet(Codigos.OpStatus, Codigos.OpValor));
        var snap = new OpSnapshot
        {
            Id = opId,
            Status = op.GetAttributeValue<OptionSetValue>(Codigos.OpStatus)?.Value,
            ValorCents = Cents(op.GetAttributeValue<Money>(Codigos.OpValor)),
        };

        var pagantes = service.RetrieveMultiple(new QueryExpression(Codigos.Pagante)
        {
            ColumnSet = new ColumnSet(Codigos.PaganteStatus, Codigos.PaganteValor),
            Criteria = { Conditions = { new ConditionExpression(Codigos.PaganteOpLookup, ConditionOperator.Equal, opId) } },
        }).Entities;
        snap.Pagantes.AddRange(pagantes.Select(p => new PaganteSnap
        {
            Id = p.Id,
            Status = p.GetAttributeValue<OptionSetValue>(Codigos.PaganteStatus)?.Value,
            ValorCents = Cents(p.GetAttributeValue<Money>(Codigos.PaganteValor)) ?? 0,
        }));

        var reservas = service.RetrieveMultiple(new QueryExpression(Codigos.Reserva)
        {
            ColumnSet = new ColumnSet(Codigos.ReservaFatStatus, Codigos.ReservaCpLookup),
            Criteria = { Conditions = { new ConditionExpression(Codigos.ReservaOpLookup, ConditionOperator.Equal, opId) } },
        }).Entities;
        var cpIds = reservas.Select(r => r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id).Where(id => id.HasValue).Select(id => (object)id!.Value).ToArray();
        var cps = cpIds.Length == 0 ? new Entity[0] : service.RetrieveMultiple(new QueryExpression(Codigos.Composicao)
        {
            ColumnSet = new ColumnSet(Codigos.CpStatus, Codigos.CpValor),
            Criteria = { Conditions = { new ConditionExpression($"{Codigos.Composicao}id", ConditionOperator.In, cpIds) } },
        }).Entities.ToArray();
        var cpById = cps.ToDictionary(c => c.Id);

        var marcadas = service.RetrieveMultiple(new QueryExpression(Codigos.Log)
        {
            ColumnSet = new ColumnSet("cr40f_reserva"),
            Criteria =
            {
                Conditions =
                {
                    new ConditionExpression("cr40f_op", ConditionOperator.Equal, opId),
                    new ConditionExpression("cr40f_campo", ConditionOperator.Equal, Codigos.ReservaFatStatus),
                    new ConditionExpression("cr40f_para", ConditionOperator.Equal, Codigos.ReservaFatPago.ToString()),
                },
            },
        }).Entities.Select(l => l.GetAttributeValue<EntityReference>("cr40f_reserva")?.Id).Where(id => id.HasValue).Select(id => id!.Value);
        var marcadasSet = new HashSet<Guid>(marcadas); // ToHashSet não existe em net462

        foreach (var r in reservas)
        {
            var cpRef = r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup);
            cpById.TryGetValue(cpRef?.Id ?? Guid.Empty, out var cp);
            snap.Reservas.Add(new ReservaSnap
            {
                Id = r.Id,
                FatStatus = r.GetAttributeValue<OptionSetValue>(Codigos.ReservaFatStatus)?.Value,
                CpId = cpRef?.Id,
                CpStatus = cp?.GetAttributeValue<OptionSetValue>(Codigos.CpStatus)?.Value,
                CpValorCents = Cents(cp?.GetAttributeValue<Money>(Codigos.CpValor)) ?? 0,
                PagoPorEstaOp = marcadasSet.Contains(r.Id),
            });
        }
        return snap;
    }

    internal static int? Cents(Money? money) => money == null ? null : (int)Math.Round(money.Value * 100m, MidpointRounding.AwayFromZero);
}
```

- [ ] **Step 2: Build**

Run: `dotnet build packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -3`
Expected: `0 Error(s)`.

- [ ] **Step 3: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: carregador de snapshot da OP (pagantes, reservas, composições e marcas do log)"
```

---

### Task 6: `MudancaApplier` e escrita do log

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/MudancaApplier.cs`

**Interfaces:**
- Produces: `public static void MudancaApplier.Apply(IOrganizationService service, Guid opId, IReadOnlyList<Mudanca> mudancas, string origem, Guid usuarioId)`.
- Consumes: tabela de log do Task 7 com colunas `cr40f_name`, `cr40f_op`, `cr40f_reserva`, `cr40f_entidade`, `cr40f_campo`, `cr40f_de`, `cr40f_para`, `cr40f_motivo`, `cr40f_origem` (choice 202410000 manual, 202410001 automático), `cr40f_usuario` (lookup systemuser).

- [ ] **Step 1: Implementar**

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

public static class MudancaApplier
{
    public const int OrigemManual = 202410000, OrigemAutomatico = 202410001;

    public static void Apply(IOrganizationService service, Guid opId, IReadOnlyList<Mudanca> mudancas, string origem, Guid usuarioId)
    {
        foreach (var m in mudancas)
        {
            var row = new Entity(m.Entidade, m.Id);
            if (m.LimparLookup) row[m.Campo] = null;
            else row[m.Campo] = new OptionSetValue(m.Para!.Value);
            service.Update(row);

            var log = new Entity(Codigos.Log);
            log["cr40f_name"] = $"{m.Entidade}.{m.Campo}: {m.De?.ToString() ?? "—"} → {(m.LimparLookup ? "(limpo)" : m.Para?.ToString())}";
            log["cr40f_op"] = new EntityReference(Codigos.Op, opId);
            if (m.Entidade == Codigos.Reserva) log["cr40f_reserva"] = new EntityReference(Codigos.Reserva, m.Id);
            log["cr40f_entidade"] = m.Entidade;
            log["cr40f_campo"] = m.Campo;
            log["cr40f_de"] = m.De?.ToString();
            log["cr40f_para"] = m.LimparLookup ? "" : m.Para?.ToString();
            log["cr40f_motivo"] = m.Motivo;
            log["cr40f_origem"] = new OptionSetValue(origem == "automatico" ? OrigemAutomatico : OrigemManual);
            log["cr40f_usuario"] = new EntityReference("systemuser", usuarioId);
            service.Create(log);
        }
    }
}
```

Nota: dentro de um plugin síncrono todas as chamadas ao `IOrganizationService` do contexto rodam na mesma transação; uma exceção desfaz tudo.

- [ ] **Step 2: Build**

Run: `dotnet build packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -3`
Expected: `0 Error(s)`.

- [ ] **Step 3: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: aplicador de mudanças grava status/lookups e uma linha de log por alteração"
```

---

### Task 7: Plugin da Custom API `cr40f_SincronizarFinanceiro`

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/Contracts.cs`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/SincronizarFinanceiroPlugin.cs`
- Create: `packages/plugins/Cr40f.Financeiro.Plugin.Tests/ContractsTests.cs`

**Interfaces:**
- Produces: Custom API bound a `cr40f_financeiro`, input `cr40f_RequestJson`, output `cr40f_ResponseJson`.
  - Request: `{"modo":"simular"|"aplicar","origem":"manual"|"automatico"}`
  - Response: `{"opId":"...","modo":"...","mudancas":[{"entidade","id","campo","de","para","limparLookup","motivo"}],"aplicadas":bool}`

- [ ] **Step 1: Teste do contrato**

```csharp
using Cr40f.Financeiro.Plugin;
using Newtonsoft.Json;
using Xunit;

public class ContractsTests
{
    [Fact]
    public void RequestAceitaModoEOrigem()
    {
        var r = JsonConvert.DeserializeObject<SincronizarRequest>("{\"modo\":\"aplicar\",\"origem\":\"manual\"}")!;
        Assert.Equal("aplicar", r.Modo);
        Assert.Equal("manual", r.Origem);
    }

    [Fact]
    public void ModoInvalidoFalha()
    {
        var r = new SincronizarRequest { Modo = "x" };
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => r.Validate());
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -3`
Expected: erro de compilação.

- [ ] **Step 3: `Contracts.cs`**

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;

namespace Cr40f.Financeiro.Plugin;

public sealed class SincronizarRequest
{
    [JsonProperty("modo")] public string Modo { get; set; } = "simular";
    [JsonProperty("origem")] public string Origem { get; set; } = "manual";

    public void Validate()
    {
        if (Modo != "simular" && Modo != "aplicar") throw new InvalidPluginExecutionException("modo deve ser 'simular' ou 'aplicar'.");
        if (Origem != "manual" && Origem != "automatico") throw new InvalidPluginExecutionException("origem deve ser 'manual' ou 'automatico'.");
    }
}

public sealed class MudancaDto
{
    [JsonProperty("entidade")] public string Entidade { get; set; } = "";
    [JsonProperty("id")] public Guid Id { get; set; }
    [JsonProperty("campo")] public string Campo { get; set; } = "";
    [JsonProperty("de")] public int? De { get; set; }
    [JsonProperty("para")] public int? Para { get; set; }
    [JsonProperty("limparLookup")] public bool LimparLookup { get; set; }
    [JsonProperty("motivo")] public string Motivo { get; set; } = "";

    public static MudancaDto From(Mudanca m) => new() { Entidade = m.Entidade, Id = m.Id, Campo = m.Campo, De = m.De, Para = m.Para, LimparLookup = m.LimparLookup, Motivo = m.Motivo };
}

public sealed class SincronizarResponse
{
    [JsonProperty("opId")] public Guid OpId { get; set; }
    [JsonProperty("modo")] public string Modo { get; set; } = "";
    [JsonProperty("mudancas")] public List<MudancaDto> Mudancas { get; } = new();
    [JsonProperty("aplicadas")] public bool Aplicadas { get; set; }
}
```

- [ ] **Step 4: `SincronizarFinanceiroPlugin.cs`**

```csharp
using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;

namespace Cr40f.Financeiro.Plugin;

public sealed class SincronizarFinanceiroPlugin : IPlugin
{
    public const string SharedFlag = "cr40f_sync";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var userService = factory.CreateOrganizationService(context.UserId);
        var systemService = factory.CreateOrganizationService(null);

        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not EntityReference target || target.LogicalName != Codigos.Op)
            throw new InvalidPluginExecutionException("A Custom API deve ser vinculada a uma OP.");
        var json = context.InputParameters.Contains("cr40f_RequestJson") ? context.InputParameters["cr40f_RequestJson"] as string : null;
        var request = string.IsNullOrWhiteSpace(json) ? new SincronizarRequest() : JsonConvert.DeserializeObject<SincronizarRequest>(json!) ?? new SincronizarRequest();
        request.Validate();

        var access = (RetrievePrincipalAccessResponse)userService.Execute(new RetrievePrincipalAccessRequest { Target = target, Principal = new EntityReference("systemuser", context.UserId) });
        if (!access.AccessRights.HasFlag(AccessRights.WriteAccess)) throw new InvalidPluginExecutionException("Sem permissão de escrita nesta OP.");

        var response = Executar(systemService, tracing, target.Id, request, context.UserId);
        if (request.Modo == "aplicar") context.SharedVariables[SharedFlag] = true;
        context.OutputParameters["cr40f_ResponseJson"] = JsonConvert.SerializeObject(response);
    }

    /// <summary>Compartilhado com o step automático (Task 9).</summary>
    public static SincronizarResponse Executar(IOrganizationService service, ITracingService tracing, Guid opId, SincronizarRequest request, Guid usuarioId)
    {
        var snapshot = SnapshotLoader.Load(service, opId);
        var mudancas = SyncEngine.Compute(snapshot);
        tracing.Trace("cr40f_SincronizarFinanceiro {0} op={1} mudancas={2}", request.Modo, opId, mudancas.Count);
        var response = new SincronizarResponse { OpId = opId, Modo = request.Modo };
        response.Mudancas.AddRange(mudancas.Select(MudancaDto.From));
        if (request.Modo == "aplicar" && mudancas.Count > 0)
        {
            MudancaApplier.Apply(service, opId, mudancas, request.Origem, usuarioId);
            response.Aplicadas = true;
        }
        return response;
    }
}
```

- [ ] **Step 5: Rodar testes**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -3`
Expected: `Failed: 0` (11 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/plugins
git commit -m "financeiro: plugin da Custom API cr40f_SincronizarFinanceiro com modos simular e aplicar"
```

---

### Task 8: Registrador, tabela de log e publicação em DEV (só `simular` em uso)

**Files:**
- Create: `packages/plugins/tools/Cr40f.Financeiro.Registrar/Cr40f.Financeiro.Registrar.csproj`
- Create: `packages/plugins/tools/Cr40f.Financeiro.Registrar/Program.cs`
- Create: `packages/plugins/scripts/push-financeiro-plugin.ps1`
- Modify: `package.json` (raiz): script `"push:plugin:financeiro:dev"`
- Modify: `packages/plugins/Cr40f.Financeiro.sln` (adicionar o registrador)

**Interfaces:**
- Produces em DEV: tabela `cr40f_sincronizacaofinanceira`, Custom API `cr40f_SincronizarFinanceiro` (bound `cr40f_financeiro`), tudo na solução `appbetinhos`.

- [ ] **Step 1: csproj do registrador** (igual ao do Gerar Pagantes: `net8.0`, `Microsoft.PowerPlatform.Dataverse.Client 1.2.10`, `OutputType Exe`, `ImplicitUsings enable`, `Nullable enable`).

- [ ] **Step 2: `Program.cs`** — copiar integralmente `Tela Gerar Pagantes\tools\Cr40f.GerarPagantes.PluginRegistrar\Program.cs` (funções `Arguments`, `AssemblyInfo`, `UpsertAssembly`, `UpsertPluginType`, `EnsureSolutionComponent`, `EnsureCustomApi`, `ConfigureMainOperationStep`, `FindSingleOrNone`, `Log`) e ajustar:

```csharp
const string PluginTypeName = "Cr40f.Financeiro.Plugin.SincronizarFinanceiroPlugin";
const string CustomApiMessageName = "cr40f_SincronizarFinanceiro";
const string BoundEntity = "cr40f_financeiro";
// em EnsureCustomApi: displayname "Sincronizar Financeiro", description "Recalcula status de OP, reservas e composições a partir dos pagantes (simular/aplicar)."
// request parameter cr40f_RequestJson com isoptional = true
```

Acrescentar antes de `EnsureCustomApi` a criação da tabela de log (idempotente):

```csharp
EnsureLogTable(service, solutionUniqueName);

static void EnsureLogTable(ServiceClient service, string solution)
{
    const string logical = "cr40f_sincronizacaofinanceira";
    var exists = ((RetrieveAllEntitiesResponse)service.Execute(new RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity })).EntityMetadata.Any(e => e.LogicalName == logical);
    if (!exists)
    {
        Log("criando tabela de log");
        var create = new CreateEntityRequest
        {
            SolutionUniqueName = solution,
            Entity = new EntityMetadata
            {
                SchemaName = "cr40f_SincronizacaoFinanceira", LogicalName = logical,
                DisplayName = new Label("Sincronização Financeira", 1046), DisplayCollectionName = new Label("Sincronizações Financeiras", 1046),
                Description = new Label("Log imutável das alterações feitas pelo motor financeiro.", 1046),
                OwnershipType = OwnershipTypes.UserOwned, IsActivity = false,
            },
            PrimaryAttribute = new StringAttributeMetadata { SchemaName = "cr40f_name", LogicalName = "cr40f_name", MaxLength = 400, DisplayName = new Label("Resumo", 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) },
        };
        service.Execute(create);
    }
    EnsureString(service, solution, logical, "cr40f_entidade", "Entidade", 100);
    EnsureString(service, solution, logical, "cr40f_campo", "Campo", 100);
    EnsureString(service, solution, logical, "cr40f_de", "De", 100);
    EnsureString(service, solution, logical, "cr40f_para", "Para", 100);
    EnsureString(service, solution, logical, "cr40f_motivo", "Motivo", 1000);
    EnsurePicklist(service, solution, logical, "cr40f_origem", "Origem", (202410000, "Manual"), (202410001, "Automático"));
    EnsureLookup(service, solution, logical, "cr40f_op", "OP", "cr40f_financeiro", "cr40f_sincronizacaofinanceira_op");
    EnsureLookup(service, solution, logical, "cr40f_reserva", "Reserva", "cr40f_reservadeveculos", "cr40f_sincronizacaofinanceira_reserva");
    EnsureLookup(service, solution, logical, "cr40f_usuario", "Usuário", "systemuser", "cr40f_sincronizacaofinanceira_usuario");
}

static bool AttributeExists(ServiceClient service, string entity, string attribute)
{
    try { service.Execute(new RetrieveAttributeRequest { EntityLogicalName = entity, LogicalName = attribute }); return true; }
    catch { return false; }
}

static void EnsureString(ServiceClient service, string solution, string entity, string name, string label, int max)
{
    if (AttributeExists(service, entity, name)) return;
    service.Execute(new CreateAttributeRequest { SolutionUniqueName = solution, EntityName = entity, Attribute = new StringAttributeMetadata { SchemaName = name, LogicalName = name, MaxLength = max, DisplayName = new Label(label, 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) } });
}

static void EnsurePicklist(ServiceClient service, string solution, string entity, string name, string label, params (int value, string text)[] options)
{
    if (AttributeExists(service, entity, name)) return;
    var set = new OptionSetMetadata { IsGlobal = false, OptionSetType = OptionSetType.Picklist };
    foreach (var (value, text) in options) set.Options.Add(new OptionMetadata(new Label(text, 1046), value));
    service.Execute(new CreateAttributeRequest { SolutionUniqueName = solution, EntityName = entity, Attribute = new PicklistAttributeMetadata { SchemaName = name, LogicalName = name, DisplayName = new Label(label, 1046), OptionSet = set, RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) } });
}

static void EnsureLookup(ServiceClient service, string solution, string entity, string name, string label, string target, string relationship)
{
    if (AttributeExists(service, entity, name)) return;
    service.Execute(new CreateOneToManyRequest
    {
        SolutionUniqueName = solution,
        OneToManyRelationship = new OneToManyRelationshipMetadata { ReferencedEntity = target, ReferencingEntity = entity, SchemaName = relationship, CascadeConfiguration = new CascadeConfiguration { Delete = CascadeType.RemoveLink, Assign = CascadeType.NoCascade, Share = CascadeType.NoCascade, Unshare = CascadeType.NoCascade, Reparent = CascadeType.NoCascade, Merge = CascadeType.NoCascade } },
        Lookup = new LookupAttributeMetadata { SchemaName = name, LogicalName = name, DisplayName = new Label(label, 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) },
    });
}
```

`using Microsoft.Xrm.Sdk.Metadata;` e `using Microsoft.Xrm.Sdk.Messages;` no topo.

- [ ] **Step 3: `push-financeiro-plugin.ps1`** — copiar `Tela Gerar Pagantes\scripts\push-plugin.ps1` trocando: caminho do projeto para `packages/plugins/Cr40f.Financeiro.Plugin/Cr40f.Financeiro.Plugin.csproj`, DLL `bin/Release/net462/Cr40f.Financeiro.Plugin.dll`, chave `Cr40f.Financeiro.Plugin.snk`, prefixo de log `[financeiro:plugin:$EnvironmentName]`; no lugar do `publish-plugin-webapi.ps1`, rodar o registrador:

```powershell
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Financeiro.Registrar\Cr40f.Financeiro.Registrar.csproj'
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }
```

`$root` = raiz do monorepo (`Resolve-Path (Join-Path $PSScriptRoot '..\..\..')`).

- [ ] **Step 4: Script no `package.json` raiz**

```json
"push:plugin:financeiro:dev": "powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/push-financeiro-plugin.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -EnvironmentName dev"
```

- [ ] **Step 5: Publicar em DEV**

Run: `pnpm push:plugin:financeiro:dev 2>&1 | tail -15`
Expected: linhas `criando tabela de log`, `criando Custom API cr40f_SincronizarFinanceiro`, `plugin publicado com sucesso`.

- [ ] **Step 6: Validar `simular` em 10 OPs reais** pelo MCP `Dataverse_DEV` (`invoke_api`, bound: `POST /cr40f_financeiros(<id>)/Microsoft.Dynamics.CRM.cr40f_SincronizarFinanceiro` com `{"cr40f_RequestJson":"{\"modo\":\"simular\"}"}`). Escolher: 3 OPs Pagas, 3 Parciais/Abertas com pagantes, 2 Canceladas, 2 sem pagante. Anotar em `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md` §10 a tabela OP → mudanças propostas → "coerente? sim/não". Se alguma for incoerente, voltar ao motor (Tasks 2–4) com um teste novo que reproduza o caso.

- [ ] **Step 7: Commit**

```bash
git add package.json packages/plugins docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md
git commit -m "financeiro: registrador cria tabela de log e Custom API cr40f_SincronizarFinanceiro; publicado em DEV e validado em modo simular"
```

---

### Task 9: Step automático em Pagante/OP com anti-loop

**Files:**
- Create: `packages/plugins/Cr40f.Financeiro.Plugin/FinanceiroStepPlugin.cs`
- Modify: `packages/plugins/tools/Cr40f.Financeiro.Registrar/Program.cs` (registrar os dois steps)

**Interfaces:**
- Consumes: `SincronizarFinanceiroPlugin.Executar(...)`, `SincronizarFinanceiroPlugin.SharedFlag`.

- [ ] **Step 1: Plugin do step**

```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

/// <summary>PostOperation Update de cr40f_pagantes e cr40f_financeiro (filtro cr40f_status). Chama o motor em modo aplicar.</summary>
public sealed class FinanceiroStepPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

        // Anti-loop: updates disparados pelo próprio motor (Depth > 1 com a flag) não reentram.
        if (context.Depth > 1 && (context.SharedVariables.Contains(SincronizarFinanceiroPlugin.SharedFlag) || context.ParentContext?.SharedVariables.Contains(SincronizarFinanceiroPlugin.SharedFlag) == true)) return;
        if (context.MessageName != "Update" || context.InputParameters["Target"] is not Entity target) return;

        Guid? opId = null;
        if (target.LogicalName == Codigos.Op)
        {
            // Ruling 14/10: em OP só o cancelamento propaga (desvincular reservas). Outros status da OP são derivados dos pagantes;
            // marcação manual de OP continua sendo tratada pelo flow "Flow Dar Baixa Status OP -> Pagantes" (assíncrono), que então aciona o step de Pagante.
            var novo = target.GetAttributeValue<OptionSetValue>(Codigos.OpStatus)?.Value;
            if (novo != Codigos.OpCancelada) return;
            opId = target.Id;
        }
        if (target.LogicalName == Codigos.Pagante)
        {
            var service0 = factory.CreateOrganizationService(null);
            var pagante = service0.Retrieve(Codigos.Pagante, target.Id, new Microsoft.Xrm.Sdk.Query.ColumnSet(Codigos.PaganteOpLookup));
            opId = pagante.GetAttributeValue<EntityReference>(Codigos.PaganteOpLookup)?.Id;
        }
        if (opId is null) return;

        context.SharedVariables[SincronizarFinanceiroPlugin.SharedFlag] = true;
        var service = factory.CreateOrganizationService(null);
        SincronizarFinanceiroPlugin.Executar(service, tracing, opId.Value, new SincronizarRequest { Modo = "aplicar", Origem = "automatico" }, context.InitiatingUserId);
    }
}
```

- [ ] **Step 2: Registrar os steps no `Program.cs`** — após `ConfigureMainOperationStep`:

```csharp
var stepTypeId = UpsertPluginTypeNamed(service, assemblyId, "Cr40f.Financeiro.Plugin.FinanceiroStepPlugin");
EnsureUpdateStep(service, stepTypeId, "cr40f_pagantes", "cr40f_status", "Cr40f.Financeiro: Pagante → OP");
EnsureUpdateStep(service, stepTypeId, "cr40f_financeiro", "cr40f_status", "Cr40f.Financeiro: OP → Reservas");

static Guid UpsertPluginTypeNamed(ServiceClient service, Guid assemblyId, string typeName)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", typeName));
    if (existing is not null) return existing.Id;
    return service.Create(new Entity("plugintype") { ["pluginassemblyid"] = Ref("pluginassembly", assemblyId), ["typename"] = typeName, ["friendlyname"] = typeName, ["name"] = typeName });
}

static void EnsureUpdateStep(ServiceClient service, Guid pluginTypeId, string entity, string filter, string name)
{
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is not null) { Log($"step já existe: {name}"); return; }
    var message = FindSingleOrNone(service, "sdkmessage", ("name", "Update")) ?? throw new InvalidOperationException("sdkmessage Update não encontrada.");
    var filterRow = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
    {
        ColumnSet = new ColumnSet("sdkmessagefilterid"),
        Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, entity) } },
    }).Entities.Single();
    service.Create(new Entity("sdkmessageprocessingstep")
    {
        ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(40), ["rank"] = 10,
        ["supporteddeployment"] = new OptionSetValue(0), ["filteringattributes"] = filter,
        ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["sdkmessagefilterid"] = Ref("sdkmessagefilter", filterRow.Id),
        ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = false,
    });
    Log($"step criado: {name}");
}
```

- [ ] **Step 3: Build e testes**

Run: `dotnet test packages/plugins/Cr40f.Financeiro.sln 2>&1 | tail -3`
Expected: `Failed: 0`.

- [ ] **Step 4: Publicar em DEV**

Run: `pnpm push:plugin:financeiro:dev 2>&1 | tail -8`
Expected: `step criado: Cr40f.Financeiro: Pagante → OP` e `... OP → Reservas`.

- [ ] **Step 5: Teste autenticado em DEV numa OP de teste** (criar reserva + CP + OP + 2 pagantes de teste pelo Gerar Pagantes em DEV; nunca usar OP real):
  1. Marcar pagante 1 como Pago na tela `#/pagantes` → OP deve ficar Parcial; nenhuma linha de log em reserva.
  2. Marcar pagante 2 como Pago → OP Paga, reserva Pago, CP Concluída, 3 linhas de log com origem Automático.
  3. Cancelar pagante 2 → OP Aberta, reserva Pendente, CP Pendente (log prova a reversão).
  4. Rodar `simular` de novo → `mudancas: []`.
  Anotar resultado no §10 da spec.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md
git commit -m "financeiro: step pós-Update em Pagante e OP aciona o motor em modo aplicar, com anti-loop por SharedVariables"
```

---

### Task 10: Substituir o flow "Pagantes → OP" em DEV

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md` (§10: registro da comparação e do desligamento)
- Modify: `C:\Users\mendo\.claude\projects\C--Users-mendo-Desktop-vscode-Sistema-Betinhos\memory\flows-prod-erros-2026-10.md` ou novo memory `financeiro-sync-flow-desativado.md` (fato: flow desativado só em DEV, data)

- [ ] **Step 1: Comparar** em DEV, nas 10 OPs do Task 8, o status atual da OP (resultado do flow) com o status que o motor calcula em `simular`. Divergência = caso novo: escrever teste no motor antes de prosseguir.

- [ ] **Step 2: Desativar o flow** "Flow Dar Baixa Status Pagantes -> OP" em DEV pelo Power Automate. Não excluir. Manter ativo "Flow Dar Baixa Status OP -> Pagantes". Em PROD não mexer.

- [ ] **Step 3: Repetir o Step 5 do Task 9** com o flow desligado e confirmar que o resultado é o mesmo.

- [ ] **Step 4: Registrar** na spec (§10) e na memória: flow desativado em DEV em dd/mm/aaaa, motor assumiu; PROD inalterado.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md
git commit -m "financeiro: flow Pagantes → OP desativado em DEV após comparação com o motor; registro na spec"
```

---

## Próximos planos

- **Plano 2 — Tela `#/financeiro/pendencias`** (§5 da spec, tipos 1, 2, 3 e 5). Depende dos códigos do Task 0 e da Custom API publicada (Task 8).
- **Plano 3 — `cr40f_FecharMesCliente` + tipo 4** (§4.3). Depende do Plano 2 (botão) e do mesmo registrador.
