using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var dllPath = options.Require("dllPath");
var solutionUniqueName = options.Require("solutionUniqueName");
var publish = options.Has("publish");
if (!File.Exists(dllPath))
{
    throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);
}

const string PluginTypeName = "Cr40f.Financeiro.Plugin.SincronizarFinanceiroPlugin";
const string CustomApiMessageName = "cr40f_SincronizarFinanceiro";
const string BoundEntity = "cr40f_financeiro";
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "financeiro.msalcache.bin");
var connectionString = $"AuthType=OAuth;Url={environmentUrl.TrimEnd('/')};AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=http://localhost;TokenCacheStorePath={tokenCachePath};LoginPrompt=Auto";
using var service = new ServiceClient(connectionString);
if (!service.IsReady)
{
    throw new InvalidOperationException($"Falha ao conectar no Dataverse. {service.LastError}");
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
var assemblyContent = Convert.ToBase64String(File.ReadAllBytes(dllPath));
var assemblyId = UpsertAssembly(service, assemblyInfo, assemblyContent);
var pluginTypeId = UpsertPluginType(service, assemblyId);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
EnsureLogTable(service, solutionUniqueName);
var customApiId = EnsureCustomApi(service, pluginTypeId, solutionUniqueName, CustomApiMessageName, BoundEntity);
ConfigureMainOperationStep(service, customApiId, pluginTypeId);

if (publish)
{
    // Plugin assemblies nao fazem parte do PublishXml seletivo; o publish global consolida o registro do step.
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}

Log("plugin publicado com sucesso");

static void Log(string message) => Console.WriteLine($"[financeiro:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

static void EnsureLogTable(ServiceClient service, string solution)
{
    const string logical = "cr40f_sincronizacaofinanceira";
    var exists = ((RetrieveAllEntitiesResponse)service.Execute(new RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity })).EntityMetadata.Any(e => e.LogicalName == logical);
    if (!exists)
    {
        Log("criando tabela de log");
        var create = new CreateEntityRequest
        {
            SolutionUniqueName = solution,
            Entity = new EntityMetadata
            {
                SchemaName = "cr40f_SincronizacaoFinanceira", LogicalName = logical,
                DisplayName = new Label("Sincronização Financeira", 1046), DisplayCollectionName = new Label("Sincronizações Financeiras", 1046),
                Description = new Label("Log imutável das alterações feitas pelo motor financeiro.", 1046),
                OwnershipType = OwnershipTypes.UserOwned, IsActivity = false,
            },
            PrimaryAttribute = new StringAttributeMetadata { SchemaName = "cr40f_name", LogicalName = "cr40f_name", MaxLength = 400, FormatName = StringFormatName.Text, DisplayName = new Label("Resumo", 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) },
        };
        service.Execute(create);
    }
    EnsureString(service, solution, logical, "cr40f_entidade", "Entidade", 100);
    EnsureString(service, solution, logical, "cr40f_campo", "Campo", 100);
    EnsureString(service, solution, logical, "cr40f_de", "De", 100);
    EnsureString(service, solution, logical, "cr40f_para", "Para", 100);
    EnsureString(service, solution, logical, "cr40f_motivo", "Motivo", 1000);
    EnsurePicklist(service, solution, logical, "cr40f_origem", "Origem", (202410000, "Manual"), (202410001, "Automático"));
    EnsureLookup(service, solution, logical, "cr40f_op", "OP", "cr40f_financeiro", "cr40f_sincronizacaofinanceira_op");
    EnsureLookup(service, solution, logical, "cr40f_reserva", "Reserva", "cr40f_reservadeveculos", "cr40f_sincronizacaofinanceira_reserva");
    EnsureLookup(service, solution, logical, "cr40f_usuario", "Usuário", "systemuser", "cr40f_sincronizacaofinanceira_usuario");
}

static bool AttributeExists(ServiceClient service, string entity, string attribute)
{
    try { service.Execute(new RetrieveAttributeRequest { EntityLogicalName = entity, LogicalName = attribute }); return true; }
    catch { return false; }
}

static void EnsureString(ServiceClient service, string solution, string entity, string name, string label, int max)
{
    if (AttributeExists(service, entity, name)) return;
    Log($"criando coluna {name}");
    service.Execute(new CreateAttributeRequest { SolutionUniqueName = solution, EntityName = entity, Attribute = new StringAttributeMetadata { SchemaName = name, LogicalName = name, MaxLength = max, FormatName = StringFormatName.Text, DisplayName = new Label(label, 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) } });
}

static void EnsurePicklist(ServiceClient service, string solution, string entity, string name, string label, params (int value, string text)[] options)
{
    if (AttributeExists(service, entity, name)) return;
    Log($"criando coluna {name}");
    var set = new OptionSetMetadata { IsGlobal = false, OptionSetType = OptionSetType.Picklist };
    foreach (var (value, text) in options) set.Options.Add(new OptionMetadata(new Label(text, 1046), value));
    service.Execute(new CreateAttributeRequest { SolutionUniqueName = solution, EntityName = entity, Attribute = new PicklistAttributeMetadata { SchemaName = name, LogicalName = name, DisplayName = new Label(label, 1046), OptionSet = set, RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) } });
}

