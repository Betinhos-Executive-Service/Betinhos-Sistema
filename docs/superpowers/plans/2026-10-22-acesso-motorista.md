# Acesso ao App Motoristas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pela Tela Funcionários, criar em minutos o acesso de um motorista ao App Motoristas (conta Microsoft, licença, grupo do Entra, `cr40f_funcionarios`, credenciais para WhatsApp) e encerrá-lo com dupla confirmação.

**Architecture:** Duas Custom APIs globais (`cr40f_CadastrarAcessoMotorista`, `cr40f_EncerrarAcessoMotorista`) executadas por um plugin C# novo (`Cr40f.Acesso.Plugin`) registrado como step síncrono com configuração segura (segredo do Graph). O plugin orquestra Graph API + Dataverse de forma idempotente e devolve as etapas. O shell React (`apps/shell/src/pages/funcionarios`) ganha um drawer de cadastro, um diálogo de encerramento em duas etapas e um bloco "Acesso ao app" na ficha; em `pnpm dev` tudo roda em mock.

**Tech Stack:** C# net462 (plugin, `Microsoft.CrmSdk.CoreAssemblies 9.0.2.60`, `System.Net.Http`, `System.Runtime.Serialization.Json`), xunit net48, registrador .NET 8 (`Microsoft.PowerPlatform.Dataverse.Client`), PowerShell 5.1 (provisão), React + TypeScript + Vitest + `@betinhos/ui` no shell.

**Spec:** `docs/superpowers/specs/2026-10-22-acesso-motorista-design.md`

## Global Constraints

- Prefixo Dataverse `cr40f_`; rótulos pt-BR (1046). Solução `appbetinhos` (`DV_SOLUTION` do `.env`).
- Só DEV: `https://org23b93544.crm2.dynamics.com`. Scripts bloqueiam PROD (`DV_BLOCKED_HOSTS` + checagem no código). `pnpm push` só da `main` no checkout principal; nunca de worktree.
- Segredo do Graph só na configuração segura do step. Nunca em Flow, `.env` versionado, trace, log ou teste. Senha temporária nunca gravada nem logada.
- E-mail Microsoft: `primeiro.ultimo@betinhos.com.br` (minúsculo, sem acentos, sufixo numérico a partir de 2 quando repetido). Domínio e licença vêm da configuração não segura do step: `{"tenantId","clientId","licenseSkuId","groupId","appUrl","dominio"}`. Link do app = `appUrl` = `https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2` no DEV. A URL direta funciona sem o Power Apps Mobile, em tela cheia e instalável na tela inicial, desde o PR #61 do App Motoristas (DEV 2.1.758, verificado no Chrome Android em 22/10/2026; iPhone pendente). Depende desse PR estar na `main` do App Motoristas antes da publicação.
- Autorização: só quem tem a função **Acesso - Gestão de Motoristas** ou **Administrador do Sistema** (`System Administrator`) executa as APIs; o plugin confere.
- Encerrar nunca exclui: remove do grupo, remove licença, `accountEnabled=false`, `cr40f_status` = 2 (inativo), `cr40f_datadedemissao` = hoje se vazia.
- Design System: tema claro, sem gradiente, `#FCFCFB` em campos; azul só em foco/ação. Preservar DOM/IDs/handlers da Ficha existente.
- Commits em português, mensagem detalhada, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Antes do PR: `qualidade-antes-do-pr` e `verificacao-manter` (skill `verificar-acesso-motorista` criada na Tarefa 12).

## Estrutura de arquivos

Plugin (`packages/plugins/`):
- `Cr40f.Acesso.Plugin/Cr40f.Acesso.Plugin.csproj` — net462 assinado (`~/.codex/keys/Cr40f.Acesso.Plugin.snk`).
- `Cr40f.Acesso.Plugin/AcessoRules.cs` — regras puras: nome → prefixo de e-mail, sufixo, celular, senha, normalização.
- `Cr40f.Acesso.Plugin/AcessoConfig.cs` — parse das configurações (não segura e segura) e `CONFIG_AUSENTE`.
- `Cr40f.Acesso.Plugin/Etapas.cs` — lista de etapas (`feita|pulada|erro`) e serialização JSON.
- `Cr40f.Acesso.Plugin/AcessoException.cs` — erro de domínio `CODIGO: texto`.
- `Cr40f.Acesso.Plugin/IGraphGateway.cs` — contrato do Graph; `GraphUsuario`, `GraphSku`.
- `Cr40f.Acesso.Plugin/GraphGateway.cs` — HTTP real (token client credentials, chamadas).
- `Cr40f.Acesso.Plugin/JsonLeve.cs` — leitura mínima de JSON (`DataContractJsonSerializer`) para as respostas do Graph.
- `Cr40f.Acesso.Plugin/FuncionarioRepository.cs` — leitura/escrita em `cr40f_funcionarios`.
- `Cr40f.Acesso.Plugin/Autorizacao.cs` — funções de segurança do chamador.
- `Cr40f.Acesso.Plugin/CadastrarAcessoHandler.cs` — orquestração do cadastro (testável sem sandbox).
- `Cr40f.Acesso.Plugin/EncerrarAcessoHandler.cs` — orquestração do encerramento.
- `Cr40f.Acesso.Plugin/CadastrarAcessoMotoristaPlugin.cs`, `EncerrarAcessoMotoristaPlugin.cs` — `IPlugin` finos.
- `Cr40f.Acesso.Plugin.Tests/` — xunit: `AcessoRulesTests.cs`, `AcessoConfigTests.cs`, `FakeGraphGateway.cs`, `FakeService.cs`, `CadastrarAcessoHandlerTests.cs`, `EncerrarAcessoHandlerTests.cs`.
- `tools/Cr40f.Acesso.Registrar/` — registra assembly, tipos, Custom APIs (sem `plugintypeid`), parâmetros e steps PostOperation (stage 40) com configuração não segura.
- `scripts/push-acesso-plugin.ps1` — testes, build, registro (`pnpm push:plugin:acesso:dev`).

Deploy (`packages/deploy/`):
- `provision-acesso.ps1` — função de segurança, configuração segura (secret via `Read-Host -AsSecureString`), checagem de step sem secure config.

Shell (`apps/shell/src/pages/funcionarios/`):
- `data/acesso.ts` — contrato `AcessoSource`, `createAcessoSource(host)`, `mensagemWhatsApp`, erros traduzidos.
- `data/acessoMock.ts` — mock.
- `data/acesso.test.ts`.
- `components/CadastroAcessoDrawer.tsx` (+ `.test.tsx`).
- `components/EncerrarAcessoDialog.tsx` (+ `.test.tsx`).
- `components/AcessoApp.tsx` — bloco na aba Dados da Ficha (estado + botões).
- `components/Ficha.tsx` — inclui `AcessoApp`.
- `FuncionariosPage.tsx` — botão "Cadastrar acesso" no cabeçalho.
- `funcionarios.css` — estilos do bloco e do resultado.

Docs e verificação:
- `docs/acesso-motorista-entra.md` — app registration e grupo de teste (passo a passo para o Renan).
- `.claude/skills/verificar-acesso-motorista/SKILL.md`.
- `package.json` (raiz) — script `push:plugin:acesso:dev`.

---

### Task 1: Projeto do plugin e `AcessoRules` (e-mail, celular, senha)

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/Cr40f.Acesso.Plugin.csproj`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/AcessoRules.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoRulesTests.cs`

**Interfaces:**
- Produces: `AcessoRules.PrefixoEmail(string nomeCompleto) : string`; `AcessoRules.EmailComSufixo(string prefixo, string dominio, Func<string,bool> existe) : string`; `AcessoRules.NormalizarCelular(string bruto) : string?` (E.164 `+55...` ou null); `AcessoRules.GerarSenha(Random rng) : string`; `AcessoRules.PrimeiroNome(string nomeCompleto) : string`; `AcessoRules.NomeValido(string) : bool`.

- [ ] **Step 1: Criar os dois csproj copiando o molde da Frota**

`packages/plugins/Cr40f.Acesso.Plugin/Cr40f.Acesso.Plugin.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <AssemblyName>Cr40f.Acesso.Plugin</AssemblyName>
    <RootNamespace>Cr40f.Acesso.Plugin</RootNamespace>
    <SignAssembly>true</SignAssembly>
    <AssemblyOriginatorKeyFile>$(UserProfile)\.codex\keys\Cr40f.Acesso.Plugin.snk</AssemblyOriginatorKeyFile>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Net.Http" />
    <Reference Include="System.Runtime.Serialization" />
    <PackageReference Include="Microsoft.CrmSdk.CoreAssemblies" Version="9.0.2.60" />
  </ItemGroup>
</Project>
```
Crie `Properties/AssemblyInfo.cs` igual ao da Frota, trocando o nome para `Cr40f.Acesso.Plugin` e versão `1.0.0.0`.

`packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj`: igual ao `Cr40f.Frota.Plugin.Tests.csproj` (net48, xunit 2.9.2, `Microsoft.NET.Test.Sdk 17.11.1`), com `ProjectReference` para `..\Cr40f.Acesso.Plugin\Cr40f.Acesso.Plugin.csproj` e sem o grupo `Fixtures`.

Gere a chave antes do primeiro build (o script de push também faz isso):
```powershell
$p="$env:USERPROFILE\.codex\keys\Cr40f.Acesso.Plugin.snk"; if (-not (Test-Path $p)) { $rsa=[Security.Cryptography.RSACryptoServiceProvider]::new(2048); [IO.File]::WriteAllBytes($p,$rsa.ExportCspBlob($true)); $rsa.Dispose() }
```

- [ ] **Step 2: Escrever os testes de `AcessoRules`**

`packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoRulesTests.cs`:
```csharp
using System;
using System.Collections.Generic;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoRulesTests
{
    [Theory]
    [InlineData("João da Silva Ávila", "joao.avila")]
    [InlineData("  maria   clara  ", "maria.clara")]
    [InlineData("José", "jose")]
    [InlineData("Ana-Lúcia D'Ávila", "ana-lucia.davila")]
    public void PrefixoEmail_usa_primeiro_e_ultimo_nome_sem_acentos(string nome, string esperado)
        => Assert.Equal(esperado, AcessoRules.PrefixoEmail(nome));

    [Fact]
    public void EmailComSufixo_devolve_sem_sufixo_quando_livre()
        => Assert.Equal("joao.avila@betinhos.com.br", AcessoRules.EmailComSufixo("joao.avila", "betinhos.com.br", _ => false));

    [Fact]
    public void EmailComSufixo_incrementa_a_partir_de_2()
    {
        var ocupados = new HashSet<string> { "joao.avila@betinhos.com.br", "joao.avila2@betinhos.com.br" };
        Assert.Equal("joao.avila3@betinhos.com.br", AcessoRules.EmailComSufixo("joao.avila", "betinhos.com.br", ocupados.Contains));
    }

    [Theory]
    [InlineData("(12) 99123-4567", "+5512991234567")]
    [InlineData("12991234567", "+5512991234567")]
    [InlineData("+55 12 99123-4567", "+5512991234567")]
    [InlineData("1234", null)]
    [InlineData("", null)]
    public void NormalizarCelular_aceita_formatos_brasileiros(string bruto, string? esperado)
        => Assert.Equal(esperado, AcessoRules.NormalizarCelular(bruto));

    [Fact]
    public void GerarSenha_tem_14_caracteres_com_letra_numero_e_simbolo()
    {
        var senha = AcessoRules.GerarSenha(new Random(7));
        Assert.Equal(14, senha.Length);
        Assert.Contains(senha, char.IsUpper);
        Assert.Contains(senha, char.IsLower);
        Assert.Contains(senha, char.IsDigit);
        Assert.Contains(senha, c => "!@#$%&*?".IndexOf(c) >= 0);
        Assert.DoesNotContain(senha, c => "0O1lI".IndexOf(c) >= 0);
    }

    [Theory]
    [InlineData("João da Silva", true)]
    [InlineData("João", false)]
    [InlineData("", false)]
    public void NomeValido_exige_dois_nomes(string nome, bool esperado) => Assert.Equal(esperado, AcessoRules.NomeValido(nome));

    [Fact]
    public void PrimeiroNome_e_a_primeira_palavra() => Assert.Equal("João", AcessoRules.PrimeiroNome("  João da Silva "));
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj`
Expected: falha de compilação (`AcessoRules` não existe).

- [ ] **Step 4: Implementar `AcessoRules`**

`packages/plugins/Cr40f.Acesso.Plugin/AcessoRules.cs`:
```csharp
using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Cr40f.Acesso.Plugin;

/// <summary>Regras puras do acesso: e-mail gerado, celular, senha. Sem Dataverse e sem HTTP.</summary>
public static class AcessoRules
{
    private const string Maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Minusculas = "abcdefghijkmnpqrstuvwxyz";
    private const string Digitos = "23456789";
    private const string Simbolos = "!@#$%&*?";

    public static bool NomeValido(string? nome) => Palavras(nome).Length >= 2;

    public static string PrimeiroNome(string? nome) => Palavras(nome).FirstOrDefault() ?? "";

    public static string PrefixoEmail(string? nome)
    {
        var palavras = Palavras(nome).Select(SemAcentos).Where(p => p.Length > 0).ToArray();
        if (palavras.Length == 0) return "";
        return palavras.Length == 1 ? palavras[0] : palavras[0] + "." + palavras[palavras.Length - 1];
    }

    public static string EmailComSufixo(string prefixo, string dominio, Func<string, bool> existe)
    {
        var candidato = prefixo + "@" + dominio;
        for (var n = 2; existe(candidato); n++) candidato = prefixo + n.ToString(CultureInfo.InvariantCulture) + "@" + dominio;
        return candidato;
    }

    /// <summary>Celular brasileiro em E.164 (+55DDD9XXXXXXXX). Inválido: null.</summary>
    public static string? NormalizarCelular(string? bruto)
    {
        var digitos = new string((bruto ?? "").Where(char.IsDigit).ToArray());
        if (digitos.StartsWith("55", StringComparison.Ordinal) && digitos.Length == 13) digitos = digitos.Substring(2);
        if (digitos.Length != 11 || digitos[2] != '9') return null;
        return "+55" + digitos;
    }

    public static string GerarSenha(Random rng)
    {
        var tudo = Maiusculas + Minusculas + Digitos + Simbolos;
        var chars = new[] { Sorteio(Maiusculas, rng), Sorteio(Minusculas, rng), Sorteio(Digitos, rng), Sorteio(Simbolos, rng) }
            .Concat(Enumerable.Range(0, 10).Select(_ => Sorteio(tudo, rng)))
            .OrderBy(_ => rng.Next()).ToArray();
        return new string(chars);
    }

    private static char Sorteio(string alfabeto, Random rng) => alfabeto[rng.Next(alfabeto.Length)];

    private static string[] Palavras(string? nome) => Regex.Split((nome ?? "").Trim(), @"\s+").Where(p => p.Length > 0).ToArray();

    private static string SemAcentos(string texto)
    {
        var decomposto = texto.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in decomposto)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(c) || c == '-') sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}
```
Observação: o apóstrofo de "D'Ávila" é removido (fica `davila`), e o hífen é preservado; isso é o que o teste cobra.

- [ ] **Step 5: Rodar e ver passar**

Run: `dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj`
Expected: todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): projeto do plugin de acesso e regras de e-mail, celular e senha

