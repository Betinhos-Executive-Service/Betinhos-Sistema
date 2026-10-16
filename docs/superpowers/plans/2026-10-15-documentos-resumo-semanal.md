# Documentos — Resumo semanal por e-mail: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda segunda às 07:00, cada destinatário cadastrado por categoria (Pessoas, Frota) recebe da noreply um e-mail com as contagens de documentos e a lista do que é urgente (vencidos, até 7 dias, faltantes).

**Architecture:** Um plugin C# (`Cr40f.Documentos.Plugin`) expõe a Custom API global `cr40f_DocumentosResumoSemanal`, que lê tipos, documentos vigentes, funcionários e veículos e devolve o resumo em JSON pela mesma regra do shell (`montarPendencias`). Um flow agendado chama a API, monta o HTML e envia. Plugin e flow são provisionados por scripts versionados; um fixture JSON compartilhado garante paridade entre C# e TypeScript.

**Tech Stack:** C# (.NET Framework 4.6.2, `Microsoft.CrmSdk.CoreAssemblies` 9.0.2.60, `DataContractJsonSerializer`), xUnit (net48), registrador .NET 8 (`Microsoft.PowerPlatform.Dataverse.Client` 1.2.10), Power Automate (definição WDL em JSON), PowerShell 5.1 + `az` CLI, Vitest e `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md` (com a §8 adicionada na Task 1).

## Global Constraints

- Ambiente: só DEV (`https://org23b93544.crm2.dynamics.com`). Nada em PROD sem ok explícito do Renan.
- Repo público: nenhum e-mail, URL de ambiente nova, ID de conexão ou chave em arquivo versionado. E-mail do remetente, URL do Sistema e e-mail do admin entram só por parâmetro de script.
- Chave de assinatura: `%USERPROFILE%\.codex\keys\Cr40f.Documentos.Plugin.snk`, criada pelo script de push se não existir; nunca no repo.
- Solução alvo: `appbetinhos` (AppBetinhos).
- Custom API: `cr40f_DocumentosResumoSemanal`, global (`bindingtype` 0), ação (`isfunction` false), sem efeitos colaterais. Entrada opcional `Hoje` (DateTime, tipo 1). Saída `ResumoJson` (String, tipo 10).
- Regra idêntica ao shell (`apps/shell/src/pages/documentos/domain/pendencias.ts` e `vencimento.ts`): marcos `vencido` < 0; `vence7` 0–7; `vence30` 8–30; `vence60` 31–60; tipo sem validade ou documento sem validade não alerta; faltante só se o tipo é obrigatório para o perfil do dono; dono e tipo inativos ficam fora; dois vigentes → vale o de maior validade (depois emissão, depois `modificadoEm`).
- Ordem das pendências: vencido, vence7, faltando, vence30, vence60; depois dias (nulo = 0), nome do dono (pt-BR), ordem do tipo, nome do tipo.
- Fuso: `E. South America Standard Time` (America/Sao_Paulo).
- Agenda do flow: semanal, segunda-feira, 07:00.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
packages/plugins/
  Cr40f.Documentos.Plugin/
    Cr40f.Documentos.Plugin.csproj
    Properties/AssemblyInfo.cs
    Codigos.cs              códigos de choice (cópia de domain/codes.ts)
    Modelo.cs               TipoDoc, Dono, DocEmitido, Pendencia, Categorias, Status
    Vencimento.cs           EstadoDe / DiasEntre (porta de vencimento.ts)
    Resumo.cs               DTOs do JSON de saída
    Json.cs                 serializar/ler com DataContractJsonSerializer
    ResumoBuilder.cs        porta de montarPendencias + montagem do resumo
    DataverseMapper.cs      Entity → modelo
    DocumentosRepository.cs consultas paginadas
    DocumentosResumoPlugin.cs IPlugin da Custom API
  Cr40f.Documentos.Plugin.Tests/
    Cr40f.Documentos.Plugin.Tests.csproj
    Fixtures/paridade.json  fixture compartilhado com o Vitest
    VencimentoTests.cs
    ResumoBuilderTests.cs
    ParidadeTests.cs
    DataverseMapperTests.cs
    FakeService.cs
    DocumentosResumoPluginTests.cs
  tools/Cr40f.Documentos.Registrar/
    Cr40f.Documentos.Registrar.csproj
    Program.cs              assembly + plugin type + Custom API + modo --testar
  scripts/push-documentos-plugin.ps1
apps/shell/src/pages/documentos/domain/paridade.test.ts
packages/deploy/
  package.json            (+ script test)
  flows/documentos-resumo-semanal.json
  flows/documentos-resumo-semanal.test.mjs
  provision-flow-documentos-resumo.ps1
package.json              (+ push:plugin:documentos:dev)
```

---

### Task 1: Projeto do plugin, domínio de vencimento e ajustes da spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md` (acrescentar §8 no fim)
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Cr40f.Documentos.Plugin.csproj`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Properties/AssemblyInfo.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Codigos.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Modelo.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Vencimento.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
- Test: `packages/plugins/Cr40f.Documentos.Plugin.Tests/VencimentoTests.cs`

**Interfaces:**
- Produces: `Codigos` (constantes e `ObrigDeFuncao(int?)`, `ObrigDeCategoriaVeiculo(int?)`), `Categorias.Pessoas/Frota/Todas`, `Status.*` (strings), `TipoDoc`, `Dono`, `DocEmitido`, `Pendencia(Dono, TipoDoc, DocEmitido?, string estado, int? dias)`, `EstadoValidade(Status, Dias)`, `Vencimento.EstadoDe(string? validade, string hoje, bool temValidade)`, `Vencimento.DiasEntre(string de, string ate)`.

- [ ] **Step 1: Acrescentar a §8 na spec**

Acrescente ao fim de `docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md`:

```markdown
## 8. Ajustes de implementação (15/10/2026)

- **Padrão de plugin da main:** projeto `packages/plugins/Cr40f.Documentos.Plugin` (+ `.Tests`) e registrador `packages/plugins/tools/Cr40f.Documentos.Registrar`, no molde do `Cr40f.Financeiro.Plugin`. A chave fica em `%USERPROFILE%\.codex\keys\Cr40f.Documentos.Plugin.snk`, criada pelo script de push; substitui o `generate-strong-name-key.ps1` citado na §2.
- **Ação, não função:** a Custom API é uma ação global (`isfunction` false). O conector Dataverse do Power Automate só executa ações não associadas. Continua sem efeitos colaterais.
- **Envio:** "Enviar um email (V2)" com "De (Enviar como)" = noreply, o padrão dos flows existentes. O e-mail ao administrador sai sem "De", para não depender da mesma permissão que pode ter causado a falha.
- **Provisionamento:** plugin e Custom API pelo registrador (login interativo do Dataverse); variáveis e flow por `provision-flow-documentos-resumo.ps1` com `az login`. E-mail da noreply, URL do Sistema e e-mail do admin entram por parâmetro.
- **Paridade:** o fixture `Fixtures/paridade.json` é escrito à mão, cobrindo os limites e casos da §5, em vez de exportar o mock do shell.
```

- [ ] **Step 2: Criar o projeto do plugin**

`packages/plugins/Cr40f.Documentos.Plugin/Cr40f.Documentos.Plugin.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <AssemblyName>Cr40f.Documentos.Plugin</AssemblyName>
    <RootNamespace>Cr40f.Documentos.Plugin</RootNamespace>
    <SignAssembly>true</SignAssembly>
    <AssemblyOriginatorKeyFile>$(UserProfile)\.codex\keys\Cr40f.Documentos.Plugin.snk</AssemblyOriginatorKeyFile>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Runtime.Serialization" />
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.60" />
  </ItemGroup>
</Project>
```

`packages/plugins/Cr40f.Documentos.Plugin/Properties/AssemblyInfo.cs`:

```csharp
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]
```

`packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`:

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
    <ProjectReference Include="..\Cr40f.Documentos.Plugin\Cr40f.Documentos.Plugin.csproj" />
  </ItemGroup>
  <ItemGroup>
    <None Include="Fixtures\**" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Garantir a chave de assinatura local**

Run (PowerShell):

```powershell
$k = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Documentos.Plugin.snk'
if (-not (Test-Path $k)) { [IO.Directory]::CreateDirectory((Split-Path $k)) | Out-Null; $r = [Security.Cryptography.RSACryptoServiceProvider]::new(2048); [IO.File]::WriteAllBytes($k, $r.ExportCspBlob($true)); $r.Dispose() }
Test-Path $k
```

Expected: `True`. A chave fica fora do repo.

- [ ] **Step 4: Escrever o teste que falha**

`packages/plugins/Cr40f.Documentos.Plugin.Tests/VencimentoTests.cs`:

```csharp
using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class VencimentoTests
{
    private const string Hoje = "2026-10-19";

    [Theory]
    [InlineData("2026-10-18", "vencido", -1)]
    [InlineData("2026-10-19", "vence7", 0)]
    [InlineData("2026-10-26", "vence7", 7)]
    [InlineData("2026-10-27", "vence30", 8)]
    [InlineData("2026-11-18", "vence30", 30)]
    [InlineData("2026-11-19", "vence60", 31)]
    [InlineData("2026-12-18", "vence60", 60)]
    [InlineData("2026-12-19", "ok", 61)]
    public void Limites_dos_marcos_iguais_ao_shell(string validade, string status, int dias)
    {
        var estado = Vencimento.EstadoDe(validade, Hoje, temValidade: true);
        Assert.Equal(status, estado.Status);
        Assert.Equal(dias, estado.Dias);
    }

    [Fact]
    public void Sem_validade_no_documento_nao_alerta()
    {
        var estado = Vencimento.EstadoDe(null, Hoje, temValidade: true);
        Assert.Equal(Status.SemValidade, estado.Status);
        Assert.Null(estado.Dias);
    }

    [Fact]
    public void Tipo_sem_validade_nao_alerta_mesmo_com_data()
    {
        var estado = Vencimento.EstadoDe("2026-10-18", Hoje, temValidade: false);
        Assert.Equal(Status.SemValidade, estado.Status);
    }

    [Fact]
    public void Codigos_de_perfil_iguais_ao_shell()
    {
        Assert.Equal(Codigos.ObrigMotorista, Codigos.ObrigDeFuncao(202410000));
        Assert.Equal(Codigos.ObrigAdministrativo, Codigos.ObrigDeFuncao(202410001));
        Assert.Null(Codigos.ObrigDeFuncao(null));
        Assert.Equal(Codigos.ObrigAluguel, Codigos.ObrigDeCategoriaVeiculo(100000002));
        Assert.Null(Codigos.ObrigDeCategoriaVeiculo(999));
    }
}
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: falha de compilação (`Vencimento`, `Status`, `Codigos` não existem).

- [ ] **Step 6: Implementar códigos, modelo e vencimento**

`packages/plugins/Cr40f.Documentos.Plugin/Codigos.cs`:

```csharp
namespace Cr40f.Documentos.Plugin;

/// <summary>Cópia de apps/shell/src/pages/documentos/domain/codes.ts. Mudou lá, muda aqui (o teste de paridade acusa).</summary>
public static class Codigos
{
    public const int CategoriaPessoas = 100000000;
    public const int CategoriaFrota = 100000001;
    public const int SituacaoVigente = 100000000;
    public const int SituacaoSubstituido = 100000001;

    public const int ObrigMotorista = 100000000;
    public const int ObrigAdministrativo = 100000001;
    public const int ObrigProprio = 100000002;
    public const int ObrigTerceiro = 100000003;
    public const int ObrigAluguel = 100000004;

    public const int FuncaoMotorista = 202410000;
    public const int FuncaoAdministrativo = 202410001;
    public const int VeiculoProprio = 100000000;
    public const int VeiculoTerceiro = 100000001;
    public const int VeiculoAluguel = 100000002;

    public const int FuncionarioDesligado = 1;
    public const int VeiculoVendido = 202410000;

    public static int? ObrigDeFuncao(int? funcao) => funcao switch
    {
        FuncaoMotorista => ObrigMotorista,
        FuncaoAdministrativo => ObrigAdministrativo,
        _ => null,
    };

    public static int? ObrigDeCategoriaVeiculo(int? categoria) => categoria switch
    {
        VeiculoProprio => ObrigProprio,
        VeiculoTerceiro => ObrigTerceiro,
        VeiculoAluguel => ObrigAluguel,
        _ => null,
    };
}
```