static void EnsureLookup(ServiceClient service, string solution, string entity, string name, string label, string target, string relationship)
{
    if (AttributeExists(service, entity, name)) return;
    Log($"criando coluna {name}");
    service.Execute(new CreateOneToManyRequest
    {
        SolutionUniqueName = solution,
        OneToManyRelationship = new OneToManyRelationshipMetadata { ReferencedEntity = target, ReferencingEntity = entity, SchemaName = relationship, CascadeConfiguration = new CascadeConfiguration { Delete = CascadeType.RemoveLink, Assign = CascadeType.NoCascade, Share = CascadeType.NoCascade, Unshare = CascadeType.NoCascade, Reparent = CascadeType.NoCascade, Merge = CascadeType.NoCascade } },
        Lookup = new LookupAttributeMetadata { SchemaName = name, LogicalName = name, DisplayName = new Label(label, 1046), RequiredLevel = new AttributeRequiredLevelManagedProperty(AttributeRequiredLevel.None) },
    });
}

static Guid UpsertAssembly(ServiceClient service, AssemblyInfo assemblyInfo, string content)
{
    var existing = FindSingleOrNone(service, "pluginassembly", ("name", assemblyInfo.Name));
    if (existing is not null)
    {
        Log($"atualizando assembly {assemblyInfo.Name}");
        service.Update(new Entity("pluginassembly", existing.Id) { ["content"] = content });
        return existing.Id;
    }

    Log($"criando assembly {assemblyInfo.Name}");
    return service.Create(new Entity("pluginassembly")
    {
        ["name"] = assemblyInfo.Name,
        ["content"] = content,
        ["isolationmode"] = new OptionSetValue(2),
        ["sourcetype"] = new OptionSetValue(0),
        ["version"] = assemblyInfo.Version,
        ["culture"] = assemblyInfo.Culture,
        ["publickeytoken"] = assemblyInfo.PublicKeyToken
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
        ["name"] = "SincronizarFinanceiroPlugin",
        ["friendlyname"] = "SincronizarFinanceiroPlugin",
        ["typename"] = PluginTypeName,
        ["pluginassemblyid"] = Ref("pluginassembly", assemblyId)
    });
}

static Guid EnsureCustomApi(ServiceClient service, Guid pluginTypeId, string solutionUniqueName, string customApiMessageName, string boundEntity)
{
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", customApiMessageName));
    if (existing is not null)
    {
        Log($"reutilizando Custom API {customApiMessageName}");
        var updateRequest = new UpdateRequest
        {
            Target = new Entity("customapi", existing.Id)
            {
                ["plugintypeid"] = Ref("plugintype", pluginTypeId)
            }
        };
        updateRequest["SolutionUniqueName"] = solutionUniqueName;
        service.Execute(updateRequest);
        EnsureCustomApiChildren(service, existing.Id, solutionUniqueName, customApiMessageName);
        return existing.Id;
    }

    Log($"criando Custom API {customApiMessageName}");
    var customApi = new Entity("customapi")
    {
        ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
        ["bindingtype"] = new OptionSetValue(1),
        ["boundentitylogicalname"] = boundEntity,
        ["description"] = "Recalcula status de OP, reservas e composições a partir dos pagantes (simular/aplicar).",
        ["displayname"] = "Sincronizar Financeiro",
        ["isfunction"] = false,
        ["isprivate"] = false,
        ["name"] = customApiMessageName,
        ["plugintypeid"] = Ref("plugintype", pluginTypeId),
        ["uniquename"] = customApiMessageName,
        ["iscustomizable"] = new BooleanManagedProperty(false)
    };

    var createRequest = new CreateRequest { Target = customApi };
    createRequest["SolutionUniqueName"] = solutionUniqueName;
    var customApiId = ((CreateResponse)service.Execute(createRequest)).id;

    EnsureCustomApiChildren(service, customApiId, solutionUniqueName, customApiMessageName);

    return customApiId;
}

static bool ChildExists(ServiceClient service, string logicalName, Guid customApiId, string uniqueName)
{
    var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet(false), TopCount = 1 };
    query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, customApiId);
    query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
    return service.RetrieveMultiple(query).Entities.Count > 0;
}