Cria Cr40f.Acesso.Plugin (net462, assinado) e os testes xunit. AcessoRules gera o prefixo
primeiro.ultimo sem acentos, aplica sufixo numérico, normaliza celular para E.164 e gera
senha temporária de 14 caracteres sem caracteres ambíguos.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Configuração, etapas e erro de domínio

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/AcessoConfig.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/Etapas.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/AcessoException.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/JsonLeve.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/AcessoConfigTests.cs`

**Interfaces:**
- Produces: `AcessoConfig.Parse(string? unsecure, string? secure) : AcessoConfig` com propriedades `TenantId, ClientId, ClientSecret, LicenseSkuId, GroupId, AppUrl, Dominio`; `Etapas` com `Feita(nome, detalhe)`, `Pulada(nome, motivo)`, `Erro(nome, mensagem)`, `ToJson()`; `AcessoException(string codigo, string mensagem)` com `Message == "CODIGO: mensagem"`; `JsonLeve.Ler(string json) : Dictionary<string, object?>` (objetos viram `Dictionary`, listas `List<object?>`), `JsonLeve.Texto(string)` escapa string.

- [ ] **Step 1: Testes**

`AcessoConfigTests.cs`:
```csharp
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoConfigTests
{
    private const string Unsecure = "{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://x/main.aspx\",\"dominio\":\"betinhos.com.br\"}";

    [Fact]
    public void Parse_le_as_duas_configuracoes()
    {
        var cfg = AcessoConfig.Parse(Unsecure, "{\"clientSecret\":\"s3gr3d0\"}");
        Assert.Equal("t", cfg.TenantId);
        Assert.Equal("s3gr3d0", cfg.ClientSecret);
        Assert.Equal("betinhos.com.br", cfg.Dominio);
        Assert.Equal("https://x/main.aspx", cfg.AppUrl);
    }

    [Fact]
    public void Parse_sem_secret_lanca_CONFIG_AUSENTE()
    {
        var erro = Assert.Throws<AcessoException>(() => AcessoConfig.Parse(Unsecure, ""));
        Assert.Equal("CONFIG_AUSENTE", erro.Codigo);
        Assert.StartsWith("CONFIG_AUSENTE: ", erro.Message);
    }

    [Fact]
    public void Parse_sem_dominio_usa_padrao()
        => Assert.Equal("betinhos.com.br", AcessoConfig.Parse(Unsecure.Replace(",\"dominio\":\"betinhos.com.br\"", ""), "{\"clientSecret\":\"s\"}").Dominio);

    [Fact]
    public void Etapas_serializa_em_ordem()
    {
        var etapas = new Etapas();
        etapas.Feita("usuario", "criado");
        etapas.Pulada("licenca", "já tinha");
        etapas.Erro("grupo", "Graph 503");
        Assert.Equal("[{\"etapa\":\"usuario\",\"estado\":\"feita\",\"detalhe\":\"criado\"},{\"etapa\":\"licenca\",\"estado\":\"pulada\",\"detalhe\":\"já tinha\"},{\"etapa\":\"grupo\",\"estado\":\"erro\",\"detalhe\":\"Graph 503\"}]", etapas.ToJson());
    }

    [Fact]
    public void JsonLeve_le_objetos_aninhados_e_listas()
    {
        var obj = JsonLeve.Ler("{\"value\":[{\"id\":\"1\",\"skuId\":\"a\"}],\"n\":2}");
        var lista = Assert.IsType<System.Collections.Generic.List<object?>>(obj["value"]);
        var item = Assert.IsType<System.Collections.Generic.Dictionary<string, object?>>(lista[0]);
        Assert.Equal("a", item["skuId"]);
        Assert.Equal("2", System.Convert.ToString(obj["n"], System.Globalization.CultureInfo.InvariantCulture));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test ...Acesso.Plugin.Tests.csproj` → erro de compilação.

- [ ] **Step 3: Implementar**

`AcessoException.cs`:
```csharp
using System;
namespace Cr40f.Acesso.Plugin;
/// <summary>Erro de domínio: a mensagem viaja como "CODIGO: texto" até a tela.</summary>
public sealed class AcessoException : Exception
{
    public string Codigo { get; }
    public AcessoException(string codigo, string mensagem) : base(codigo + ": " + mensagem) { Codigo = codigo; }
}
```

`JsonLeve.cs` (leitor com `DataContractJsonSerializer` em modo `UseSimpleDictionaryFormat` não cobre tipos dinâmicos; use o `System.Runtime.Serialization.Json.JsonReaderWriterFactory`):
```csharp
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Cr40f.Acesso.Plugin;

/// <summary>JSON mínimo para as respostas do Graph: objetos viram Dictionary, listas viram List, escalares viram string/bool/decimal.</summary>
public static class JsonLeve
{
    public static Dictionary<string, object?> Ler(string json)
    {
        using var reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json), XmlDictionaryReaderQuotas.Max);
        var raiz = XElement.Load(reader);
        return (Dictionary<string, object?>)Converter(raiz)!;
    }

    public static string Texto(string? valor)
    {
        if (valor is null) return "null";
        var sb = new StringBuilder("\"");
        foreach (var c in valor)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture)); else sb.Append(c); break;
            }
        }
        return sb.Append('"').ToString();
    }

    private static object? Converter(XElement el)
    {
        var tipo = (string?)el.Attribute("type") ?? "string";
        switch (tipo)
        {
            case "object":
                var dic = new Dictionary<string, object?>();
                foreach (var filho in el.Elements()) dic[NomeChave(filho)] = Converter(filho);
                return dic;
            case "array":
                var lista = new List<object?>();
                foreach (var filho in el.Elements()) lista.Add(Converter(filho));
                return lista;
            case "boolean": return (bool)el;
            case "number": return decimal.Parse(el.Value, CultureInfo.InvariantCulture);
            case "null": return null;
            default: return el.Value;
        }
    }

    // Chaves com caracteres fora do nome XML vêm como <a:item item="chave">.
    private static string NomeChave(XElement el) => (string?)el.Attribute("item") ?? el.Name.LocalName;
}
```

`Etapas.cs`:
```csharp
using System.Collections.Generic;
using System.Text;

namespace Cr40f.Acesso.Plugin;

public sealed class Etapas
{
    private readonly List<(string Etapa, string Estado, string Detalhe)> _itens = new();
    public void Feita(string etapa, string detalhe) => _itens.Add((etapa, "feita", detalhe));
    public void Pulada(string etapa, string motivo) => _itens.Add((etapa, "pulada", motivo));
    public void Erro(string etapa, string mensagem) => _itens.Add((etapa, "erro", mensagem));
    public string ToJson()
    {
        var sb = new StringBuilder("[");
        for (var i = 0; i < _itens.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append("{\"etapa\":").Append(JsonLeve.Texto(_itens[i].Etapa))
              .Append(",\"estado\":").Append(JsonLeve.Texto(_itens[i].Estado))
              .Append(",\"detalhe\":").Append(JsonLeve.Texto(_itens[i].Detalhe)).Append('}');
        }
        return sb.Append(']').ToString();
    }
}
```

`AcessoConfig.cs`:
```csharp
using System.Collections.Generic;

namespace Cr40f.Acesso.Plugin;

/// <summary>Configuração do step: não segura (ids e URLs) e segura (clientSecret).</summary>
public sealed class AcessoConfig
{
    public string TenantId { get; private set; } = "";
    public string ClientId { get; private set; } = "";
    public string ClientSecret { get; private set; } = "";
    public string LicenseSkuId { get; private set; } = "";
    public string GroupId { get; private set; } = "";
    public string AppUrl { get; private set; } = "";
    public string Dominio { get; private set; } = "betinhos.com.br";

    public static AcessoConfig Parse(string? unsecure, string? secure)
    {
        if (string.IsNullOrWhiteSpace(unsecure)) throw new AcessoException("CONFIG_AUSENTE", "O step do plugin está sem a configuração não segura.");
        if (string.IsNullOrWhiteSpace(secure)) throw new AcessoException("CONFIG_AUSENTE", "O step do plugin está sem a configuração segura (clientSecret). Rode provision-acesso.ps1.");
        var u = JsonLeve.Ler(unsecure!);
        var s = JsonLeve.Ler(secure!);
        var cfg = new AcessoConfig
        {
            TenantId = Obrigatorio(u, "tenantId"),
            ClientId = Obrigatorio(u, "clientId"),
            LicenseSkuId = Obrigatorio(u, "licenseSkuId"),
            GroupId = Obrigatorio(u, "groupId"),
            AppUrl = Obrigatorio(u, "appUrl"),
            ClientSecret = Obrigatorio(s, "clientSecret"),
        };
        if (u.TryGetValue("dominio", out var dominio) && dominio is string d && d.Length > 0) cfg.Dominio = d;
        return cfg;
    }

    private static string Obrigatorio(Dictionary<string, object?> dic, string chave)
        => dic.TryGetValue(chave, out var v) && v is string texto && texto.Length > 0 ? texto : throw new AcessoException("CONFIG_AUSENTE", "Falta '" + chave + "' na configuração do step.");
}
```

- [ ] **Step 4: Rodar e ver passar** — `dotnet test ...Acesso.Plugin.Tests.csproj` → PASS. Se `JsonLeve_le_objetos_aninhados_e_listas` falhar por nome de chave, confira no depurador o XML gerado pelo `JsonReaderWriterFactory` (chaves válidas viram elementos com o próprio nome; inválidas viram `<item item="...">`).

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): configuração do step, etapas e erro de domínio do plugin de acesso

AcessoConfig lê a configuração não segura (tenant, client, SKU, grupo, URL do app, domínio)
e a segura (clientSecret) e falha com CONFIG_AUSENTE quando falta algo. Etapas serializa
feita/pulada/erro para a tela. JsonLeve lê as respostas do Graph sem dependência externa.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Contrato do Graph, fake de teste e gateway HTTP

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/IGraphGateway.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/GraphGateway.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeGraphGateway.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/GraphGatewayTests.cs`

**Interfaces:**
- Produces:
```csharp
public sealed class GraphUsuario { public string Id = ""; public string Upn = ""; public bool Ativo; public List<string> SkuIds = new(); }
public interface IGraphGateway
{
    GraphUsuario? UsuarioPorUpn(string upn);               // null quando não existe
    GraphUsuario CriarUsuario(string upn, string nome, string senhaTemporaria, string? celular);
    void DefinirAtivo(string usuarioId, bool ativo);
    void AtribuirLicenca(string usuarioId, string skuId);
    void RemoverLicenca(string usuarioId, string skuId);
    bool EhMembro(string grupoId, string usuarioId);
    void AdicionarAoGrupo(string grupoId, string usuarioId);
    void RemoverDoGrupo(string grupoId, string usuarioId);
    int LicencasLivres(string skuId);                       // prepaidUnits.enabled - consumedUnits
}
```
- `GraphGateway(AcessoConfig cfg, Func<HttpClient> http)` implementa com token client credentials (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, scope `https://graph.microsoft.com/.default`). Erros HTTP viram `AcessoException("GRAPH_INDISPONIVEL", "<status> em <método> <rota>")`.

- [ ] **Step 1: Fake e testes do gateway HTTP**

`FakeGraphGateway.cs`:
```csharp
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class FakeGraphGateway : IGraphGateway
{
    public readonly Dictionary<string, GraphUsuario> Usuarios = new();
    public readonly HashSet<(string Grupo, string Usuario)> Membros = new();
    public readonly List<string> Chamadas = new();
    public int Livres = 5;
    public string? FalharEm;   // nome do método que deve lançar GRAPH_INDISPONIVEL

    private void Registrar(string metodo) { Chamadas.Add(metodo); if (FalharEm == metodo) throw new AcessoException("GRAPH_INDISPONIVEL", "503 em " + metodo); }

    public GraphUsuario? UsuarioPorUpn(string upn) { Registrar("UsuarioPorUpn"); return Usuarios.TryGetValue(upn, out var u) ? u : null; }
    public GraphUsuario CriarUsuario(string upn, string nome, string senha, string? celular)
    {
        Registrar("CriarUsuario");
        var u = new GraphUsuario { Id = "id-" + upn, Upn = upn, Ativo = true };
        Usuarios[upn] = u; return u;
    }
    public void DefinirAtivo(string id, bool ativo) { Registrar("DefinirAtivo"); Usuarios.Values.Single(u => u.Id == id).Ativo = ativo; }
    public void AtribuirLicenca(string id, string sku) { Registrar("AtribuirLicenca"); Usuarios.Values.Single(u => u.Id == id).SkuIds.Add(sku); }
    public void RemoverLicenca(string id, string sku) { Registrar("RemoverLicenca"); Usuarios.Values.Single(u => u.Id == id).SkuIds.Remove(sku); }
    public bool EhMembro(string g, string id) { Registrar("EhMembro"); return Membros.Contains((g, id)); }
    public void AdicionarAoGrupo(string g, string id) { Registrar("AdicionarAoGrupo"); Membros.Add((g, id)); }
    public void RemoverDoGrupo(string g, string id) { Registrar("RemoverDoGrupo"); Membros.Remove((g, id)); }
    public int LicencasLivres(string sku) { Registrar("LicencasLivres"); return Livres; }
}
```

`GraphGatewayTests.cs` (HttpClient com handler falso):
```csharp
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class GraphGatewayTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public readonly List<HttpRequestMessage> Pedidos = new();
        public Func<HttpRequestMessage, HttpResponseMessage> Responder = _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") };
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        { Pedidos.Add(request); return Task.FromResult(Responder(request)); }
    }

    private static AcessoConfig Cfg() => AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\"}", "{\"clientSecret\":\"s\"}");

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body) };

    [Fact]
    public void UsuarioPorUpn_devolve_null_em_404_e_usuario_em_200()
    {
        var h = new Handler();
        h.Responder = r => r.RequestUri!.AbsolutePath.Contains("/token") ? Json("{\"access_token\":\"tok\"}")
            : r.RequestUri.AbsolutePath.EndsWith("/users/x%40b.com") ? Json("", HttpStatusCode.NotFound)
            : Json("{\"id\":\"1\",\"userPrincipalName\":\"y@b.com\",\"accountEnabled\":true,\"assignedLicenses\":[{\"skuId\":\"sku\"}]}");
        var g = new GraphGateway(Cfg(), () => new HttpClient(h));
        Assert.Null(g.UsuarioPorUpn("x@b.com"));
        var u = g.UsuarioPorUpn("y@b.com")!;
        Assert.Equal("1", u.Id); Assert.True(u.Ativo); Assert.Contains("sku", u.SkuIds);
        Assert.Equal("Bearer tok", h.Pedidos[1].Headers.Authorization!.ToString());
    }

    [Fact]
    public void CriarUsuario_envia_senha_com_troca_obrigatoria_e_nunca_a_expoe_no_erro()
    {
        var h = new Handler();
        string? corpo = null;
        h.Responder = r =>
        {
            if (r.RequestUri!.AbsolutePath.Contains("/token")) return Json("{\"access_token\":\"tok\"}");
            corpo = r.Content!.ReadAsStringAsync().Result;
            return Json("", HttpStatusCode.ServiceUnavailable);
        };
        var g = new GraphGateway(Cfg(), () => new HttpClient(h));
        var erro = Assert.Throws<AcessoException>(() => g.CriarUsuario("x@b.com", "X Y", "Senha#123456", "+5512999999999"));
        Assert.Contains("\"forceChangePasswordNextSignIn\":true", corpo);
        Assert.Contains("\"password\":\"Senha#123456\"", corpo);
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        Assert.DoesNotContain("Senha#123456", erro.Message);
    }

    [Fact]
    public void LicencasLivres_subtrai_consumidas()
    {
        var h = new Handler();
        h.Responder = r => r.RequestUri!.AbsolutePath.Contains("/token") ? Json("{\"access_token\":\"tok\"}")
            : Json("{\"value\":[{\"skuId\":\"sku\",\"consumedUnits\":3,\"prepaidUnits\":{\"enabled\":10}}]}");
        Assert.Equal(7, new GraphGateway(Cfg(), () => new HttpClient(h)).LicencasLivres("sku"));
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — `dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj` → compilação falha (`IGraphGateway`, `GraphGateway`).

- [ ] **Step 3: Implementar contrato e gateway**

`IGraphGateway.cs`: exatamente o bloco de "Interfaces" acima (classe `GraphUsuario` com campos públicos e a interface), com `using System.Collections.Generic;` e `namespace Cr40f.Acesso.Plugin;`.

`GraphGateway.cs`:
```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;

namespace Cr40f.Acesso.Plugin;

/// <summary>Microsoft Graph com client credentials. Senha e segredo nunca entram em mensagens de erro.</summary>
public sealed class GraphGateway : IGraphGateway
{
    private const string Base = "https://graph.microsoft.com/v1.0";
    private readonly AcessoConfig _cfg;
    private readonly Lazy<HttpClient> _http;
    private string? _token;

    public GraphGateway(AcessoConfig cfg, Func<HttpClient> http) { _cfg = cfg; _http = new Lazy<HttpClient>(http); }

    public GraphUsuario? UsuarioPorUpn(string upn)
    {
        var resp = Enviar(HttpMethod.Get, "/users/" + Uri.EscapeDataString(upn) + "?$select=id,userPrincipalName,accountEnabled,assignedLicenses", null, aceitar404: true);
        return resp is null ? null : LerUsuario(JsonLeve.Ler(resp));
    }

    public GraphUsuario CriarUsuario(string upn, string nome, string senhaTemporaria, string? celular)
    {
        var mailNickname = upn.Split('@')[0];
        var corpo = "{\"accountEnabled\":true,\"displayName\":" + JsonLeve.Texto(nome) + ",\"mailNickname\":" + JsonLeve.Texto(mailNickname)
            + ",\"userPrincipalName\":" + JsonLeve.Texto(upn) + ",\"usageLocation\":\"BR\",\"preferredLanguage\":\"pt-BR\""
            + (celular is null ? "" : ",\"mobilePhone\":" + JsonLeve.Texto(celular))
            + ",\"passwordProfile\":{\"forceChangePasswordNextSignIn\":true,\"password\":" + JsonLeve.Texto(senhaTemporaria) + "}}";
        return LerUsuario(JsonLeve.Ler(Enviar(HttpMethod.Post, "/users", corpo)!));
    }

    public void DefinirAtivo(string usuarioId, bool ativo)
        => Enviar(new HttpMethod("PATCH"), "/users/" + usuarioId, "{\"accountEnabled\":" + (ativo ? "true" : "false") + "}");

    public void AtribuirLicenca(string usuarioId, string skuId)
        => Enviar(HttpMethod.Post, "/users/" + usuarioId + "/assignLicense", "{\"addLicenses\":[{\"skuId\":" + JsonLeve.Texto(skuId) + ",\"disabledPlans\":[]}],\"removeLicenses\":[]}");

    public void RemoverLicenca(string usuarioId, string skuId)
        => Enviar(HttpMethod.Post, "/users/" + usuarioId + "/assignLicense", "{\"addLicenses\":[],\"removeLicenses\":[" + JsonLeve.Texto(skuId) + "]}");

    public bool EhMembro(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Get, "/groups/" + grupoId + "/members/" + usuarioId + "?$select=id", null, aceitar404: true) is not null;

    public void AdicionarAoGrupo(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Post, "/groups/" + grupoId + "/members/$ref", "{\"@odata.id\":\"" + Base + "/directoryObjects/" + usuarioId + "\"}");

    public void RemoverDoGrupo(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Delete, "/groups/" + grupoId + "/members/" + usuarioId + "/$ref", null, aceitar404: true);

    public int LicencasLivres(string skuId)
    {
        var lista = (List<object?>)JsonLeve.Ler(Enviar(HttpMethod.Get, "/subscribedSkus", null)!)["value"]!;
        foreach (var sku in lista.Cast<Dictionary<string, object?>>())
        {
            if ((string?)sku["skuId"] != skuId) continue;
            var habilitadas = Convert.ToInt32(((Dictionary<string, object?>)sku["prepaidUnits"]!)["enabled"], CultureInfo.InvariantCulture);
            return habilitadas - Convert.ToInt32(sku["consumedUnits"], CultureInfo.InvariantCulture);
        }
        return 0;
    }

    private static GraphUsuario LerUsuario(Dictionary<string, object?> j)
    {
        var u = new GraphUsuario { Id = (string)j["id"]!, Upn = (string)j["userPrincipalName"]!, Ativo = j.TryGetValue("accountEnabled", out var a) && a is bool b && b };
        if (j.TryGetValue("assignedLicenses", out var l) && l is List<object?> lics)
            foreach (var lic in lics.Cast<Dictionary<string, object?>>()) u.SkuIds.Add((string)lic["skuId"]!);
        return u;
    }

