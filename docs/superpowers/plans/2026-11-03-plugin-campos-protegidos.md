# Plugin de campos protegidos da Tenaris — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Goal:** o que a equipe alterar numa reserva da Tenaris (status, endereço, horário, tipo de veículo etc.) fica protegido na hora e a sincronização da Tenaris não sobrescreve mais, sem depender do "Flow Campos Protegidos" nem da auditoria.

**Architecture:** um plugin C# síncrono na pré-operação (stage 20) do Update de `cr40f_reservadeveculos` altera o próprio `Target`. (A) Gravação da equipe, sem `new_snapshotsharepoint` no Target, em reserva que tem snapshot: os campos monitorados que chegaram com valor diferente da planilha entram em `new_camposprotegidos`. (B) Gravação da sincronização da Tenaris (Target traz `new_snapshotsharepoint`, porque o `Upsert_Geral` sempre manda): os campos já protegidos saem do Target. A lógica fica isolada numa classe estática testável. O registro segue o molde do `Cr40f.Portal`.

**Tech Stack:** C# (`net462`, `Microsoft.CrmSdk.CoreAssemblies 9.0.2.60`), xUnit (`net48`), registrador `net8.0` com `Microsoft.PowerPlatform.Dataverse.Client 1.2.10`, PowerShell.

**Spec:** o brief aprovado em 03/11/2026 (copiado abaixo) e o diagnóstico em `C:\Users\mendo\.claude-renan\projects\C--Users-mendo-Desktop-vscode-Sistema-Betinhos\memory\campos-protegidos-falha-pos-publicacao.md`.

## Global Constraints

- Campos monitorados (nomes lógicos, nesta ordem): `cr40f_destino`, `cr40f_endereodesada`, `cr40f_dataehorriodesada`, `cr40f_obsdeoperao`, `cr40f_horrioprevistoderetorno`, `cr40f_status`, `cr40f_trajeto`, `cr40f_cr`, `cr40f_idtenaris`, `cr40f_tipodeveiculo`.
- `cr40f_passageirosetelefonedecontato` nunca entra na lista; o dono é o plugin DriverRecordSharing.
- `new_camposprotegidos`: nomes em minúsculas separados por `,`. A leitura aceita `,` ou `;` e espaços (igual a `apps/shell/src/pages/geral/domain/protecao.ts`).
- Proteção é para sempre: o plugin só acrescenta e nunca tira um nome da lista.
- Status protegido vale sempre, inclusive se a Tenaris mandar Cancelado ou Concluído.
- O plugin nunca bloqueia o salvamento: erro de lógica vira trace e a gravação segue como veio.
- Publicação só no DEV, só da `main`, no checkout principal (`CLAUDE.md`). Sessão cloud não publica. TEST e PROD só pelo workflow "Publicar soluções".
- O "Flow Campos Protegidos" fica ligado nesta entrega. Ele só acrescenta à lista, então não conflita. Desligá-lo é um PR à parte.
- Commits em português, detalhados. Antes do PR: skills `qualidade-antes-do-pr` e `verificacao-manter`.

## Brief aprovado

**Objetivo:** quando alguém da equipe altera na reserva da Tenaris um campo que veio da planilha, a alteração vale na hora e não é sobrescrita pela sincronização.

**Verificação (pronto quando todos passarem):**
1. Reserva da Tenaris com a planilha em Confirmado: a equipe muda para Programado → `new_camposprotegidos` contém `cr40f_status` na mesma gravação.
2. A sincronização regrava com status Confirmado e o snapshot → o status continua Programado e o snapshot é atualizado.
3. Reserva que não é da Tenaris (sem snapshot), status alterado → nada protegido.
4. O noreply grava o status sem snapshot no Target (flows "Dar Baixa") → a gravação passa. O campo passa a ser protegido se ficar diferente da planilha, o que é coerente com "protegido vale sempre".
5. A equipe grava um valor igual ao da planilha → não protege. A lista existente é mantida, sem duplicar.
- **Casos de borda:** sem snapshot; JSON inválido (compara com o valor anterior); choice e data comparados com o formato do snapshot (choice como texto do número, data ISO UTC); lista com `;` e espaços; tipo de veículo, que não está no snapshot (compara com o valor anterior).

