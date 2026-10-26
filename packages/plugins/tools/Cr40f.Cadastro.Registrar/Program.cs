using System.Globalization;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin do link de cadastro do passageiro e as Custom APIs globais new_GerarLinkCadastro e new_ObterFotoPassageiro.
// new_ObterFotoPassageiro nao tem plugintype na API: roda num step sincrono stage 40 cuja configuracao segura e a URL do gatilho
// do "Flow - Consultar Arquivos Sharepoint". A URL vem de --fotoFlowUrl ou da variavel CADASTRO_FOTO_FLOW_URL (nunca versionada);
// sem ela, o step mantem a configuracao segura que ja tiver.
// Modo de verificação: --testar <reservaId> [--passageiroId <id>] chama a Custom API e imprime o new_LinkJson (token oculto).
// Atenção: --testar cria um link real (e revoga os anteriores do mesmo escopo).
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var testar = options.Has("testar") || options.Has("testarFoto");
var dllPath = testar ? "" : options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string PluginTypeName = "Cr40f.Cadastro.Plugin.GerarLinkCadastroPlugin";
const string CustomApiName = "new_GerarLinkCadastro";
const string FotoTypeName = "Cr40f.Cadastro.Plugin.ObterFotoPassageiroPlugin";
const string FotoApiName = "new_ObterFotoPassageiro";
const string FotoStepName = "Cadastro | new_ObterFotoPassageiro | PostOperation";
var fotoFlowUrl = options.Optional("fotoFlowUrl") ?? Environment.GetEnvironmentVariable("CADASTRO_FOTO_FLOW_URL");
if (!string.IsNullOrWhiteSpace(fotoFlowUrl) && !fotoFlowUrl.Trim().StartsWith("https://", StringComparison.Ordinal)) throw new InvalidOperationException("URL do flow de foto deve ser https.");
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "cadastro.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

if (options.Has("testarFoto"))
{
    // --testarFoto <reservaId> --passageiroId <id>: chama como o usuario logado; so o motorista do servico recebe ok:true.
    var fotoJson = (string)service.Execute(new OrganizationRequest("new_ObterFotoPassageiro") { ["new_ReservaId"] = options.Require("testarFoto"), ["new_PassageiroId"] = options.Require("passageiroId") })["new_FotoJson"];
    Console.WriteLine(System.Text.RegularExpressions.Regex.Replace(fotoJson, "\"conteudoBase64\":\"([^\"]{0,16})[^\"]*\"", m => $"\"conteudoBase64\":\"{m.Groups[1].Value}...({fotoJson.Length} chars)\""));
    return;
}