    private string Token()
    {
        if (_token is not null) return _token;
        var corpo = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials", ["client_id"] = _cfg.ClientId, ["client_secret"] = _cfg.ClientSecret, ["scope"] = "https://graph.microsoft.com/.default",
        });
        var resp = _http.Value.PostAsync("https://login.microsoftonline.com/" + _cfg.TenantId + "/oauth2/v2.0/token", corpo).Result;
        if (!resp.IsSuccessStatusCode) throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " ao obter token do Graph");
        _token = (string)JsonLeve.Ler(resp.Content.ReadAsStringAsync().Result)["access_token"]!;
        return _token;
    }

    /// <summary>Devolve o corpo da resposta; null em 404 quando aceitar404. Nunca inclui o corpo enviado na exceção.</summary>
    private string? Enviar(HttpMethod metodo, string rota, string? corpoJson, bool aceitar404 = false)
    {
        using var req = new HttpRequestMessage(metodo, Base + rota);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", Token());
        if (corpoJson is not null) req.Content = new StringContent(corpoJson, Encoding.UTF8, "application/json");
        using var resp = _http.Value.SendAsync(req).Result;
        if (aceitar404 && resp.StatusCode == HttpStatusCode.NotFound) return null;
        if (!resp.IsSuccessStatusCode) throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " em " + metodo.Method + " " + rota.Split('?')[0]);
        return resp.Content.ReadAsStringAsync().Result;
    }
}
```
Sandbox: `HttpClient` síncrono via `.Result` é o padrão dos plugins do App Motoristas. O plugin (Tarefa 5) seta `ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12` antes da primeira chamada.

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): gateway do Microsoft Graph com client credentials e fake para testes

IGraphGateway cobre usuário, licença e grupo. GraphGateway obtém token por client
credentials, cria usuário com troca de senha obrigatória, atribui e remove licença,
gerencia membro do grupo e conta licenças livres; erros HTTP viram GRAPH_INDISPONIVEL
sem expor senha nem corpo. FakeGraphGateway simula tudo em memória.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Repositório de funcionários e autorização do chamador

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/FuncionarioRepository.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/Autorizacao.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/FakeService.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/FuncionarioRepositoryTests.cs`

**Interfaces:**
- Produces:
```csharp
public sealed class FuncionarioRegistro { public Guid Id; public string Nome = ""; public string? EmailMicrosoft; public string? Celular; public int Status; public int? TipoVinculo; public bool TemDemissao; }
public sealed class FuncionarioRepository
{
    public FuncionarioRepository(IOrganizationService service);
    public FuncionarioRegistro? PorId(Guid id);
    public FuncionarioRegistro? PorEmail(string email);
    public Guid Criar(string nome, string email, string celular, int tipoVinculo);   // cr40f_funcao = 202410000, cr40f_status = 0
    public void VincularEmail(Guid id, string email, string? celularSeVazio);
    public void Inativar(Guid id, DateTime hojeUtc);                                   // cr40f_status = 1 (Desligado) e cr40f_datadedemissao se vazia
}
public static class Autorizacao { public static void Exigir(IOrganizationService service, Guid userId); } // AcessoException("SEM_PERMISSAO", ...)
```
- Colunas: `cr40f_funcionariosid`, `cr40f_nomecompleto`, `cr40f_emailmicrosoft`, `cr40f_telefonecorporativo` (celular), `cr40f_status` (0 Ativo, 2 Afastado, 1 Desligado, conforme `STATUS` em `apps/shell/src/pages/funcionarios/data/schema.ts`; encerrar grava 1), `cr40f_funcao` (202410000 Motorista), `cr40f_tipodevinculo` (0 Colaborador, 1 Terceiro), `cr40f_datadedemissao` (date). Antes de codar, confirme no DEV com `mcp__Dataverse_DEV__describe` em `cr40f_funcionarios` que `cr40f_telefonecorporativo` é o celular usado no WhatsApp (a lista usa `cr40f_telefonecorporativo ?? cr40f_telefonepessoal`). Se para terceiro o certo for `cr40f_telefonepessoal`, troque a constante `ColunaCelular` abaixo e ajuste este plano.

- [ ] **Step 1: FakeService com Create/Update/Retrieve/RetrieveMultiple**

`FakeService.cs`: copie `packages/plugins/Cr40f.Frota.Plugin.Tests/FakeService.cs`, troque o namespace para `Cr40f.Acesso.Plugin.Tests` e substitua `Create`, `Update`, `Retrieve` e `RetrieveMultiple` por:
```csharp
public List<Entity> Criados { get; } = new();
public List<Entity> Atualizados { get; } = new();

public Guid Create(Entity entity) { if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid(); Com(entity); Criados.Add(entity); return entity.Id; }
public void Update(Entity entity) { Atualizados.Add(entity); var alvo = _tabelas[entity.LogicalName].Single(e => e.Id == entity.Id); foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value; }
public Entity Retrieve(string entityName, Guid id, ColumnSet cs) => _tabelas[entityName].Single(e => e.Id == id);

public EntityCollection RetrieveMultiple(QueryBase query)
{
    var expressao = (QueryExpression)query;
    Consultas.Add(expressao);
    var linhas = (_tabelas.TryGetValue(expressao.EntityName, out var lista) ? lista : new List<Entity>())
        .Where(e => expressao.Criteria.Conditions.All(c => c.Operator != ConditionOperator.Equal || Equals(Valor(e, c.AttributeName, expressao.EntityName), c.Values[0])))
        .ToList();
    return new EntityCollection(linhas) { MoreRecords = false };
}

private static object? Valor(Entity e, string atributo, string tabela)
{
    if (atributo == tabela + "id" || atributo == "cr40f_funcionariosid") return e.Id;
    if (!e.Contains(atributo)) return null;
    return e[atributo] switch { OptionSetValue o => o.Value, EntityReference r => r.Id, string s => s.ToLowerInvariant(), var v => v };
}
```
O fake não faz join (`LinkEntities`): `Autorizacao` consulta em duas etapas (roles do usuário, depois o nome de cada role), o que o fake cobre. Strings comparam em minúsculo para imitar o Dataverse (case-insensitive).

- [ ] **Step 2: Testes do repositório e da autorização**

`FuncionarioRepositoryTests.cs`:
```csharp
using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class FuncionarioRepositoryTests
{
    private static Entity Func(Guid id, string nome, string? email, int status = 0) => new("cr40f_funcionarios", id)
    { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(status), ["cr40f_tipodevinculo"] = new OptionSetValue(1) };

    [Fact]
    public void PorEmail_ignora_maiusculas_e_devolve_null_quando_nao_ha()
    {
        var id = Guid.NewGuid();
        var repo = new FuncionarioRepository(new FakeService().Com(Func(id, "Ana Lima", "ana.lima@betinhos.com.br")));
        Assert.Equal(id, repo.PorEmail("Ana.Lima@betinhos.com.br")!.Id);
        Assert.Null(repo.PorEmail("x@betinhos.com.br"));
    }

    [Fact]
    public void Criar_grava_motorista_ativo_com_vinculo()
    {
        var svc = new FakeService();
        var id = new FuncionarioRepository(svc).Criar("Ana Lima", "ana.lima@betinhos.com.br", "+5512999999999", 1);
        var e = svc.Criados[0];
        Assert.Equal(id, e.Id);
        Assert.Equal(202410000, e.GetAttributeValue<OptionSetValue>("cr40f_funcao").Value);
        Assert.Equal(0, e.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(1, e.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo").Value);
        Assert.Equal("+5512999999999", e["cr40f_telefonecorporativo"]);
    }

    [Fact]
    public void Inativar_preenche_demissao_so_quando_vazia()
    {
        var id = Guid.NewGuid();
        var svc = new FakeService().Com(Func(id, "Ana Lima", "a@b.c"));
        new FuncionarioRepository(svc).Inativar(id, new DateTime(2026, 10, 22, 15, 0, 0, DateTimeKind.Utc));
        Assert.Equal(1, svc.Atualizados[0].GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(new DateTime(2026, 10, 22), svc.Atualizados[0].GetAttributeValue<DateTime>("cr40f_datadedemissao"));
    }

    [Fact]
    public void Autorizacao_exige_funcao_de_gestao_ou_admin()
    {
        var user = Guid.NewGuid(); var roleId = Guid.NewGuid();
        var svc = new FakeService()
            .Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = user, ["roleid"] = roleId })
            .Com(new Entity("role", roleId) { ["name"] = "Acesso - Gestão de Motoristas" });
        Autorizacao.Exigir(svc, user);
        var erro = Assert.Throws<AcessoException>(() => Autorizacao.Exigir(svc, Guid.NewGuid()));
        Assert.Equal("SEM_PERMISSAO", erro.Codigo);
    }
}
```

- [ ] **Step 3: Rodar e ver falhar** — compilação falha.

- [ ] **Step 4: Implementar**

`FuncionarioRepository.cs`:
```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public sealed class FuncionarioRegistro { public Guid Id; public string Nome = ""; public string? EmailMicrosoft; public string? Celular; public int Status; public int? TipoVinculo; public bool TemDemissao; }

public sealed class FuncionarioRepository
{
    public const string Tabela = "cr40f_funcionarios";
    public const string ColunaCelular = "cr40f_telefonecorporativo";
    public const int FuncaoMotorista = 202410000;
    public const int StatusAtivo = 0;
    public const int StatusInativo = 1; // Desligado
    private static readonly ColumnSet Colunas = new("cr40f_nomecompleto", "cr40f_emailmicrosoft", ColunaCelular, "cr40f_status", "cr40f_tipodevinculo", "cr40f_datadedemissao");
    private readonly IOrganizationService _service;
    public FuncionarioRepository(IOrganizationService service) { _service = service; }

    public FuncionarioRegistro? PorId(Guid id)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 1 };
        q.Criteria.AddCondition("cr40f_funcionariosid", ConditionOperator.Equal, id);
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    public FuncionarioRegistro? PorEmail(string email)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 2 };
        q.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, email.Trim().ToLowerInvariant());
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    public Guid Criar(string nome, string email, string celular, int tipoVinculo) => _service.Create(new Entity(Tabela)
    {
        ["cr40f_nomecompleto"] = nome.Trim(), ["cr40f_emailmicrosoft"] = email, [ColunaCelular] = celular,
        ["cr40f_funcao"] = new OptionSetValue(FuncaoMotorista), ["cr40f_status"] = new OptionSetValue(StatusAtivo), ["cr40f_tipodevinculo"] = new OptionSetValue(tipoVinculo),
    });

    public void VincularEmail(Guid id, string email, string? celularSeVazio)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_emailmicrosoft"] = email };
        if (string.IsNullOrWhiteSpace(atual.Celular) && celularSeVazio is not null) e[ColunaCelular] = celularSeVazio;
        _service.Update(e);
    }

    public void Inativar(Guid id, DateTime hojeUtc)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_status"] = new OptionSetValue(StatusInativo) };
        if (!atual.TemDemissao) e["cr40f_datadedemissao"] = hojeUtc.AddHours(-3).Date; // Brasília, sem horário de verão desde 2019
        _service.Update(e);
    }

    private static FuncionarioRegistro Mapear(Entity e) => new()
    {
        Id = e.Id,
        Nome = e.GetAttributeValue<string>("cr40f_nomecompleto") ?? "",
        EmailMicrosoft = e.GetAttributeValue<string>("cr40f_emailmicrosoft"),
        Celular = e.GetAttributeValue<string>(ColunaCelular),
        Status = e.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value ?? StatusAtivo,
        TipoVinculo = e.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo")?.Value,
        TemDemissao = e.Contains("cr40f_datadedemissao") && e["cr40f_datadedemissao"] != null,
    };
}
```

`Autorizacao.cs`:
```csharp
using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public static class Autorizacao
{
    public const string FuncaoGestao = "Acesso - Gestão de Motoristas";
    private static readonly string[] Admin = { "Administrador do Sistema", "System Administrator" };

    public static void Exigir(IOrganizationService service, Guid userId)
    {
        var vinculos = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet("roleid") };
        vinculos.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
        var roleIds = service.RetrieveMultiple(vinculos).Entities.Select(e => (Guid)e["roleid"]).ToArray();
        foreach (var roleId in roleIds)
        {
            var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
            q.Criteria.AddCondition("roleid", ConditionOperator.Equal, roleId);
            var nome = service.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<string>("name")).FirstOrDefault();
            if (nome == FuncaoGestao || Admin.Contains(nome)) return;
        }
        throw new AcessoException("SEM_PERMISSAO", "Só quem tem a função '" + FuncaoGestao + "' ou Administrador do Sistema pode gerir acessos.");
    }
}
```
Funções herdadas por equipe não contam (decisão simples; registrada na skill de verificação da Tarefa 12). No fake, a condição `roleid` compara `Guid` com `Guid` e `name` compara minúsculo com minúsculo (`Valor()` baixa a caixa só do lado da entidade, então `FuncaoGestao` precisa ser comparada pelo repositório: o `Equals` do fake compara `"acesso - gestão de motoristas"` com o `c.Values[0]` que é o `Guid` do role, e não o nome; o nome é lido do resultado, não filtrado, então não há problema).

- [ ] **Step 5: Rodar e ver passar** — PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): repositório de funcionários e autorização do chamador