**Assumi:** a regra A vale para toda gravação que não é a sincronização, inclusive as do noreply em outros flows. Isso dispensa ler o GUID do noreply por ambiente. O flow antigo excluía o noreply, mas pela decisão "protegido vale sempre" proteger o status que um "Dar Baixa" gravou também está correto.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/plugins/Cr40f.Protecao.Plugin/Cr40f.Protecao.Plugin.csproj` | Projeto do plugin (`net462`, assinado). |
| `packages/plugins/Cr40f.Protecao.Plugin/ProtecaoCampos.cs` | Regra pura: ler a lista, ler o snapshot, comparar valores, aplicar A ou B no Target. |
| `packages/plugins/Cr40f.Protecao.Plugin/ProtegerCamposPlugin.cs` | `IPlugin`: pega Target e imagem `pre`, chama `ProtecaoCampos.Aplicar`, faz o trace, nunca lança. |
| `packages/plugins/Cr40f.Protecao.Plugin.Tests/Cr40f.Protecao.Plugin.Tests.csproj` | Testes xUnit. |
| `packages/plugins/Cr40f.Protecao.Plugin.Tests/ProtecaoCamposTests.cs` | Cenários 1 a 5 e casos de borda. |
| `packages/plugins/Cr40f.Protecao.Plugin.Tests/FakeContext.cs` | Contexto de plugin em memória (pré-operação). |
| `packages/plugins/tools/Cr40f.Protecao.Registrar/Cr40f.Protecao.Registrar.csproj` e `Program.cs` | Registra assembly, tipo, step (stage 20, filtro e imagem `pre`) e a solução; `--testar <reservaId>` faz a prova no DEV. |
| `packages/plugins/scripts/push-protecao-plugin.ps1` | Testa, compila, confere assinatura e registra (bloqueia PROD). |
| `package.json` (raiz) | Script `push:plugin:protecao:dev`. |
| `.claude/skills/verificar-plugins/SKILL.md` | Seção "Proteção de campos da Tenaris". |

---

### Task 1: Regra de proteção (`ProtecaoCampos`) com testes

**Files:**
- Create: `packages/plugins/Cr40f.Protecao.Plugin/Cr40f.Protecao.Plugin.csproj`
- Create: `packages/plugins/Cr40f.Protecao.Plugin/ProtecaoCampos.cs`
- Create: `packages/plugins/Cr40f.Protecao.Plugin.Tests/Cr40f.Protecao.Plugin.Tests.csproj`
- Test: `packages/plugins/Cr40f.Protecao.Plugin.Tests/ProtecaoCamposTests.cs`

**Interfaces:**
- Produces: `ProtecaoCampos.Aplicar(Entity alvo, Entity? anterior) : Resultado`, `Resultado(IReadOnlyList<string> Adicionados, IReadOnlyList<string> Barrados)`, constantes `ProtecaoCampos.Lista = "new_camposprotegidos"`, `ProtecaoCampos.Snapshot = "new_snapshotsharepoint"`, `ProtecaoCampos.Monitorados : string[]`.

- [ ] **Step 1: Criar os dois csproj**

`packages/plugins/Cr40f.Protecao.Plugin/Cr40f.Protecao.Plugin.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <AssemblyName>Cr40f.Protecao.Plugin</AssemblyName>
    <RootNamespace>Cr40f.Protecao.Plugin</RootNamespace>
    <Version>1.0.0.0</Version>
    <SignAssembly>true</SignAssembly>
    <AssemblyOriginatorKeyFile>$(UserProfile)\.codex\keys\Cr40f.Protecao.Plugin.snk</AssemblyOriginatorKeyFile>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.60" />
    <Reference Include="System.Runtime.Serialization" />
  </ItemGroup>
</Project>
```

`packages/plugins/Cr40f.Protecao.Plugin.Tests/Cr40f.Protecao.Plugin.Tests.csproj`:
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
    <ProjectReference Include="..\Cr40f.Protecao.Plugin\Cr40f.Protecao.Plugin.csproj" />
  </ItemGroup>
</Project>
```

Se a chave não existir, gerar antes do build (o mesmo bloco do `push-portal-plugin.ps1`):
```powershell
$k = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Protecao.Plugin.snk'
if (-not (Test-Path $k)) { [IO.Directory]::CreateDirectory((Split-Path $k)) | Out-Null; $r=[Security.Cryptography.RSACryptoServiceProvider]::new(2048); [IO.File]::WriteAllBytes($k,$r.ExportCspBlob($true)); $r.Dispose() }
```