`packages/plugins/Cr40f.Documentos.Plugin/Modelo.cs`:

```csharp
using System.Runtime.Serialization;

namespace Cr40f.Documentos.Plugin;

public static class Categorias
{
    public const string Pessoas = "pessoas";
    public const string Frota = "frota";
    public static readonly string[] Todas = { Pessoas, Frota };
}

public static class Status
{
    public const string Vencido = "vencido";
    public const string Vence7 = "vence7";
    public const string Vence30 = "vence30";
    public const string Vence60 = "vence60";
    public const string Ok = "ok";
    public const string SemValidade = "semValidade";
    public const string Faltando = "faltando";
}

/// <summary>Mesmos nomes de campo do TipoDoc do shell (o fixture de paridade usa os dois).</summary>
[DataContract]
public sealed class TipoDoc
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "temValidade")] public bool TemValidade { get; set; }
    [DataMember(Name = "obrigatorioPara")] public int[] ObrigatorioPara { get; set; } = new int[0];
    [DataMember(Name = "ordem")] public int Ordem { get; set; }
    [DataMember(Name = "ativo")] public bool Ativo { get; set; } = true;
}

[DataContract]
public sealed class Dono
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "detalhe")] public string Detalhe { get; set; } = "";
    [DataMember(Name = "obrigKey")] public int? ObrigKey { get; set; }
    [DataMember(Name = "ativo")] public bool Ativo { get; set; } = true;
}

/// <summary>Datas em yyyy-MM-dd; ModificadoEm em ISO 8601.</summary>
[DataContract]
public sealed class DocEmitido
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "tipoId")] public string TipoId { get; set; } = "";
    [DataMember(Name = "donoId")] public string DonoId { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "emissao")] public string? Emissao { get; set; }
    [DataMember(Name = "validade")] public string? Validade { get; set; }
    [DataMember(Name = "situacao")] public string Situacao { get; set; } = "vigente";
    [DataMember(Name = "modificadoEm")] public string? ModificadoEm { get; set; }
}

public sealed class Pendencia
{
    public Pendencia(Dono dono, TipoDoc tipo, DocEmitido? doc, string estado, int? dias)
    {
        Dono = dono;
        Tipo = tipo;
        Doc = doc;
        Estado = estado;
        Dias = dias;
    }

    public Dono Dono { get; }
    public TipoDoc Tipo { get; }
    public DocEmitido? Doc { get; }
    public string Estado { get; }
    public int? Dias { get; }
}
```

`packages/plugins/Cr40f.Documentos.Plugin/Vencimento.cs`:

```csharp
using System;
using System.Globalization;

namespace Cr40f.Documentos.Plugin;

public sealed class EstadoValidade
{
    public EstadoValidade(string status, int? dias)
    {
        Status = status;
        Dias = dias;
    }

    public string Status { get; }
    public int? Dias { get; }
}

/// <summary>Porta de apps/shell/src/pages/documentos/domain/vencimento.ts (statusDe + marcoDe).</summary>
public static class Vencimento
{
    public const int JanelaDias = 60;

    public static int DiasEntre(string de, string ate) => (Data(ate) - Data(de)).Days;

    public static EstadoValidade EstadoDe(string? validade, string hoje, bool temValidade)
    {
        if (!temValidade || string.IsNullOrEmpty(validade)) return new EstadoValidade(Status.SemValidade, null);
        var dias = DiasEntre(hoje, validade!);
        if (dias < 0) return new EstadoValidade(Status.Vencido, dias);
        if (dias <= 7) return new EstadoValidade(Status.Vence7, dias);
        if (dias <= 30) return new EstadoValidade(Status.Vence30, dias);
        if (dias <= JanelaDias) return new EstadoValidade(Status.Vence60, dias);
        return new EstadoValidade(Status.Ok, dias);
    }

    private static DateTime Data(string iso) =>
        DateTime.ParseExact(iso.Substring(0, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: PASS, 11 testes.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md packages/plugins/Cr40f.Documentos.Plugin packages/plugins/Cr40f.Documentos.Plugin.Tests
git commit -m "feat(documentos): projeto do plugin do resumo semanal e regra de vencimento

Cria Cr40f.Documentos.Plugin (net462, assinado com chave fora do repo)
e o projeto de testes. Porta códigos de choice e statusDe/marcoDe do
shell para C#, com testes dos limites -1, 0, 7, 8, 30, 31, 60 e 61.
Registra na spec (§8) os ajustes de implementação: padrão de plugin da
main, Custom API como ação global, envio pela ação V2 com De = noreply e
fixture de paridade escrito à mão.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ResumoBuilder e paridade C# × TypeScript

**Files:**
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Resumo.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/Json.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/ResumoBuilder.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin.Tests/Fixtures/paridade.json`
- Test: `packages/plugins/Cr40f.Documentos.Plugin.Tests/ResumoBuilderTests.cs`
- Test: `packages/plugins/Cr40f.Documentos.Plugin.Tests/ParidadeTests.cs`
- Test: `apps/shell/src/pages/documentos/domain/paridade.test.ts`

**Interfaces:**
- Consumes: Task 1 (`TipoDoc`, `Dono`, `DocEmitido`, `Pendencia`, `Status`, `Categorias`, `Vencimento.EstadoDe`).
- Produces: `ResumoBuilder.MontarPendencias(IList<TipoDoc>, IList<Dono>, IList<DocEmitido>, string hoje) : List<Pendencia>`, `ResumoBuilder.Montar(...) : Resumo`, DTOs `Resumo { Hoje, Categorias }`, `ResumoCategoria { Categoria, Contagens, Urgentes }`, `Contagens { Vencido, Vence7, Vence30, Vence60, Faltando }`, `ItemUrgente { Dono, Detalhe, Tipo, Validade, Estado, Dias }`, `Json.Serializar<T>(T) : string`, `Json.Ler<T>(string) : T`.

- [ ] **Step 1: Escrever o fixture compartilhado**

