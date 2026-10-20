using System.Globalization;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin das pendências da frota e a Custom API global cr40f_FrotaPendencias.
// Modo de verificação: --testar [yyyy-MM-dd] chama a Custom API e imprime o PendenciasJson.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var testar = options.Has("testar");
var dllPath = testar ? "" : options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string PluginTypeName = "Cr40f.Frota.Plugin.FrotaPendenciasPlugin";
const string CustomApiName = "cr40f_FrotaPendencias";
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "frota.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

if (testar)
{
    var request = new OrganizationRequest(CustomApiName);
    var hoje = options.Optional("testar");
    if (hoje is not null) request["Hoje"] = DateTime.SpecifyKind(DateTime.ParseExact(hoje, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Utc);
    Console.WriteLine(service.Execute(request)["PendenciasJson"]);
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
Log("plugin das pendências da frota registrado");

static void Log(string message) => Console.WriteLine($"[frota:plugin] {message}");
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
        ["name"] = "FrotaPendenciasPlugin",
        ["friendlyname"] = "FrotaPendenciasPlugin",
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
                ["displayname"] = "Frota | Pendências",
                ["description"] = "Calcula as pendências proativas da frota (preventiva, reincidência, prioridade parada, custo, hodômetro). Somente leitura.",
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

    if (!ChildExists(service, "customapiresponseproperty", customApiId, "PendenciasJson"))
    {
        Log("criando resposta PendenciasJson");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = "PendenciasJson",
            ["name"] = $"{CustomApiName}.PendenciasJson",
            ["displayname"] = "Pendências JSON",
            ["description"] = "{hoje, total, pendencias:[{tipo,id,veiculoId,placa,titulo,detalhe,manutencaoId}]}",
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