FuncionarioRepository lê por id e por e-mail Microsoft, cria motorista ativo com vínculo,
vincula e-mail a registro existente e inativa com data de demissão. Autorizacao exige a
função 'Acesso - Gestão de Motoristas' ou Administrador do Sistema. FakeService ganha
Create/Update/Retrieve em memória e filtro Equal.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Orquestração do cadastro (`CadastrarAcessoHandler`) e o plugin

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/CadastrarAcessoHandler.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/CadastrarAcessoMotoristaPlugin.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/CadastrarAcessoHandlerTests.cs`

**Interfaces:**
- Produces:
```csharp
public sealed class CadastroEntrada { public string NomeCompleto = ""; public string Celular = ""; public string? EmailPessoal; public string? PrefixoEmail; public int TipoVinculo = 1; public Guid? FuncionarioId; }
public sealed class CadastroSaida { public string EmailMicrosoft = ""; public string SenhaTemporaria = ""; public Guid FuncionarioId; public string UsuarioEntraId = ""; public string LinkApp = ""; public Etapas Etapas = new(); }
public sealed class CadastrarAcessoHandler
{
    public CadastrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Random rng, Action<string> trace);
    public CadastroSaida Executar(CadastroEntrada entrada);
}
```
- Custom API `cr40f_CadastrarAcessoMotorista`: entradas `NomeCompleto` (String), `Celular` (String), `EmailPessoal` (String, opcional), `PrefixoEmail` (String, opcional), `TipoVinculo` (Integer, opcional), `FuncionarioId` (Guid, opcional); saídas `EmailMicrosoft`, `SenhaTemporaria`, `FuncionarioId` (String com o guid), `UsuarioEntraId`, `LinkApp`, `Etapas` (String JSON).

Ordem das etapas (cada uma pula se já feita):
1. `validacao`: `NomeValido`, `NormalizarCelular` (`NOME_INVALIDO` / `CELULAR_INVALIDO`).
2. `email`: prefixo = `PrefixoEmail` (normalizado por `AcessoRules.PrefixoEmail` para tirar acento/espaço) ou gerado do nome; se `FuncionarioId` informado e o funcionário já tem `cr40f_emailmicrosoft`, usa esse e-mail (sem sufixo). Senão `EmailComSufixo` com `existe = upn => graph.UsuarioPorUpn(upn) != null || repo.PorEmail(upn) != null`.
3. `conflito`: se `repo.PorEmail(email)` existe e é um funcionário diferente de `FuncionarioId` → `EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO`.
4. `usuario`: `graph.UsuarioPorUpn(email)`; se não existe → `LicencasLivres(sku) <= 0` → `SEM_LICENCA_DISPONIVEL`; `CriarUsuario` com senha nova (`feita`, "criado"). Se existe e inativo → `DefinirAtivo(true)` + nova senha? **Não**: não se reseta senha de conta existente (decisão: `pulada`, "já existia; senha não alterada", `SenhaTemporaria` vazia). Se existe ativo → `pulada`.
5. `licenca`: se `SkuIds` não contém `LicenseSkuId` → `AtribuirLicenca` (`feita`), senão `pulada`.
6. `grupo`: `EhMembro` ? `pulada` : `AdicionarAoGrupo` (`feita`).
7. `funcionario`: `FuncionarioId` informado → `VincularEmail(id, email, celular)` (`feita`, "e-mail vinculado"); senão `repo.PorEmail(email)` existente (mesmo registro) → `pulada`; senão `Criar` (`feita`, "criado").
Falha em 4-7 com `AcessoException`: a etapa recebe `Erro(...)` e a exceção é relançada com as etapas já registradas (`CadastroSaida` parcial vai no `Data["Etapas"]` da exceção, para o plugin devolver na mensagem). Simplificação: a mensagem final do plugin vira `CODIGO: texto | etapas=<json>`.

- [ ] **Step 1: Testes do handler**

`CadastrarAcessoHandlerTests.cs`:
```csharp
using System;
using System.Collections.Generic;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class CadastrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://app\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly List<string> _trace = new();

    private CadastrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), Cfg, new Random(1), _trace.Add);
    private static CadastroEntrada Entrada() => new() { NomeCompleto = "João da Silva Ávila", Celular = "(12) 99123-4567" };

    [Fact]
    public void Caminho_feliz_cria_usuario_licenca_grupo_e_funcionario()
    {
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila@betinhos.com.br", saida.EmailMicrosoft);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        Assert.Equal("https://app", saida.LinkApp);
        Assert.Contains("sku", _graph.Usuarios[saida.EmailMicrosoft].SkuIds);
        Assert.Contains(("g", "id-joao.avila@betinhos.com.br"), _graph.Membros);
        Assert.Single(_svc.Criados);
        Assert.Equal("+5512991234567", _svc.Criados[0]["cr40f_telefonecorporativo"]);
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"feita\"", saida.Etapas.ToJson());
        Assert.DoesNotContain(saida.SenhaTemporaria, string.Join("\n", _trace));
    }

    [Fact]
    public void Reexecucao_pula_o_que_ja_existe_e_nao_reseta_senha()
    {
        var primeira = Handler().Executar(Entrada());
        _graph.Chamadas.Clear();
        var segunda = Handler().Executar(Entrada());
        Assert.Equal(primeira.EmailMicrosoft, segunda.EmailMicrosoft);
        Assert.Equal("", segunda.SenhaTemporaria);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas);
        Assert.DoesNotContain("AdicionarAoGrupo", _graph.Chamadas);
        Assert.Single(_svc.Criados);
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"pulada\"", segunda.Etapas.ToJson());
    }

    [Fact]
    public void Sufixo_quando_upn_ja_existe_para_outra_pessoa()
    {
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.com.br", Ativo = true };
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "João Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.com.br", ["cr40f_status"] = new OptionSetValue(0) });
        Assert.Equal("joao.avila2@betinhos.com.br", Handler().Executar(Entrada()).EmailMicrosoft);
    }

    [Fact]
    public void FuncionarioId_vincula_email_em_vez_de_criar()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal(id, saida.FuncionarioId);
        Assert.Empty(_svc.Criados);
        Assert.Equal("joao.avila@betinhos.com.br", _svc.Atualizados[0]["cr40f_emailmicrosoft"]);
    }

    [Fact]
    public void Sem_licenca_livre_falha_antes_de_criar()
    {
        _graph.Livres = 0;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        Assert.Equal("SEM_LICENCA_DISPONIVEL", erro.Codigo);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
    }

    [Theory]
    [InlineData("João", "NOME_INVALIDO")]
    [InlineData("João Silva|1234", "CELULAR_INVALIDO")]
    public void Validacao(string entrada, string codigo)
    {
        var partes = entrada.Split('|');
        var e = new CadastroEntrada { NomeCompleto = partes[0], Celular = partes.Length > 1 ? partes[1] : "12991234567" };
        Assert.Equal(codigo, Assert.Throws<AcessoException>(() => Handler().Executar(e)).Codigo);
    }

    [Fact]
    public void Falha_na_licenca_relanca_com_etapas_feitas()
    {
        _graph.FalharEm = "AtribuirLicenca";
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        var etapas = (string)erro.Data["Etapas"]!;
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"erro\"", etapas);
    }

    [Fact]
    public void PrefixoEmail_informado_vence_o_gerado()
    {
        var e = Entrada(); e.PrefixoEmail = "Joãozinho Ávila";
        Assert.Equal("joaozinho.avila@betinhos.com.br", Handler().Executar(e).EmailMicrosoft);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar** — compilação falha.

- [ ] **Step 3: Implementar handler e plugin**

`CadastrarAcessoHandler.cs`:
```csharp
using System;

namespace Cr40f.Acesso.Plugin;

public sealed class CadastroEntrada { public string NomeCompleto = ""; public string Celular = ""; public string? EmailPessoal; public string? PrefixoEmail; public int TipoVinculo = 1; public Guid? FuncionarioId; }
public sealed class CadastroSaida { public string EmailMicrosoft = ""; public string SenhaTemporaria = ""; public Guid FuncionarioId; public string UsuarioEntraId = ""; public string LinkApp = ""; public Etapas Etapas = new(); }

/// <summary>Cadastro idempotente: cada etapa confere o estado antes de agir. Falha relança com as etapas em Data["Etapas"].</summary>
public sealed class CadastrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly AcessoConfig _cfg; private readonly Random _rng; private readonly Action<string> _trace;
    public CadastrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Random rng, Action<string> trace)
    { _graph = graph; _repo = repo; _cfg = cfg; _rng = rng; _trace = trace; }

    public CadastroSaida Executar(CadastroEntrada entrada)
    {
        var saida = new CadastroSaida { LinkApp = _cfg.AppUrl };
        var etapas = saida.Etapas;
        try
        {
            if (!AcessoRules.NomeValido(entrada.NomeCompleto)) throw new AcessoException("NOME_INVALIDO", "Informe nome e sobrenome.");
            var celular = AcessoRules.NormalizarCelular(entrada.Celular) ?? throw new AcessoException("CELULAR_INVALIDO", "Informe um celular brasileiro com DDD (11 dígitos).");
            etapas.Feita("validacao", "ok");

            var existente = entrada.FuncionarioId is Guid fid ? _repo.PorId(fid) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.") : null;
            string email;
            if (existente?.EmailMicrosoft is { Length: > 0 } ja) { email = ja.ToLowerInvariant(); etapas.Pulada("email", "funcionário já tinha e-mail Microsoft"); }
            else
            {
                var prefixo = AcessoRules.PrefixoEmail(string.IsNullOrWhiteSpace(entrada.PrefixoEmail) ? entrada.NomeCompleto : entrada.PrefixoEmail);
                if (prefixo.Length == 0) throw new AcessoException("NOME_INVALIDO", "Não foi possível gerar o e-mail a partir do nome.");
                email = AcessoRules.EmailComSufixo(prefixo, _cfg.Dominio, upn => _graph.UsuarioPorUpn(upn) is not null || _repo.PorEmail(upn) is not null);
                etapas.Feita("email", email);
            }
            saida.EmailMicrosoft = email;

            var dono = _repo.PorEmail(email);
            if (dono is not null && existente is not null && dono.Id != existente.Id)
                throw new AcessoException("EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO", "O e-mail " + email + " já pertence a " + dono.Nome + ".");

            var usuario = Etapa(etapas, "usuario", () =>
            {
                var u = _graph.UsuarioPorUpn(email);
                if (u is not null) { etapas.Pulada("usuario", u.Ativo ? "já existia; senha não alterada" : "já existia (desativado); senha não alterada"); if (!u.Ativo) _graph.DefinirAtivo(u.Id, true); return u; }
                if (_graph.LicencasLivres(_cfg.LicenseSkuId) <= 0) throw new AcessoException("SEM_LICENCA_DISPONIVEL", "Não há licença livre no plano configurado.");
                saida.SenhaTemporaria = AcessoRules.GerarSenha(_rng);
                u = _graph.CriarUsuario(email, entrada.NomeCompleto.Trim(), saida.SenhaTemporaria, celular);
                etapas.Feita("usuario", "criado"); return u;
            });
            saida.UsuarioEntraId = usuario.Id;

            Etapa(etapas, "licenca", () =>
            {
                if (usuario.SkuIds.Contains(_cfg.LicenseSkuId)) { etapas.Pulada("licenca", "já atribuída"); return 0; }
                _graph.AtribuirLicenca(usuario.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "atribuída"); return 0;
            });

            Etapa(etapas, "grupo", () =>
            {
                if (_graph.EhMembro(_cfg.GroupId, usuario.Id)) { etapas.Pulada("grupo", "já era membro"); return 0; }
                _graph.AdicionarAoGrupo(_cfg.GroupId, usuario.Id); etapas.Feita("grupo", "adicionado"); return 0;
            });

            saida.FuncionarioId = Etapa(etapas, "funcionario", () =>
            {
                if (existente is not null) { _repo.VincularEmail(existente.Id, email, celular); etapas.Feita("funcionario", "e-mail vinculado"); return existente.Id; }
                if (dono is not null) { etapas.Pulada("funcionario", "já cadastrado"); return dono.Id; }
                var id = _repo.Criar(entrada.NomeCompleto, email, celular, entrada.TipoVinculo); etapas.Feita("funcionario", "criado"); return id;
            });

            _trace("cadastro concluído para " + email);
            return saida;
        }
        catch (AcessoException erro)
        {
            erro.Data["Etapas"] = etapas.ToJson();
            throw;
        }
    }

    private static T Etapa<T>(Etapas etapas, string nome, Func<T> acao)
    {
        try { return acao(); }
        catch (AcessoException erro) { etapas.Erro(nome, erro.Message); throw; }
        catch (Exception erro) { etapas.Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
    }
}
```
Atenção ao teste de validação: a `AcessoException` de `SEM_LICENCA_DISPONIVEL` nasce dentro de `Etapa("usuario")` e registra `erro` na etapa; o teste só confere o código.

`CadastrarAcessoMotoristaPlugin.cs`:
```csharp
using System;
using System.Net;
using System.Net.Http;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_CadastrarAcessoMotorista. Step síncrono com configuração não segura (ids/URLs) e segura (clientSecret).</summary>
public sealed class CadastrarAcessoMotoristaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_CadastrarAcessoMotorista";
    private readonly string? _unsecure; private readonly string? _secure;
    public CadastrarAcessoMotoristaPlugin(string unsecureConfig, string secureConfig) { _unsecure = unsecureConfig; _secure = secureConfig; }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo cadastro de acesso.");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            Autorizacao.Exigir(caller, context.InitiatingUserId);
            var sistema = factory.CreateOrganizationService(null);
            var cfg = AcessoConfig.Parse(_unsecure, _secure);
            var entrada = new CadastroEntrada
            {
                NomeCompleto = Texto(context, "NomeCompleto"), Celular = Texto(context, "Celular"), EmailPessoal = TextoOuNulo(context, "EmailPessoal"), PrefixoEmail = TextoOuNulo(context, "PrefixoEmail"),
                TipoVinculo = context.InputParameters.Contains("TipoVinculo") && context.InputParameters["TipoVinculo"] is int tv ? tv : 1,
                FuncionarioId = context.InputParameters.Contains("FuncionarioId") && context.InputParameters["FuncionarioId"] is Guid g && g != Guid.Empty ? g : null,
            };
            var handler = new CadastrarAcessoHandler(new GraphGateway(cfg, () => new HttpClient()), new FuncionarioRepository(sistema), cfg, new Random(), m => tracing.Trace("{0}: {1}", Mensagem, m));
            var saida = handler.Executar(entrada);
            context.OutputParameters["EmailMicrosoft"] = saida.EmailMicrosoft;
            context.OutputParameters["SenhaTemporaria"] = saida.SenhaTemporaria;
            context.OutputParameters["FuncionarioId"] = saida.FuncionarioId.ToString("D");
            context.OutputParameters["UsuarioEntraId"] = saida.UsuarioEntraId;
            context.OutputParameters["LinkApp"] = saida.LinkApp;
            context.OutputParameters["Etapas"] = saida.Etapas.ToJson();
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message + (erro.Data["Etapas"] is string etapas ? " | etapas=" + etapas : ""), erro);
        }
        catch (Exception erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível cadastrar o acesso. " + erro.Message, erro);
        }
    }

    private static string Texto(IPluginExecutionContext c, string nome) => TextoOuNulo(c, nome) ?? "";
    private static string? TextoOuNulo(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
}
```

- [ ] **Step 4: Rodar e ver passar** — `dotnet test` PASS; `dotnet build packages/plugins/Cr40f.Acesso.Plugin/Cr40f.Acesso.Plugin.csproj -c Release` sem aviso de nullable.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): Custom API cr40f_CadastrarAcessoMotorista com cadastro idempotente

CadastrarAcessoHandler valida, gera o e-mail com sufixo, confere conflito com outro
funcionário, cria ou reaproveita o usuário no Entra (sem resetar senha), atribui licença,
adiciona ao grupo e cria ou vincula o cr40f_funcionarios, devolvendo as etapas. O plugin
exige autorização do chamador, grava com o serviço do sistema e nunca registra a senha.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Encerramento (`EncerrarAcessoHandler`) e o plugin

**Files:**
- Create: `packages/plugins/Cr40f.Acesso.Plugin/EncerrarAcessoHandler.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin/EncerrarAcessoMotoristaPlugin.cs`
- Create: `packages/plugins/Cr40f.Acesso.Plugin.Tests/EncerrarAcessoHandlerTests.cs`

**Interfaces:**
- Produces: `EncerrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Func<DateTime> utcNow, Action<string> trace)`; `Etapas Executar(Guid funcionarioId, string confirmacao)`. Custom API `cr40f_EncerrarAcessoMotorista`: entradas `FuncionarioId` (Guid), `Confirmacao` (String); saída `Etapas` (String JSON). Erros: `FUNCIONARIO_NAO_ENCONTRADO`, `FUNCIONARIO_SEM_EMAIL`, `CONFIRMACAO_INVALIDA`, `GRAPH_INDISPONIVEL`.

Etapas: `confirmacao` (primeiro nome igual, sem acento e sem caixa), `grupo` (remove se membro), `licenca` (remove se tem), `conta` (`DefinirAtivo(false)` se ativa), `funcionario` (`Inativar` se status ≠ 1). Usuário inexistente no Entra: `grupo`, `licenca`, `conta` ficam `pulada` ("usuário não existe no Entra") e o funcionário é inativado mesmo assim.

- [ ] **Step 1: Testes**

```csharp
using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class EncerrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly Guid _id = Guid.NewGuid();

    private EncerrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), Cfg, () => new DateTime(2026, 10, 22, 12, 0, 0, DateTimeKind.Utc), _ => { });
    private void ComFuncionario(string? email = "ana.lima@betinhos.com.br") => _svc.Com(new Entity("cr40f_funcionarios", _id) { ["cr40f_nomecompleto"] = "Ana Lima", ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(0) });
    private void ComUsuarioCompleto()
    {
        var u = new GraphUsuario { Id = "u1", Upn = "ana.lima@betinhos.com.br", Ativo = true }; u.SkuIds.Add("sku");
        _graph.Usuarios[u.Upn] = u; _graph.Membros.Add(("g", "u1"));
    }

    [Fact]
    public void Encerra_tudo_e_inativa()
    {
        ComFuncionario(); ComUsuarioCompleto();
        var etapas = Handler().Executar(_id, "ANA").ToJson();
        Assert.Contains("\"etapa\":\"grupo\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"feita\"", etapas);
        Assert.False(_graph.Usuarios["ana.lima@betinhos.com.br"].Ativo);
        Assert.Equal(1, _svc.Atualizados[0].GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void Reexecucao_pula_tudo()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Handler().Executar(_id, "Ana");
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.DoesNotContain("\"estado\":\"feita\"", etapas);
    }

    [Fact]
    public void Confirmacao_errada_nao_toca_em_nada()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Assert.Equal("CONFIRMACAO_INVALIDA", Assert.Throws<AcessoException>(() => Handler().Executar(_id, "Maria")).Codigo);
        Assert.Empty(_graph.Chamadas); Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Sem_email_falha()
    {
        ComFuncionario(email: null);
        Assert.Equal("FUNCIONARIO_SEM_EMAIL", Assert.Throws<AcessoException>(() => Handler().Executar(_id, "Ana")).Codigo);
    }

    [Fact]
    public void Usuario_inexistente_no_entra_so_inativa_o_funcionario()
    {
        ComFuncionario();
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"pulada\"", etapas);
        Assert.Contains("\"etapa\":\"funcionario\",\"estado\":\"feita\"", etapas);
    }
}
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`EncerrarAcessoHandler.cs`:
```csharp
using System;
using System.Globalization;
using System.Text;

namespace Cr40f.Acesso.Plugin;