`packages/plugins/Cr40f.Documentos.Plugin.Tests/Fixtures/paridade.json` (campos completos dos tipos do shell; o C# ignora os que não usa):

```json
{
  "hoje": "2026-10-19",
  "tipos": [
    { "id": "t-cnh", "codigo": "CNH", "nome": "CNH", "categoria": "pessoas", "temValidade": true, "validadePadraoMeses": 60, "obrigatorioPara": [100000000], "ordem": 1, "ativo": true },
    { "id": "t-aso", "codigo": "ASO", "nome": "ASO", "categoria": "pessoas", "temValidade": true, "validadePadraoMeses": 12, "obrigatorioPara": [100000000, 100000001], "ordem": 2, "ativo": true },
    { "id": "t-rg", "codigo": "RG", "nome": "RG", "categoria": "pessoas", "temValidade": false, "validadePadraoMeses": null, "obrigatorioPara": [100000000, 100000001], "ordem": 3, "ativo": true },
    { "id": "t-cert", "codigo": "CERT", "nome": "Certidão", "categoria": "pessoas", "temValidade": true, "validadePadraoMeses": 6, "obrigatorioPara": [], "ordem": 4, "ativo": true },
    { "id": "t-antec", "codigo": "ANTEC", "nome": "Antecedentes", "categoria": "pessoas", "temValidade": true, "validadePadraoMeses": 6, "obrigatorioPara": [], "ordem": 5, "ativo": true },
    { "id": "t-velho", "codigo": "VELHO", "nome": "Tipo antigo", "categoria": "pessoas", "temValidade": true, "validadePadraoMeses": null, "obrigatorioPara": [100000000], "ordem": 6, "ativo": false },
    { "id": "t-crlv", "codigo": "CRLV", "nome": "CRLV / Licenciamento", "categoria": "frota", "temValidade": true, "validadePadraoMeses": 12, "obrigatorioPara": [100000002, 100000003, 100000004], "ordem": 1, "ativo": true },
    { "id": "t-seguro", "codigo": "SEGURO", "nome": "Seguro", "categoria": "frota", "temValidade": true, "validadePadraoMeses": 12, "obrigatorioPara": [100000002], "ordem": 2, "ativo": true }
  ],
  "donos": [
    { "id": "p1", "categoria": "pessoas", "nome": "Ana Souza", "detalhe": "Motorista", "obrigKey": 100000000, "ativo": true, "email": "" },
    { "id": "p2", "categoria": "pessoas", "nome": "Bruno Lima", "detalhe": "Administrativo", "obrigKey": 100000001, "ativo": true, "email": "" },
    { "id": "p3", "categoria": "pessoas", "nome": "Carla Dias", "detalhe": "Motorista", "obrigKey": 100000000, "ativo": false, "email": "" },
    { "id": "v1", "categoria": "frota", "nome": "ABC1D23", "detalhe": "Toyota Corolla", "obrigKey": 100000002, "ativo": true, "email": "" },
    { "id": "v2", "categoria": "frota", "nome": "XYZ9W87", "detalhe": "Chevrolet Spin", "obrigKey": 100000004, "ativo": true, "email": "" }
  ],
  "docs": [
    { "id": "d1", "tipoId": "t-cnh", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-18", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d2", "tipoId": "t-aso", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-19", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d3", "tipoId": "t-rg", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": "2010-05-01", "validade": null, "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d4", "tipoId": "t-aso", "donoId": "p2", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-27", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d6", "tipoId": "t-cert", "donoId": "p2", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-11-18", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d7", "tipoId": "t-cnh", "donoId": "p3", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-01", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d8", "tipoId": "t-crlv", "donoId": "v1", "categoria": "frota", "numero": "", "emissao": null, "validade": "2026-12-18", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d9", "tipoId": "t-crlv", "donoId": "v2", "categoria": "frota", "numero": "", "emissao": null, "validade": "2026-12-19", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d10", "tipoId": "t-crlv", "donoId": "v2", "categoria": "frota", "numero": "", "emissao": null, "validade": "2026-10-01", "situacao": "substituido", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d12", "tipoId": "t-crlv", "donoId": "v2", "categoria": "frota", "numero": "", "emissao": null, "validade": "2026-10-25", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-02-01T00:00:00Z" },
    { "id": "d13", "tipoId": "t-velho", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-01", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d14", "tipoId": "t-cert", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-10-26", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d15", "tipoId": "t-antec", "donoId": "p1", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-11-19", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" },
    { "id": "d16", "tipoId": "t-antec", "donoId": "p2", "categoria": "pessoas", "numero": "", "emissao": null, "validade": "2026-12-19", "situacao": "vigente", "pasta": "", "observacao": "", "ultimoMarco": null, "modificadoEm": "2026-01-01T00:00:00Z" }
  ],
  "esperado": {
    "pessoas": {
      "contagens": { "vencido": 1, "vence7": 2, "vence30": 2, "vence60": 1, "faltando": 1 },
      "urgentes": [
        "Ana Souza|CNH|vencido|-1",
        "Ana Souza|ASO|vence7|0",
        "Ana Souza|Certidão|vence7|7",
        "Bruno Lima|RG|faltando|"
      ]
    },
    "frota": {
      "contagens": { "vencido": 0, "vence7": 0, "vence30": 0, "vence60": 1, "faltando": 1 },
      "urgentes": [
        "ABC1D23|Seguro|faltando|"
      ]
    }
  }
}
```

O que cada caso prova: d1/d2/d14/d4/d6/d15/d8/d9/d16 = limites −1, 0, 7, 8, 30, 31, 60, 61; d3 = documento sem validade; Bruno sem RG = faltante por perfil administrativo; Bruno sem CNH = não obrigatória para administrativo; Carla = dono inativo; d13 = tipo inativo; v2 com d9 e d12 vigentes = vale o de maior validade (61 dias, sem alerta); d10 = substituído ignorado; v1 sem seguro = faltante; v2 sem seguro = não obrigatório para aluguel.

- [ ] **Step 2: Escrever os testes C# que falham**

`packages/plugins/Cr40f.Documentos.Plugin.Tests/ParidadeTests.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

[DataContract]
public sealed class FixtureParidade
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "tipos")] public List<TipoDoc> Tipos { get; set; } = new();
    [DataMember(Name = "donos")] public List<Dono> Donos { get; set; } = new();
    [DataMember(Name = "docs")] public List<DocEmitido> Docs { get; set; } = new();
    [DataMember(Name = "esperado")] public EsperadoParidade Esperado { get; set; } = new();

    public static FixtureParidade Carregar() =>
        Json.Ler<FixtureParidade>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", "paridade.json")));
}

[DataContract]
public sealed class EsperadoParidade
{
    [DataMember(Name = "pessoas")] public EsperadoCategoria Pessoas { get; set; } = new();
    [DataMember(Name = "frota")] public EsperadoCategoria Frota { get; set; } = new();
}

[DataContract]
public sealed class EsperadoCategoria
{
    [DataMember(Name = "contagens")] public Contagens Contagens { get; set; } = new();
    [DataMember(Name = "urgentes")] public List<string> Urgentes { get; set; } = new();
}

public class ParidadeTests
{
    [Theory]
    [InlineData("pessoas")]
    [InlineData("frota")]
    public void Mesmas_contagens_e_mesma_lista_urgente_do_shell(string categoria)
    {
        var fixture = FixtureParidade.Carregar();
        var resumo = ResumoBuilder.Montar(fixture.Tipos, fixture.Donos, fixture.Docs, fixture.Hoje);
        var atual = resumo.Categorias.Single(c => c.Categoria == categoria);
        var esperado = categoria == Categorias.Frota ? fixture.Esperado.Frota : fixture.Esperado.Pessoas;

        Assert.Equal(Json.Serializar(esperado.Contagens), Json.Serializar(atual.Contagens));
        Assert.Equal(esperado.Urgentes, atual.Urgentes.Select(u => $"{u.Dono}|{u.Tipo}|{u.Estado}|{u.Dias}").ToList());
    }
}
```

`packages/plugins/Cr40f.Documentos.Plugin.Tests/ResumoBuilderTests.cs`:

```csharp
using System.Collections.Generic;
using System.Linq;
using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class ResumoBuilderTests
{
    [Fact]
    public void Sem_dados_as_duas_categorias_aparecem_zeradas()
    {
        var resumo = ResumoBuilder.Montar(new List<TipoDoc>(), new List<Dono>(), new List<DocEmitido>(), "2026-10-19");

        Assert.Equal("2026-10-19", resumo.Hoje);
        Assert.Equal(new[] { "pessoas", "frota" }, resumo.Categorias.Select(c => c.Categoria));
        Assert.All(resumo.Categorias, c =>
        {
            Assert.Equal(0, c.Contagens.Vencido + c.Contagens.Vence7 + c.Contagens.Vence30 + c.Contagens.Vence60 + c.Contagens.Faltando);
            Assert.Empty(c.Urgentes);
        });
    }

    [Fact]
    public void Faltante_sai_com_validade_e_dias_nulos_e_detalhe_do_dono()
    {
        var tipo = new TipoDoc { Id = "t", Nome = "Seguro", Categoria = Categorias.Frota, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigProprio }, Ativo = true };
        var dono = new Dono { Id = "v", Categoria = Categorias.Frota, Nome = "ABC1D23", Detalhe = "Toyota Corolla", ObrigKey = Codigos.ObrigProprio, Ativo = true };

        var item = ResumoBuilder.Montar(new[] { tipo }, new[] { dono }, new DocEmitido[0], "2026-10-19")
            .Categorias.Single(c => c.Categoria == Categorias.Frota).Urgentes.Single();

        Assert.Equal("ABC1D23", item.Dono);
        Assert.Equal("Toyota Corolla", item.Detalhe);
        Assert.Equal("Seguro", item.Tipo);
        Assert.Equal(Status.Faltando, item.Estado);
        Assert.Null(item.Validade);
        Assert.Null(item.Dias);
    }

    [Fact]
    public void Json_de_saida_segue_o_contrato_da_spec()
    {
        var tipo = new TipoDoc { Id = "t", Nome = "CNH", Categoria = Categorias.Pessoas, TemValidade = true, Ativo = true };
        var dono = new Dono { Id = "p", Categoria = Categorias.Pessoas, Nome = "Ana", Detalhe = "Motorista", ObrigKey = Codigos.ObrigMotorista, Ativo = true };
        var doc = new DocEmitido { Id = "d", TipoId = "t", DonoId = "p", Validade = "2026-10-15", Situacao = "vigente" };

        var json = Json.Serializar(ResumoBuilder.Montar(new[] { tipo }, new[] { dono }, new[] { doc }, "2026-10-19"));

        Assert.StartsWith("{\"hoje\":\"2026-10-19\",\"categorias\":[{\"categoria\":\"pessoas\",\"contagens\":{\"vencido\":1,\"vence7\":0,\"vence30\":0,\"vence60\":0,\"faltando\":0},\"urgentes\":[{\"dono\":\"Ana\",\"detalhe\":\"Motorista\",\"tipo\":\"CNH\",\"validade\":\"2026-10-15\",\"estado\":\"vencido\",\"dias\":-4}]}", json);
        Assert.Contains("{\"categoria\":\"frota\"", json);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: falha de compilação (`ResumoBuilder`, `Json`, `Contagens` não existem).

- [ ] **Step 4: Implementar DTOs, JSON e builder**

`packages/plugins/Cr40f.Documentos.Plugin/Resumo.cs`:

```csharp
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace Cr40f.Documentos.Plugin;

[DataContract]
public sealed class Resumo
{
    [DataMember(Name = "hoje", Order = 0)] public string Hoje { get; set; } = "";
    [DataMember(Name = "categorias", Order = 1)] public List<ResumoCategoria> Categorias { get; set; } = new();
}

[DataContract]
public sealed class ResumoCategoria
{
    [DataMember(Name = "categoria", Order = 0)] public string Categoria { get; set; } = "";
    [DataMember(Name = "contagens", Order = 1)] public Contagens Contagens { get; set; } = new();
    [DataMember(Name = "urgentes", Order = 2)] public List<ItemUrgente> Urgentes { get; set; } = new();
}

[DataContract]
public sealed class Contagens
{
    [DataMember(Name = "vencido", Order = 0)] public int Vencido { get; set; }
    [DataMember(Name = "vence7", Order = 1)] public int Vence7 { get; set; }
    [DataMember(Name = "vence30", Order = 2)] public int Vence30 { get; set; }
    [DataMember(Name = "vence60", Order = 3)] public int Vence60 { get; set; }
    [DataMember(Name = "faltando", Order = 4)] public int Faltando { get; set; }
}

[DataContract]
public sealed class ItemUrgente
{
    [DataMember(Name = "dono", Order = 0)] public string Dono { get; set; } = "";
    [DataMember(Name = "detalhe", Order = 1)] public string Detalhe { get; set; } = "";
    [DataMember(Name = "tipo", Order = 2)] public string Tipo { get; set; } = "";
    [DataMember(Name = "validade", Order = 3)] public string? Validade { get; set; }
    [DataMember(Name = "estado", Order = 4)] public string Estado { get; set; } = "";
    [DataMember(Name = "dias", Order = 5)] public int? Dias { get; set; }
}
```

`packages/plugins/Cr40f.Documentos.Plugin/Json.cs`:

```csharp
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Cr40f.Documentos.Plugin;

/// <summary>DataContractJsonSerializer: vem com o .NET Framework, sem dependência extra no sandbox.</summary>
public static class Json
{
    public static string Serializar<T>(T valor)
    {
        var serializer = new DataContractJsonSerializer(typeof(T));
        using var stream = new MemoryStream();
        serializer.WriteObject(stream, valor);
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    public static T Ler<T>(string json)
    {
        var serializer = new DataContractJsonSerializer(typeof(T));
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
        return (T)serializer.ReadObject(stream);
    }
}
```

`packages/plugins/Cr40f.Documentos.Plugin/ResumoBuilder.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Cr40f.Documentos.Plugin;

/// <summary>Porta de montarPendencias/indexarVigentes (apps/shell/src/pages/documentos/domain/pendencias.ts).</summary>
public static class ResumoBuilder
{
    private static readonly string[] Ordem = { Status.Vencido, Status.Vence7, Status.Faltando, Status.Vence30, Status.Vence60 };
    private static readonly HashSet<string> EmAlerta = new() { Status.Vencido, Status.Vence7, Status.Vence30, Status.Vence60 };
    private static readonly HashSet<string> Urgente = new() { Status.Vencido, Status.Vence7, Status.Faltando };
    private static readonly CompareInfo PtBr = CultureInfo.GetCultureInfo("pt-BR").CompareInfo;

    private static string Chave(string donoId, string tipoId) => donoId + "|" + tipoId;

    public static bool IsObrigatorio(TipoDoc tipo, Dono dono) =>
        dono.ObrigKey.HasValue && tipo.ObrigatorioPara.Contains(dono.ObrigKey.Value);

    /// <summary>Vigente por dono+tipo; com dois vigentes vale o de maior validade (ou emissão), depois o modificado mais recente.</summary>
    public static Dictionary<string, DocEmitido> IndexarVigentes(IEnumerable<DocEmitido> docs)
    {
        var mapa = new Dictionary<string, DocEmitido>();
        var ordenados = docs
            .Where(d => d.Situacao == "vigente")
            .OrderByDescending(d => d.Validade ?? d.Emissao ?? "", StringComparer.Ordinal)
            .ThenByDescending(d => d.ModificadoEm ?? "", StringComparer.Ordinal);
        foreach (var doc in ordenados)
        {
            var chave = Chave(doc.DonoId, doc.TipoId);
            if (!mapa.ContainsKey(chave)) mapa[chave] = doc;
        }
        return mapa;
    }

    public static List<Pendencia> MontarPendencias(IList<TipoDoc> tipos, IList<Dono> donos, IList<DocEmitido> docs, string hoje)
    {
        var vigentes = IndexarVigentes(docs);
        var lista = new List<Pendencia>();
        foreach (var dono in donos)
        {
            if (!dono.Ativo) continue;
            foreach (var tipo in tipos)
            {
                if (!tipo.Ativo || tipo.Categoria != dono.Categoria) continue;
                if (!vigentes.TryGetValue(Chave(dono.Id, tipo.Id), out var doc))
                {
                    if (IsObrigatorio(tipo, dono)) lista.Add(new Pendencia(dono, tipo, null, Status.Faltando, null));
                    continue;
                }
                var estado = Vencimento.EstadoDe(doc.Validade, hoje, tipo.TemValidade);
                if (EmAlerta.Contains(estado.Status)) lista.Add(new Pendencia(dono, tipo, doc, estado.Status, estado.Dias));
            }
        }
        // OrderBy é estável, como o sort do JavaScript.
        return lista.OrderBy(p => p, Comparer<Pendencia>.Create(Comparar)).ToList();
    }

    public static Resumo Montar(IList<TipoDoc> tipos, IList<Dono> donos, IList<DocEmitido> docs, string hoje)
    {
        var pendencias = MontarPendencias(tipos, donos, docs, hoje);
        var resumo = new Resumo { Hoje = hoje };
        foreach (var categoria in Categorias.Todas)
        {
            var daCategoria = pendencias.Where(p => p.Dono.Categoria == categoria).ToList();
            resumo.Categorias.Add(new ResumoCategoria
            {
                Categoria = categoria,
                Contagens = new Contagens
                {
                    Vencido = daCategoria.Count(p => p.Estado == Status.Vencido),
                    Vence7 = daCategoria.Count(p => p.Estado == Status.Vence7),
                    Vence30 = daCategoria.Count(p => p.Estado == Status.Vence30),
                    Vence60 = daCategoria.Count(p => p.Estado == Status.Vence60),
                    Faltando = daCategoria.Count(p => p.Estado == Status.Faltando),
                },
                Urgentes = daCategoria.Where(p => Urgente.Contains(p.Estado)).Select(p => new ItemUrgente
                {
                    Dono = p.Dono.Nome,
                    Detalhe = p.Dono.Detalhe,
                    Tipo = p.Tipo.Nome,
                    Validade = p.Doc?.Validade,
                    Estado = p.Estado,
                    Dias = p.Dias,
                }).ToList(),
            });
        }
        return resumo;
    }

    private static int Comparar(Pendencia a, Pendencia b)
    {
        var c = Array.IndexOf(Ordem, a.Estado).CompareTo(Array.IndexOf(Ordem, b.Estado));
        if (c != 0) return c;
        c = (a.Dias ?? 0).CompareTo(b.Dias ?? 0);
        if (c != 0) return c;
        c = PtBr.Compare(a.Dono.Nome, b.Dono.Nome);
        if (c != 0) return c;
        c = a.Tipo.Ordem.CompareTo(b.Tipo.Ordem);
        return c != 0 ? c : PtBr.Compare(a.Tipo.Nome, b.Tipo.Nome);
    }
}
```

- [ ] **Step 5: Rodar os testes C#**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: PASS, 16 testes.

- [ ] **Step 6: Escrever o teste de paridade no shell**

`apps/shell/src/pages/documentos/domain/paridade.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contarKpis, montarPendencias } from './pendencias'
import type { Categoria, DocEmitido, Dono, TipoDoc } from './types'

type Esperado = { contagens: Record<string, number>; urgentes: string[] }
type Fixture = { hoje: string; tipos: TipoDoc[]; donos: Dono[]; docs: DocEmitido[]; esperado: Record<Categoria, Esperado> }

// Mesmo arquivo usado pelos testes do plugin C# (Custom API cr40f_DocumentosResumoSemanal).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Documentos.Plugin.Tests/Fixtures/paridade.json', import.meta.url))
const fixture = JSON.parse(readFileSync(caminho, 'utf8')) as Fixture
const URGENTES = new Set(['vencido', 'vence7', 'faltando'])

describe('paridade com o resumo semanal do plugin', () => {
  for (const categoria of ['pessoas', 'frota'] as const) {
    it(`${categoria}: mesmas contagens e mesma lista urgente do fixture`, () => {
      const donos = fixture.donos.filter((d) => d.categoria === categoria)
      const pendencias = montarPendencias(fixture.tipos, donos, fixture.docs, fixture.hoje)
      expect(contarKpis(pendencias)).toEqual(fixture.esperado[categoria].contagens)
      const urgentes = pendencias.filter((p) => URGENTES.has(p.estado)).map((p) => `${p.dono.nome}|${p.tipo.nome}|${p.estado}|${p.dias ?? ''}`)
      expect(urgentes).toEqual(fixture.esperado[categoria].urgentes)
    })
  }
})
```

- [ ] **Step 7: Rodar o teste do shell**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/documentos/domain/paridade.test.ts`
Expected: PASS, 2 testes. Se falhar, a regra divergiu entre C# e TS: corrija o lado errado, nunca o fixture sem refazer a conta dos dias.

- [ ] **Step 8: Commit**

```bash
git add packages/plugins/Cr40f.Documentos.Plugin packages/plugins/Cr40f.Documentos.Plugin.Tests apps/shell/src/pages/documentos/domain/paridade.test.ts
git commit -m "feat(documentos): ResumoBuilder do resumo semanal com paridade C# × shell

Porta montarPendencias/indexarVigentes para C# e monta o JSON do
contrato da spec (contagens por estado e lista urgente com vencidos,
até 7 dias e faltantes, sempre com as duas categorias). Um fixture
compartilhado cobre limites, dono e tipo inativos, obrigatoriedade por
perfil, dois vigentes e substituídos; o mesmo arquivo é verificado pelo
xUnit e pelo Vitest do shell.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Leitura no Dataverse e plugin da Custom API

**Files:**
- Create: `packages/plugins/Cr40f.Documentos.Plugin/DataverseMapper.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/DocumentosRepository.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin/DocumentosResumoPlugin.cs`
- Create: `packages/plugins/Cr40f.Documentos.Plugin.Tests/FakeService.cs`
- Test: `packages/plugins/Cr40f.Documentos.Plugin.Tests/DataverseMapperTests.cs`
- Test: `packages/plugins/Cr40f.Documentos.Plugin.Tests/DocumentosResumoPluginTests.cs`

**Interfaces:**
- Consumes: Task 2 (`ResumoBuilder.Montar`, `Json.Serializar`), Task 1 (modelo e `Codigos`).
- Produces: `DataverseMapper.Tipo/Funcionario/Veiculo/Documento(Entity)`, `DocumentosRepository(IOrganizationService).Carregar() : DadosDocumentos { Tipos, Donos, Docs }`, `DocumentosResumoPlugin` (type name `Cr40f.Documentos.Plugin.DocumentosResumoPlugin`) com `Mensagem = "cr40f_DocumentosResumoSemanal"`, `ParametroHoje = "Hoje"`, `SaidaResumo = "ResumoJson"`, `Gerar(IOrganizationService, string hoje) : string`, `ResolverHoje(object? entrada, DateTime utcAgora) : string`.

Campos lidos (conferidos em `apps/shell/src/pages/documentos/data/queries.ts`): tipo `cr40f_name`, `cr40f_categoria`, `cr40f_temvalidade`, `cr40f_obrigatoriopara` (multi-choice), `cr40f_ordem`, `statecode`; documento `cr40f_tipo`, `cr40f_funcionario`, `cr40f_veiculo`, `cr40f_emissao`, `cr40f_validade`, `cr40f_situacao`, `modifiedon`; funcionário `new_apelido`, `cr40f_nomecompleto`, `cr40f_funcao`, `cr40f_status`; veículo `cr40f_placa`, `cr40f_marca`, `cr40f_modelo`, `new_categoriadoveiculo`, `cr40f_statusdoveiculo`.

- [ ] **Step 1: Escrever o serviço falso de testes**

`packages/plugins/Cr40f.Documentos.Plugin.Tests/FakeService.cs`:

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Documentos.Plugin.Tests;

/// <summary>Só RetrieveMultiple: devolve as linhas da tabela pedida, sem aplicar filtro (os filtros são conferidos em Consultas).</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<QueryExpression> Consultas { get; } = new();

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            lista.Add(linha);
        }
        return this;
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expressao = (QueryExpression)query;
        Consultas.Add(expressao);
        var linhas = _tabelas.TryGetValue(expressao.EntityName, out var lista) ? lista : new List<Entity>();
        return new EntityCollection(new List<Entity>(linhas)) { MoreRecords = false };
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
    public void Update(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
```

- [ ] **Step 2: Escrever os testes que falham**

`packages/plugins/Cr40f.Documentos.Plugin.Tests/DataverseMapperTests.cs`:

```csharp
using System;
using Cr40f.Documentos.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class DataverseMapperTests
{
    [Fact]
    public void Tipo_le_multi_choice_categoria_e_estado()
    {
        var id = Guid.NewGuid();
        var e = new Entity("cr40f_tipodocumento", id)
        {
            ["cr40f_name"] = " Seguro ",
            ["cr40f_categoria"] = new OptionSetValue(Codigos.CategoriaFrota),
            ["cr40f_temvalidade"] = true,
            ["cr40f_obrigatoriopara"] = new OptionSetValueCollection { new OptionSetValue(100000002), new OptionSetValue(100000004) },
            ["cr40f_ordem"] = 2,
            ["statecode"] = new OptionSetValue(1),
        };

        var tipo = DataverseMapper.Tipo(e);

        Assert.Equal(id.ToString(), tipo.Id);
        Assert.Equal("Seguro", tipo.Nome);
        Assert.Equal(Categorias.Frota, tipo.Categoria);
        Assert.True(tipo.TemValidade);
        Assert.Equal(new[] { 100000002, 100000004 }, tipo.ObrigatorioPara);
        Assert.Equal(2, tipo.Ordem);
        Assert.False(tipo.Ativo);
    }

    [Fact]
    public void Funcionario_usa_apelido_rotulo_da_funcao_e_desligado()
    {
        var e = new Entity("cr40f_funcionarios", Guid.NewGuid())
        {
            ["new_apelido"] = "",
            ["cr40f_nomecompleto"] = "Ana Souza",
            ["cr40f_funcao"] = new OptionSetValue(Codigos.FuncaoMotorista),
            ["cr40f_status"] = new OptionSetValue(Codigos.FuncionarioDesligado),
        };
        e.FormattedValues["cr40f_funcao"] = "Motorista";

        var dono = DataverseMapper.Funcionario(e);

        Assert.Equal(Categorias.Pessoas, dono.Categoria);
        Assert.Equal("Ana Souza", dono.Nome);
        Assert.Equal("Motorista", dono.Detalhe);
        Assert.Equal(Codigos.ObrigMotorista, dono.ObrigKey);
        Assert.False(dono.Ativo);
    }

    [Fact]
    public void Veiculo_usa_placa_marca_modelo_e_vendido()
    {
        var e = new Entity("cr40f_veiculos", Guid.NewGuid())
        {
            ["cr40f_placa"] = "ABC1D23",
            ["cr40f_marca"] = "Toyota",
            ["cr40f_modelo"] = "Corolla",
            ["new_categoriadoveiculo"] = new OptionSetValue(Codigos.VeiculoProprio),
            ["cr40f_statusdoveiculo"] = new OptionSetValue(1),
        };

        var dono = DataverseMapper.Veiculo(e);

        Assert.Equal("ABC1D23", dono.Nome);
        Assert.Equal("Toyota Corolla", dono.Detalhe);
        Assert.Equal(Codigos.ObrigProprio, dono.ObrigKey);
        Assert.True(dono.Ativo);
    }

    [Fact]
    public void Documento_de_veiculo_com_datas_so_data()
    {
        var tipoId = Guid.NewGuid();
        var veiculoId = Guid.NewGuid();
        var e = new Entity("cr40f_documento", Guid.NewGuid())
        {
            ["cr40f_tipo"] = new EntityReference("cr40f_tipodocumento", tipoId),
            ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", veiculoId),
            ["cr40f_validade"] = new DateTime(2026, 12, 18),
            ["cr40f_situacao"] = new OptionSetValue(Codigos.SituacaoVigente),
            ["modifiedon"] = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc),
        };

        var doc = DataverseMapper.Documento(e);

        Assert.Equal(tipoId.ToString(), doc.TipoId);
        Assert.Equal(veiculoId.ToString(), doc.DonoId);
        Assert.Equal(Categorias.Frota, doc.Categoria);
        Assert.Equal("2026-12-18", doc.Validade);
        Assert.Null(doc.Emissao);
        Assert.Equal("vigente", doc.Situacao);
        Assert.StartsWith("2026-10-01T12:00:00", doc.ModificadoEm);
    }
}
```

`packages/plugins/Cr40f.Documentos.Plugin.Tests/DocumentosResumoPluginTests.cs`:

```csharp
using System;
using System.Linq;
using Cr40f.Documentos.Plugin;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class DocumentosResumoPluginTests
{
    [Fact]
    public void Gerar_le_o_dataverse_e_devolve_o_resumo()
    {
        var veiculo = new Entity("cr40f_veiculos", Guid.NewGuid())
        {
            ["cr40f_placa"] = "ABC1D23",
            ["new_categoriadoveiculo"] = new OptionSetValue(Codigos.VeiculoProprio),
            ["cr40f_statusdoveiculo"] = new OptionSetValue(1),
        };
        var seguro = new Entity("cr40f_tipodocumento", Guid.NewGuid())
        {
            ["cr40f_name"] = "Seguro",
            ["cr40f_categoria"] = new OptionSetValue(Codigos.CategoriaFrota),
            ["cr40f_temvalidade"] = true,
            ["cr40f_obrigatoriopara"] = new OptionSetValueCollection { new OptionSetValue(Codigos.ObrigProprio) },
            ["statecode"] = new OptionSetValue(0),
        };
        var service = new FakeService().Com(veiculo, seguro);

        var resumo = Json.Ler<Resumo>(DocumentosResumoPlugin.Gerar(service, "2026-10-19"));

        Assert.Equal("2026-10-19", resumo.Hoje);
        var frota = resumo.Categorias.Single(c => c.Categoria == Categorias.Frota);
        Assert.Equal(1, frota.Contagens.Faltando);
        Assert.Equal("ABC1D23|Seguro|faltando", string.Join("|", frota.Urgentes.Single().Dono, frota.Urgentes.Single().Tipo, frota.Urgentes.Single().Estado));
    }

    [Fact]
    public void Documentos_sao_lidos_so_ativos_e_vigentes()
    {
        var service = new FakeService();

        DocumentosResumoPlugin.Gerar(service, "2026-10-19");

        var consulta = service.Consultas.Single(q => q.EntityName == "cr40f_documento");
        Assert.Contains(consulta.Criteria.Conditions, c => c.AttributeName == "statecode" && c.Operator == ConditionOperator.Equal && (int)c.Values[0] == 0);
        Assert.Contains(consulta.Criteria.Conditions, c => c.AttributeName == "cr40f_situacao" && (int)c.Values[0] == Codigos.SituacaoVigente);
    }

    [Fact]
    public void Hoje_informado_vale_como_data()
    {
        Assert.Equal("2026-10-19", DocumentosResumoPlugin.ResolverHoje(new DateTime(2026, 10, 19, 0, 0, 0, DateTimeKind.Utc), DateTime.UtcNow));
    }

    [Fact]
    public void Sem_hoje_usa_a_data_de_brasilia()
    {
        // 02:00 UTC de 20/10 ainda é 19/10 em Brasília (UTC-3).
        Assert.Equal("2026-10-19", DocumentosResumoPlugin.ResolverHoje(null, new DateTime(2026, 10, 20, 2, 0, 0, DateTimeKind.Utc)));
    }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: falha de compilação (`DataverseMapper`, `DocumentosResumoPlugin` não existem).

- [ ] **Step 4: Implementar mapper, repositório e plugin**

`packages/plugins/Cr40f.Documentos.Plugin/DataverseMapper.cs`:

```csharp
using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Documentos.Plugin;

/// <summary>Entity → modelo, com as mesmas regras de apps/shell/src/pages/documentos/data/queries.ts.</summary>
public static class DataverseMapper
{
    public static TipoDoc Tipo(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Nome = Texto(e, "cr40f_name"),
        Categoria = Inteiro(e, "cr40f_categoria") == Codigos.CategoriaFrota ? Categorias.Frota : Categorias.Pessoas,
        TemValidade = e.GetAttributeValue<bool>("cr40f_temvalidade"),
        ObrigatorioPara = e.GetAttributeValue<OptionSetValueCollection>("cr40f_obrigatoriopara")?.Select(o => o.Value).ToArray() ?? new int[0],
        Ordem = e.GetAttributeValue<int?>("cr40f_ordem") ?? 0,
        Ativo = Inteiro(e, "statecode") != 1,
    };

    public static Dono Funcionario(Entity e)
    {
        var apelido = Texto(e, "new_apelido");
        return new Dono
        {
            Id = e.Id.ToString(),
            Categoria = Categorias.Pessoas,
            Nome = apelido.Length > 0 ? apelido : Texto(e, "cr40f_nomecompleto"),
            Detalhe = e.FormattedValues.Contains("cr40f_funcao") ? e.FormattedValues["cr40f_funcao"] : "",
            ObrigKey = Codigos.ObrigDeFuncao(Inteiro(e, "cr40f_funcao")),
            Ativo = Inteiro(e, "cr40f_status") != Codigos.FuncionarioDesligado,
        };
    }

    public static Dono Veiculo(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Categoria = Categorias.Frota,
        Nome = Texto(e, "cr40f_placa"),
        Detalhe = string.Join(" ", new[] { Texto(e, "cr40f_marca"), Texto(e, "cr40f_modelo") }.Where(s => s.Length > 0)),
        ObrigKey = Codigos.ObrigDeCategoriaVeiculo(Inteiro(e, "new_categoriadoveiculo")),
        Ativo = Inteiro(e, "cr40f_statusdoveiculo") != Codigos.VeiculoVendido,
    };

    public static DocEmitido Documento(Entity e)
    {
        var funcionario = e.GetAttributeValue<EntityReference>("cr40f_funcionario");
        var veiculo = e.GetAttributeValue<EntityReference>("cr40f_veiculo");
        return new DocEmitido
        {
            Id = e.Id.ToString(),
            TipoId = e.GetAttributeValue<EntityReference>("cr40f_tipo")?.Id.ToString() ?? "",
            DonoId = (funcionario ?? veiculo)?.Id.ToString() ?? "",
            Categoria = funcionario != null ? Categorias.Pessoas : Categorias.Frota,
            Emissao = Data(e, "cr40f_emissao"),
            Validade = Data(e, "cr40f_validade"),
            Situacao = Inteiro(e, "cr40f_situacao") == Codigos.SituacaoSubstituido ? "substituido" : "vigente",
            ModificadoEm = e.GetAttributeValue<DateTime?>("modifiedon")?.ToString("o", CultureInfo.InvariantCulture),
        };
    }

    private static string Texto(Entity e, string campo) => (e.GetAttributeValue<string>(campo) ?? "").Trim();

    private static int? Inteiro(Entity e, string campo)
    {
        if (!e.Contains(campo)) return null;
        return e[campo] switch
        {
            OptionSetValue opcao => opcao.Value,
            int numero => numero,
            _ => null,
        };
    }

    /// <summary>Colunas "só data": o SDK devolve meia-noite, então a data vale como está.</summary>
    private static string? Data(Entity e, string campo) =>
        e.GetAttributeValue<DateTime?>(campo)?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
```

`packages/plugins/Cr40f.Documentos.Plugin/DocumentosRepository.cs`:

```csharp
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Documentos.Plugin;

public sealed class DadosDocumentos
{
    public List<TipoDoc> Tipos { get; } = new();
    public List<Dono> Donos { get; } = new();
    public List<DocEmitido> Docs { get; } = new();
}

public sealed class DocumentosRepository
{
    private readonly IOrganizationService _service;

    public DocumentosRepository(IOrganizationService service) => _service = service;

    public DadosDocumentos Carregar()
    {
        var dados = new DadosDocumentos();

        // Tipos inativos também vêm: o builder os ignora, como no shell.
        dados.Tipos.AddRange(Todos(Consulta("cr40f_tipodocumento", "cr40f_name", "cr40f_categoria", "cr40f_temvalidade", "cr40f_obrigatoriopara", "cr40f_ordem", "statecode")).Select(DataverseMapper.Tipo));

        var docs = Consulta("cr40f_documento", "cr40f_tipo", "cr40f_funcionario", "cr40f_veiculo", "cr40f_emissao", "cr40f_validade", "cr40f_situacao", "modifiedon");
        docs.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        docs.Criteria.AddCondition("cr40f_situacao", ConditionOperator.Equal, Codigos.SituacaoVigente);
        dados.Docs.AddRange(Todos(docs).Select(DataverseMapper.Documento));

        var funcionarios = Consulta("cr40f_funcionarios", "new_apelido", "cr40f_nomecompleto", "cr40f_funcao", "cr40f_status");
        funcionarios.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Donos.AddRange(Todos(funcionarios).Select(DataverseMapper.Funcionario));

        var veiculos = Consulta("cr40f_veiculos", "cr40f_placa", "cr40f_marca", "cr40f_modelo", "new_categoriadoveiculo", "cr40f_statusdoveiculo");
        veiculos.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Donos.AddRange(Todos(veiculos).Select(DataverseMapper.Veiculo));

        return dados;
    }

    private static QueryExpression Consulta(string tabela, params string[] colunas) => new(tabela)
    {
        ColumnSet = new ColumnSet(colunas),
        PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
    };

    private IEnumerable<Entity> Todos(QueryExpression consulta)
    {
        while (true)
        {
            var pagina = _service.RetrieveMultiple(consulta);
            foreach (var linha in pagina.Entities) yield return linha;
            if (!pagina.MoreRecords) yield break;
            consulta.PageInfo.PageNumber++;
            consulta.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}
```

`packages/plugins/Cr40f.Documentos.Plugin/DocumentosResumoPlugin.cs`:

```csharp
using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Documentos.Plugin;

/// <summary>Custom API global cr40f_DocumentosResumoSemanal: só leitura, no contexto de quem chama (o dono da conexão do flow).</summary>
public sealed class DocumentosResumoPlugin : IPlugin
{
    public const string Mensagem = "cr40f_DocumentosResumoSemanal";
    public const string ParametroHoje = "Hoje";
    public const string SaidaResumo = "ResumoJson";
    private const string FusoBrasilia = "E. South America Standard Time";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo resumo de documentos.");
            var service = factory.CreateOrganizationService(context.UserId);
            var entrada = context.InputParameters.Contains(ParametroHoje) ? context.InputParameters[ParametroHoje] : null;
            var hoje = ResolverHoje(entrada, DateTime.UtcNow);
            context.OutputParameters[SaidaResumo] = Gerar(service, hoje);
            tracing.Trace("{0}: resumo de {1} gerado", Mensagem, hoje);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível montar o resumo de documentos. " + error.Message, error);
        }
    }

    public static string Gerar(IOrganizationService service, string hoje)
    {
        var dados = new DocumentosRepository(service).Carregar();
        return Json.Serializar(ResumoBuilder.Montar(dados.Tipos, dados.Donos, dados.Docs, hoje));
    }

    public static string ResolverHoje(object? entrada, DateTime utcAgora)
    {
        if (entrada is DateTime informado && informado != DateTime.MinValue)
            return informado.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        DateTime local;
        try
        {
            local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcAgora, DateTimeKind.Utc), TimeZoneInfo.FindSystemTimeZoneById(FusoBrasilia));
        }
        catch (TimeZoneNotFoundException)
        {
            local = utcAgora.AddHours(-3); // Brasília sem horário de verão desde 2019.
        }
        return local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Documentos.Plugin.Tests/Cr40f.Documentos.Plugin.Tests.csproj`
Expected: PASS, 24 testes.

- [ ] **Step 6: Conferir que o build Release sai assinado**

Run: `dotnet build packages/plugins/Cr40f.Documentos.Plugin/Cr40f.Documentos.Plugin.csproj -c Release` e depois, em PowerShell, `[BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName((Resolve-Path 'packages/plugins/Cr40f.Documentos.Plugin/bin/Release/net462/Cr40f.Documentos.Plugin.dll')).GetPublicKeyToken())`
Expected: build sem erros e um token de 8 bytes não vazio.

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/Cr40f.Documentos.Plugin packages/plugins/Cr40f.Documentos.Plugin.Tests
git commit -m "feat(documentos): plugin da Custom API cr40f_DocumentosResumoSemanal

Lê tipos, documentos ativos e vigentes, funcionários e veículos com
paginação, no contexto do usuário que chama, mapeando os campos com as
mesmas regras do shell (apelido, rótulo da função, desligado, vendido,
datas só data). Sem Hoje informado, usa a data de Brasília. Testes com
serviço falso cobrem mapeamento, filtros da consulta e fuso.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Registrador e script de publicação do plugin

**Files:**
- Create: `packages/plugins/tools/Cr40f.Documentos.Registrar/Cr40f.Documentos.Registrar.csproj`
- Create: `packages/plugins/tools/Cr40f.Documentos.Registrar/Program.cs`
- Create: `packages/plugins/scripts/push-documentos-plugin.ps1`
- Modify: `package.json` (raiz, bloco `scripts`)

**Interfaces:**
- Consumes: Task 3 (DLL `Cr40f.Documentos.Plugin.dll`, type `Cr40f.Documentos.Plugin.DocumentosResumoPlugin`, parâmetros `Hoje`/`ResumoJson`).
- Produces: comando `pnpm push:plugin:documentos:dev`; modo de verificação `dotnet run --project packages/plugins/tools/Cr40f.Documentos.Registrar -- --environmentUrl <url> --testar [yyyy-MM-dd]`. A Task 5 depende da Custom API registrada por este comando.

- [ ] **Step 1: Criar o projeto do registrador**

`packages/plugins/tools/Cr40f.Documentos.Registrar/Cr40f.Documentos.Registrar.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.PowerPlatform.Dataverse.Client" Version="1.2.10" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Escrever o registrador**

`packages/plugins/tools/Cr40f.Documentos.Registrar/Program.cs`:

```csharp
using System.Globalization;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin do resumo semanal de documentos e a Custom API global cr40f_DocumentosResumoSemanal.
// Modo de verificação: --testar [yyyy-MM-dd] chama a Custom API e imprime o ResumoJson.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var testar = options.Has("testar");
var dllPath = testar ? "" : options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string PluginTypeName = "Cr40f.Documentos.Plugin.DocumentosResumoPlugin";
const string CustomApiName = "cr40f_DocumentosResumoSemanal";
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "documentos.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

if (testar)
{
    var request = new OrganizationRequest(CustomApiName);
    var hoje = options.Optional("testar");
    if (hoje is not null) request["Hoje"] = DateTime.SpecifyKind(DateTime.ParseExact(hoje, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Utc);
    Console.WriteLine(service.Execute(request)["ResumoJson"]);
    return;
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
var pluginTypeId = UpsertPluginType(service, assemblyId);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
EnsureCustomApi(service, pluginTypeId, solutionUniqueName);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin do resumo semanal registrado");

static void Log(string message) => Console.WriteLine($"[documentos:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

static Guid UpsertAssembly(ServiceClient service, AssemblyInfo info, string content)
{
    var existing = FindSingleOrNone(service, "pluginassembly", ("name", info.Name));
    if (existing is not null)
    {
        Log($"atualizando assembly {info.Name}");
        service.Update(new Entity("pluginassembly", existing.Id) { ["content"] = content, ["version"] = info.Version });
        return existing.Id;
    }
    Log($"criando assembly {info.Name}");
    return service.Create(new Entity("pluginassembly")
    {
        ["name"] = info.Name,
        ["content"] = content,
        ["isolationmode"] = new OptionSetValue(2),
        ["sourcetype"] = new OptionSetValue(0),
        ["version"] = info.Version,
        ["culture"] = info.Culture,
        ["publickeytoken"] = info.PublicKeyToken,
    });
}

static Guid UpsertPluginType(ServiceClient service, Guid assemblyId)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", PluginTypeName), ("pluginassemblyid", assemblyId));
    if (existing is not null)
    {
        Log($"reutilizando tipo {PluginTypeName}");
        return existing.Id;
    }
    Log($"criando tipo {PluginTypeName}");
    return service.Create(new Entity("plugintype")
    {
        ["name"] = "DocumentosResumoPlugin",
        ["friendlyname"] = "DocumentosResumoPlugin",
        ["typename"] = PluginTypeName,
        ["pluginassemblyid"] = Ref("pluginassembly", assemblyId),
    });
}

static void EnsureCustomApi(ServiceClient service, Guid pluginTypeId, string solution)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", CustomApiName));
    if (existing is not null)
    {
        Log($"reutilizando Custom API {CustomApiName}");
        var update = new UpdateRequest { Target = new Entity("customapi", existing.Id) { ["plugintypeid"] = Ref("plugintype", pluginTypeId) } };
        update["SolutionUniqueName"] = solution;
        service.Execute(update);
        customApiId = existing.Id;
    }
    else
    {
        Log($"criando Custom API {CustomApiName}");
        var create = new CreateRequest
        {
            Target = new Entity("customapi")
            {
                ["uniquename"] = CustomApiName,
                ["name"] = CustomApiName,
                ["displayname"] = "Documentos | Resumo semanal",
                ["description"] = "Monta o resumo semanal de documentos (contagens e lista urgente por categoria). Somente leitura.",
                ["bindingtype"] = new OptionSetValue(0),
                ["isfunction"] = false,
                ["isprivate"] = false,
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
                ["plugintypeid"] = Ref("plugintype", pluginTypeId),
                ["iscustomizable"] = new BooleanManagedProperty(false),
            },
        };
        create["SolutionUniqueName"] = solution;
        customApiId = ((CreateResponse)service.Execute(create)).id;
    }

    if (!ChildExists(service, "customapirequestparameter", customApiId, "Hoje"))
    {
        Log("criando parametro Hoje");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = "Hoje",
            ["name"] = $"{CustomApiName}.Hoje",
            ["displayname"] = "Hoje",
            ["description"] = "Data de referência. Ausente: data atual em Brasília.",
            ["type"] = new OptionSetValue(1),
            ["isoptional"] = true,
            ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }

    if (!ChildExists(service, "customapiresponseproperty", customApiId, "ResumoJson"))
    {
        Log("criando resposta ResumoJson");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = "ResumoJson",
            ["name"] = $"{CustomApiName}.ResumoJson",
            ["displayname"] = "Resumo JSON",
            ["description"] = "Resumo por categoria: contagens e lista urgente.",
            ["type"] = new OptionSetValue(10),
            ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
}

static bool ChildExists(ServiceClient service, string logicalName, Guid customApiId, string uniqueName)
{
    var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet(false), TopCount = 1 };
    query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, customApiId);
    query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
    return service.RetrieveMultiple(query).Entities.Count > 0;
}

static void CreateInSolution(ServiceClient service, Entity entity, string solution)
{
    var request = new CreateRequest { Target = entity };
    request["SolutionUniqueName"] = solution;
    service.Execute(request);
}

static void EnsureSolutionComponent(ServiceClient service, Guid componentId, string solution, int componentType)
{
    try
    {
        service.Execute(new OrganizationRequest("AddSolutionComponent")
        {
            ["ComponentId"] = componentId,
            ["ComponentType"] = componentType,
            ["SolutionUniqueName"] = solution,
            ["AddRequiredComponents"] = true,
        });
        Log($"componente {componentType} incluido na solucao {solution}");
    }
    catch (Exception error) when (error.Message.Contains("already", StringComparison.OrdinalIgnoreCase) || error.Message.Contains("ja existe", StringComparison.OrdinalIgnoreCase))
    {
        Log($"componente {componentType} ja pertence a solucao {solution}");
    }
}

static Entity? FindSingleOrNone(ServiceClient service, string logicalName, params (string Attribute, object Value)[] conditions)
{
    var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet($"{logicalName}id"), TopCount = 2 };
    foreach (var (attribute, value) in conditions) query.Criteria.AddCondition(attribute, ConditionOperator.Equal, value);
    var rows = service.RetrieveMultiple(query).Entities;
    if (rows.Count > 1) throw new InvalidOperationException($"Mais de um registro encontrado: {logicalName}.");
    return rows.SingleOrDefault();
}

internal sealed record AssemblyInfo(string Name, string Version, string Culture, string PublicKeyToken)
{
    public static AssemblyInfo Read(string dllPath)
    {
        var name = AssemblyName.GetAssemblyName(dllPath);
        var token = name.GetPublicKeyToken();
        var publicKeyToken = token is null || token.Length == 0 ? string.Empty : string.Concat(token.Select(b => b.ToString("x2")));
        return new AssemblyInfo(name.Name ?? throw new InvalidOperationException("Assembly sem nome."), name.Version?.ToString() ?? "1.0.0.0", string.IsNullOrWhiteSpace(name.CultureName) ? "neutral" : name.CultureName, publicKeyToken);
    }
}

internal sealed class Arguments
{
    private readonly Dictionary<string, string?> _values;
    private Arguments(Dictionary<string, string?> values) => _values = values;

    public static Arguments Parse(string[] args)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal)) throw new InvalidOperationException($"Argumento invalido: {key}");
            var value = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal) ? args[++index] : null;
            values[key[2..]] = value;
        }
        return new Arguments(values);
    }

    public string Require(string name) => Optional(name) ?? throw new InvalidOperationException($"Argumento obrigatorio: --{name}");
    public string? Optional(string name) => _values.TryGetValue(name, out var value) ? value : null;
    public bool Has(string name) => _values.ContainsKey(name);
}
```

- [ ] **Step 3: Compilar o registrador**

Run: `dotnet build packages/plugins/tools/Cr40f.Documentos.Registrar/Cr40f.Documentos.Registrar.csproj`
Expected: build sem erros.

- [ ] **Step 4: Escrever o script de publicação**

`packages/plugins/scripts/push-documentos-plugin.ps1`:

```powershell
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string] $EnvironmentUrl,

  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string] $EnvironmentName,

  [string] $SolutionUniqueName = 'appbetinhos'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string] $message) { Write-Host "[documentos:plugin:$EnvironmentName] $message" }

if ($EnvironmentName -eq 'prod') { throw 'Publicacao em PROD exige ok explicito do Renan; rode manualmente apos a aprovacao.' }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { throw 'dotnet SDK 8 ou superior nao encontrado.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pluginProject = Join-Path $root 'packages\plugins\Cr40f.Documentos.Plugin\Cr40f.Documentos.Plugin.csproj'
$testsProject = Join-Path $root 'packages\plugins\Cr40f.Documentos.Plugin.Tests\Cr40f.Documentos.Plugin.Tests.csproj'
$dllPath = Join-Path $root 'packages\plugins\Cr40f.Documentos.Plugin\bin\Release\net462\Cr40f.Documentos.Plugin.dll'
$registrar = Join-Path $root 'packages\plugins\tools\Cr40f.Documentos.Registrar\Cr40f.Documentos.Registrar.csproj'
$signingKeyPath = Join-Path $env:USERPROFILE '.codex\keys\Cr40f.Documentos.Plugin.snk'

if (-not (Test-Path -LiteralPath $signingKeyPath -PathType Leaf)) {
  Write-Step "criando chave persistente de assinatura em $signingKeyPath"
  [IO.Directory]::CreateDirectory((Split-Path -Parent $signingKeyPath)) | Out-Null
  $rsa = [Security.Cryptography.RSACryptoServiceProvider]::new(2048)
  try { [IO.File]::WriteAllBytes($signingKeyPath, $rsa.ExportCspBlob($true)) } finally { $rsa.Dispose() }
}

Write-Step 'rodando testes do plugin'
& $dotnet.Source test $testsProject
if ($LASTEXITCODE -ne 0) { throw "Testes do plugin falharam. Codigo: $LASTEXITCODE" }

Write-Step 'compilando plugin'
& $dotnet.Source build $pluginProject --configuration Release
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar plugin. Codigo: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dllPath)) { throw "DLL nao encontrada apos o build: $dllPath" }

$token = [BitConverter]::ToString([Reflection.AssemblyName]::GetAssemblyName($dllPath).GetPublicKeyToken()).Replace('-', '').ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($token)) { throw "DLL gerada sem assinatura: $dllPath" }
Write-Step "DLL assinada com public key token $token"

Write-Step 'registrando assembly e Custom API e publicando'
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --publish
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar plugin. Codigo: $LASTEXITCODE" }

Write-Step 'concluido'
```

- [ ] **Step 5: Adicionar o atalho na raiz**

Em `package.json` (raiz), no bloco `scripts`, logo depois de `push:plugin:financeiro:dev`, acrescente:

```json
    "push:plugin:documentos:dev": "powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/push-documentos-plugin.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -EnvironmentName dev"
```

(Não esqueça a vírgula no fim da linha anterior.) Confira com `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`: sem saída = JSON válido.

- [ ] **Step 6: Validar a sintaxe do script sem rodar**

Run (PowerShell 5.1): `powershell -NoProfile -Command "$null = [ScriptBlock]::Create((Get-Content -Raw packages/plugins/scripts/push-documentos-plugin.ps1)); 'ok'"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add packages/plugins/tools/Cr40f.Documentos.Registrar packages/plugins/scripts/push-documentos-plugin.ps1 package.json
git commit -m "feat(documentos): registrador e publicação do plugin do resumo semanal

Registrador .NET 8 no molde do Financeiro: envia o assembly assinado,
cria o plugin type e a Custom API global cr40f_DocumentosResumoSemanal
(ação, parâmetro opcional Hoje e resposta ResumoJson) na AppBetinhos e
publica. Modo --testar chama a API e imprime o JSON. O script de push
roda os testes, cria a chave fora do repo se faltar, confere a
assinatura e recusa PROD. Atalho pnpm push:plugin:documentos:dev.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Flow do resumo semanal e script de provisionamento

**Files:**
- Create: `packages/deploy/flows/documentos-resumo-semanal.json`
- Create: `packages/deploy/flows/documentos-resumo-semanal.test.mjs`
- Modify: `packages/deploy/package.json` (script `test`)
- Create: `packages/deploy/provision-flow-documentos-resumo.ps1`

**Interfaces:**
- Consumes: Custom API `cr40f_DocumentosResumoSemanal` com saída `ResumoJson` (Task 4); tabela `cr40f_avisodestinatario` com `cr40f_categoria` (Pessoas 100000000, Frota 100000001), `statecode` e lookup `cr40f_Funcionario` → `cr40f_emailbetinhos` (Entrega 1).
- Produces: flow "Documentos | Resumo semanal" na AppBetinhos; variáveis `new_URLSistemaBetinhos` e `new_EmailAdminAvisos`. Tokens substituídos pelo script: `__SET_DESTINATARIOS__` (entity set) e `__REMETENTE__` (e-mail da noreply).

- [ ] **Step 1: Escrever o teste que falha**

`packages/deploy/flows/documentos-resumo-semanal.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./documentos-resumo-semanal.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)

test('agenda toda segunda às 07:00 no horário de Brasília', () => {
  const recurrence = flow.triggers.Toda_segunda_7h.recurrence
  assert.equal(recurrence.frequency, 'Week')
  assert.equal(recurrence.interval, 1)
  assert.equal(recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(recurrence.schedule, { weekDays: ['Monday'], hours: ['7'], minutes: [0] })
})

test('chama a Custom API do resumo', () => {
  const resumo = flow.actions.Try.actions.Resumo
  assert.equal(resumo.inputs.host.operationId, 'PerformUnboundAction')
  assert.equal(resumo.inputs.parameters.actionName, 'cr40f_DocumentosResumoSemanal')
})

test('envia pela noreply só para destinatários com e-mail', () => {
  const enviar = flow.actions.Try.actions.Por_categoria.actions.Enviar
  const email = enviar.actions.Tem_email.actions.E_mail
  assert.equal(email.inputs.host.operationId, 'SendEmailV2')
  assert.equal(email.inputs.parameters['emailMessage/From'], '__REMETENTE__')
})

test('Catch roda só quando o Try falha, avisa o admin sem depender da noreply e marca a execução como falha', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  const aviso = flow.actions.Catch.actions.Avisar_admin
  assert.equal(aviso.inputs.parameters['emailMessage/From'], undefined)
  assert.match(aviso.inputs.parameters['emailMessage/To'], /new_EmailAdminAvisos/)
  assert.equal(flow.actions.Catch.actions.Marcar_falha.type, 'Terminate')
})

test('tokens do script presentes e nenhum dado de ambiente no repo', () => {
  assert.ok(raw.includes('__SET_DESTINATARIOS__'))
  assert.ok(raw.includes('__REMETENTE__'))
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft/i)
})