- [ ] **Step 2: Escrever os testes que falham**

`packages/plugins/Cr40f.Protecao.Plugin.Tests/ProtecaoCamposTests.cs`:
```csharp
using System;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Protecao.Plugin.Tests;

public class ProtecaoCamposTests
{
    const string Planilha = "{\"cr40f_destino\":\"Aeroporto; \\n\",\"cr40f_dataehorriodesada\":\"2026-11-04T14:30:00Z\",\"cr40f_horrioprevistoderetorno\":\"\",\"cr40f_status\":\"202410001\",\"cr40f_cr\":\"501019731\"}";
    static readonly Guid Id = Guid.NewGuid();

    static Entity Anterior(string? lista = null, string? snapshot = Planilha, int tipo = 202410000) => new("cr40f_reservadeveculos", Id)
    {
        [ProtecaoCampos.Lista] = lista, [ProtecaoCampos.Snapshot] = snapshot,
        ["cr40f_status"] = new OptionSetValue(202410001), ["cr40f_tipodeveiculo"] = new OptionSetValue(tipo),
    };
    static Entity Alvo() => new("cr40f_reservadeveculos", Id);

    [Fact]
    public void Equipe_muda_status_para_valor_diferente_da_planilha_protege()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        var r = ProtecaoCampos.Aplicar(alvo, Anterior());
        Assert.Equal(new[] { "cr40f_status" }, r.Adicionados);
        Assert.Equal("cr40f_status", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Sincronizacao_tira_campo_protegido_e_mantem_snapshot()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410001); alvo["cr40f_cr"] = "999"; alvo[ProtecaoCampos.Snapshot] = Planilha;
        var r = ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_status"));
        Assert.Equal(new[] { "cr40f_status" }, r.Barrados);
        Assert.False(alvo.Contains("cr40f_status"));
        Assert.True(alvo.Contains("cr40f_cr"));
        Assert.True(alvo.Contains(ProtecaoCampos.Snapshot));
        Assert.False(alvo.Contains(ProtecaoCampos.Lista));
    }

    [Fact]
    public void Status_cancelado_da_tenaris_tambem_e_barrado()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410002); alvo[ProtecaoCampos.Snapshot] = Planilha;
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_status"));
        Assert.False(alvo.Contains("cr40f_status"));
    }

    [Fact]
    public void Reserva_sem_snapshot_nao_protege()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        var r = ProtecaoCampos.Aplicar(alvo, Anterior(snapshot: null));
        Assert.Empty(r.Adicionados);
        Assert.False(alvo.Contains(ProtecaoCampos.Lista));
    }

    [Fact]
    public void Valor_igual_ao_da_planilha_nao_protege()
    {
        var alvo = Alvo();
        alvo["cr40f_status"] = new OptionSetValue(202410001);
        alvo["cr40f_destino"] = "Aeroporto; \n";
        alvo["cr40f_dataehorriodesada"] = new DateTime(2026, 11, 4, 14, 30, 0, DateTimeKind.Utc);
        alvo["cr40f_horrioprevistoderetorno"] = null;
        var r = ProtecaoCampos.Aplicar(alvo, Anterior());
        Assert.Empty(r.Adicionados);
    }

    [Fact]
    public void Lista_existente_e_mantida_sem_duplicar()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005); alvo["cr40f_cr"] = "123";
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_observaointerna; cr40f_STATUS"));
        Assert.Equal("cr40f_observaointerna,cr40f_status,cr40f_cr", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Passageiros_nunca_entram_na_lista()
    {
        var alvo = Alvo(); alvo["cr40f_passageirosetelefonedecontato"] = "Fulano - (12) 9999";
        Assert.Empty(ProtecaoCampos.Aplicar(alvo, Anterior()).Adicionados);
    }

    [Fact]
    public void Tipo_de_veiculo_fora_do_snapshot_compara_com_valor_anterior()
    {
        var igual = Alvo(); igual["cr40f_tipodeveiculo"] = new OptionSetValue(202410000);
        Assert.Empty(ProtecaoCampos.Aplicar(igual, Anterior()).Adicionados);
        var outro = Alvo(); outro["cr40f_tipodeveiculo"] = new OptionSetValue(202410001);
        Assert.Equal(new[] { "cr40f_tipodeveiculo" }, ProtecaoCampos.Aplicar(outro, Anterior()).Adicionados);
    }

    [Fact]
    public void Snapshot_invalido_compara_com_valor_anterior_sem_quebrar()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        Assert.Equal(new[] { "cr40f_status" }, ProtecaoCampos.Aplicar(alvo, Anterior(snapshot: "{quebrado")).Adicionados);
    }

    [Fact]
    public void Lista_vinda_no_proprio_alvo_e_a_base()
    {
        var alvo = Alvo(); alvo[ProtecaoCampos.Lista] = "cr40f_trajeto"; alvo["cr40f_status"] = new OptionSetValue(202410005);
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_cr"));
        Assert.Equal("cr40f_trajeto,cr40f_status", alvo[ProtecaoCampos.Lista]);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests`