public sealed class EncerrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly AcessoConfig _cfg; private readonly Func<DateTime> _utcNow; private readonly Action<string> _trace;
    public EncerrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Func<DateTime> utcNow, Action<string> trace)
    { _graph = graph; _repo = repo; _cfg = cfg; _utcNow = utcNow; _trace = trace; }

    public Etapas Executar(Guid funcionarioId, string confirmacao)
    {
        var etapas = new Etapas();
        try
        {
            var f = _repo.PorId(funcionarioId) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.");
            if (string.IsNullOrWhiteSpace(f.EmailMicrosoft)) throw new AcessoException("FUNCIONARIO_SEM_EMAIL", f.Nome + " não tem e-mail Microsoft; não há acesso a encerrar.");
            if (Simples(AcessoRules.PrimeiroNome(f.Nome)) != Simples(confirmacao)) throw new AcessoException("CONFIRMACAO_INVALIDA", "Digite o primeiro nome do funcionário para confirmar.");
            etapas.Feita("confirmacao", "ok");

            var email = f.EmailMicrosoft!.ToLowerInvariant();
            var u = _graph.UsuarioPorUpn(email);
            if (u is null) { etapas.Pulada("grupo", "usuário não existe no Entra"); etapas.Pulada("licenca", "usuário não existe no Entra"); etapas.Pulada("conta", "usuário não existe no Entra"); }
            else
            {
                Etapa(etapas, "grupo", () => { if (_graph.EhMembro(_cfg.GroupId, u.Id)) { _graph.RemoverDoGrupo(_cfg.GroupId, u.Id); etapas.Feita("grupo", "removido"); } else etapas.Pulada("grupo", "não era membro"); });
                Etapa(etapas, "licenca", () => { if (u.SkuIds.Contains(_cfg.LicenseSkuId)) { _graph.RemoverLicenca(u.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "removida"); } else etapas.Pulada("licenca", "não tinha"); });
                Etapa(etapas, "conta", () => { if (u.Ativo) { _graph.DefinirAtivo(u.Id, false); etapas.Feita("conta", "desativada"); } else etapas.Pulada("conta", "já desativada"); });
            }
            Etapa(etapas, "funcionario", () => { if (f.Status != FuncionarioRepository.StatusInativo) { _repo.Inativar(f.Id, _utcNow()); etapas.Feita("funcionario", "inativado"); } else etapas.Pulada("funcionario", "já inativo"); });
            _trace("acesso encerrado para " + email);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    private static void Etapa(Etapas etapas, string nome, Action acao)
    {
        try { acao(); }
        catch (AcessoException erro) { etapas.Erro(nome, erro.Message); throw; }
        catch (Exception erro) { etapas.Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
    }

    private static string Simples(string texto)
    {
        var sb = new StringBuilder();
        foreach (var c in (texto ?? "").Trim().Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(c));
        return sb.ToString();
    }
}
```

`EncerrarAcessoMotoristaPlugin.cs`: mesmo esqueleto do `CadastrarAcessoMotoristaPlugin` (construtor com as duas configurações, `Mensagem = "cr40f_EncerrarAcessoMotorista"`, TLS 1.2, `Autorizacao.Exigir`, serviço do sistema), lendo `FuncionarioId` (`Guid`) e `Confirmacao` (`string`) de `InputParameters` e gravando `context.OutputParameters["Etapas"] = handler.Executar(id, confirmacao).ToJson()`. Mesmo tratamento de exceção (`CODIGO: texto | etapas=...`). `FuncionarioId` ausente ou vazio → `AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Informe o funcionário.")`.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/Cr40f.Acesso.Plugin packages/plugins/Cr40f.Acesso.Plugin.Tests
git commit -m "feat(acesso): Custom API cr40f_EncerrarAcessoMotorista com dupla confirmação

EncerrarAcessoHandler confere o primeiro nome digitado, remove do grupo, remove a licença,
desativa a conta no Entra e inativa o funcionário com data de demissão; nada é excluído e
reexecutar só pula etapas. Usuário ausente no Entra ainda inativa o funcionário.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Registrador, script de push e scripts do `package.json`

**Files:**
- Create: `packages/plugins/tools/Cr40f.Acesso.Registrar/Cr40f.Acesso.Registrar.csproj`
- Create: `packages/plugins/tools/Cr40f.Acesso.Registrar/Program.cs`
- Create: `packages/plugins/scripts/push-acesso-plugin.ps1`
- Modify: `package.json` (raiz) — script `push:plugin:acesso:dev`

**Interfaces:**
- Consumes: nomes `Cr40f.Acesso.Plugin.CadastrarAcessoMotoristaPlugin`, `Cr40f.Acesso.Plugin.EncerrarAcessoMotoristaPlugin`, mensagens `cr40f_CadastrarAcessoMotorista` e `cr40f_EncerrarAcessoMotorista`, parâmetros das Tarefas 5 e 6.
- Produces: steps nomeados `Cr40f.Acesso: cadastrar acesso` e `Cr40f.Acesso: encerrar acesso` (stage 40, mode 0) com `configuration` (não segura) vinda de `--config <json>`; a configuração segura é gravada pela Tarefa 8.

Diferença em relação ao registrador da Frota: aqui a Custom API é criada **sem** `plugintypeid` e a execução vem do **step** (é o step que carrega as configurações). `allowedcustomprocessingsteptype` = 2 (Sync e Async) para permitir o step.

- [ ] **Step 1: csproj do registrador**

Copie `packages/plugins/tools/Cr40f.Frota.Registrar/Cr40f.Frota.Registrar.csproj` para `Cr40f.Acesso.Registrar.csproj`, trocando `AssemblyName`/`RootNamespace` para `Cr40f.Acesso.Registrar`.

- [ ] **Step 2: `Program.cs`**

Copie o `Program.cs` da Frota e adapte as constantes e o fluxo principal:
```csharp
const string TipoCadastrar = "Cr40f.Acesso.Plugin.CadastrarAcessoMotoristaPlugin";
const string TipoEncerrar = "Cr40f.Acesso.Plugin.EncerrarAcessoMotoristaPlugin";
const string ApiCadastrar = "cr40f_CadastrarAcessoMotorista";
const string ApiEncerrar = "cr40f_EncerrarAcessoMotorista";
var config = options.Require("config"); // JSON da configuração não segura
// ... autenticação igual à Frota (token cache "acesso.msalcache.bin") ...
var assemblyId = EnsureAssembly(service, dllPath, solutionUniqueName);            // igual à Frota
var tipoCadastrar = EnsurePluginType(service, assemblyId, TipoCadastrar);
var tipoEncerrar = EnsurePluginType(service, assemblyId, TipoEncerrar);
EnsureCustomApi(service, ApiCadastrar, "Acesso | Cadastrar acesso de motorista", "Cria conta Microsoft, licença, grupo e funcionário; devolve credenciais e etapas.", solutionUniqueName,
    requestParams: new[] { ("NomeCompleto", 10, false), ("Celular", 10, false), ("EmailPessoal", 10, true), ("PrefixoEmail", 10, true), ("TipoVinculo", 8, true), ("FuncionarioId", 12, true) },
    responseProps: new[] { ("EmailMicrosoft", 10), ("SenhaTemporaria", 10), ("FuncionarioId", 10), ("UsuarioEntraId", 10), ("LinkApp", 10), ("Etapas", 10) });
EnsureCustomApi(service, ApiEncerrar, "Acesso | Encerrar acesso de motorista", "Remove grupo, licença e conta no Entra e inativa o funcionário.", solutionUniqueName,
    requestParams: new[] { ("FuncionarioId", 12, false), ("Confirmacao", 10, false) },
    responseProps: new[] { ("Etapas", 10) });
EnsureApiStep(service, tipoCadastrar, ApiCadastrar, "Cr40f.Acesso: cadastrar acesso", config, solutionUniqueName);
EnsureApiStep(service, tipoEncerrar, ApiEncerrar, "Cr40f.Acesso: encerrar acesso", config, solutionUniqueName);
if (publish) service.Execute(new PublishAllXmlRequest());
```
Tipos de parâmetro (`customapirequestparameter.type` / `customapiresponseproperty.type`): 8 = Integer, 10 = String, 12 = Guid.

`EnsureCustomApi` generalizada (a partir da versão da Frota):
```csharp
static Guid EnsureCustomApi(ServiceClient service, string uniqueName, string displayName, string description, string solution,
    (string Nome, int Tipo, bool Opcional)[] requestParams, (string Nome, int Tipo)[] responseProps)
{
    Guid id;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", uniqueName));
    if (existing is not null) { id = existing.Id; Log($"reutilizando Custom API {uniqueName}"); }
    else
    {
        var create = new CreateRequest { Target = new Entity("customapi")
        {
            ["uniquename"] = uniqueName, ["name"] = uniqueName, ["displayname"] = displayName, ["description"] = description,
            ["bindingtype"] = new OptionSetValue(0), ["isfunction"] = false, ["isprivate"] = false,
            ["allowedcustomprocessingsteptype"] = new OptionSetValue(2), ["iscustomizable"] = new BooleanManagedProperty(false),
        } };
        create["SolutionUniqueName"] = solution;
        id = ((CreateResponse)service.Execute(create)).id;
        Log($"Custom API criada: {uniqueName}");
    }
    foreach (var p in requestParams)
        if (!ChildExists(service, "customapirequestparameter", id, p.Nome))
            CreateInSolution(service, new Entity("customapirequestparameter") { ["customapiid"] = Ref("customapi", id), ["uniquename"] = p.Nome, ["name"] = $"{uniqueName}.{p.Nome}", ["displayname"] = p.Nome, ["type"] = new OptionSetValue(p.Tipo), ["isoptional"] = p.Opcional, ["iscustomizable"] = new BooleanManagedProperty(false) }, solution);
    foreach (var r in responseProps)
        if (!ChildExists(service, "customapiresponseproperty", id, r.Nome))
            CreateInSolution(service, new Entity("customapiresponseproperty") { ["customapiid"] = Ref("customapi", id), ["uniquename"] = r.Nome, ["name"] = $"{uniqueName}.{r.Nome}", ["displayname"] = r.Nome, ["type"] = new OptionSetValue(r.Tipo), ["iscustomizable"] = new BooleanManagedProperty(false) }, solution);
    return id;
}
```

`EnsureApiStep` (step síncrono PostOperation (stage 40) na mensagem da Custom API, preservando a configuração segura já existente):
```csharp
static void EnsureApiStep(ServiceClient service, Guid pluginTypeId, string messageName, string name, string config, string solution)
{
    var message = FindSingleOrNone(service, "sdkmessage", ("name", messageName)) ?? throw new InvalidOperationException($"sdkmessage {messageName} não encontrada (publique a Custom API antes).");
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        service.Update(new Entity("sdkmessageprocessingstep", existing.Id) { ["configuration"] = config, ["stage"] = new OptionSetValue(30), ["mode"] = new OptionSetValue(0), ["eventhandler"] = Ref("plugintype", pluginTypeId) });
        EnsureSolutionComponent(service, existing.Id, solution, 92);
        Log($"step reconciliado: {name}");
        return;
    }
    var stepId = service.Create(new Entity("sdkmessageprocessingstep")
    {
        ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(30), ["rank"] = 1, ["supporteddeployment"] = new OptionSetValue(0),
        ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["eventhandler"] = Ref("plugintype", pluginTypeId), ["configuration"] = config, ["asyncautodelete"] = false,
    });
    EnsureSolutionComponent(service, stepId, solution, 92);
    Log($"step criado: {name}");
}
```
A `sdkmessage` da Custom API só existe depois de criada a API; o registrador cria a API antes do step na mesma execução (o Dataverse cria a mensagem na hora).

- [ ] **Step 3: Script de push**

`packages/plugins/scripts/push-acesso-plugin.ps1`: copie `push-frota-plugin.ps1`, troque `frota`→`acesso` nos caminhos e nomes (`Cr40f.Acesso.Plugin`, `Cr40f.Acesso.Plugin.Tests`, `Cr40f.Acesso.Registrar`, chave `Cr40f.Acesso.Plugin.snk`) e passe a configuração não segura lida do `.env` da raiz:
```powershell
$dotEnv = @{}; $envPath = Join-Path $root '.env'
if (Test-Path $envPath) { foreach ($line in [IO.File]::ReadAllLines($envPath)) { if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { $dotEnv[$Matches[1]] = $Matches[2].Trim('"') } } }
foreach ($k in 'ACESSO_TENANT_ID','ACESSO_CLIENT_ID','ACESSO_LICENSE_SKU_ID','ACESSO_GROUP_ID','ACESSO_APP_URL') { if (-not $dotEnv[$k]) { throw "$k ausente no .env (configuração não segura do plugin de acesso)." } }
$config = @{ tenantId = $dotEnv.ACESSO_TENANT_ID; clientId = $dotEnv.ACESSO_CLIENT_ID; licenseSkuId = $dotEnv.ACESSO_LICENSE_SKU_ID; groupId = $dotEnv.ACESSO_GROUP_ID; appUrl = $dotEnv.ACESSO_APP_URL; dominio = 'betinhos.com.br' } | ConvertTo-Json -Compress
& $dotnet.Source run --project $registrar -- --environmentUrl $EnvironmentUrl --dllPath $dllPath --solutionUniqueName $SolutionUniqueName --config $config --publish
```
Adicione em `.env.example` (se existir; senão crie a seção no `README` do deploy) as cinco chaves `ACESSO_*` com valores vazios e o comentário "sem segredo: o clientSecret é digitado em provision-acesso.ps1".

- [ ] **Step 4: `package.json` da raiz**

Acrescente ao lado dos outros `push:plugin:*`:
```json
"push:plugin:acesso:dev": "powershell -NoProfile -ExecutionPolicy Bypass -File packages/plugins/scripts/push-acesso-plugin.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -EnvironmentName dev"
```

- [ ] **Step 5: Verificar**

Run: `dotnet build packages/plugins/tools/Cr40f.Acesso.Registrar/Cr40f.Acesso.Registrar.csproj`
Expected: build OK. Não execute o push a partir da worktree; o push no DEV é feito pela Tarefa 12, da `main`.

- [ ] **Step 6: Commit**

```bash
git add packages/plugins/tools/Cr40f.Acesso.Registrar packages/plugins/scripts/push-acesso-plugin.ps1 package.json .env.example
git commit -m "build(acesso): registrador e script de push do plugin de acesso

Cr40f.Acesso.Registrar cria as Custom APIs cr40f_CadastrarAcessoMotorista e
cr40f_EncerrarAcessoMotorista sem plugintype e registra os steps síncronos PostOperation (stage 40)
com a configuração não segura lida do .env. pnpm push:plugin:acesso:dev roda testes,
build, registro e publicação no DEV.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Provisão no DEV: função de segurança e configuração segura

**Files:**
- Create: `packages/deploy/provision-acesso.ps1`
- Create: `docs/acesso-motorista-entra.md`

**Interfaces:**
- Consumes: steps `Cr40f.Acesso: cadastrar acesso` e `Cr40f.Acesso: encerrar acesso` (Tarefa 7).
- Produces: função de segurança `Acesso - Gestão de Motoristas` (sem privilégios de tabela: a autorização é por nome no plugin), `sdkmessageprocessingstepsecureconfig` com `{"clientSecret":"..."}` nos dois steps, checagem que falha se algum step ficar sem configuração segura.

- [ ] **Step 1: Script**

`packages/deploy/provision-acesso.ps1` (salvo com BOM, Windows PowerShell 5.1, molde `provision-equipamentos.ps1` para `.env`, token, `Invoke-Dataverse`, bloqueio de PROD e `-Apply`):
```powershell
param([switch] $Apply, [switch] $DeviceCode)
# Provisiona no DEV a função "Acesso - Gestão de Motoristas" e grava a configuração segura (clientSecret do Graph)
# nos steps do plugin de acesso. Sem -Apply roda em DRY RUN. O segredo é digitado, nunca lido do .env nem versionado.
# ... (cabeçalho, Read-DotEnv, Get-Setting, bloqueio de PROD, Get-AccessToken e Invoke-Dataverse copiados de provision-equipamentos.ps1) ...

$FuncaoNome = "Acesso - Gestão de Motoristas"
$StepNames = @("Cr40f.Acesso: cadastrar acesso", "Cr40f.Acesso: encerrar acesso")

# 1. Função de segurança (na unidade de negócios raiz)
$bu = (Invoke-Dataverse "GET" "businessunits?`$select=businessunitid&`$filter=parentbusinessunitid eq null").value[0].businessunitid
$papel = @((Invoke-Dataverse "GET" "roles?`$select=roleid&`$filter=name eq '$(Escape-OData $FuncaoNome)' and _businessunitid_value eq $bu").value)
if ($papel.Count -eq 0) {
  Write-Step "funcao '$FuncaoNome' ausente"
  if ($Apply) { Invoke-Dataverse "POST" "roles" @{ name = $FuncaoNome; "businessunitid@odata.bind" = "/businessunits($bu)" } | Out-Null; Write-Step "funcao criada" }
} else { Write-Step "funcao ja existe" }

# 2. Configuração segura dos steps
$steps = @{}
foreach ($name in $StepNames) {
  $rows = @((Invoke-Dataverse "GET" "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$(Escape-OData $name)'").value)
  if ($rows.Count -ne 1) { throw "Step '$name' nao encontrado ($($rows.Count)). Rode 'pnpm push:plugin:acesso:dev' antes." }
  $steps[$name] = $rows[0]
}
if ($Apply) {
  $secure = Read-Host -AsSecureString "clientSecret do app registration do Graph"
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if ([string]::IsNullOrWhiteSpace($plain)) { throw "clientSecret vazio." }
  $json = (@{ clientSecret = $plain } | ConvertTo-Json -Compress)
  foreach ($name in $StepNames) {
    $step = $steps[$name]
    $secureId = [string]$step._sdkmessageprocessingstepsecureconfigid_value
    if ($secureId) { Invoke-Dataverse "PATCH" "sdkmessageprocessingstepsecureconfigs($secureId)" @{ secureconfig = $json } | Out-Null }
    else {
      $created = Invoke-Dataverse "POST" "sdkmessageprocessingstepsecureconfigs" @{ secureconfig = $json } -ExtraHeaders @{ Prefer = "return=representation" }
      Invoke-Dataverse "PATCH" "sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" @{ "sdkmessageprocessingstepsecureconfigid@odata.bind" = "/sdkmessageprocessingstepsecureconfigs($($created.sdkmessageprocessingstepsecureconfigid))" } | Out-Null
    }
    Write-Step "configuracao segura gravada em '$name'"
  }
  $plain = $null; $json = $null
} else { Write-Step "DRY RUN: 2 steps encontrados; use -Apply para gravar o clientSecret" }

# 3. Checagem final: nenhum step sem configuração segura
foreach ($name in $StepNames) {
  $row = (Invoke-Dataverse "GET" "sdkmessageprocessingsteps?`$select=_sdkmessageprocessingstepsecureconfigid_value&`$filter=name eq '$(Escape-OData $name)'").value[0]
  if ($Apply -and -not $row._sdkmessageprocessingstepsecureconfigid_value) { throw "Step '$name' continua sem configuracao segura." }
}
Write-Step "concluido"
```
Em `Invoke-Dataverse`, o `POST` precisa devolver o registro criado: o molde já aceita `-ExtraHeaders`; confirme que ele retorna o corpo quando `Prefer: return=representation` está presente (no molde, `Invoke-RestMethod` já devolve o JSON).

- [ ] **Step 2: Rodar em DRY RUN**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-acesso.ps1`
Expected (antes do push do plugin): erro claro "Step ... nao encontrado. Rode 'pnpm push:plugin:acesso:dev' antes." Depois do push (Tarefa 12): "DRY RUN: 2 steps encontrados".

- [ ] **Step 3: Documento para o Renan**

`docs/acesso-motorista-entra.md`:
```markdown
# Acesso ao App Motoristas — preparação no Entra (feita pelo Renan)

## 1. App registration do Graph (uma vez por tenant)
1. Entra admin center → Aplicativos → Registros de aplicativo → Novo registro: nome `Betinhos - Acesso Motoristas`, conta única (este tenant), sem redirect URI.
2. Permissões de API → Adicionar → Microsoft Graph → Permissões de aplicativo: `User.ReadWrite.All`, `GroupMember.ReadWrite.All`, `Organization.Read.All`. Clique em "Conceder consentimento de administrador".
3. Certificados e segredos → Novo segredo do cliente (validade 12 meses). Copie o **valor** agora; ele só aparece uma vez.
4. Anote `Application (client) ID` e `Directory (tenant) ID`.
5. Para `assignLicense`, o app precisa também estar fora de políticas de acesso condicional que bloqueiem fluxos sem usuário (padrão: não há).

## 2. Grupo de teste no DEV
1. Entra → Grupos → Novo grupo: Segurança, nome `Team-Betinhos-Canvas-DEV`, sem membros.
2. No Power Platform admin center → ambiente DEV → Configurações → Usuários + permissões → Equipes → Nova equipe do tipo "Grupo do Entra" apontando para esse grupo; função de segurança igual à do `Team-Betinhos-Canvas` do PROD (a que os motoristas usam).
3. Anote o Object ID do grupo.

## 3. SKU da licença
`Get-MgSubscribedSku | Select SkuPartNumber, SkuId` (PowerShell com `Microsoft.Graph`) ou Entra → Cobrança → Licenças. Use o `SkuId` do plano escolhido (hoje `POWERAPPS_DEV`, "Power Apps for Developer"). Ressalva registrada no spec: esse plano é de desenvolvimento; trocar o SKU é só editar o `.env` e rodar `pnpm push:plugin:acesso:dev`.

## 4. `.env` da raiz (não versionado)
ACESSO_TENANT_ID=<tenant>
ACESSO_CLIENT_ID=<client id>
ACESSO_LICENSE_SKU_ID=<sku id>
ACESSO_GROUP_ID=<object id do grupo>
ACESSO_APP_URL=https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2

## 5. Ordem de publicação (da `main`, checkout principal)
1. `pnpm push:plugin:acesso:dev`
2. `powershell -File packages/deploy/provision-acesso.ps1 -Apply` (digita o clientSecret)
3. Atribuir a função "Acesso - Gestão de Motoristas" aos usuários da operação.
4. `pnpm push` (shell)
```

- [ ] **Step 4: Commit**

```bash
git add packages/deploy/provision-acesso.ps1 docs/acesso-motorista-entra.md
git commit -m "build(acesso): provisão da função de segurança e da configuração segura do Graph

provision-acesso.ps1 cria a função 'Acesso - Gestão de Motoristas', grava o clientSecret
digitado na configuração segura dos dois steps do plugin e falha se algum step ficar sem
ela. docs/acesso-motorista-entra.md descreve o app registration, o grupo de teste do DEV,
o SKU e a ordem de publicação.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Fonte de dados do acesso no shell (contrato, Dataverse e mock)

**Files:**
- Create: `apps/shell/src/pages/funcionarios/data/acesso.ts`
- Create: `apps/shell/src/pages/funcionarios/data/acessoMock.ts`
- Create: `apps/shell/src/pages/funcionarios/data/acesso.test.ts`

**Interfaces:**
- Consumes: `Host` (`apps/shell/src/host.ts`: `{ mode: 'mock' } | { mode: 'dataverse', client: DataverseClient, ... }`), `client.request<T>(path, { method, body })` de `@betinhos/dataverse`, `phoneDigits` de `../../operacional/domain/phone`.
- Produces:
```ts
export type Etapa = { etapa: string; estado: 'feita' | 'pulada' | 'erro'; detalhe: string }
export type CadastroInput = { nomeCompleto: string; celular: string; emailPessoal?: string; prefixoEmail?: string; tipoVinculo: 0 | 1; funcionarioId?: string }
export type CadastroResultado = { emailMicrosoft: string; senhaTemporaria: string; funcionarioId: string; linkApp: string; etapas: Etapa[] }
export class AcessoError extends Error { codigo: string; etapas: Etapa[] }
export interface AcessoSource { cadastrar(input: CadastroInput): Promise<CadastroResultado>; encerrar(funcionarioId: string, confirmacao: string): Promise<Etapa[]> }
export function createAcessoSource(host: Host): AcessoSource
export function parseAcessoError(error: unknown): AcessoError          // lê "CODIGO: texto | etapas=[...]" da mensagem do Dataverse
export const MENSAGENS: Record<string, string>                         // código → texto curto para a tela
export function mensagemWhatsApp(r: { nome: string; emailMicrosoft: string; senhaTemporaria: string; linkApp: string }): string
export function whatsappComMensagem(celular: string, texto: string): string | null   // https://wa.me/<digitos>?text=<encoded>
```

- [ ] **Step 1: Testes**

`acesso.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createAcessoSource, mensagemWhatsApp, parseAcessoError, whatsappComMensagem, MENSAGENS } from './acesso'

describe('acesso', () => {
  it('parseAcessoError extrai código, texto e etapas da mensagem do Dataverse', () => {
    const erro = parseAcessoError(new Error('GRAPH_INDISPONIVEL: 503 em POST /users | etapas=[{"etapa":"usuario","estado":"erro","detalhe":"503"}]'))
    expect(erro.codigo).toBe('GRAPH_INDISPONIVEL')
    expect(erro.message).toBe(MENSAGENS.GRAPH_INDISPONIVEL)
    expect(erro.etapas).toEqual([{ etapa: 'usuario', estado: 'erro', detalhe: '503' }])
  })

  it('parseAcessoError sem código vira DESCONHECIDO com a mensagem original', () => {
    const erro = parseAcessoError(new Error('Timeout'))
    expect(erro.codigo).toBe('DESCONHECIDO')
    expect(erro.message).toContain('Timeout')
    expect(erro.etapas).toEqual([])
  })

  it('mensagemWhatsApp tem link, e-mail, senha e instrução de troca, sem introdução', () => {
    const texto = mensagemWhatsApp({ nome: 'João da Silva', emailMicrosoft: 'joao.silva@betinhos.com.br', senhaTemporaria: 'Abc#12345678xy', linkApp: 'https://app' })
    expect(texto.startsWith('*Acesso ao App Motoristas*')).toBe(true)
    expect(texto).toContain('https://app')
    expect(texto).toContain('joao.silva@betinhos.com.br')
    expect(texto).toContain('Abc#12345678xy')
    expect(texto).toContain('troque a senha')
    expect(texto).toContain('5 minutos')
  })

  it('whatsappComMensagem codifica o texto', () => {
    expect(whatsappComMensagem('(12) 99123-4567', 'oi & tchau')).toBe('https://wa.me/5512991234567?text=oi%20%26%20tchau')
    expect(whatsappComMensagem('123', 'x')).toBeNull()
  })

  it('mock cadastra, aplica sufixo quando repete e simula erro pelo nome', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    const a = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '12991234567', tipoVinculo: 1 })
    expect(a.emailMicrosoft).toBe('ana.lima@betinhos.com.br')
    expect(a.senhaTemporaria).toHaveLength(14)
    expect(a.etapas.map((e) => e.estado)).toContain('feita')
    const b = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '12991234567', tipoVinculo: 1 })
    expect(b.emailMicrosoft).toBe('ana.lima2@betinhos.com.br')
    await expect(src.cadastrar({ nomeCompleto: 'Erro Graph', celular: '12991234567', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'GRAPH_INDISPONIVEL' })
    await expect(src.cadastrar({ nomeCompleto: 'Sem Licenca', celular: '12991234567', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'SEM_LICENCA_DISPONIVEL' })
  })

  it('mock encerra só com o primeiro nome certo', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    await expect(src.encerrar('m1', 'Errado')).rejects.toMatchObject({ codigo: 'CONFIRMACAO_INVALIDA' })
    const etapas = await src.encerrar('m1', 'Carlos')
    expect(etapas.find((e) => e.etapa === 'funcionario')?.estado).toBe('feita')
  })

  it('dataverse chama as Custom APIs com os nomes de parâmetro do plugin', async () => {
    const calls: { path: string; body: unknown }[] = []
    const client = { request: async (path: string, init: { body: string }) => { calls.push({ path, body: JSON.parse(init.body) }); return path.includes('Cadastrar') ? { EmailMicrosoft: 'a@b', SenhaTemporaria: 's', FuncionarioId: 'f', LinkApp: 'l', Etapas: '[]' } : { Etapas: '[{"etapa":"conta","estado":"feita","detalhe":""}]' } } }
    const src = createAcessoSource({ mode: 'dataverse', client } as never)
    const r = await src.cadastrar({ nomeCompleto: 'A B', celular: '12991234567', tipoVinculo: 1, funcionarioId: 'F1' })
    expect(calls[0]).toEqual({ path: 'cr40f_CadastrarAcessoMotorista', body: { NomeCompleto: 'A B', Celular: '12991234567', TipoVinculo: 1, FuncionarioId: 'F1' } })
    expect(r).toEqual({ emailMicrosoft: 'a@b', senhaTemporaria: 's', funcionarioId: 'f', linkApp: 'l', etapas: [] })
    await src.encerrar('F1', 'Ana')
    expect(calls[1]).toEqual({ path: 'cr40f_EncerrarAcessoMotorista', body: { FuncionarioId: 'F1', Confirmacao: 'Ana' } })
  })
})
```
No mock, `m1` é "Carlos Alberto Teste" em `data/mock.ts`.

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- acesso` → módulo não encontrado.

