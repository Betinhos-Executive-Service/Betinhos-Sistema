using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
// Modo de validacao: --simular <opId> (ou --aplicar <opId>) chama a Custom API bound e imprime o ResponseJson.
var simularId = options.Optional("simular");
var aplicarId = options.Optional("aplicar");
// Modo de validacao: --fechar <clienteId> --mes AAAA-MM chama a Custom API unbound cr40f_FecharMesCliente.
var fecharId = options.Optional("fechar");
// Carga inicial do valor da OP: --recalcularValorOp grava; --simularValorOp só conta o que mudaria. Mesma soma do ValorOpPlugin.
var recalcularValorOp = options.Has("recalcularValorOp");
var simularValorOp = options.Has("simularValorOp");
var dllPath = simularId is null && aplicarId is null && fecharId is null && !recalcularValorOp && !simularValorOp ? options.Require("dllPath") : "";
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath))
{
    throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);
}

const string PluginTypeName = "Cr40f.Financeiro.Plugin.SincronizarFinanceiroPlugin";
const string CustomApiMessageName = "cr40f_SincronizarFinanceiro";
const string BoundEntity = "cr40f_financeiro";
const string FecharMesPluginTypeName = "Cr40f.Financeiro.Plugin.FecharMesClientePlugin";
const string FecharMesMessageName = "cr40f_FecharMesCliente";
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

if (recalcularValorOp || simularValorOp)
{
    RecalcularValorOps(service, gravar: recalcularValorOp);
    return;
}

if (simularId is not null || aplicarId is not null)
{
    var opId = Guid.Parse(simularId ?? aplicarId!);
    var modo = simularId is not null ? "simular" : "aplicar";
    var request = new OrganizationRequest("cr40f_SincronizarFinanceiro")
    {
        ["Target"] = new EntityReference("cr40f_financeiro", opId),
        ["cr40f_RequestJson"] = "{\"modo\":\"" + modo + "\",\"origem\":\"manual\"}",
    };
    var response = service.Execute(request);
    Console.WriteLine(response["cr40f_ResponseJson"]);
    return;
}