test('toda ação citada em expressões existe', () => {
  const nomes = new Set()
  const percorrer = (acoes) => {
    for (const [nome, acao] of Object.entries(acoes ?? {})) {
      nomes.add(nome)
      percorrer(acao.actions)
      percorrer(acao.else?.actions)
    }
  }
  percorrer(flow.actions)
  for (const [, nome] of raw.matchAll(/(?:outputs|body|items|result)\('([^']+)'\)/g)) {
    assert.ok(nomes.has(nome), `ação inexistente: ${nome}`)
  }
})
```

Em `packages/deploy/package.json`, acrescente o script (o `pnpm -r test` da raiz e o CI passam a rodá-lo):

```json
{
  "name": "@betinhos/deploy",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test flows/documentos-resumo-semanal.test.mjs"
  }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/deploy test`
Expected: FAIL com `ENOENT` (o JSON do flow ainda não existe).

- [ ] **Step 3: Escrever a definição do flow**

`packages/deploy/flows/documentos-resumo-semanal.json`:

```json
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" },
    "URL do Sistema Betinhos (new_URLSistemaBetinhos)": {
      "defaultValue": "",
      "type": "String",
      "metadata": { "schemaName": "new_URLSistemaBetinhos", "description": "Endereço do Sistema Betinhos usado nos links dos e-mails." }
    },
    "E-mail do administrador dos avisos (new_EmailAdminAvisos)": {
      "defaultValue": "",
      "type": "String",
      "metadata": { "schemaName": "new_EmailAdminAvisos", "description": "Recebe o aviso quando o resumo semanal falha." }
    }
  },
  "triggers": {
    "Toda_segunda_7h": {
      "type": "Recurrence",
      "recurrence": {
        "frequency": "Week",
        "interval": 1,
        "timeZone": "E. South America Standard Time",
        "startTime": "2026-10-19T07:00:00",
        "schedule": { "weekDays": ["Monday"], "hours": ["7"], "minutes": [0] }
      }
    }
  },
  "actions": {
    "Try": {
      "type": "Scope",
      "runAfter": {},
      "actions": {
        "Resumo": {
          "type": "OpenApiConnection",
          "runAfter": {},
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "PerformUnboundAction" },
            "parameters": { "actionName": "cr40f_DocumentosResumoSemanal" },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Dados": {
          "type": "Compose",
          "runAfter": { "Resumo": ["Succeeded"] },
          "inputs": "@json(outputs('Resumo')?['body/ResumoJson'])"
        },
        "Semana": {
          "type": "Compose",
          "runAfter": { "Dados": ["Succeeded"] },
          "inputs": "@formatDateTime(outputs('Dados')?['hoje'], 'dd/MM/yyyy')"
        },
        "Por_categoria": {
          "type": "Foreach",
          "foreach": "@outputs('Dados')?['categorias']",
          "runAfter": { "Semana": ["Succeeded"] },
          "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
          "actions": {
            "Rotulo": {
              "type": "Compose",
              "runAfter": {},
              "inputs": "@if(equals(items('Por_categoria')?['categoria'], 'frota'), 'Frota', 'Pessoas')"
            },
            "Destinatarios": {
              "type": "OpenApiConnection",
              "runAfter": { "Rotulo": ["Succeeded"] },
              "inputs": {
                "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords" },
                "parameters": {
                  "entityName": "__SET_DESTINATARIOS__",
                  "$select": "cr40f_avisodestinatarioid",
                  "$filter": "statecode eq 0 and cr40f_categoria eq @{if(equals(items('Por_categoria')?['categoria'], 'frota'), 100000001, 100000000)}",
                  "$expand": "cr40f_Funcionario($select=cr40f_emailbetinhos)"
                },
                "authentication": "@parameters('$authentication')"
              }
            },
            "Linhas": {
              "type": "Select",
              "runAfter": { "Destinatarios": ["Succeeded"] },
              "inputs": {
                "from": "@items('Por_categoria')?['urgentes']",
                "select": "@concat('<tr><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['dono'], ''), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['detalhe'], ''), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', coalesce(item()?['tipo'], ''), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', if(empty(item()?['validade']), '—', formatDateTime(coalesce(item()?['validade'], '1900-01-01'), 'dd/MM/yyyy')), '</td><td style=\"padding:6px 10px;border-bottom:1px solid #E5E7EB\">', if(equals(item()?['estado'], 'faltando'), 'Faltando', if(equals(item()?['estado'], 'vencido'), concat('Vencido há ', string(mul(-1, coalesce(item()?['dias'], 0))), if(equals(coalesce(item()?['dias'], 0), -1), ' dia', ' dias')), if(equals(coalesce(item()?['dias'], 0), 0), 'Vence hoje', concat('Vence em ', string(coalesce(item()?['dias'], 0)), if(equals(coalesce(item()?['dias'], 0), 1), ' dia', ' dias'))))), '</td></tr>')"
              }
            },
            "Corpo": {
              "type": "Compose",
              "runAfter": { "Linhas": ["Succeeded"] },
              "inputs": "@concat('<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1F2937\">', '<p>Resumo de documentos de <b>', outputs('Rotulo'), '</b> na semana de ', outputs('Semana'), '.</p>', if(equals(add(add(add(add(int(items('Por_categoria')?['contagens']?['vencido']), int(items('Por_categoria')?['contagens']?['vence7'])), int(items('Por_categoria')?['contagens']?['vence30'])), int(items('Por_categoria')?['contagens']?['vence60'])), int(items('Por_categoria')?['contagens']?['faltando'])), 0), '<p>Nenhuma pendência nesta semana.</p>', concat('<table style=\"border-collapse:collapse;margin:8px 0 16px\">', '<tr><td style=\"padding:3px 16px 3px 0\">Vencidos</td><td><b>', string(items('Por_categoria')?['contagens']?['vencido']), '</b></td></tr>', '<tr><td style=\"padding:3px 16px 3px 0\">Vencem em até 7 dias</td><td><b>', string(items('Por_categoria')?['contagens']?['vence7']), '</b></td></tr>', '<tr><td style=\"padding:3px 16px 3px 0\">Vencem em 8 a 30 dias</td><td><b>', string(items('Por_categoria')?['contagens']?['vence30']), '</b></td></tr>', '<tr><td style=\"padding:3px 16px 3px 0\">Vencem em 31 a 60 dias</td><td><b>', string(items('Por_categoria')?['contagens']?['vence60']), '</b></td></tr>', '<tr><td style=\"padding:3px 16px 3px 0\">Faltando</td><td><b>', string(items('Por_categoria')?['contagens']?['faltando']), '</b></td></tr>', '</table>', if(equals(length(body('Linhas')), 0), '', concat('<table style=\"border-collapse:collapse\"><tr><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Nome</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Detalhe</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Documento</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Validade</th><th align=\"left\" style=\"padding:6px 10px;border-bottom:2px solid #D1D5DB\">Situação</th></tr>', join(body('Linhas'), ''), '</table>')))), '<p style=\"margin-top:16px\"><a href=\"', parameters('URL do Sistema Betinhos (new_URLSistemaBetinhos)'), '#/documentos?aba=', items('Por_categoria')?['categoria'], '\">Abrir a central de documentos</a></p></div>')"
            },
            "Enviar": {
              "type": "Foreach",
              "foreach": "@outputs('Destinatarios')?['body/value']",
              "runAfter": { "Corpo": ["Succeeded"] },
              "actions": {
                "Tem_email": {
                  "type": "If",
                  "runAfter": {},
                  "expression": { "and": [ { "not": { "equals": [ "@trim(coalesce(items('Enviar')?['cr40f_Funcionario']?['cr40f_emailbetinhos'], ''))", "" ] } } ] },
                  "actions": {
                    "E_mail": {
                      "type": "OpenApiConnection",
                      "runAfter": {},
                      "inputs": {
                        "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
                        "parameters": {
                          "emailMessage/From": "__REMETENTE__",
                          "emailMessage/To": "@{trim(items('Enviar')?['cr40f_Funcionario']?['cr40f_emailbetinhos'])}",
                          "emailMessage/Subject": "Documentos | @{outputs('Rotulo')} | semana de @{outputs('Semana')}",
                          "emailMessage/Body": "@{outputs('Corpo')}",
                          "emailMessage/Importance": "Normal"
                        },
                        "authentication": "@parameters('$authentication')"
                      }
                    }
                  },
                  "else": { "actions": {} }
                }
              }
            }
          }
        }
      }
    },
    "Catch": {
      "type": "Scope",
      "runAfter": { "Try": ["Failed", "TimedOut"] },
      "actions": {
        "Falhas": {
          "type": "Query",
          "runAfter": {},
          "inputs": { "from": "@result('Try')", "where": "@not(equals(item()?['status'], 'Succeeded'))" }
        },
        "Avisar_admin": {
          "type": "OpenApiConnection",
          "runAfter": { "Falhas": ["Succeeded"] },
          "inputs": {
            "host": { "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365", "connectionName": "shared_office365", "operationId": "SendEmailV2" },
            "parameters": {
              "emailMessage/To": "@{parameters('E-mail do administrador dos avisos (new_EmailAdminAvisos)')}",
              "emailMessage/Subject": "Documentos | Resumo semanal falhou",
              "emailMessage/Body": "@{concat('<p>O resumo semanal de documentos falhou na execução ', workflow()?['run']?['name'], '.</p><p>Etapas com problema:</p><pre>', string(body('Falhas')), '</pre>')}",
              "emailMessage/Importance": "High"
            },
            "authentication": "@parameters('$authentication')"
          }
        },
        "Marcar_falha": {
          "type": "Terminate",
          "runAfter": { "Avisar_admin": ["Succeeded", "Failed"] },
          "inputs": { "runStatus": "Failed", "runError": { "code": "ResumoSemanalFalhou", "message": "O resumo semanal falhou; o administrador foi avisado." } }
        }
      }
    }
  },
  "outputs": {}
}
```

Notas para quem implementa: `if()` do Power Automate avalia os dois lados, por isso `coalesce` protege `formatDateTime` e `mul` quando `validade` ou `dias` vêm nulos (faltantes). O `Catch` usa `result('Try')`, que lista só as ações do primeiro nível do `Try`; uma falha dentro do laço aparece como falha de `Por_categoria`, com a mensagem do erro.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @betinhos/deploy test`
Expected: PASS, 6 testes.