if (testar)
{
    var request = new OrganizationRequest(CustomApiName) { ["new_ReservaId"] = options.Require("testar") };
    var passageiro = options.Optional("passageiroId");
    if (passageiro is not null) request["new_PassageiroId"] = passageiro;
    var json = (string)service.Execute(request)["new_LinkJson"];
    // Não imprime o token do link no terminal.
    Console.WriteLine(System.Text.RegularExpressions.Regex.Replace(json, "#t=[^\"]+", "#t=<oculto>"));
    return;
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
var pluginTypeId = UpsertPluginType(service, assemblyId, PluginTypeName);
var fotoTypeId = UpsertPluginType(service, assemblyId, FotoTypeName);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
EnsureCustomApi(service, pluginTypeId, solutionUniqueName);
EnsureFotoApi(service, fotoTypeId, solutionUniqueName, fotoFlowUrl);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin do link de cadastro registrado");

static void Log(string message) => Console.WriteLine($"[cadastro:plugin] {message}");
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
                ["displayname"] = "Cadastro | Gerar link do passageiro",
                ["description"] = "Gera link público (36 h) para o passageiro enviar foto, telefone e e-mail. Grava só o hash do token.",
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

    foreach (var (nome, descricao, opcional) in new[] { ("new_ReservaId", "GUID da reserva (cr40f_reservadeveculos).", false), ("new_PassageiroId", "GUID do passageiro (cr40f_bancodedados). Ausente: todos do serviço.", true) })
    {
        if (ChildExists(service, "customapirequestparameter", customApiId, nome)) continue;
        Log($"criando parametro {nome}");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = nome,
            ["name"] = $"{CustomApiName}.{nome}",
            ["displayname"] = nome,
            ["description"] = descricao,
            ["type"] = new OptionSetValue(10),
            ["isoptional"] = opcional,
            ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }

    if (!ChildExists(service, "customapiresponseproperty", customApiId, "new_LinkJson"))
    {
        Log("criando resposta new_LinkJson");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = "new_LinkJson",
            ["name"] = $"{CustomApiName}.new_LinkJson",
            ["displayname"] = "Link JSON",
            ["description"] = "{ok, link, expiraEm, passageiros} ou {ok:false, erro}.",
            ["type"] = new OptionSetValue(10),
            ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
}

static void EnsureFotoApi(ServiceClient service, Guid pluginTypeId, string solution, string? flowUrl)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", FotoApiName));
    if (existing is not null) { customApiId = existing.Id; Log($"reutilizando Custom API {FotoApiName}"); }
    else
    {
        Log($"criando Custom API {FotoApiName}");
        var create = new CreateRequest
        {
            Target = new Entity("customapi")
            {
                ["uniquename"] = FotoApiName,
                ["name"] = FotoApiName,
                ["displayname"] = "Cadastro | Obter foto do passageiro",
                ["description"] = "Foto do passageiro para o motorista do servico Programado; devolve a imagem em base64 ou motivo indisponivel.",
                ["bindingtype"] = new OptionSetValue(0),
                ["isfunction"] = false,
                ["isprivate"] = false,
                // Sem plugintype na API: o step sincrono abaixo carrega a configuracao segura.
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(2),
                ["iscustomizable"] = new BooleanManagedProperty(false),
            },
        };
        create["SolutionUniqueName"] = solution;
        customApiId = ((CreateResponse)service.Execute(create)).id;
    }

    foreach (var (nome, descricao) in new[] { ("new_ReservaId", "GUID da reserva (cr40f_reservadeveculos)."), ("new_PassageiroId", "GUID do passageiro (cr40f_bancodedados).") })
    {
        if (ChildExists(service, "customapirequestparameter", customApiId, nome)) continue;
        Log($"criando parametro {FotoApiName}.{nome}");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = nome, ["name"] = $"{FotoApiName}.{nome}", ["displayname"] = nome,
            ["description"] = descricao, ["type"] = new OptionSetValue(10), ["isoptional"] = false, ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
    if (!ChildExists(service, "customapiresponseproperty", customApiId, "new_FotoJson"))
    {
        Log("criando resposta new_FotoJson");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = "new_FotoJson", ["name"] = $"{FotoApiName}.new_FotoJson", ["displayname"] = "Foto JSON",
            ["description"] = "{ok, mimeType, conteudoBase64} ou {ok:false, motivo}.", ["type"] = new OptionSetValue(10), ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }

    var message = FindSingleOrNone(service, "sdkmessage", ("name", FotoApiName)) ?? throw new InvalidOperationException($"sdkmessage {FotoApiName} nao encontrada.");
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", FotoStepName)) is { } step)
    {
        stepId = step.Id;
        service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(0), ["eventhandler"] = Ref("plugintype", pluginTypeId) });
        Log($"step reconciliado: {FotoStepName}");
    }
    else
    {
        stepId = service.Create(new Entity("sdkmessageprocessingstep")
        {
            ["name"] = FotoStepName, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(40), ["rank"] = 1, ["supporteddeployment"] = new OptionSetValue(0),
            ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = false,
        });
        Log($"step criado: {FotoStepName}");
    }
    EnsureSolutionComponent(service, stepId, solution, 92);

    var secureRef = service.Retrieve("sdkmessageprocessingstep", stepId, new ColumnSet("sdkmessageprocessingstepsecureconfigid")).GetAttributeValue<EntityReference>("sdkmessageprocessingstepsecureconfigid");
    if (string.IsNullOrWhiteSpace(flowUrl))
    {
        Log(secureRef is null
            ? "ATENCAO: step sem configuracao segura; a API responde indisponivel ate passar --fotoFlowUrl ou CADASTRO_FOTO_FLOW_URL"
            : "configuracao segura existente mantida");
        return;
    }
    var valor = flowUrl!.Trim();
    if (secureRef is not null) service.Update(new Entity("sdkmessageprocessingstepsecureconfig", secureRef.Id) { ["secureconfig"] = valor });
    else
    {
        var secureId = service.Create(new Entity("sdkmessageprocessingstepsecureconfig") { ["secureconfig"] = valor });
        service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["sdkmessageprocessingstepsecureconfigid"] = Ref("sdkmessageprocessingstepsecureconfig", secureId) });
    }
    Log("configuracao segura gravada (URL do flow oculta)");
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