if (fecharId is not null)
{
    var fecharRequest = new OrganizationRequest(FecharMesMessageName)
    {
        ["cr40f_RequestJson"] = "{\"clienteId\":\"" + Guid.Parse(fecharId) + "\",\"mes\":\"" + options.Require("mes") + "\"}",
    };
    Console.WriteLine(service.Execute(fecharRequest)["cr40f_ResponseJson"]);
    return;
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
var assemblyContent = Convert.ToBase64String(File.ReadAllBytes(dllPath));
var assemblyId = UpsertAssembly(service, assemblyInfo, assemblyContent);
var pluginTypeId = UpsertPluginType(service, assemblyId);
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
EnsureLogTable(service, solutionUniqueName);
var customApiId = EnsureCustomApi(service, pluginTypeId, solutionUniqueName, CustomApiMessageName, BoundEntity,
    "Sincronizar Financeiro", "Recalcula status de OP, reservas e composições a partir dos pagantes (simular/aplicar).",
    "JSON da solicitação de sincronização (modo simular ou aplicar).", requestOptional: true);
ConfigureMainOperationStep(service, customApiId, pluginTypeId);
var fecharTypeId = UpsertPluginTypeNamed(service, assemblyId, FecharMesPluginTypeName);
var fecharApiId = EnsureCustomApi(service, fecharTypeId, solutionUniqueName, FecharMesMessageName, null,
    "Fechar Mês do Cliente", "Cria a OP consolidada do mês para os serviços mensais concluídos de um cliente e vincula os serviços.",
    "JSON da solicitação de fechamento (clienteId e mes AAAA-MM).", requestOptional: false);
ConfigureMainOperationStep(service, fecharApiId, fecharTypeId);
var stepTypeId = UpsertPluginTypeNamed(service, assemblyId, "Cr40f.Financeiro.Plugin.FinanceiroStepPlugin");
EnsureUpdateStep(service, stepTypeId, "cr40f_pagantes", "cr40f_status", "Cr40f.Financeiro: Pagante → OP", solutionUniqueName);
EnsureUpdateStep(service, stepTypeId, "cr40f_financeiro", "cr40f_status", "Cr40f.Financeiro: OP → Reservas", solutionUniqueName);
// Valor da OP = soma das composições das reservas (mesma soma do SyncEngine). Ver ValorOpPlugin.
var valorOpTypeId = UpsertPluginTypeNamed(service, assemblyId, "Cr40f.Financeiro.Plugin.ValorOpPlugin");
// new_valortotal é coluna calculada (subtotal + pedágios + passagens + estacionamento + combustível): não entra em Update,
// então o step ouve qualquer alteração da composição; o plugin só grava a OP se o total mudar.
EnsureStep(service, valorOpTypeId, "Update", "cr40f_composicaodeprecos", 40, null, "Cr40f.ValorOp: composição alterada", solutionUniqueName);
EnsureStep(service, valorOpTypeId, "Delete", "cr40f_composicaodeprecos", 20, null, "Cr40f.ValorOp: composição excluída (antes)", solutionUniqueName);
EnsureStep(service, valorOpTypeId, "Delete", "cr40f_composicaodeprecos", 40, null, "Cr40f.ValorOp: composição excluída", solutionUniqueName);
EnsureStep(service, valorOpTypeId, "Create", "cr40f_reservadeveculos", 40, null, "Cr40f.ValorOp: reserva criada", solutionUniqueName);
EnsureStep(service, valorOpTypeId, "Update", "cr40f_reservadeveculos", 40, "cr40f_financeiro,new_composicaodepreco", "Cr40f.ValorOp: reserva alterada", solutionUniqueName, preImageAttributes: "cr40f_financeiro");
EnsureStep(service, valorOpTypeId, "Delete", "cr40f_reservadeveculos", 40, null, "Cr40f.ValorOp: reserva excluída", solutionUniqueName, preImageAttributes: "cr40f_financeiro");

if (publish)
{
    // Plugin assemblies nao fazem parte do PublishXml seletivo; o publish global consolida o registro do step.
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}

Log("plugin publicado com sucesso");

static void Log(string message) => Console.WriteLine($"[financeiro:plugin] {message}");

/// <summary>
/// Valor de todas as OPs = soma das composições (new_valortotal) das reservas ligadas, 0 para reserva sem composição,
/// null para OP sem reserva. Igual ao ValorOpPlugin.Calcular; grava só o que mudou.
/// </summary>
static void RecalcularValorOps(ServiceClient service, bool gravar)
{
    var ops = TodasAsLinhas(service, "cr40f_financeiro", "cr40f_valor", "cr40f_idfinanceiro");
    var reservas = TodasAsLinhas(service, "cr40f_reservadeveculos", "cr40f_financeiro", "new_composicaodepreco")
        .Where(r => r.GetAttributeValue<EntityReference>("cr40f_financeiro") != null).ToList();
    var valorCp = TodasAsLinhas(service, "cr40f_composicaodeprecos", "new_valortotal")
        .ToDictionary(c => c.Id, c => Centavos(c.GetAttributeValue<Money>("new_valortotal")) ?? 0);
    var porOp = reservas.GroupBy(r => r.GetAttributeValue<EntityReference>("cr40f_financeiro")!.Id)
        .ToDictionary(g => g.Key, g => g.Sum(r => r.GetAttributeValue<EntityReference>("new_composicaodepreco") is { } cp && valorCp.TryGetValue(cp.Id, out var v) ? v : 0));
    int mudam = 0, gravadas = 0;
    foreach (var op in ops)
    {
        int? atual = Centavos(op.GetAttributeValue<Money>("cr40f_valor"));
        int? novo = porOp.TryGetValue(op.Id, out var soma) ? soma : null;
        if (atual == novo) continue;
        mudam++;
        if (!gravar) continue;
        service.Update(new Entity("cr40f_financeiro", op.Id) { ["cr40f_valor"] = novo is null ? null : new Money(novo.Value / 100m) });
        gravadas++;
    }
    Log($"valor da OP: {ops.Count} OPs, {porOp.Count} com reservas, {mudam} mudariam, {gravadas} gravadas{(gravar ? "" : " (simulação)")}");
}

static int? Centavos(Money? money) => money == null ? null : (int)Math.Round(money.Value * 100m, MidpointRounding.AwayFromZero);

static List<Entity> TodasAsLinhas(ServiceClient service, string entity, params string[] colunas)
{
    var linhas = new List<Entity>();
    var query = new QueryExpression(entity) { ColumnSet = new ColumnSet(colunas), PageInfo = new PagingInfo { PageNumber = 1, Count = 5000 } };
    while (true)
    {
        var pagina = service.RetrieveMultiple(query);
        linhas.AddRange(pagina.Entities);
        if (!pagina.MoreRecords) return linhas;
        query.PageInfo.PageNumber++;
        query.PageInfo.PagingCookie = pagina.PagingCookie;
    }
}
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
    else
    {
        var meta = (RetrieveEntityResponse)service.Execute(new RetrieveEntityRequest { LogicalName = logical, EntityFilters = EntityFilters.Entity });
        EnsureSolutionComponent(service, meta.EntityMetadata.MetadataId!.Value, solution, 1);
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

static Guid EnsureCustomApi(ServiceClient service, Guid pluginTypeId, string solutionUniqueName, string customApiMessageName, string? boundEntity, string displayName, string description, string requestDescription, bool requestOptional)
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
        EnsureCustomApiChildren(service, existing.Id, solutionUniqueName, customApiMessageName, requestDescription, requestOptional);
        return existing.Id;
    }

    Log($"criando Custom API {customApiMessageName}");
    var customApi = new Entity("customapi")
    {
        ["allowedcustomprocessingsteptype"] = new OptionSetValue(0),
        ["bindingtype"] = new OptionSetValue(boundEntity is null ? 0 : 1),
        ["description"] = description,
        ["displayname"] = displayName,
        ["isfunction"] = false,
        ["isprivate"] = false,
        ["name"] = customApiMessageName,
        ["plugintypeid"] = Ref("plugintype", pluginTypeId),
        ["uniquename"] = customApiMessageName,
        ["iscustomizable"] = new BooleanManagedProperty(false)
    };

    if (boundEntity is not null) customApi["boundentitylogicalname"] = boundEntity;
    var createRequest = new CreateRequest { Target = customApi };
    createRequest["SolutionUniqueName"] = solutionUniqueName;
    var customApiId = ((CreateResponse)service.Execute(createRequest)).id;

    EnsureCustomApiChildren(service, customApiId, solutionUniqueName, customApiMessageName, requestDescription, requestOptional);

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

static void EnsureCustomApiChildren(ServiceClient service, Guid customApiId, string solutionUniqueName, string customApiMessageName, string requestDescription, bool requestOptional)
{
    if (!ChildExists(service, "customapirequestparameter", customApiId, "cr40f_RequestJson"))
    {
        Log("criando parâmetro cr40f_RequestJson");
        CreateInSolution(service, new Entity("customapirequestparameter")
        {
            ["customapiid"] = Ref("customapi", customApiId),
            ["description"] = requestDescription,
            ["displayname"] = "Request JSON",
            ["isoptional"] = requestOptional,
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

static Guid UpsertPluginTypeNamed(ServiceClient service, Guid assemblyId, string typeName)
{
    var existing = FindSingleOrNone(service, "plugintype", ("typename", typeName));
    if (existing is not null) return existing.Id;
    return service.Create(new Entity("plugintype") { ["pluginassemblyid"] = Ref("pluginassembly", assemblyId), ["typename"] = typeName, ["friendlyname"] = typeName, ["name"] = typeName });
}

static void EnsureUpdateStep(ServiceClient service, Guid pluginTypeId, string entity, string filter, string name, string solutionUniqueName)
{
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        EnsureSolutionComponent(service, existing.Id, solutionUniqueName, 92);
        service.Update(new Entity("sdkmessageprocessingstep", existing.Id)
        {
            ["filteringattributes"] = filter, ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(0),
        });
        Log($"step reconciliado: {name}");
        return;
    }
    var message = FindSingleOrNone(service, "sdkmessage", ("name", "Update")) ?? throw new InvalidOperationException("sdkmessage Update não encontrada.");
    var filterRow = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
    {
        ColumnSet = new ColumnSet("sdkmessagefilterid"),
        Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, entity) } },
    }).Entities.Single();
    var stepId = service.Create(new Entity("sdkmessageprocessingstep")
    {
        ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(40), ["rank"] = 10,
        ["supporteddeployment"] = new OptionSetValue(0), ["filteringattributes"] = filter,
        ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["sdkmessagefilterid"] = Ref("sdkmessagefilter", filterRow.Id),
        ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = false,
    });
    EnsureSolutionComponent(service, stepId, solutionUniqueName, 92);
    Log($"step criado: {name}");
}

/// <summary>Step síncrono (mode 0) idempotente por nome, com imagem "pre" opcional (alias igual a ValorOpPlugin.ImagemAnterior).</summary>
static void EnsureStep(ServiceClient service, Guid pluginTypeId, string messageName, string entity, int stage, string? filter, string name, string solutionUniqueName, string? preImageAttributes = null)
{
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        stepId = existing.Id;
        service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["filteringattributes"] = filter, ["stage"] = new OptionSetValue(stage), ["mode"] = new OptionSetValue(0) });
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
            ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(stage), ["rank"] = 20,
            ["supporteddeployment"] = new OptionSetValue(0), ["filteringattributes"] = filter,
            ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["sdkmessagefilterid"] = Ref("sdkmessagefilter", filterRow.Id),
            ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = false,
        });
        Log($"step criado: {name}");
    }
    EnsureSolutionComponent(service, stepId, solutionUniqueName, 92);
    if (preImageAttributes is null) return;
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