- [ ] **Step 5: Escrever o script de provisionamento**

`packages/deploy/provision-flow-documentos-resumo.ps1`:

```powershell
# Cria (ou atualiza) no DEV o flow "Documentos | Resumo semanal" e as variáveis new_URLSistemaBetinhos e
# new_EmailAdminAvisos, na solução AppBetinhos. A definição vem de flows/documentos-resumo-semanal.json;
# e-mail da noreply, URL do Sistema e e-mail do admin entram por parâmetro (nunca no repo).
# Pré-requisitos: Custom API cr40f_DocumentosResumoSemanal registrada (pnpm push:plugin:documentos:dev),
# connection references de Dataverse e Office 365 Outlook na solução, e `az login --use-device-code` no DEV.
# Idempotente.
param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $Remetente,
  [Parameter(Mandatory = $true)] [ValidatePattern('^https://')] [string] $UrlSistema,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[^@\s]+@[^@\s]+$')] [string] $EmailAdmin,
  [string] $ReferenciaDataverse,
  [string] $ReferenciaOutlook
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$environmentUrl = 'https://org23b93544.crm2.dynamics.com'
$solutionName = 'AppBetinhos'
$flowName = 'Documentos | Resumo semanal'
$customApi = 'cr40f_DocumentosResumoSemanal'
if (([Uri]$environmentUrl).Host -ne 'org23b93544.crm2.dynamics.com') { throw 'Somente DEV.' }

$dvToken = & az account get-access-token --resource "$environmentUrl/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $dvToken) { throw 'Token do Dataverse DEV indisponível (rode az login --use-device-code).' }
$headers = @{ Authorization = "Bearer $dvToken"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0'; 'MSCRM.SolutionUniqueName' = $solutionName }

function Dv([string] $Method, [string] $Path, $Body = $null) {
  Write-Host "[documentos-resumo] $Method $($Path.Split('?')[0])"
  $params = @{ Method = $Method; Uri = "$environmentUrl/api/data/v9.2/$Path"; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 90 -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

$who = Dv GET WhoAmI
if ($who.OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1') { throw 'A API não respondeu pela organização DEV.' }
$solution = @((Dv GET "solutions?`$select=solutionid&`$filter=uniquename eq '$solutionName'").value)
if ($solution.Count -ne 1) { throw 'Solução AppBetinhos ausente ou ambígua.' }
$solutionId = $solution[0].solutionid

function Include([string] $id, [int] $type) {
  $filter = "solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type and objectid eq $id"
  if (@((Dv GET $filter).value).Count) { return }
  Dv POST AddSolutionComponent @{ ComponentId = $id; ComponentType = $type; SolutionUniqueName = $solutionName; AddRequiredComponents = $false } | Out-Null
  if (-not @((Dv GET $filter).value).Count) { throw "Componente $type/$id não entrou na $solutionName." }
}

# 1. A Custom API precisa existir antes do flow.
if (@((Dv GET "customapis?`$select=customapiid&`$filter=uniquename eq '$customApi'").value).Count -ne 1) {
  throw "Custom API $customApi ausente no DEV. Rode 'pnpm push:plugin:documentos:dev' antes."
}

# 2. Entity set dos destinatários (lido da metadata, não suposto).
$setDestinatarios = (Dv GET "EntityDefinitions(LogicalName='cr40f_avisodestinatario')?`$select=EntitySetName").EntitySetName
if (-not $setDestinatarios) { throw 'Tabela cr40f_avisodestinatario ausente no DEV.' }