- [ ] **Step 3: Implementar**

`data/acesso.ts`:
```ts
import type { Host } from '../../../host'
import { phoneDigits } from '../../operacional/domain/phone'
import { createAcessoMock } from './acessoMock'

export type Etapa = { etapa: string; estado: 'feita' | 'pulada' | 'erro'; detalhe: string }
export type CadastroInput = { nomeCompleto: string; celular: string; emailPessoal?: string; prefixoEmail?: string; tipoVinculo: 0 | 1; funcionarioId?: string }
export type CadastroResultado = { emailMicrosoft: string; senhaTemporaria: string; funcionarioId: string; linkApp: string; etapas: Etapa[] }

export interface AcessoSource {
  cadastrar(input: CadastroInput): Promise<CadastroResultado>
  encerrar(funcionarioId: string, confirmacao: string): Promise<Etapa[]>
}

export const MENSAGENS: Record<string, string> = {
  NOME_INVALIDO: 'Informe nome e sobrenome.',
  CELULAR_INVALIDO: 'Informe um celular com DDD (11 dígitos).',
  EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO: 'Esse e-mail já pertence a outro funcionário. Ajuste o prefixo.',
  SEM_LICENCA_DISPONIVEL: 'Não há licença livre no plano configurado. Libere uma licença no Microsoft 365 e tente de novo.',
  GRAPH_INDISPONIVEL: 'O Microsoft 365 não respondeu. O que já foi feito está marcado; tente de novo em instantes.',
  CONFIG_AUSENTE: 'O plugin de acesso está sem configuração. Avise a TI.',
  SEM_PERMISSAO: 'Você não tem permissão para gerir acessos.',
  FUNCIONARIO_NAO_ENCONTRADO: 'Funcionário não encontrado.',
  FUNCIONARIO_SEM_EMAIL: 'Este funcionário não tem e-mail Microsoft; não há acesso a encerrar.',
  CONFIRMACAO_INVALIDA: 'O nome digitado não confere.',
}

export class AcessoError extends Error {
  constructor(public codigo: string, message: string, public etapas: Etapa[]) { super(message); this.name = 'AcessoError' }
}

/** Mensagens do plugin chegam como "CODIGO: texto | etapas=[...]" (às vezes embrulhadas pelo Dataverse). */
export function parseAcessoError(error: unknown): AcessoError {
  if (error instanceof AcessoError) return error
  const raw = error instanceof Error ? error.message : String(error)
  const m = /([A-Z_]{4,}): ([^|]*)(?:\| etapas=(\[.*\]))?/s.exec(raw)
  if (!m) return new AcessoError('DESCONHECIDO', raw.replace(/\.+$/, ''), [])
  let etapas: Etapa[] = []
  try { etapas = m[3] ? (JSON.parse(m[3]) as Etapa[]) : [] } catch { etapas = [] }
  return new AcessoError(m[1], MENSAGENS[m[1]] ?? m[2].trim(), etapas)
}

export function mensagemWhatsApp(r: { nome: string; emailMicrosoft: string; senhaTemporaria: string; linkApp: string }) {
  const primeiro = r.nome.trim().split(/\s+/)[0]
  return [
    '*Acesso ao App Motoristas*',
    '',
    `Olá, ${primeiro}. Seu acesso está pronto.`,
    '',
    `• Link: ${r.linkApp}`,
    `• E-mail: ${r.emailMicrosoft}`,
    `• Senha temporária: ${r.senhaTemporaria}`,
    '',
    'Abra o link no navegador do celular, entre com o e-mail e troque a senha no primeiro acesso.',
    'Se der erro de acesso, aguarde 5 minutos e tente de novo.',
  ].join('\n')
}

export function whatsappComMensagem(celular: string, texto: string) {
  const digits = phoneDigits(celular)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(texto)}` : null
}

type Resposta = { EmailMicrosoft: string; SenhaTemporaria: string; FuncionarioId: string; LinkApp: string; Etapas: string }

export function createAcessoSource(host: Host): AcessoSource {
  if (host.mode === 'mock') return createAcessoMock()
  const { client } = host
  const chamar = async <T,>(nome: string, body: Record<string, unknown>) => {
    try { return await client.request<T>(nome, { method: 'POST', body: JSON.stringify(body) }) } catch (error) { throw parseAcessoError(error) }
  }
  const etapas = (json: string): Etapa[] => { try { return JSON.parse(json) as Etapa[] } catch { return [] } }
  return {
    async cadastrar(input) {
      const body: Record<string, unknown> = { NomeCompleto: input.nomeCompleto, Celular: input.celular, TipoVinculo: input.tipoVinculo }
      if (input.emailPessoal) body.EmailPessoal = input.emailPessoal
      if (input.prefixoEmail) body.PrefixoEmail = input.prefixoEmail
      if (input.funcionarioId) body.FuncionarioId = input.funcionarioId
      const r = await chamar<Resposta>('cr40f_CadastrarAcessoMotorista', body)
      return { emailMicrosoft: r.EmailMicrosoft, senhaTemporaria: r.SenhaTemporaria, funcionarioId: r.FuncionarioId, linkApp: r.LinkApp, etapas: etapas(r.Etapas) }
    },
    async encerrar(funcionarioId, confirmacao) {
      const r = await chamar<{ Etapas: string }>('cr40f_EncerrarAcessoMotorista', { FuncionarioId: funcionarioId, Confirmacao: confirmacao })
      return etapas(r.Etapas)
    },
  }
}
```
Confira em `packages/dataverse/src/client.ts` se `request` lança `DataverseError` com a mensagem do servidor em `message` (é o que `parseAcessoError` lê). Se a mensagem do Dataverse vier embrulhada ("...InvalidPluginExecutionException: CODIGO: ..."), a regex acima ainda acha o código.

`data/acessoMock.ts`:
```ts
import type { AcessoSource, CadastroResultado, Etapa } from './acesso'
import { AcessoError, MENSAGENS } from './acesso'

const delay = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MOCK_FUNCIONARIOS: Record<string, { nome: string; email: string | null }> = { m1: { nome: 'Carlos Alberto Teste', email: 'carlos.teste@betinhos.com.br' }, m7: { nome: 'Helena Simulada Costa', email: null } }

