using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin de acesso de motoristas, as Custom APIs (sem plugintype) e os steps
// sincronos (stage 30) que carregam a configuracao nao segura. A configuracao segura e gravada por outro script.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var config = options.Require("config");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (!File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string TipoCadastrar = "Cr40f.Acesso.Plugin.CadastrarAcessoMotoristaPlugin";
const string TipoEncerrar = "Cr40f.Acesso.Plugin.EncerrarAcessoMotoristaPlugin";
const string ApiCadastrar = "cr40f_CadastrarAcessoMotorista";
const string ApiEncerrar = "cr40f_EncerrarAcessoMotorista";
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "acesso.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
var tipoCadastrar = UpsertPluginType(service, assemblyId, TipoCadastrar);
var tipoEncerrar = UpsertPluginType(service, assemblyId, TipoEncerrar);

// Tipos de parametro/resposta: 8 = Integer, 10 = String, 12 = Guid.
EnsureCustomApi(service, ApiCadastrar, "Acesso | Cadastrar acesso de motorista", "Cria conta Microsoft, licenca, grupo e funcionario; devolve credenciais e etapas.", solutionUniqueName,
    requestParams: new[] { ("NomeCompleto", 10, false), ("Celular", 10, false), ("EmailPessoal", 10, true), ("PrefixoEmail", 10, true), ("TipoVinculo", 8, true), ("FuncionarioId", 12, true) },
    responseProps: new[] { ("EmailMicrosoft", 10), ("SenhaTemporaria", 10), ("FuncionarioId", 10), ("UsuarioEntraId", 10), ("LinkApp", 10), ("Etapas", 10) });
EnsureCustomApi(service, ApiEncerrar, "Acesso | Encerrar acesso de motorista", "Remove grupo, licenca e conta no Entra e inativa o funcionario.", solutionUniqueName,
    requestParams: new[] { ("FuncionarioId", 12, false), ("Confirmacao", 10, false) },
    responseProps: new[] { ("Etapas", 10) });
EnsureApiStep(service, tipoCadastrar, ApiCadastrar, "Cr40f.Acesso: cadastrar acesso", config, solutionUniqueName);
EnsureApiStep(service, tipoEncerrar, ApiEncerrar, "Cr40f.Acesso: encerrar acesso", config, solutionUniqueName);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin de acesso registrado");

static void Log(string message) => Console.WriteLine($"[acesso:plugin] {message}");
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

static Guid UpsertPluginType(ServiceClient service, Guid assemblyId, string typeName)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", typeName), ("pluginassemblyid", assemblyId));
    if (existing is not null)
    {
        Log($"reutilizando tipo {typeName}");
        return existing.Id;
    }
    Log($"criando tipo {typeName}");
    var shortName = typeName[(typeName.LastIndexOf('.') + 1)..];
    return service.Create(new Entity("plugintype")
    {
        ["name"] = shortName,
        ["friendlyname"] = shortName,
        ["typename"] = typeName,
        ["pluginassemblyid"] = Ref("pluginassembly", assemblyId),
    });
}

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

static void EnsureApiStep(ServiceClient service, Guid pluginTypeId, string messageName, string name, string config, string solution)
{
    var message = FindSingleOrNone(service, "sdkmessage", ("name", messageName)) ?? throw new InvalidOperationException($"sdkmessage {messageName} nao encontrada (publique a Custom API antes).");
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
