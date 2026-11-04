using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin de campos protegidos da Tenaris (ProtegerCamposPlugin) e o step em cr40f_reservadeveculos Update.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (!File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const string PluginTypeName = "Cr40f.Protecao.Plugin.ProtegerCamposPlugin";
const int PluginAssemblyComponentType = 91;
const int StepComponentType = 92;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "protecao.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady) throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
var pluginTypeId = UpsertPluginType(service, assemblyId);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
const string Campos = "cr40f_destino,cr40f_endereodesada,cr40f_dataehorriodesada,cr40f_obsdeoperao,cr40f_horrioprevistoderetorno,cr40f_status,cr40f_trajeto,cr40f_cr,cr40f_idtenaris,cr40f_tipodeveiculo";
const string Filtro = Campos + ",new_snapshotsharepoint";
const string Imagem = Campos + ",new_camposprotegidos,new_snapshotsharepoint";
EnsureStep(service, pluginTypeId, "Update", "cr40f_reservadeveculos", "Cr40f.Protecao: protege campos editados da Tenaris", solutionUniqueName, Filtro, Imagem);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin de campos protegidos registrado");

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

static void Log(string message) => Console.WriteLine($"[protecao:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

/// <summary>Step síncrono pré-operação (stage 20, mode 0, rank 1) idempotente por nome, com imagem "pre" (alias igual a ProtegerCamposPlugin).</summary>
static void EnsureStep(ServiceClient service, Guid pluginTypeId, string messageName, string entity, string name, string solutionUniqueName, string filteringAttributes, string preImageAttributes)
{
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        stepId = existing.Id;
        service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["filteringattributes"] = filteringAttributes, ["stage"] = new OptionSetValue(20), ["rank"] = 1, ["mode"] = new OptionSetValue(0), ["eventhandler"] = Ref("plugintype", pluginTypeId) });
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
            ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(20), ["rank"] = 1, ["filteringattributes"] = filteringAttributes,
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
        ["name"] = "ProtegerCamposPlugin",
        ["friendlyname"] = "ProtegerCamposPlugin",
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