/** Simulação em memória: nome com "Erro Graph" falha depois de criar o usuário; "Sem Licenca" falha antes. */
export function createAcessoMock(): AcessoSource {
  const emails = new Set<string>()
  return {
    async cadastrar(input) {
      const palavras = semAcentos(input.nomeCompleto.trim()).split(/\s+/).filter(Boolean)
      if (palavras.length < 2) throw new AcessoError('NOME_INVALIDO', MENSAGENS.NOME_INVALIDO, [])
      if (input.celular.replace(/\D/g, '').length !== 11) throw new AcessoError('CELULAR_INVALIDO', MENSAGENS.CELULAR_INVALIDO, [])
      if (/sem licenca/i.test(semAcentos(input.nomeCompleto))) throw new AcessoError('SEM_LICENCA_DISPONIVEL', MENSAGENS.SEM_LICENCA_DISPONIVEL, [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'usuario', estado: 'erro', detalhe: 'sem licença' }])
      const prefixo = input.prefixoEmail ? semAcentos(input.prefixoEmail).replace(/\s+/g, '.') : `${palavras[0]}.${palavras[palavras.length - 1]}`
      let email = `${prefixo}@betinhos.com.br`
      for (let n = 2; emails.has(email); n++) email = `${prefixo}${n}@betinhos.com.br`
      if (/erro graph/i.test(input.nomeCompleto)) {
        throw new AcessoError('GRAPH_INDISPONIVEL', MENSAGENS.GRAPH_INDISPONIVEL, [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'email', estado: 'feita', detalhe: email }, { etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'erro', detalhe: '503 em POST assignLicense' }])
      }
      emails.add(email)
      const resultado: CadastroResultado = {
        emailMicrosoft: email, senhaTemporaria: 'Kx7#mQ2vR9pL4w', funcionarioId: input.funcionarioId ?? `m${Date.now()}`, linkApp: 'https://org23b93544.crm2.dynamics.com/main.aspx?appid=mock&pagetype=webresource&webresourceName=new_app-motoristas-v2',
        etapas: [{ etapa: 'validacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'email', estado: 'feita', detalhe: email }, { etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'feita', detalhe: 'atribuída' }, { etapa: 'grupo', estado: 'feita', detalhe: 'adicionado' }, { etapa: 'funcionario', estado: input.funcionarioId ? 'feita' : 'feita', detalhe: input.funcionarioId ? 'e-mail vinculado' : 'criado' }],
      }
      return delay(resultado)
    },
    async encerrar(funcionarioId, confirmacao) {
      const f = MOCK_FUNCIONARIOS[funcionarioId] ?? { nome: 'Funcionário Mock', email: 'x@betinhos.com.br' }
      if (!f.email) throw new AcessoError('FUNCIONARIO_SEM_EMAIL', MENSAGENS.FUNCIONARIO_SEM_EMAIL, [])
      if (semAcentos(confirmacao.trim()) !== semAcentos(f.nome.split(/\s+/)[0])) throw new AcessoError('CONFIRMACAO_INVALIDA', MENSAGENS.CONFIRMACAO_INVALIDA, [])
      const etapas: Etapa[] = [{ etapa: 'confirmacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'grupo', estado: 'feita', detalhe: 'removido' }, { etapa: 'licenca', estado: 'feita', detalhe: 'removida' }, { etapa: 'conta', estado: 'feita', detalhe: 'desativada' }, { etapa: 'funcionario', estado: 'feita', detalhe: 'inativado' }]
      return delay(etapas)
    },
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @betinhos/shell test -- acesso` PASS; `pnpm typecheck` sem erro.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/funcionarios/data/acesso.ts apps/shell/src/pages/funcionarios/data/acessoMock.ts apps/shell/src/pages/funcionarios/data/acesso.test.ts
git commit -m "feat(funcionarios): fonte de dados do acesso ao App Motoristas (Dataverse e mock)

createAcessoSource chama as Custom APIs cr40f_CadastrarAcessoMotorista e
cr40f_EncerrarAcessoMotorista, traduz os códigos de erro do plugin e lê as etapas.
mensagemWhatsApp monta o texto com link, e-mail e senha; whatsappComMensagem gera o
link wa.me. O mock cobre caminho feliz, sufixo, erro parcial e sem licença.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Drawer "Cadastrar acesso"

**Files:**
- Create: `apps/shell/src/pages/funcionarios/components/CadastroAcessoDrawer.tsx`
- Create: `apps/shell/src/pages/funcionarios/components/CadastroAcessoDrawer.test.tsx`
- Modify: `apps/shell/src/pages/funcionarios/funcionarios.css` — classes `.acesso-*`
- Modify: `apps/shell/src/pages/funcionarios/FuncionariosPage.tsx:167-181` — botão "Cadastrar acesso" ao lado de "Novo"

**Interfaces:**
- Consumes: `AcessoSource`, `CadastroInput`, `CadastroResultado`, `AcessoError`, `mensagemWhatsApp`, `whatsappComMensagem` (Tarefa 9); `Dialog`, `Button`, `Alert`, `Field`, `Input` de `@betinhos/ui`; `useNotify` de `./Toasts`; `VINCULO` de `../data/schema`.
- Produces: `CadastroAcessoDrawer({ acesso, inicial?, onClose, onCadastrado }: { acesso: AcessoSource; inicial?: { funcionarioId: string; nomeCompleto: string; celular: string }; onClose: () => void; onCadastrado: (funcionarioId: string) => void })`.

Comportamento (spec 4.3): campos nome, celular, e-mail pessoal (opcional), vínculo (padrão Terceiro), prévia do e-mail editável (campo "prefixo" preenchido automaticamente a partir do nome até o usuário editar). Estados `form → criando → resultado | erro`. No resultado: e-mail, senha com "Copiar" (`navigator.clipboard.writeText`), aviso "A senha aparece só agora", botão "Enviar no WhatsApp" (`<a target="_blank">` com `whatsappComMensagem`), "Abrir ficha". No erro: `Alert danger` com `MENSAGENS[codigo]`, lista das etapas (`feita` ✓, `pulada` –, `erro` ✕), botão "Tentar de novo" (reenvia o mesmo input). Fechar com campo digitado e sem resultado → `Dialog` "Descartar alterações?". Durante `criando`, backdrop e Esc não fecham. Backdrop: `div.drawer-backdrop > aside.drawer` igual à Ficha.

- [ ] **Step 1: Testes**

`CadastroAcessoDrawer.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcessoError, type AcessoSource } from '../data/acesso'
import { CadastroAcessoDrawer } from './CadastroAcessoDrawer'

const ok = { emailMicrosoft: 'ana.lima@betinhos.com.br', senhaTemporaria: 'Kx7#mQ2vR9pL4w', funcionarioId: 'f9', linkApp: 'https://app', etapas: [{ etapa: 'usuario', estado: 'feita' as const, detalhe: 'criado' }] }
function src(cadastrar: AcessoSource['cadastrar']): AcessoSource { return { cadastrar, encerrar: async () => [] } }
function renderDrawer(source: AcessoSource, props: Partial<Parameters<typeof CadastroAcessoDrawer>[0]> = {}) {
  const onClose = vi.fn(); const onCadastrado = vi.fn()
  render(<ToastProvider><CadastroAcessoDrawer acesso={source} onClose={onClose} onCadastrado={onCadastrado} {...props} /></ToastProvider>)
  return { onClose, onCadastrado }
}
afterEach(cleanup)

describe('CadastroAcessoDrawer', () => {
  it('gera a prévia do e-mail a partir do nome e permite editar o prefixo', () => {
    renderDrawer(src(async () => ok))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Ávila' } })
    expect(screen.getByLabelText(/E-mail Microsoft/)).toHaveValue('joao.avila')
    expect(screen.getByText('joao.avila@betinhos.com.br')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/E-mail Microsoft/), { target: { value: 'joao.silva' } })
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Prado' } })
    expect(screen.getByLabelText(/E-mail Microsoft/)).toHaveValue('joao.silva')
  })

  it('cadastra, mostra senha uma vez e monta o link do WhatsApp', async () => {
    const cadastrar = vi.fn(async () => ok)
    const { onCadastrado } = renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledWith({ nomeCompleto: 'Ana Lima', celular: '12991234567', emailPessoal: undefined, prefixoEmail: 'ana.lima', tipoVinculo: 1, funcionarioId: undefined })
    const wa = screen.getByRole('link', { name: /Enviar no WhatsApp/ })
    expect(wa).toHaveAttribute('href', expect.stringContaining('https://wa.me/5512991234567?text='))
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('Kx7#mQ2vR9pL4w')
    expect(screen.getByText(/aparece só agora/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir ficha/ }))
    expect(onCadastrado).toHaveBeenCalledWith('f9')
  })

  it('erro parcial mostra etapas e permite tentar de novo com o mesmo input', async () => {
    const cadastrar = vi.fn()
      .mockRejectedValueOnce(new AcessoError('GRAPH_INDISPONIVEL', 'O Microsoft 365 não respondeu.', [{ etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'erro', detalhe: '503' }]))
      .mockResolvedValueOnce(ok)
    renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByRole('alert')
    expect(screen.getByText(/usuario/)).toBeInTheDocument()
    expect(screen.getByText(/licenca/)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledTimes(2)
    expect(cadastrar.mock.calls[1][0]).toEqual(cadastrar.mock.calls[0][0])
  })

  it('fechar com dado digitado pede confirmação; durante a criação não fecha', async () => {
    let resolver: (v: typeof ok) => void = () => {}
    const { onClose } = renderDrawer(src(() => new Promise((r) => { resolver = r })))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Continuar editando/ }))
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { resolver(ok) })
  })

  it('com inicial preenche nome e celular e envia funcionarioId', async () => {
    const cadastrar = vi.fn(async () => ok)
    renderDrawer(src(cadastrar), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Ana Lima', celular: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    expect(cadastrar.mock.calls[0][0]).toMatchObject({ funcionarioId: 'f1', nomeCompleto: 'Ana Lima' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar o drawer**

`CadastroAcessoDrawer.tsx`:
```tsx
import { Alert, Button, Dialog, Field, Input } from '@betinhos/ui'
import { Copy, ExternalLink, MessageCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type AcessoSource, type CadastroInput, type CadastroResultado, type Etapa, parseAcessoError, mensagemWhatsApp, whatsappComMensagem } from '../data/acesso'
import { VINCULO } from '../data/schema'
import { useNotify } from './Toasts'

type Props = { acesso: AcessoSource; inicial?: { funcionarioId: string; nomeCompleto: string; celular: string }; onClose: () => void; onCadastrado: (funcionarioId: string) => void }
type Estado = { fase: 'form' } | { fase: 'criando' } | { fase: 'resultado'; r: CadastroResultado } | { fase: 'erro'; codigo: string; mensagem: string; etapas: Etapa[] }

const DOMINIO = 'betinhos.com.br'
const ROTULO: Record<Etapa['estado'], string> = { feita: '✓', pulada: '–', erro: '✕' }

/** primeiro.ultimo sem acentos; igual a AcessoRules.PrefixoEmail do plugin (só prévia: o plugin recalcula). */
export function prefixoDeNome(nome: string) {
  const p = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).map((w) => w.replace(/[^a-z0-9-]/g, '')).filter(Boolean)
  return p.length === 0 ? '' : p.length === 1 ? p[0] : `${p[0]}.${p[p.length - 1]}`
}

export function CadastroAcessoDrawer({ acesso, inicial, onClose, onCadastrado }: Props) {
  const notify = useNotify()
  const [nome, setNome] = useState(inicial?.nomeCompleto ?? '')
  const [celular, setCelular] = useState(inicial?.celular ?? '')
  const [emailPessoal, setEmailPessoal] = useState('')
  const [vinculo, setVinculo] = useState<0 | 1>(1)
  const [prefixo, setPrefixo] = useState(prefixoDeNome(inicial?.nomeCompleto ?? ''))
  const [prefixoEditado, setPrefixoEditado] = useState(false)
  const [estado, setEstado] = useState<Estado>({ fase: 'form' })
  const [discarding, setDiscarding] = useState(false)
  const [ultimo, setUltimo] = useState<CadastroInput | null>(null)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => { panel.current?.focus() }, [])
  useEffect(() => { if (!prefixoEditado) setPrefixo(prefixoDeNome(nome)) }, [nome, prefixoEditado])

  const touched = estado.fase === 'form' && (nome !== (inicial?.nomeCompleto ?? '') || celular !== (inicial?.celular ?? '') || emailPessoal !== '')
  const criando = estado.fase === 'criando'
  const input = useMemo<CadastroInput>(() => ({ nomeCompleto: nome.trim(), celular: celular.trim(), emailPessoal: emailPessoal.trim() || undefined, prefixoEmail: prefixo.trim() || undefined, tipoVinculo: vinculo, funcionarioId: inicial?.funcionarioId }), [nome, celular, emailPessoal, prefixo, vinculo, inicial])

  function requestClose() {
    if (criando) return
    if (touched) { setDiscarding(true); return }
    onClose()
  }

  async function criar(dados: CadastroInput) {
    setUltimo(dados)
    setEstado({ fase: 'criando' })
    try {
      const r = await acesso.cadastrar(dados)
      setEstado({ fase: 'resultado', r })
    } catch (reason) {
      const erro = parseAcessoError(reason)
      setEstado({ fase: 'erro', codigo: erro.codigo, mensagem: erro.message, etapas: erro.etapas })
    }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); notify('success', 'Copiado.') } catch { notify('error', 'Não foi possível copiar. Selecione e copie manualmente.') }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !discarding) requestClose() }}>
      <aside ref={panel} className="drawer drawer--acesso" role="dialog" aria-modal="true" aria-labelledby="acesso-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape' && !discarding) requestClose() }}>
        <header className="drawer-head">
          <div className="drawer-title"><h2 id="acesso-title">Cadastrar acesso ao App Motoristas</h2></div>
          <Button variant="secondary" icon={<X size={18} />} aria-label="Fechar" onClick={requestClose} disabled={criando} />
        </header>
        <div className="drawer-body">
          {(estado.fase === 'form' || estado.fase === 'criando' || estado.fase === 'erro') && (
            <form id="acesso-form" onSubmit={(event) => { event.preventDefault(); void criar(input) }}>
              <Field label="Nome completo" required><Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={criando || Boolean(inicial)} autoComplete="off" /></Field>
              <Field label="Celular" required hint="Com DDD. Recebe o link e a senha no WhatsApp."><Input inputMode="tel" value={celular} onChange={(e) => setCelular(e.target.value)} disabled={criando} /></Field>
              <Field label="E-mail pessoal" hint="Opcional, para recuperação de senha."><Input type="email" value={emailPessoal} onChange={(e) => setEmailPessoal(e.target.value)} disabled={criando} /></Field>
              <Field label="Vínculo">
                <select className="bt-control__input" id="acesso-vinculo" value={vinculo} onChange={(e) => setVinculo(Number(e.target.value) as 0 | 1)} disabled={criando}>
                  {VINCULO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="E-mail Microsoft" hint={`Será ${prefixo || '…'}@${DOMINIO}. Se já existir, o sistema acrescenta um número.`}>
                <Input value={prefixo} onChange={(e) => { setPrefixoEditado(true); setPrefixo(e.target.value) }} suffix={`@${DOMINIO}`} disabled={criando} />
              </Field>
              <p className="acesso-previa" aria-live="polite">{prefixo ? `${prefixo}@${DOMINIO}` : ''}</p>
              {estado.fase === 'erro' && (
                <Alert tone="danger" title="Não foi possível concluir">
                  {estado.mensagem}
                  {estado.etapas.length > 0 && <ul className="acesso-etapas">{estado.etapas.map((e) => <li key={e.etapa} data-estado={e.estado}><span aria-hidden>{ROTULO[e.estado]}</span> {e.etapa}: {e.detalhe}</li>)}</ul>}
                </Alert>
              )}
            </form>
          )}
          {estado.fase === 'resultado' && (
            <div className="acesso-resultado">
              <Alert tone="success" title="Acesso criado">A senha aparece só agora. Envie para o motorista antes de fechar.</Alert>
              <dl className="acesso-credenciais">
                <dt>E-mail</dt><dd><code>{estado.r.emailMicrosoft}</code> <Button variant="secondary" size="sm" icon={<Copy size={14} />} aria-label="Copiar e-mail" onClick={() => copiar(estado.r.emailMicrosoft)} /></dd>
                <dt>Senha temporária</dt><dd><code>{estado.r.senhaTemporaria || '(conta já existia; senha não alterada)'}</code> {estado.r.senhaTemporaria && <Button variant="secondary" size="sm" icon={<Copy size={14} />} aria-label="Copiar senha" onClick={() => copiar(estado.r.senhaTemporaria)} />}</dd>
                <dt>Link do app</dt><dd><a href={estado.r.linkApp} target="_blank" rel="noopener noreferrer">{estado.r.linkApp}</a></dd>
              </dl>
              <ul className="acesso-etapas">{estado.r.etapas.map((e) => <li key={e.etapa} data-estado={e.estado}><span aria-hidden>{ROTULO[e.estado]}</span> {e.etapa}: {e.detalhe}</li>)}</ul>
            </div>
          )}
        </div>
        <footer className="drawer-foot drawer-foot--active">
          {estado.fase === 'resultado' ? (
            <div className="cluster">
              {(() => { const href = whatsappComMensagem(celular, mensagemWhatsApp({ nome, emailMicrosoft: estado.r.emailMicrosoft, senhaTemporaria: estado.r.senhaTemporaria, linkApp: estado.r.linkApp })); return href ? <a className="bt-button bt-button--primary" href={href} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> Enviar no WhatsApp</a> : null })()}
              <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => onCadastrado(estado.r.funcionarioId)}>Abrir ficha</Button>
            </div>
          ) : (
            <div className="cluster">
              {estado.fase === 'erro' && ultimo && <Button variant="secondary" onClick={() => void criar(ultimo)}>Tentar de novo</Button>}
              <Button type="submit" form="acesso-form" loading={criando} disabled={!nome.trim() || !celular.trim()}>Criar acesso</Button>
            </div>
          )}
        </footer>
      </aside>
      <Dialog open={discarding} onClose={() => setDiscarding(false)} title="Descartar alterações?" actions={<><Button variant="secondary" onClick={() => setDiscarding(false)}>Continuar editando</Button><Button variant="danger" onClick={() => { setDiscarding(false); onClose() }}>Descartar</Button></>}>
        Os dados digitados ainda não foram enviados.
      </Dialog>
    </div>
  )
}
```
`Field` do `@betinhos/ui` liga o rótulo ao `Input` pelo contexto (`controlId`): **não passe `id` no `Input`**, senão o `htmlFor` deixa de bater e `getByLabelText` falha. O `<select>` de vínculo não recebe o `controlId`; os testes não o buscam por rótulo. Confira também `buttonClassName` para o `<a>` do WhatsApp (a Ficha usa `buttonClassName({ variant: 'secondary' })`); use `buttonClassName({ variant: 'primary' })` em vez de classe literal.

CSS em `funcionarios.css`:
```css
.drawer--acesso { max-width: 520px; }
.acesso-previa { margin: -4px 0 12px; color: var(--bt-text-muted); font-size: 13px; }
.acesso-credenciais { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 16px 0; }
.acesso-credenciais dd { display: flex; align-items: center; gap: 8px; word-break: break-all; }
.acesso-etapas { list-style: none; padding: 0; margin: 8px 0 0; font-size: 13px; }
.acesso-etapas li[data-estado='erro'] { color: var(--bt-danger); }
.acesso-etapas li[data-estado='pulada'] { color: var(--bt-text-muted); }
```
Use os tokens reais de `design-tokens.css` (confira os nomes em `DESIGN_SYSTEM.md`; não invente valores).

- [ ] **Step 4: Botão na página**

Em `FuncionariosPage.tsx`, ao lado de `Novo` (linha ~180):
```tsx
<Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => setAcessoAberto({ aberto: true })}>Cadastrar acesso</Button>
```
Estado `const [acessoAberto, setAcessoAberto] = useState<{ aberto: boolean; inicial?: { funcionarioId: string; nomeCompleto: string; celular: string } }>({ aberto: false })`, `const acesso = useMemo(() => createAcessoSource(host), [host])`, e no JSX:
```tsx
{acessoAberto.aberto && <CadastroAcessoDrawer acesso={acesso} inicial={acessoAberto.inicial} onClose={() => setAcessoAberto({ aberto: false })} onCadastrado={(id) => { setAcessoAberto({ aberto: false }); mutate(); setSelection({ mode: 'open', id }) }} />}
```
`mutate()`/`reload()`: use o que a página já usa para revalidar a lista depois de salvar (confira `onSaved` da Ficha na própria página). Importe `KeyRound` de `lucide-react`.

- [ ] **Step 5: Rodar e ver passar** — `pnpm --filter @betinhos/shell test -- CadastroAcesso` PASS; `pnpm typecheck`; `pnpm dev` e abrir `#/funcionarios` → "Cadastrar acesso" → nome "Ana Lima", celular → resultado com WhatsApp; nome "Erro Graph" → erro com etapas e "Tentar de novo".

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/funcionarios
git commit -m "feat(funcionarios): drawer Cadastrar acesso ao App Motoristas

Formulário com nome, celular, e-mail pessoal, vínculo e prévia editável do e-mail
Microsoft; estados criando/resultado/erro com etapas e 'Tentar de novo'; senha exibida
uma vez com copiar e botão 'Enviar no WhatsApp' com mensagem pronta; descarte com
confirmação. Botão no cabeçalho da Tela Funcionários.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Bloco "Acesso ao app" na ficha e diálogo "Encerrar acesso" em duas etapas

**Files:**
- Create: `apps/shell/src/pages/funcionarios/components/EncerrarAcessoDialog.tsx`
- Create: `apps/shell/src/pages/funcionarios/components/EncerrarAcessoDialog.test.tsx`
- Create: `apps/shell/src/pages/funcionarios/components/AcessoApp.tsx`
- Modify: `apps/shell/src/pages/funcionarios/components/Ficha.tsx` — props `acesso?: AcessoSource`, `onCadastrarAcesso?: (inicial) => void`; render de `<AcessoApp>` no fim da aba Dados
- Modify: `apps/shell/src/pages/funcionarios/FuncionariosPage.tsx` — passa `acesso` e `onCadastrarAcesso` para a Ficha
- Modify: `apps/shell/src/pages/funcionarios/components/Ficha.test.tsx` — teste do bloco

**Interfaces:**
- Consumes: `AcessoSource.encerrar`, `parseAcessoError`, `Etapa` (Tarefa 9); `Funcionario` (`values.cr40f_emailmicrosoft`, `values.cr40f_status`, `values.cr40f_nomecompleto`, `values.cr40f_telefonecorporativo`).
- Produces: `EncerrarAcessoDialog({ open, nome, onCancel, onConfirmar }: { open: boolean; nome: string; onCancel: () => void; onConfirmar: (confirmacao: string) => Promise<void> })`; `AcessoApp({ funcionario, acesso, onCadastrar, onEncerrado }: { funcionario: Funcionario; acesso: AcessoSource; onCadastrar: () => void; onEncerrado: () => void })`.

Estados do bloco (derivados do registro): sem e-mail → "Sem acesso ao app" + botão "Cadastrar acesso"; e-mail e `cr40f_status` ativo (0) → "Acesso ativo" + e-mail + botão "Encerrar acesso"; e-mail e status Desligado (1) → "Acesso encerrado"; Afastado (2) conta como ativo + e-mail (sem botão). Diálogo: etapa 1 "Encerrar acesso de <nome>?" com a lista do que acontece (sai do grupo, perde a licença, conta bloqueada, funcionário inativado; nada é excluído) e botão "Continuar"; etapa 2 campo "Digite o primeiro nome para confirmar" e botão "Encerrar acesso" (`variant="danger"`) só habilitado quando o texto normalizado é igual ao primeiro nome; durante a chamada, botões desabilitados e Esc/backdrop não fecham; erro `CONFIRMACAO_INVALIDA` mostra abaixo do campo; outros erros em `Alert`. 403/`SEM_PERMISSAO`: toast "Você não tem permissão para gerir acessos" e o botão some (`setSemPermissao(true)` no bloco).

- [ ] **Step 1: Testes do diálogo**

`EncerrarAcessoDialog.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'

afterEach(cleanup)

describe('EncerrarAcessoDialog', () => {
  it('exige duas etapas e só habilita com o primeiro nome', async () => {
    const onConfirmar = vi.fn(async () => {})
    render(<EncerrarAcessoDialog open nome="João da Silva" onCancel={() => {}} onConfirmar={onConfirmar} />)
    expect(screen.getByText(/Encerrar acesso de João da Silva\?/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/primeiro nome/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    const campo = screen.getByLabelText(/primeiro nome/i)
    const botao = screen.getByRole('button', { name: /^Encerrar acesso$/ })
    expect(botao).toBeDisabled()
    fireEvent.change(campo, { target: { value: 'Maria' } })
    expect(botao).toBeDisabled()
    fireEvent.change(campo, { target: { value: ' joao ' } })
    expect(botao).toBeEnabled()
    await act(async () => { fireEvent.click(botao) })
    expect(onConfirmar).toHaveBeenCalledWith('joao')
  })

  it('mostra erro de confirmação sem fechar', async () => {
    const onConfirmar = vi.fn(async () => { throw new Error('CONFIRMACAO_INVALIDA: não confere') })
    const onCancel = vi.fn()
    render(<EncerrarAcessoDialog open nome="Ana Lima" onCancel={onCancel} onConfirmar={onConfirmar} />)
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ })) })
    expect(screen.getByText(/não confere/)).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Teste do bloco na Ficha** (acrescente ao `Ficha.test.tsx`, usando `fakeSource` já existente):
```tsx
it('mostra o estado do acesso e encerra pela ficha', async () => {
  const encerrar = vi.fn(async () => [{ etapa: 'funcionario', estado: 'feita' as const, detalhe: 'inativado' }])
  const comEmail = { ...record, values: { ...record.values, cr40f_emailmicrosoft: 'ana.souza@betinhos.com.br' } }
  const source = fakeSource(async () => 'f1', { get: async () => structuredClone(comEmail) })
  render(<ToastProvider><Ficha source={source} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar }} /></ToastProvider>)
  await screen.findByText('Acesso ativo')
  fireEvent.click(screen.getByRole('button', { name: /Encerrar acesso/ }))
  fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
  fireEvent.change(screen.getByLabelText(/primeiro nome/i), { target: { value: 'Ana' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Encerrar acesso$/ })) })
  await waitFor(() => expect(encerrar).toHaveBeenCalledWith('f1', 'Ana'))
})

