using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin Cr40f.Prontuario e as Custom APIs globais do anexo no prontuário pelo Claude:
//   cr40f_PrepararAnexoProntuario: qualquer usuário chama; a regra de permissão (criar nota no funcionário) está no plugin.
//   cr40f_ConsumirAnexoProntuario: execute privilege prvWritecr40f_liberacaoanexo, que só administrador e a conta do flow têm.
// Pré-requisito: tabela cr40f_liberacaoanexo (provision-anexo-prontuario.ps1 -Apply), para o privilégio existir.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (!File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const int PluginAssemblyComponentType = 91;
const int Booleano = 0, Texto = 10;

var apis = new[]
{
    new Api("Cr40f.Prontuario.Plugin.PrepararAnexoProntuarioPlugin", "cr40f_PrepararAnexoProntuario", "Prontuário | Preparar anexo pelo Claude",
        "Confere se quem chama pode anotar no funcionário e cria uma liberação de uso único (10 min) para o flow de anexo. Devolve id, token, expiração e URL de envio.",
        null,
        new[] { new Param("FuncionarioId", Texto, "Id (GUID) do funcionário em cr40f_funcionarios.") },
        new[] { new Param("LiberacaoId", Texto, "Id da liberação."), new Param("Token", Texto, "Token de uso único (base64url); só o hash fica gravado."), new Param("ExpiraEm", Texto, "Expiração em UTC (ISO 8601)."), new Param("UrlEnvio", Texto, "URL HTTP do flow que recebe os arquivos.") }),
    new Api("Cr40f.Prontuario.Plugin.ConsumirAnexoProntuarioPlugin", "cr40f_ConsumirAnexoProntuario", "Prontuário | Consumir liberação de anexo",
        "Chamada pelo flow de anexo: valida liberação, token e arquivos, marca a liberação como usada e devolve funcionário, solicitante, pasta, nomes finais e corpo da nota.",
        "prvWritecr40f_liberacaoanexo",
        new[] { new Param("LiberacaoId", Texto, "Id da liberação."), new Param("Token", Texto, "Token recebido na preparação."), new Param("ArquivosJson", Texto, "[{nome, mimeType, tamanho}] dos arquivos."), new Param("Titulo", Texto, "Título da anotação.", true), new Param("Texto", Texto, "Texto da anotação.", true) },
        new[] { new Param("Ok", Booleano, "Liberação válida e consumida."), new Param("Codigo", Texto, "LIBERACAO ou ARQUIVOS quando Ok é falso."), new Param("Erro", Texto, "Mensagem em pt-BR quando Ok é falso."), new Param("FuncionarioId", Texto, "Id do funcionário."), new Param("Solicitante", Texto, "Nome de quem pediu."), new Param("Pasta", Texto, "Pasta na biblioteca (Funcionarios/[DEV/]<id>/Anotacoes)."), new Param("Titulo", Texto, "Título final."), new Param("CorpoHtml", Texto, "Parágrafos da nota (sem o wrapper)."), new Param("ArquivosJson", Texto, "[{nome, mimeType, tamanho}] com os nomes finais.") }),
};

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "prontuario.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
foreach (var api in apis)
{
    var privilegio = api.Privilegio is null ? null : NomePrivilegio(service, api.Privilegio);
    EnsureCustomApi(service, api, UpsertPluginType(service, assemblyId, api.TypeName), privilegio, solutionUniqueName);
}

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin do anexo no prontuario registrado");

static void Log(string message) => Console.WriteLine($"[prontuario:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

// O privilégio nasce com a tabela; o nome exato vem do Dataverse (lá a comparação ignora maiúsculas).
static string NomePrivilegio(ServiceClient service, string nome)
{
    var query = new QueryExpression("privilege") { ColumnSet = new ColumnSet("name"), TopCount = 2 };
    query.Criteria.AddCondition("name", ConditionOperator.Equal, nome);
    var rows = service.RetrieveMultiple(query).Entities;
    if (rows.Count != 1) throw new InvalidOperationException($"Privilegio {nome} nao encontrado. Rode provision-anexo-prontuario.ps1 -Apply antes.");
    return rows[0].GetAttributeValue<string>("name");
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

static void EnsureCustomApi(ServiceClient service, Api api, Guid pluginTypeId, string? privilegio, string solution)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", api.Nome));
    if (existing is not null)
    {
        Log($"atualizando Custom API {api.Nome}");
        var update = new UpdateRequest { Target = new Entity("customapi", existing.Id) { ["plugintypeid"] = Ref("plugintype", pluginTypeId), ["executeprivilegename"] = privilegio } };
        update["SolutionUniqueName"] = solution;
        service.Execute(update);
        customApiId = existing.Id;
    }
    else
    {
        Log($"criando Custom API {api.Nome}");
        var create = new CreateRequest
        {
            Target = new Entity("customapi")
            {
                ["uniquename"] = api.Nome,
                ["name"] = api.Nome,
                ["displayname"] = api.Rotulo,
                ["description"] = api.Descricao,
                ["bindingtype"] = new OptionSetValue(0),
                ["isfunction"] = false,
                ["isprivate"] = false,
                ["executeprivilegename"] = privilegio,
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
                ["plugintypeid"] = Ref("plugintype", pluginTypeId),
                ["iscustomizable"] = new BooleanManagedProperty(false),
            },
        };
        create["SolutionUniqueName"] = solution;
        customApiId = ((CreateResponse)service.Execute(create)).id;
    }

    foreach (var p in api.Entradas)
    {
        if (ChildExists(service, "customapirequestparameter", customApiId, p.Nome)) continue;
        Log($"criando parametro {api.Nome}.{p.Nome}");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = p.Nome,
            ["name"] = $"{api.Nome}.{p.Nome}",
            ["displayname"] = p.Nome,
            ["description"] = p.Descricao,
            ["type"] = new OptionSetValue(p.Tipo),
            ["isoptional"] = p.Opcional,
            ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
    foreach (var p in api.Saidas)
    {
        if (ChildExists(service, "customapiresponseproperty", customApiId, p.Nome)) continue;
        Log($"criando resposta {api.Nome}.{p.Nome}");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["uniquename"] = p.Nome,
            ["name"] = $"{api.Nome}.{p.Nome}",
            ["displayname"] = p.Nome,
            ["description"] = p.Descricao,
            ["type"] = new OptionSetValue(p.Tipo),
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

internal sealed record Param(string Nome, int Tipo, string Descricao, bool Opcional = false);
internal sealed record Api(string TypeName, string Nome, string Rotulo, string Descricao, string? Privilegio, Param[] Entradas, Param[] Saidas);