Expected: erro de compilação "ProtecaoCampos não existe".

- [ ] **Step 4: Implementar `ProtecaoCampos`**

`packages/plugins/Cr40f.Protecao.Plugin/ProtecaoCampos.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Protecao.Plugin;

// Classe e não record: record em net462 exige o polyfill IsExternalInit.
public sealed class Resultado
{
    public Resultado(IReadOnlyList<string> adicionados, IReadOnlyList<string> barrados) { Adicionados = adicionados; Barrados = barrados; }
    public IReadOnlyList<string> Adicionados { get; }
    public IReadOnlyList<string> Barrados { get; }
}

/// <summary>
/// Campos da reserva da Tenaris editados pela equipe ficam protegidos contra a sincronização.
/// A gravação da sincronização é reconhecida por trazer new_snapshotsharepoint (o Upsert_Geral do flow da Tenaris sempre manda).
/// </summary>
public static class ProtecaoCampos
{
    public const string Lista = "new_camposprotegidos";
    public const string Snapshot = "new_snapshotsharepoint";
    public static readonly string[] Monitorados =
    {
        "cr40f_destino", "cr40f_endereodesada", "cr40f_dataehorriodesada", "cr40f_obsdeoperao", "cr40f_horrioprevistoderetorno",
        "cr40f_status", "cr40f_trajeto", "cr40f_cr", "cr40f_idtenaris", "cr40f_tipodeveiculo",
    };
    static readonly string[] Vazio = new string[0];

    public static Resultado Aplicar(Entity alvo, Entity? anterior)
    {
        var protegidos = LerLista(alvo.Contains(Lista) ? alvo.GetAttributeValue<string>(Lista) : anterior?.GetAttributeValue<string>(Lista));
        if (alvo.Contains(Snapshot))
        {
            var barrados = protegidos.Where(alvo.Contains).ToList();
            foreach (var campo in barrados) alvo.Attributes.Remove(campo);
            return new Resultado(Vazio, barrados);
        }
        var textoSnapshot = anterior?.GetAttributeValue<string>(Snapshot);
        if (string.IsNullOrWhiteSpace(textoSnapshot)) return new Resultado(Vazio, Vazio);
        var planilha = LerSnapshot(textoSnapshot!);
        var adicionados = Monitorados
            .Where(campo => alvo.Contains(campo) && !protegidos.Contains(campo))
            .Where(campo => !Igual(alvo[campo], planilha.TryGetValue(campo, out var texto) ? texto : Texto(anterior!.Contains(campo) ? anterior[campo] : null)))
            .ToList();
        if (adicionados.Count > 0) alvo[Lista] = string.Join(",", protegidos.Concat(adicionados));
        return new Resultado(adicionados, Vazio);
    }

    public static List<string> LerLista(string? texto) =>
        (texto ?? "").Split(',', ';').Select(nome => nome.Trim().ToLowerInvariant()).Where(nome => nome.Length > 0).Distinct().ToList();

    /// <summary>JSON plano campo → texto. Inválido vira vazio: cada campo passa a ser comparado com o valor anterior.</summary>
    static Dictionary<string, string> LerSnapshot(string json)
    {
        try
        {
            var leitor = new DataContractJsonSerializer(typeof(Dictionary<string, string>), new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true });
            using var fluxo = new MemoryStream(Encoding.UTF8.GetBytes(json));
            return (Dictionary<string, string>?)leitor.ReadObject(fluxo) ?? new Dictionary<string, string>();
        }
        catch (Exception) { return new Dictionary<string, string>(); }
    }

    /// <summary>Valor do SDK no formato do snapshot: choice como número, data ISO UTC, lookup como id.</summary>
    static string? Texto(object? valor) => valor switch
    {
        null => null,
        OptionSetValue opcao => opcao.Value.ToString(CultureInfo.InvariantCulture),
        DateTime data => data.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
        EntityReference referencia => referencia.Id.ToString(),
        _ => Convert.ToString(valor, CultureInfo.InvariantCulture),
    };

    static bool Igual(object? valor, string? texto)
    {
        if (string.IsNullOrEmpty(texto)) return string.IsNullOrEmpty(Texto(valor));
        if (valor is DateTime data)
            return DateTime.TryParse(texto, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var outra)
                && Math.Abs((data.ToUniversalTime() - outra).TotalMinutes) < 1;
        return string.Equals(Texto(valor), texto, StringComparison.Ordinal);
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests`
Expected: `Aprovado! – Com falha: 0, Aprovado: 10`.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Protecao.Plugin packages/plugins/Cr40f.Protecao.Plugin.Tests
git commit -m "feat(plugins): regra de campos protegidos da Tenaris (edição protege, sincronização barra)"
```

---

### Task 2: `IPlugin` que aplica a regra no Target

**Files:**
- Create: `packages/plugins/Cr40f.Protecao.Plugin/ProtegerCamposPlugin.cs`
- Create: `packages/plugins/Cr40f.Protecao.Plugin.Tests/FakeContext.cs`
- Modify: `packages/plugins/Cr40f.Protecao.Plugin.Tests/ProtecaoCamposTests.cs` (classe nova no fim do arquivo)

**Interfaces:**
- Consumes: `ProtecaoCampos.Aplicar(Entity, Entity?)`.
- Produces: `ProtegerCamposPlugin` (`typename` `Cr40f.Protecao.Plugin.ProtegerCamposPlugin`), `ProtegerCamposPlugin.ImagemAnterior = "pre"`, `ProtegerCamposPlugin.Processar(IPluginExecutionContext, ITracingService?) : Resultado?`.

- [ ] **Step 1: Contexto falso**

`packages/plugins/Cr40f.Protecao.Plugin.Tests/FakeContext.cs`: copiar `FakeContext` de `packages/plugins/Cr40f.Portal.Plugin.Tests/Fakes.cs:53-83`, trocando o namespace para `Cr40f.Protecao.Plugin.Tests` e `Stage => 40` por `Stage => 20`. Não copiar o `FakeService`, porque o plugin não lê nem grava nada.

- [ ] **Step 2: Testes que falham** (acrescentar ao fim de `ProtecaoCamposTests.cs`)

```csharp
public class ProtegerCamposPluginTests
{
    static FakeContext Contexto(Entity alvo, Entity anterior)
    {
        var c = new FakeContext("Update", "cr40f_reservadeveculos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        c.PreEntityImages[ProtegerCamposPlugin.ImagemAnterior] = anterior;
        return c;
    }

    [Fact]
    public void Plugin_protege_no_proprio_target()
    {
        var id = Guid.NewGuid();
        var alvo = new Entity("cr40f_reservadeveculos", id) { ["cr40f_status"] = new OptionSetValue(202410005) };
        var anterior = new Entity("cr40f_reservadeveculos", id) { [ProtecaoCampos.Snapshot] = "{\"cr40f_status\":\"202410001\"}" };
        ProtegerCamposPlugin.Processar(Contexto(alvo, anterior));
        Assert.Equal("cr40f_status", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Outra_tabela_ou_mensagem_nao_faz_nada()
    {
        var alvo = new Entity("cr40f_composicaodeprecos", Guid.NewGuid());
        var c = new FakeContext("Update", "cr40f_composicaodeprecos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        Assert.Null(ProtegerCamposPlugin.Processar(c));
    }

    [Fact]
    public void Sem_imagem_pre_nao_quebra()
    {
        var alvo = new Entity("cr40f_reservadeveculos", Guid.NewGuid()) { ["cr40f_status"] = new OptionSetValue(202410005) };
        var c = new FakeContext("Update", "cr40f_reservadeveculos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        Assert.Empty(ProtegerCamposPlugin.Processar(c)!.Adicionados);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests`
Expected: erro de compilação "ProtegerCamposPlugin não existe".

- [ ] **Step 4: Implementar**

`packages/plugins/Cr40f.Protecao.Plugin/ProtegerCamposPlugin.cs`:
```csharp
using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Protecao.Plugin;

/// <summary>
/// Step: cr40f_reservadeveculos Update, pré-operação (20) síncrono, filtro nos campos monitorados + snapshot, imagem "pre".
/// Altera só o Target (sem gravação extra). Nunca bloqueia o salvamento: erro vira trace.
/// </summary>
public sealed class ProtegerCamposPlugin : IPlugin
{
    public const string ImagemAnterior = "pre";
    public const string Reserva = "cr40f_reservadeveculos";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        try { Processar(context, tracing); }
        catch (Exception error) { tracing.Trace("Cr40f.Protecao: erro ignorado, gravação segue sem proteção. {0}", error); }
    }

    public static Resultado? Processar(IPluginExecutionContext context, ITracingService? tracing = null)
    {
        if (context.MessageName != "Update" || context.PrimaryEntityName != Reserva) return null;
        if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity alvo)) return null;
        var anterior = context.PreEntityImages.Contains(ImagemAnterior) ? context.PreEntityImages[ImagemAnterior] : null;
        var resultado = ProtecaoCampos.Aplicar(alvo, anterior);
        if (resultado.Adicionados.Count > 0) tracing?.Trace("Cr40f.Protecao: protegidos {0}", string.Join(",", resultado.Adicionados));
        if (resultado.Barrados.Count > 0) tracing?.Trace("Cr40f.Protecao: sincronização barrada em {0}", string.Join(",", resultado.Barrados));
        return resultado;
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests`
Expected: `Com falha: 0, Aprovado: 13`.

- [ ] **Step 6: Build Release com assinatura**

Run: `dotnet build packages/plugins/Cr40f.Protecao.Plugin -c Release`
Then: `powershell -NoProfile -Command "[BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName((Resolve-Path 'packages/plugins/Cr40f.Protecao.Plugin/bin/Release/net462/Cr40f.Protecao.Plugin.dll')).GetPublicKeyToken())"`
Expected: `0 Erro(s)` e um token não vazio.

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Protecao.Plugin packages/plugins/Cr40f.Protecao.Plugin.Tests
git commit -m "feat(plugins): ProtegerCamposPlugin aplica a proteção no Target da reserva sem bloquear o salvamento"
```

---

### Task 3: Registrador, script de publicação e prova no DEV

**Files:**
- Create: `packages/plugins/tools/Cr40f.Protecao.Registrar/Cr40f.Protecao.Registrar.csproj` (idêntico a `tools/Cr40f.Portal.Registrar/Cr40f.Portal.Registrar.csproj`)
- Create: `packages/plugins/tools/Cr40f.Protecao.Registrar/Program.cs`
- Create: `packages/plugins/scripts/push-protecao-plugin.ps1`
- Modify: `package.json` (raiz, ao lado de `push:plugin:portal:dev`)

**Interfaces:**
- Consumes: `ProtecaoCampos.Monitorados`, `Lista`, `Snapshot` (os nomes repetidos como texto no registrador, porque ele é `net8.0` e não referencia o `net462`); `typename` `Cr40f.Protecao.Plugin.ProtegerCamposPlugin`.
- Produces: step `Cr40f.Protecao: protege campos editados da Tenaris`; CLI `--environmentUrl --dllPath [--solutionUniqueName] [--publish] [--testar <reservaId>]`.

- [ ] **Step 1: `Program.cs`**

Partir de `packages/plugins/tools/Cr40f.Portal.Registrar/Program.cs` inteiro e trocar só o que segue:
1. Linhas 8 e 16: comentário "Registra o plugin de campos protegidos da Tenaris" e `const string PluginTypeName = "Cr40f.Protecao.Plugin.ProtegerCamposPlugin";`.
2. Linha 23: `"protecao.msalcache.bin"`.
3. Remover as linhas 28-30 (checagem de `cr40f_validacaoservico`).
4. Acrescentar antes do `EnsureStep`:
```csharp
const string Campos = "cr40f_destino,cr40f_endereodesada,cr40f_dataehorriodesada,cr40f_obsdeoperao,cr40f_horrioprevistoderetorno,cr40f_status,cr40f_trajeto,cr40f_cr,cr40f_idtenaris,cr40f_tipodeveiculo";
const string Filtro = Campos + ",new_snapshotsharepoint";
const string Imagem = Campos + ",new_camposprotegidos,new_snapshotsharepoint";
```
5. A chamada vira `EnsureStep(service, pluginTypeId, "Update", "cr40f_reservadeveculos", "Cr40f.Protecao: protege campos editados da Tenaris", solutionUniqueName, Filtro, Imagem);`.
6. `EnsureStep` ganha o parâmetro `string filteringAttributes`. Nos dois ramos, `["stage"] = new OptionSetValue(20)` e `["filteringattributes"] = filteringAttributes` (no Create também). `["rank"] = 1`, para rodar antes de outros steps de pré-operação. O resto continua igual: mode 0, imagem `pre`, solução.
7. `UpsertPluginType`: `["name"]` e `["friendlyname"] = "ProtegerCamposPlugin"`. `Log` com o prefixo `[protecao:plugin]`.
8. Modo de prova, executado depois do registro quando vier `--testar <id>`:
```csharp
if (options.Optional("testar") is { } testar)
{
    var id = Guid.Parse(testar);
    var colunas = new ColumnSet("cr40f_status", "new_camposprotegidos", "new_snapshotsharepoint");
    var antes = service.Retrieve("cr40f_reservadeveculos", id, colunas);
    var snapshot = antes.GetAttributeValue<string>("new_snapshotsharepoint") ?? throw new InvalidOperationException("Reserva sem snapshot: escolha uma da Tenaris.");
    var original = antes.GetAttributeValue<OptionSetValue>("cr40f_status");
    var listaOriginal = antes.GetAttributeValue<string>("new_camposprotegidos");
    // Precondição: status igual ao da planilha e não protegido. Assim a restauração no fim não protege o status de novo.
    if ((listaOriginal ?? "").ToLowerInvariant().Contains("cr40f_status") || !snapshot.Contains($"\"cr40f_status\":\"{original?.Value}\""))
        throw new InvalidOperationException("Escolha uma reserva da Tenaris com status igual ao da planilha e sem cr40f_status protegido.");
    try
    {
        var outro = original?.Value == 202410005 ? 202410001 : 202410005;
        service.Update(new Entity("cr40f_reservadeveculos", id) { ["cr40f_status"] = new OptionSetValue(outro) });
        var depoisEdicao = service.Retrieve("cr40f_reservadeveculos", id, colunas);
        Log($"edicao: status={depoisEdicao.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value} lista={depoisEdicao.GetAttributeValue<string>("new_camposprotegidos")}");
        service.Update(new Entity("cr40f_reservadeveculos", id) { ["cr40f_status"] = original, ["new_snapshotsharepoint"] = snapshot });
        var depoisSync = service.Retrieve("cr40f_reservadeveculos", id, colunas);
        var ok = depoisSync.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value == outro;
        Log($"sincronizacao simulada: status={depoisSync.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value} -> {(ok ? "BARRADA (ok)" : "SOBRESCREVEU (falha)")}");
        if (!ok) Environment.ExitCode = 1;
    }
    finally
    {
        // Volta a reserva ao estado de antes: primeiro a lista (assim o status não fica barrado), depois o status.
        service.Update(new Entity("cr40f_reservadeveculos", id) { ["new_camposprotegidos"] = listaOriginal });
        service.Update(new Entity("cr40f_reservadeveculos", id) { ["cr40f_status"] = original });
        Log("reserva restaurada");
    }
}
```
A restauração do status, que não traz snapshot, roda a regra A. Ela não protege porque a precondição garante que o status original é igual ao da planilha. A gravação só da lista não dispara o plugin, porque `new_camposprotegidos` não está no filtro.

- [ ] **Step 2: Script de publicação**

`packages/plugins/scripts/push-protecao-plugin.ps1`: copiar `push-portal-plugin.ps1` e trocar todos os `Portal`/`portal` por `Protecao`/`protecao` (projeto, testes, DLL, registrador, chave e prefixo do `Write-Step`). O bloqueio de `prod` continua.

- [ ] **Step 3: Script no `package.json`**

Acrescentar depois de `push:plugin:portal:dev` a mesma linha, trocando `push-portal-plugin.ps1` por `push-protecao-plugin.ps1` e a chave por `push:plugin:protecao:dev`. A chamada a `distribuir-apos-push.ps1` fica igual.

- [ ] **Step 4: Compilar o registrador**

Run: `dotnet build packages/plugins/tools/Cr40f.Protecao.Registrar`
Expected: `0 Erro(s)`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/tools/Cr40f.Protecao.Registrar packages/plugins/scripts/push-protecao-plugin.ps1 package.json
git commit -m "feat(plugins): registrador e push do plugin de campos protegidos, com prova --testar no DEV"
```

---

### Task 4: Skill de verificação, revisão, PR e publicação no DEV

**Files:**
- Modify: `.claude/skills/verificar-plugins/SKILL.md` (descrição do frontmatter e seção nova)

- [ ] **Step 1: Seção na skill**

Acrescentar `Cr40f.Protecao.Plugin` na `description` do frontmatter e esta seção antes de "## Casos de borda":
```markdown
## Proteção de campos da Tenaris (`ProtegerCamposPlugin`)
1. `dotnet test packages/plugins/Cr40f.Protecao.Plugin.Tests` → "Com falha: 0" (13 em 03/11/2026). Chave em `%USERPROFILE%\.codex\keys\Cr40f.Protecao.Plugin.snk`.
2. Regra: Update de `cr40f_reservadeveculos` sem `new_snapshotsharepoint` no Target, em reserva com snapshot → campo monitorado diferente da planilha entra em `new_camposprotegidos` (tipo de veículo, fora do snapshot, compara com o valor anterior). Update com snapshot (sincronização da Tenaris) → campos protegidos saem do Target. Proteção nunca é removida pelo plugin.
3. Publicar no DEV (só da `main`, checkout principal): `pnpm push:plugin:protecao:dev`. Step `Cr40f.Protecao: protege campos editados da Tenaris` (pré-operação 20, rank 1, filtro nos 10 campos + snapshot, imagem `pre`).
4. Prova no DEV: `dotnet run --project packages/plugins/tools/Cr40f.Protecao.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com/ --dllPath packages/plugins/Cr40f.Protecao.Plugin/bin/Release/net462/Cr40f.Protecao.Plugin.dll --testar <id de reserva da Tenaris com status igual ao da planilha e sem proteção de status>` → `edicao: ... lista=...cr40f_status`, `sincronizacao simulada: ... BARRADA (ok)`, `reserva restaurada`.
5. Não rode o flow da Tenaris no DEV de ponta a ponta (grava na planilha real).
6. PROD: só pelo workflow "Publicar soluções". Depois, prova pela auditoria: nenhuma troca de `cr40f_status` pelo noreply em reserva com `cr40f_status` em `new_camposprotegidos`.
```

- [ ] **Step 2: Qualidade e verificação**

Rodar a skill `qualidade-antes-do-pr` (passadas de `/simplify` + `karpathy-coder`, `/code-review high --fix`) e depois a `verificacao-manter` (executa a `verificar-plugins`, passos 1 e 4 da seção nova). Guardar a saída do `dotnet test` como evidência.

- [ ] **Step 3: Commit e PR**

```bash
git add .claude/skills/verificar-plugins/SKILL.md
git commit -m "docs(skills): verificar-plugins cobre o plugin de campos protegidos da Tenaris"
git push -u origin HEAD
gh pr create --title "feat(plugins): proteção de campos da Tenaris por plugin síncrono" --body "<objetivo, causa (flow com auditoria após a publicação de 03/11), regras A/B, cenários 1-5 com passou/falhou, prova --testar no DEV, fora do alcance>"
```

- [ ] **Step 4: Depois do merge (checkout principal, `main`, `git pull`)**

Run: `pnpm push:plugin:protecao:dev`, depois o passo 4 da skill com uma reserva da Tenaris do DEV.
Expected: `plugin publicado`, distribuição sem "ATENCAO" e `BARRADA (ok)`.

- [ ] **Step 5: TEST e PROD**

Workflow "Publicar soluções", primeiro com `alvo=test` e depois `prod` (backup e aprovação do Renan). Antes de publicar, conferir que a regra de `SdkMessageProcessingStep`/`PluginAssembly` em `packages/deploy/solucoes/regras.json` leva o step novo para a solução certa. Após o PROD, consultar a auditoria (passo 6 da skill).

---

## Fora deste plano
- Desligar ou remover o "Flow Campos Protegidos": PR à parte, depois de uma semana do plugin no PROD sem regressão.
- `Compose_Observacao` do flow da Tenaris lê `cr40f_observaointerna` mas grava `cr40f_obsdeoperao`: registrar como achado separado.