# 3. Connection references (Dataverse e Office 365 Outlook).
$refs = @((Dv GET "connectionreferences?`$select=connectionreferencelogicalname,connectorid&`$filter=statecode eq 0").value)
function Referencia([string] $conector, [string] $preferida) {
  $candidatas = @($refs | Where-Object { $_.connectorid -like "*/$conector" })
  if ($preferida) {
    $escolhida = @($candidatas | Where-Object { $_.connectionreferencelogicalname -eq $preferida })
    if ($escolhida.Count -ne 1) { throw "Connection reference '$preferida' ($conector) não encontrada." }
    return $preferida
  }
  if ($candidatas.Count -eq 1) { return $candidatas[0].connectionreferencelogicalname }
  $nomes = ($candidatas | ForEach-Object { $_.connectionreferencelogicalname }) -join ', '
  throw "Há $($candidatas.Count) connection references de $conector ($nomes). Informe uma com -Referencia$(if ($conector -eq 'shared_office365') { 'Outlook' } else { 'Dataverse' })."
}
$refDataverse = Referencia 'shared_commondataserviceforapps' $ReferenciaDataverse
$refOutlook = Referencia 'shared_office365' $ReferenciaOutlook

# 4. Variáveis de ambiente.
function VariavelDeAmbiente([string] $schema, [string] $display, [string] $valor) {
  $defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value)
  if (-not $defs.Count) {
    Dv POST environmentvariabledefinitions @{ schemaname = $schema; displayname = $display; type = 100000000 } | Out-Null
    $defs = @((Dv GET "environmentvariabledefinitions?`$select=environmentvariabledefinitionid&`$filter=schemaname eq '$schema'").value)
  }
  $defId = $defs[0].environmentvariabledefinitionid
  Include $defId 380
  $vals = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)
  if ($vals.Count -gt 1) { throw "Variável $schema com valores ambíguos." }
  if ($vals.Count) { $valId = $vals[0].environmentvariablevalueid; Dv PATCH "environmentvariablevalues($valId)" @{ value = $valor } | Out-Null }
  else {
    Dv POST environmentvariablevalues @{ value = $valor; 'EnvironmentVariableDefinitionId@odata.bind' = "/environmentvariabledefinitions($defId)" } | Out-Null
    $valId = @((Dv GET "environmentvariablevalues?`$select=environmentvariablevalueid&`$filter=_environmentvariabledefinitionid_value eq $defId").value)[0].environmentvariablevalueid
  }
  Include $valId 381
}
VariavelDeAmbiente 'new_URLSistemaBetinhos' 'URL do Sistema Betinhos' $UrlSistema.TrimEnd('/')
VariavelDeAmbiente 'new_EmailAdminAvisos' 'E-mail do administrador dos avisos' $EmailAdmin