static void CreateInSolution(ServiceClient service, Entity entity, string solutionUniqueName)
{
    var request = new CreateRequest { Target = entity };
    request["SolutionUniqueName"] = solutionUniqueName;
    service.Execute(request);
}

static void EnsureCustomApiChildren(ServiceClient service, Guid customApiId, string solutionUniqueName, string customApiMessageName)
{
    if (!ChildExists(service, "customapirequestparameter", customApiId, "cr40f_RequestJson"))
    {
        Log("criando parâmetro cr40f_RequestJson");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["description"] = "JSON da solicitação de sincronização (modo simular ou aplicar).",
            ["displayname"] = "Request JSON",
            ["isoptional"] = true,
            ["name"] = $"{customApiMessageName}.cr40f_RequestJson",
            ["type"] = new OptionSetValue(10),
            ["uniquename"] = "cr40f_RequestJson",
            ["iscustomizable"] = new BooleanManagedProperty(false)
        }, solutionUniqueName);
    }

    if (!ChildExists(service, "customapiresponseproperty", customApiId, "cr40f_ResponseJson"))
    {
        Log("criando resposta cr40f_ResponseJson");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["description"] = "JSON do resultado da operação.",
            ["displayname"] = "Response JSON",
            ["name"] = $"{customApiMessageName}.cr40f_ResponseJson",
            ["type"] = new OptionSetValue(10),
            ["uniquename"] = "cr40f_ResponseJson",
            ["iscustomizable"] = new BooleanManagedProperty(false)
        }, solutionUniqueName);
    }
}

static Guid ConfigureMainOperationStep(
    ServiceClient service,
    Guid customApiId,
    Guid pluginTypeId)
{
    var customApi = service.Retrieve("customapi", customApiId, new ColumnSet("sdkmessageid"));
    var sdkMessage = customApi.GetAttributeValue<EntityReference>("sdkmessageid")
        ?? throw new InvalidOperationException("A Custom API não possui mensagem SDK publicada.");
    var rows = service.RetrieveMultiple(new QueryExpression("sdkmessageprocessingstep")
    {
        ColumnSet = new ColumnSet("name"),
        TopCount = 2,
        Criteria = new FilterExpression(LogicalOperator.And)
        {
            Conditions =
            {
                new ConditionExpression("sdkmessageid", ConditionOperator.Equal, sdkMessage.Id),
                new ConditionExpression("eventhandler", ConditionOperator.Equal, pluginTypeId),
                new ConditionExpression("stage", ConditionOperator.Equal, 30)
            }
        }
    }).Entities;
    if (rows.Count != 1) throw new InvalidOperationException($"Step MainOperation da Custom API não encontrado de forma única. Quantidade: {rows.Count}.");
    var step = rows.Single();

    return step.Id;
}

static void EnsureSolutionComponent(ServiceClient service, Guid componentId, string solutionUniqueName, int componentType)
{
    try
    {
        service.Execute(new OrganizationRequest("AddSolutionComponent")
        {
            ["ComponentId"] = componentId,
            ["ComponentType"] = componentType,
            ["SolutionUniqueName"] = solutionUniqueName,
            ["AddRequiredComponents"] = true
        });
        Log($"componente {componentType} incluido na solucao {solutionUniqueName}");
    }
    catch (Exception error) when (error.Message.Contains("already", StringComparison.OrdinalIgnoreCase) || error.Message.Contains("ja existe", StringComparison.OrdinalIgnoreCase))
    {
        Log($"componente {componentType} ja pertence a solucao {solutionUniqueName}");
    }
}

static Entity? FindSingleOrNone(ServiceClient service, string logicalName, params (string Attribute, object Value)[] conditions)
{
    var query = new QueryExpression(logicalName)
    {
        ColumnSet = new ColumnSet($"{logicalName}id"),
        TopCount = 2
    };
    foreach (var condition in conditions) query.Criteria.AddCondition(condition.Attribute, ConditionOperator.Equal, condition.Value);
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
        var publicKeyToken = token is null || token.Length == 0 ? string.Empty : string.Concat(token.Select(value => value.ToString("x2")));
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
            var name = key[2..];
            var value = index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal) ? args[++index] : null;
            values[name] = value;
        }
        return new Arguments(values);
    }

    public string Require(string name) => Optional(name) ?? throw new InvalidOperationException($"Argumento obrigatorio: --{name}");
    public string? Optional(string name) => _values.TryGetValue(name, out var value) ? value : null;
    public bool Has(string name) => _values.ContainsKey(name);
}
