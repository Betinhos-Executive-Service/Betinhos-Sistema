using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin que reabre a validação do cliente quando o preço muda (ReabrirValidacaoPlugin) e o step em composição Update.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (!File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string PluginTypeName = "Cr40f.Portal.Plugin.ReabrirValidacaoPlugin";
const int PluginAssemblyComponentType = 91;
const int StepComponentType = 92;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "portal.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

// A tabela vem de packages/deploy/provision-portal-cliente.ps1; sem ela o plugin falharia em todo Update de composição.
try { service.Execute(new RetrieveEntityRequest { LogicalName = "cr40f_validacaoservico", EntityFilters = EntityFilters.Entity }); }
catch (Exception error) { throw new InvalidOperationException("Tabela cr40f_validacaoservico ausente: rode provision-portal-cliente.ps1 -Apply antes.", error); }

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
var pluginTypeId = UpsertPluginType(service, assemblyId);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
// Sem filtro: new_valortotal é calculada e nunca vem no Update (mesmo motivo do Cr40f.ValorOp). A imagem "pre" é só atalho.
EnsureStep(service, pluginTypeId, "Update", "cr40f_composicaodeprecos", "Cr40f.Portal: preço alterado reabre validação", solutionUniqueName, "new_valortotal");

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin do portal registrado");

static void Log(string message) => Console.WriteLine($"[portal:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

/// <summary>Step síncrono pós-operação (stage 40, mode 0) idempotente por nome, com imagem "pre" (alias igual a ReabrirValidacaoPlugin.ImagemAnterior).</summary>
static void EnsureStep(ServiceClient service, Guid pluginTypeId, string messageName, string entity, string name, string solutionUniqueName, string preImageAttributes)
{
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        stepId = existing.Id;
        service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["filteringattributes"] = null, ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(0), ["eventhandler"] = Ref("plugintype", pluginTypeId) });
        Log($"step reconciliado: {name}");
    }
    else
    {
        var message = FindSingleOrNone(service, "sdkmessage", ("name", messageName)) ?? throw new InvalidOperationException($"sdkmessage {messageName} não encontrada.");
        var filterRow = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid"),
            Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, entity) } },
        }).Entities.Single();
        stepId = service.Create(new Entity("sdkmessageprocessingstep")
        {
            ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(40), ["rank"] = 30,
            ["supporteddeployment"] = new OptionSetValue(0),
            ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["sdkmessagefilterid"] = Ref("sdkmessagefilter", filterRow.Id),
            ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = false,
        });
        Log($"step criado: {name}");
    }
    EnsureSolutionComponent(service, stepId, solutionUniqueName, StepComponentType);
    var image = FindSingleOrNone(service, "sdkmessageprocessingstepimage", ("sdkmessageprocessingstepid", stepId), ("entityalias", "pre"));
    var dados = new Entity("sdkmessageprocessingstepimage")
    {
        ["name"] = "pre", ["entityalias"] = "pre", ["imagetype"] = new OptionSetValue(0),
        ["messagepropertyname"] = "Target", ["attributes"] = preImageAttributes,
        ["sdkmessageprocessingstepid"] = Ref("sdkmessageprocessingstep", stepId),
    };
    if (image is null) { service.Create(dados); Log($"imagem pre criada: {name}"); }
    else { dados.Id = image.Id; service.Update(dados); Log($"imagem pre reconciliada: {name}"); }
}
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
        ["name"] = "ReabrirValidacaoPlugin",
        ["friendlyname"] = "ReabrirValidacaoPlugin",
        ["typename"] = PluginTypeName,
        ["pluginassemblyid"] = Ref("pluginassembly", assemblyId),
    });
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