# 5. Definição do flow com os tokens trocados.
$raw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'flows\documentos-resumo-semanal.json'), [Text.Encoding]::UTF8)
$raw = $raw.Replace('__SET_DESTINATARIOS__', $setDestinatarios).Replace('__REMETENTE__', $Remetente)
if ($raw -match '__[A-Z_]+__') { throw "Token não substituído na definição do flow: $($Matches[0])" }
$definition = $raw | ConvertFrom-Json

$connectionReferences = @{
  shared_commondataserviceforapps = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refDataverse }; api = @{ name = 'shared_commondataserviceforapps' } }
  shared_office365 = @{ runtimeSource = 'embedded'; connection = @{ connectionReferenceLogicalName = $refOutlook }; api = @{ name = 'shared_office365' } }
}
$clientData = @{ properties = @{ definition = $definition; connectionReferences = $connectionReferences }; schemaVersion = '1.0.0.0' } | ConvertTo-Json -Depth 90 -Compress

# 6. Cria ou atualiza o flow, inclui na solução e ativa.
$flows = @((Dv GET "workflows?`$select=workflowid,statecode,clientdata&`$filter=name eq '$flowName' and category eq 5").value)
if ($flows.Count -gt 1) { throw 'Flow duplicado no DEV.' }
if ($flows.Count) {
  $flowId = $flows[0].workflowid
  if ($flows[0].clientdata -ne $clientData) {
    if ($flows[0].statecode -eq 1) { Dv PATCH "workflows($flowId)" @{ statecode = 0 } | Out-Null }
    Dv PATCH "workflows($flowId)" @{ clientdata = $clientData } | Out-Null
  }
} else {
  Dv POST workflows @{ name = $flowName; category = 5; type = 1; primaryentity = 'none'; clientdata = $clientData; description = 'Toda segunda às 07:00 envia, por categoria, o resumo de documentos vencidos, a vencer e faltantes aos destinatários cadastrados no Sistema Betinhos.' } | Out-Null
  $flowId = @((Dv GET "workflows?`$select=workflowid&`$filter=name eq '$flowName' and category eq 5").value)[0].workflowid
}
Include $flowId 29
$flow = Dv GET "workflows($flowId)?`$select=statecode"
if ($flow.statecode -ne 1) { Dv PATCH "workflows($flowId)" @{ statecode = 1 } | Out-Null; $flow = Dv GET "workflows($flowId)?`$select=statecode" }
if ($flow.statecode -ne 1) { throw 'Flow não ativou. Confira as conexões das connection references no Power Automate.' }
Write-Output "DEV: '$flowName' ativo, variáveis configuradas, tudo na $solutionName."
```

- [ ] **Step 6: Validar a sintaxe do script sem rodar**

Run (PowerShell 5.1): `powershell -NoProfile -Command "$null = [ScriptBlock]::Create((Get-Content -Raw -Encoding UTF8 packages/deploy/provision-flow-documentos-resumo.ps1)); 'ok'"`
Expected: `ok`.

- [ ] **Step 7: Rodar a suíte da raiz**

Run: `pnpm -r test`
Expected: tudo verde, incluindo `@betinhos/deploy` (6) e o novo teste de paridade do shell. Os timeouts conhecidos da `GeralPage` locais não bloqueiam; o CI é a referência.

- [ ] **Step 8: Commit**

```bash
git add packages/deploy/flows packages/deploy/package.json packages/deploy/provision-flow-documentos-resumo.ps1
git commit -m "feat(documentos): flow do resumo semanal e script de provisionamento