it('sem e-mail oferece cadastrar acesso', async () => {
  const onCadastrarAcesso = vi.fn()
  render(<ToastProvider><Ficha source={fakeSource(async () => 'f1')} id="f1" onClose={() => {}} onSaved={() => {}} acesso={{ cadastrar: async () => { throw new Error('n/a') }, encerrar: async () => [] }} onCadastrarAcesso={onCadastrarAcesso} /></ToastProvider>)
  await screen.findByText('Sem acesso ao app')
  fireEvent.click(screen.getByRole('button', { name: /Cadastrar acesso/ }))
  expect(onCadastrarAcesso).toHaveBeenCalledWith({ funcionarioId: 'f1', nomeCompleto: 'Ana Souza', celular: '' })
})
```

- [ ] **Step 3: Rodar e ver falhar.**

- [ ] **Step 4: Implementar**

`EncerrarAcessoDialog.tsx`:
```tsx
import { Alert, Button, Dialog, Field, Input } from '@betinhos/ui'
import { useEffect, useState } from 'react'
import { parseAcessoError } from '../data/acesso'

type Props = { open: boolean; nome: string; onCancel: () => void; onConfirmar: (confirmacao: string) => Promise<void> }
const simples = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Dupla confirmação: aviso do que acontece e, depois, digitar o primeiro nome. */
export function EncerrarAcessoDialog({ open, nome, onCancel, onConfirmar }: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<{ codigo: string; mensagem: string } | null>(null)
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  const confere = simples(texto) === simples(primeiro) && primeiro.length > 0

  useEffect(() => { if (open) { setEtapa(1); setTexto(''); setErro(null); setEnviando(false) } }, [open])

  async function confirmar() {
    setEnviando(true); setErro(null)
    try { await onConfirmar(texto.trim()) } catch (reason) { const e = parseAcessoError(reason); setErro({ codigo: e.codigo, mensagem: e.message }) } finally { setEnviando(false) }
  }

  return (
    <Dialog open={open} onClose={() => { if (!enviando) onCancel() }} title={`Encerrar acesso de ${nome}?`} tone="danger"
      actions={etapa === 1
        ? <><Button variant="secondary" onClick={onCancel}>Cancelar</Button><Button variant="danger" onClick={() => setEtapa(2)}>Continuar</Button></>
        : <><Button variant="secondary" onClick={onCancel} disabled={enviando}>Cancelar</Button><Button variant="danger" loading={enviando} disabled={!confere || enviando} onClick={() => void confirmar()}>Encerrar acesso</Button></>}>
      {etapa === 1 ? (
        <ul>
          <li>Sai do grupo de motoristas e perde a licença.</li>
          <li>A conta Microsoft é bloqueada (não excluída).</li>
          <li>O funcionário fica inativo com a data de hoje como demissão.</li>
        </ul>
      ) : (
        <>
          <Field label={`Digite o primeiro nome (${primeiro}) para confirmar`} error={erro?.codigo === 'CONFIRMACAO_INVALIDA' ? erro.mensagem : undefined}>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} autoComplete="off" autoFocus />
          </Field>
          {erro && erro.codigo !== 'CONFIRMACAO_INVALIDA' && <Alert tone="danger" title="Não foi possível encerrar">{erro.mensagem}</Alert>}
        </>
      )}
    </Dialog>
  )
}
```
`Dialog` aceita `tone: 'neutral' | 'danger'`. `Field` liga o rótulo ao `Input` pelo contexto; não passe `id` no `Input`.

`AcessoApp.tsx`:
```tsx
import { Alert, Button } from '@betinhos/ui'
import { KeyRound, UserX } from 'lucide-react'
import { useState } from 'react'
import { type AcessoSource, type Etapa, parseAcessoError } from '../data/acesso'
import type { Funcionario } from '../data/types'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'
import { useNotify } from './Toasts'

type Props = { funcionario: Funcionario; acesso: AcessoSource; onCadastrar: () => void; onEncerrado: () => void }

/** Bloco "Acesso ao app" na aba Dados: estado derivado do e-mail Microsoft e do status. */
export function AcessoApp({ funcionario, acesso, onCadastrar, onEncerrado }: Props) {
  const notify = useNotify()
  const [aberto, setAberto] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [etapas, setEtapas] = useState<Etapa[] | null>(null)
  const email = String(funcionario.values.cr40f_emailmicrosoft ?? '')
  const inativo = Number(funcionario.values.cr40f_status) === 1 // Desligado
  const nome = String(funcionario.values.cr40f_nomecompleto ?? '')
  const estado = !email ? 'sem' : inativo ? 'encerrado' : 'ativo'

  async function encerrar(confirmacao: string) {
    try {
      const resultado = await acesso.encerrar(funcionario.id, confirmacao)
      setEtapas(resultado); setAberto(false); notify('success', 'Acesso encerrado.'); onEncerrado()
    } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setSemPermissao(true); setAberto(false); notify('error', erro.message); return }
      throw erro
    }
  }

  return (
    <fieldset className="group acesso-bloco">
      <legend>Acesso ao app</legend>
      <div className="acesso-estado" data-estado={estado}>
        <strong>{estado === 'sem' ? 'Sem acesso ao app' : estado === 'ativo' ? 'Acesso ativo' : 'Acesso encerrado'}</strong>
        {email && <code>{email}</code>}
      </div>
      {!semPermissao && estado === 'sem' && <Button variant="secondary" icon={<KeyRound size={16} />} onClick={onCadastrar}>Cadastrar acesso</Button>}
      {!semPermissao && estado === 'ativo' && <Button variant="secondary" icon={<UserX size={16} />} onClick={() => setAberto(true)}>Encerrar acesso</Button>}
      {etapas && <ul className="acesso-etapas">{etapas.map((e) => <li key={e.etapa} data-estado={e.estado}>{e.etapa}: {e.detalhe}</li>)}</ul>}
      {semPermissao && <Alert tone="warning">Você não tem permissão para gerir acessos.</Alert>}
      <EncerrarAcessoDialog open={aberto} nome={nome} onCancel={() => setAberto(false)} onConfirmar={encerrar} />
    </fieldset>
  )
}
```

Em `Ficha.tsx`: props novas `acesso?: AcessoSource | null` e `onCadastrarAcesso?: (inicial: { funcionarioId: string; nomeCompleto: string; celular: string }) => void`. Depois do `GROUPS.map(...)` dentro do `<form id="ficha-form">` (só quando `original && acesso`):
```tsx
{original && acesso && (
  <AcessoApp
    funcionario={original}
    acesso={acesso}
    onCadastrar={() => onCadastrarAcesso?.({ funcionarioId: original.id, nomeCompleto: String(original.values.cr40f_nomecompleto ?? ''), celular: String(original.values.cr40f_telefonecorporativo ?? '') })}
    onEncerrado={() => { void source.get(original.id).then((fresh) => { setOriginal(fresh); setDraft(draftFrom(fresh)); onSaved(original.id, false) }) }}
  />
)}
```
Mantenha o `EncerrarAcessoDialog` (um `<dialog>` nativo) fora do fluxo de Esc da Ficha: como no painel de renovação, envolva o bloco em `onKeyDown={(e) => { if (e.key === 'Escape' && (e.target as HTMLElement).closest('dialog')) e.stopPropagation() }}`.

Em `FuncionariosPage.tsx`: passe `acesso={acesso}` e `onCadastrarAcesso={(inicial) => setAcessoAberto({ aberto: true, inicial })}` para `<Ficha>` (o estado `acessoAberto` e `acesso` vêm da Tarefa 10).

CSS: `.acesso-bloco .acesso-estado { display: flex; gap: 12px; align-items: baseline; margin-bottom: 8px; }`.

- [ ] **Step 5: Rodar e ver passar** — `pnpm --filter @betinhos/shell test -- "Ficha|EncerrarAcesso"` PASS; `pnpm typecheck`; no `pnpm dev`, abrir a ficha de `m1` → "Acesso ativo" → Encerrar → duas etapas → "Carlos" → toast e etapas; ficha de `m7` → "Sem acesso ao app" → Cadastrar acesso abre o drawer com nome preenchido.

- [ ] **Step 6: Commit**

```bash
git add apps/shell/src/pages/funcionarios
git commit -m "feat(funcionarios): bloco Acesso ao app na ficha e encerramento com dupla confirmação

A aba Dados mostra sem acesso / ativo / encerrado a partir do e-mail Microsoft e do
status. Encerrar acesso abre diálogo em duas etapas (aviso e digitar o primeiro nome),
chama cr40f_EncerrarAcessoMotorista, recarrega a ficha e esconde o botão sem permissão.
Cadastrar acesso pela ficha abre o drawer com nome e celular preenchidos.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Verificação no DEV, skill de verificação e PR

**Files:**
- Create: `.claude/skills/verificar-acesso-motorista/SKILL.md`
- Modify: `.claude/skills/verificar-index.md` — linha da skill nova
- Modify: `docs/superpowers/specs/2026-10-22-acesso-motorista-design.md` — seção "Estado no DEV" com a data e a versão publicada

**Pré-requisitos do Renan (fora do código):** app registration, grupo de teste, SKU e `.env` conforme `docs/acesso-motorista-entra.md`; um celular dele para receber o WhatsApp de teste.

- [ ] **Step 1: Qualidade antes do PR**

Rode a skill `qualidade-antes-do-pr` (simplify 2–3 passadas, `karpathy-coder`, `/code-review high --fix`) sobre o diff da branch. Depois `pnpm test`, `pnpm typecheck`, `dotnet test` dos dois projetos (`Cr40f.Acesso.Plugin.Tests`) e `pnpm --filter @betinhos/shell build`.

- [ ] **Step 2: Abrir o PR**

```bash
git push -u origin HEAD
gh pr create --title "Acesso ao App Motoristas em minutos pela Tela Funcionários" --body-file docs/superpowers/specs/2026-10-22-acesso-motorista-design.md
```
No corpo do PR, acrescente no topo: o que muda para o usuário, comandos de validação, impacto em Dataverse (duas Custom APIs, dois steps, uma função de segurança) e "verificação no DEV: pendente até o merge" (push só da `main`).

- [ ] **Step 3: Publicar no DEV (após o merge, no checkout principal, branch `main` atualizada)**

```bash
pnpm push:plugin:acesso:dev
powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/provision-acesso.ps1 -Apply
pnpm push
```
Atribuir a função "Acesso - Gestão de Motoristas" ao usuário de teste da operação (ou usar o Renan, que é Administrador do Sistema). Commitar o bump conforme o CLAUDE.md (`build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main`).

- [ ] **Step 4: Roteiro de verificação no DEV (evidências na skill)**

1. Tela Funcionários → Cadastrar acesso → nome "Teste Acesso Betinhos", celular do Renan, vínculo Terceiro → resultado com e-mail `teste.betinhos@betinhos.com.br`, senha e etapas todas `feita`. Screenshot.
2. Entra: usuário existe, licença atribuída, membro do grupo de teste. `cr40f_funcionarios` novo com `cr40f_emailmicrosoft`, função Motorista, vínculo Terceiro. Query MCP DEV: `SELECT cr40f_nomecompleto, cr40f_emailmicrosoft, cr40f_status FROM cr40f_funcionarios WHERE cr40f_emailmicrosoft = 'teste.betinhos@betinhos.com.br'`.
3. "Enviar no WhatsApp" abre o `wa.me` com a mensagem completa (não enviar para terceiros reais).
4. Celular: abrir o link no navegador, logar com a conta nova, trocar a senha, ver a tela inicial do App Motoristas com o nome. (Depende do resultado da sessão "Verificar App Motoristas v2 pela URL no navegador"; se ela apontar bloqueios, registrar aqui.)
5. Clicar "Cadastrar acesso" de novo para o mesmo nome → e-mail com sufixo `2`? **Não**: com `FuncionarioId` pela ficha deve reaproveitar o e-mail e marcar `usuario` como `pulada`. Pelo cabeçalho (sem id) gera `teste.betinhos2@...` — comportamento esperado; registrar.
6. Ficha → Encerrar acesso → "Continuar" → digitar "Teste" → etapas `feita`; Entra: fora do grupo, sem licença, conta desabilitada; funcionário inativo com `cr40f_datadedemissao` = hoje.
7. Usuário sem a função → botão some após toast "sem permissão".
8. `ux-audit` modo Fluxo no drawer e no diálogo.
9. Limpeza: excluir o usuário de teste no Entra manualmente (o sistema nunca exclui) e inativar/excluir o `cr40f_funcionarios` de teste.

- [ ] **Step 5: Skill de verificação**

`.claude/skills/verificar-acesso-motorista/SKILL.md` no molde de `verificar-equipamentos`: como subir (`pnpm dev`, mock: nomes "Erro Graph" e "Sem Licenca" simulam falhas; `m1` tem acesso ativo, `m7` não tem), como verificar no DEV (roteiro acima, queries, o que olhar no Entra), limitações (funções herdadas por equipe não autorizam; senha nunca é recuperável; a URL direta só funciona com o PR #61 do App Motoristas publicado; antes dele cai em mock), e evidências com data. Adicione a linha em `verificar-index.md`. Rode `verificacao-manter`.

- [ ] **Step 6: Commit final**

```bash
git add .claude/skills/verificar-acesso-motorista .claude/skills/verificar-index.md docs/superpowers/specs/2026-10-22-acesso-motorista-design.md
git commit -m "docs(acesso): skill verificar-acesso-motorista e estado da verificação no DEV

Roteiro de verificação do cadastro e do encerramento de acesso (mock e DEV), queries,
conferências no Entra, limitações conhecidas e evidências datadas.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Autorrevisão do plano (feita em 22/10/2026)

- **Cobertura do spec:** 3.1–3.10 cobertos (3.2 e-mail: T1/T5; 3.3 senha: T1/T3/T5; 3.4 SKU configurável: T2/T7; 3.5 idempotência: T5/T6; 3.6 vínculo: T4/T5; 3.7 encerrar sem excluir: T4/T6; 3.8 dupla confirmação: T11; 3.9 função de segurança: T4/T8; 4.1–4.3: T5–T11; 5: T5/T6; 6: T7/T8; 7: cada tarefa + T12; 8 riscos: documentados em T8/T12). "E-mail pessoal" é recebido e aceito pela API, mas o plugin **não o grava em lugar nenhum** (Graph `otherMails` exigiria permissão extra e o Dataverse não tem campo): fica registrado como limitação; se o Renan quiser, vira `cr40f_emailpessoal` em tarefa à parte.
- **Placeholders:** nenhum "TBD"; os pontos "confira X" são verificações de nomes reais (tokens CSS, props de `Field`/`Dialog`, nome de `m1`), não lacunas de desenho.
- **Consistência de tipos:** `CadastroEntrada/CadastroSaida` (T5) ↔ parâmetros da Custom API (T7) ↔ `CadastroInput/CadastroResultado` (T9) ↔ drawer (T10); `Etapas.ToJson()` ↔ `Etapa[]`; `FuncionarioRepository.StatusInativo = 1` (Desligado) ↔ `AcessoApp` (`cr40f_status === 1`); nome dos steps igual em T7 e T8; `prefixoDeNome` (T10) é só prévia e o plugin recalcula com `AcessoRules.PrefixoEmail` (T1), mesma regra.
