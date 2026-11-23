using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

// Registra o assembly Cr40f.Projetos.Plugin e o step da transcrição: Create de annotation, pós-operação (stage 40),
// assíncrono (mode 1). O step de annotation não filtra por tabela nem por mimetype: o plugin ignora o que não é áudio
// (audio/*) de cr40f_projetoatualizacao. A chave da Groq vem da tabela cr40f_segredo (groq.transcricao), gravada à parte.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (!File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const int PluginAssemblyComponentType = 91;
const int StepComponentType = 92;
const string TranscreverType = "Cr40f.Projetos.Plugin.TranscreverAudioPlugin";
const string StepNome = "Cr40f.Projetos: transcrever audio da atualizacao (Create annotation)";

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "projetos.msalcache.bin");
// No CI (workflow Deploy) entra a conta de servico do environment dev; local, o login interativo de sempre.
var dvClientSecret = Environment.GetEnvironmentVariable("DV_CLIENT_SECRET");
var connectionString = string.IsNullOrEmpty(dvClientSecret)
    ? $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto"
    : $"AuthType=ClientSecret;Url={environmentUrl.TrimEnd('/')};ClientId={Environment.GetEnvironmentVariable("DV_CLIENT_ID")};ClientSecret={dvClientSecret}";

// A descricao do assembly guarda o commit publicado pelo workflow Deploy; o publicar.yml compara com o commit levado ao PROD.
// Publicacao local grava vazio, e a trava do PROD recusa ate o Deploy da develop publicar de novo.
static string CommitPublicado() =>
    Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" ? Environment.GetEnvironmentVariable("GITHUB_SHA") ?? "" : "";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
var pluginTypeId = UpsertPluginType(service, assemblyId, TranscreverType);
EnsureAsyncCreateStep(service, pluginTypeId, StepNome, "annotation", solutionUniqueName);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin de projetos registrado (transcricao de audio)");

static void Log(string message) => Console.WriteLine($"[projetos:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

static Guid UpsertAssembly(ServiceClient service, AssemblyInfo info, string content)
{
    var existing = FindSingleOrNone(service, "pluginassembly", ("name", info.Name));
    if (existing is not null)
    {
        Log($"atualizando assembly {info.Name}");
        service.Update(new Entity("pluginassembly", existing.Id) { ["description"] = CommitPublicado(), ["content"] = content, ["version"] = info.Version });
        return existing.Id;
    }
    Log($"criando assembly {info.Name}");
    return service.Create(new Entity("pluginassembly")
    {
        ["description"] = CommitPublicado(), ["name"] = info.Name, ["content"] = content, ["isolationmode"] = new OptionSetValue(2),
        ["sourcetype"] = new OptionSetValue(0), ["version"] = info.Version, ["culture"] = info.Culture, ["publickeytoken"] = info.PublicKeyToken,
    });
}

static Guid UpsertPluginType(ServiceClient service, Guid assemblyId, string typeName)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", typeName), ("pluginassemblyid", assemblyId));
    if (existing is not null)
    {
        Log($"reutilizando tipo {typeName}");
        return existing.Id;
    }
    Log($"criando tipo {typeName}");
    var curto = typeName.Split('.').Last();
    return service.Create(new Entity("plugintype")
    {
        ["name"] = curto, ["friendlyname"] = curto, ["typename"] = typeName, ["pluginassemblyid"] = Ref("pluginassembly", assemblyId),
    });
}

/// <summary>Step assíncrono pós-operação idempotente por nome; apaga o job que deu certo e guarda o que falhou.</summary>
static void EnsureAsyncCreateStep(ServiceClient service, Guid pluginTypeId, string nome, string entidade, string solution)
{
    var dados = new Entity("sdkmessageprocessingstep")
    {
        ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(1), ["rank"] = 1,
        ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = true,
    };
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", nome)) is { } existing)
    {
        stepId = existing.Id;
        dados.Id = stepId;
        service.Update(dados);
        Log($"step reconciliado: {nome}");
    }
    else
    {
        var message = FindSingleOrNone(service, "sdkmessage", ("name", "Create")) ?? throw new InvalidOperationException("sdkmessage Create nao encontrada.");
        var filtro = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid"),
            Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, entidade) } },
        }).Entities.Single();
        dados["name"] = nome;
        dados["supporteddeployment"] = new OptionSetValue(0);
        dados["sdkmessageid"] = Ref("sdkmessage", message.Id);
        dados["sdkmessagefilterid"] = Ref("sdkmessagefilter", filtro.Id);
        stepId = service.Create(dados);
        Log($"step criado: {nome}");
    }
    EnsureSolutionComponent(service, stepId, solution, StepComponentType);
}

static void EnsureSolutionComponent(ServiceClient service, Guid componentId, string solution, int componentType)
{
    try
    {
        service.Execute(new OrganizationRequest("AddSolutionComponent")
        {
            ["ComponentId"] = componentId, ["ComponentType"] = componentType, ["SolutionUniqueName"] = solution, ["AddRequiredComponents"] = true,
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