Flow agendado para toda segunda às 07:00 (Brasília): chama a Custom
API, monta por categoria o e-mail com as cinco contagens, a tabela dos
urgentes e o link para a central, e envia pela noreply a cada
destinatário ativo com e-mail. Try/Catch avisa o admin (sem depender da
noreply) e marca a execução como falha. O script cria as variáveis
new_URLSistemaBetinhos e new_EmailAdminAvisos, lê o entity set e as
connection references do DEV, troca os tokens da definição e
cria/ativa o flow na AppBetinhos. Teste node --test valida agenda,
chamadas, Catch, tokens e referências entre ações.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Publicação e validação no DEV (com o Renan)

Esta tarefa depende de login e permissões do Renan. Quem executa por subagente para no Step 1 e entrega a lista ao Renan.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md` (anotar o resultado da validação no fim da §8)

- [ ] **Step 1: Publicar o plugin (Renan)**

```bash
pnpm push:plugin:documentos:dev
```

Expected: testes verdes, "DLL assinada com public key token …", "plugin do resumo semanal registrado". Abre login do Dataverse no navegador na primeira vez.

- [ ] **Step 2: Conferir a Custom API com data fixa**

```bash
dotnet run --project packages/plugins/tools/Cr40f.Documentos.Registrar -- --environmentUrl https://org23b93544.crm2.dynamics.com --testar 2026-10-19
```

Expected: um JSON com `"hoje":"2026-10-19"` e as categorias `pessoas` e `frota`. Compare as contagens com os KPIs da central `#/documentos` do Sistema no DEV na mesma data; precisam bater.

- [ ] **Step 3: Provisionar o flow (Renan)**

```powershell
az login --use-device-code
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-flow-documentos-resumo.ps1 -Remetente <e-mail da noreply> -UrlSistema <URL do Sistema Betinhos no DEV> -EmailAdmin <e-mail do admin>
```

Expected: "DEV: 'Documentos | Resumo semanal' ativo, variáveis configuradas, tudo na AppBetinhos." Se acusar várias connection references, rode de novo com `-ReferenciaDataverse` e `-ReferenciaOutlook`.

- [ ] **Step 4: Dados de teste e execução manual**

1. Na central de documentos do DEV, cadastre o próprio Renan como destinatário de Pessoas e de Frota (Configurações).
2. Crie documentos de teste vencendo em −1, 3, 20 e 45 dias e deixe um tipo obrigatório faltando em um motorista de teste.
3. No Power Automate, abra "Documentos | Resumo semanal" e use "Testar → Manualmente".
4. Confira os dois e-mails: remetente noreply, assunto `Documentos | Pessoas | semana de dd/mm/aaaa`, contagens corretas, tabela com vencido/até 7 dias/faltante, link abrindo `#/documentos?aba=pessoas` (e `frota`).

- [ ] **Step 5: Forçar falha e conferir o aviso**

Rode o script de provisionamento de novo com `-Remetente` apontando para uma caixa em que a conexão **não** tem "Enviar como", e teste o flow manualmente. Expected: execução marcada como falha e e-mail "Documentos | Resumo semanal falhou" no admin. Depois rode o script com o remetente correto e teste de novo (volta a enviar).

- [ ] **Step 6: Registrar o resultado e abrir o PR**

Acrescente ao fim da §8 da spec uma linha com a data, a versão validada e o resultado dos Steps 2, 4 e 5. Depois:

```bash
git add docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md
git commit -m "docs(documentos): validação do resumo semanal no DEV

Registra o resultado da Custom API com data fixa, do e-mail recebido
por categoria e do aviso de falha ao admin.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/documentos-resumo-semanal
gh pr create --base main --title "Documentos: resumo semanal por e-mail (Entrega 2)" --body "Plugin + Custom API cr40f_DocumentosResumoSemanal, flow semanal e scripts de provisionamento. Spec: docs/superpowers/specs/2026-10-14-documentos-resumo-semanal-design.md. Validado no DEV conforme §8.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

PROD fica fora deste plano: só com ok explícito do Renan, rodando os mesmos passos contra o ambiente de produção depois de ajustar as travas de DEV dos dois scripts.
