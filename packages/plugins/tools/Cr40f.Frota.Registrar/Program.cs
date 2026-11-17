using System.Globalization;
using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o assembly Cr40f.Frota.Plugin: Custom APIs globais cr40f_FrotaPendencias, cr40f_PassoMulta e cr40f_MultasDoDia,
// a trava das multas (pre-operation síncrona em Create e Update de cr40f_multas) e a tarefa no Planner (post-operation assíncrona).
// Verificação: --testar [yyyy-MM-dd] imprime o PendenciasJson; --testar-multas [yyyy-MM-dd] imprime o MultasJson.
var options = Arguments.Parse(args);
var environmentUrl = options.Require("environmentUrl");
var testarPendencias = options.Has("testar");
var testarMultas = options.Has("testar-multas");
var dllPath = testarPendencias || testarMultas ? "" : options.Require("dllPath");
var solutionUniqueName = options.Optional("solutionUniqueName") ?? "appbetinhos";
var publish = options.Has("publish");
if (dllPath.Length > 0 && !File.Exists(dllPath)) throw new FileNotFoundException("DLL do plugin nao encontrada.", dllPath);

const int PluginAssemblyComponentType = 91;
const int StepComponentType = 92;
const int TipoDateTime = 1, TipoString = 10, TipoGuid = 12;
const string Multas = "cr40f_multas";
// Igual a MultaTravaPlugin.CamposDePasso: filtro do step de Update da trava e colunas da imagem "pre".
const string CamposDePasso = "cr40f_status,cr40f_responsavel,cr40f_motivoempresa,cr40f_canalindicacao,cr40f_datadeavisoaocondutor,cr40f_datadeindicacao,cr40f_aceiteem,cr40f_pagaem,cr40f_acertoem,cr40f_encerradaem,cr40f_canceladaem,cr40f_valorpago,cr40f_competenciadesconto,cr40f_motivocancelamento";

var apis = new[]
{
    new Api("Cr40f.Frota.Plugin.FrotaPendenciasPlugin", "cr40f_FrotaPendencias", "Frota | Pendências",
        "Calcula as pendências proativas da frota (preventiva, reincidência, prioridade parada, custo, hodômetro). Somente leitura.", null,
        new[] { new Param("Hoje", TipoDateTime, "Data de referência. Ausente: data atual em Brasília.", true) },
        new[] { new Param("PendenciasJson", TipoString, "{hoje, total, pendencias:[{tipo,id,veiculoId,placa,titulo,detalhe,manutencaoId}]}") }),
    new Api("Cr40f.Frota.Plugin.PassoMultaPlugin", "cr40f_PassoMulta", "Multas | Passo",
        "Valida e grava um passo da multa (MultaEtapas). Roda como quem chama; a recusa diz o que fazer.", "prvWritecr40f_multas",
        new[]
        {
            new Param("MultaId", TipoGuid, "Id da multa (cr40f_multas)."),
            new Param("Passo", TipoString, "DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer ou ResultadoRecurso."),
            new Param("DadosJson", TipoString, "Dados do passo (JSON, ver DadosPasso).", true),
        },
        new[] { new Param("MultaJson", TipoString, "{etapa, pendentes, proximoPasso, proximoPrazo, prazoVencido, aguardandoPenalidade} depois do passo.") }),
    new Api("Cr40f.Frota.Plugin.MultasDoDiaPlugin", "cr40f_MultasDoDia", "Multas | Multas de hoje",
        "Seções do e-mail diário de multas (prazo vencido, indicar em 7 dias, aceite pendente, pagar com 40%, aguardando acerto). Somente leitura.", null,
        new[] { new Param("Hoje", TipoDateTime, "Data de referência. Ausente: data atual em Brasília.", true) },
        new[] { new Param("MultasJson", TipoString, "{hoje, total, prazoVencido, indicar, aceite, pagar, aguardandoAcerto}") }),
};

// A tarefa sincroniza em todo Update da multa que tenha tarefa (precisa reabrir tarefa concluída por fora): sem filtro de atributos,
// com imagem "pre" só de cr40f_status (o plugin usa o status anterior).
var steps = new[]
{
    new Step("Cr40f.Frota.Plugin.MultaTravaPlugin", "Cr40f.Frota: trava da multa (Create)", "Create", 20, 0, null, null),
    new Step("Cr40f.Frota.Plugin.MultaTravaPlugin", "Cr40f.Frota: trava da multa (Update)", "Update", 20, 0, CamposDePasso, CamposDePasso),
    new Step("Cr40f.Frota.Plugin.MultaTarefaPlugin", "Cr40f.Frota: tarefa da multa no Planner (Create)", "Create", 40, 1, null, null),
    new Step("Cr40f.Frota.Plugin.MultaTarefaPlugin", "Cr40f.Frota: tarefa da multa no Planner (Update)", "Update", 40, 1, null, "cr40f_status"),
};

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "frota.msalcache.bin");
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

if (testarPendencias || testarMultas)
{
    var (api, saida, valor) = testarMultas ? ("cr40f_MultasDoDia", "MultasJson", options.Optional("testar-multas")) : ("cr40f_FrotaPendencias", "PendenciasJson", options.Optional("testar"));
    var request = new OrganizationRequest(api);
    if (valor is not null) request["Hoje"] = DateTime.SpecifyKind(DateTime.ParseExact(valor, "yyyy-MM-dd", CultureInfo.InvariantCulture), DateTimeKind.Utc);
    Console.WriteLine(service.Execute(request)[saida]);
    return;
}

var assemblyInfo = AssemblyInfo.Read(dllPath);
if (assemblyInfo.PublicKeyToken.Length == 0) throw new InvalidOperationException("DLL sem assinatura forte.");
var assemblyId = UpsertAssembly(service, assemblyInfo, Convert.ToBase64String(File.ReadAllBytes(dllPath)));
EnsureSolutionComponent(service, assemblyId, solutionUniqueName, PluginAssemblyComponentType);
foreach (var api in apis)
{
    var privilegio = api.Privilegio is null ? null : NomePrivilegio(service, api.Privilegio);
    EnsureCustomApi(service, api, UpsertPluginType(service, assemblyId, api.TypeName), privilegio, solutionUniqueName);
}
foreach (var step in steps) EnsureStep(service, UpsertPluginType(service, assemblyId, step.TypeName), step, solutionUniqueName);

if (publish)
{
    Log("publicando customizacoes");
    service.Execute(new OrganizationRequest("PublishAllXml"));
}
Log("plugin da frota registrado (pendencias e multas)");

static void Log(string message) => Console.WriteLine($"[frota:plugin] {message}");
static EntityReference Ref(string logicalName, Guid id) => new(logicalName, id);

// O privilégio nasce com a tabela; o nome exato (cr40f_Multas) vem do Dataverse, que compara sem diferenciar maiúsculas.
static string NomePrivilegio(ServiceClient service, string nome)
{
    var query = new QueryExpression("privilege") { ColumnSet = new ColumnSet("name"), TopCount = 2 };
    query.Criteria.AddCondition("name", ConditionOperator.Equal, nome);
    var rows = service.RetrieveMultiple(query).Entities;
    if (rows.Count != 1) throw new InvalidOperationException($"Privilegio {nome} nao encontrado.");
    return rows[0].GetAttributeValue<string>("name");
}

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
    if (existing is not null) return existing.Id;
    Log($"criando tipo {typeName}");
    var shortName = typeName[(typeName.LastIndexOf('.') + 1)..];
    return service.Create(new Entity("plugintype") { ["name"] = shortName, ["friendlyname"] = shortName, ["typename"] = typeName, ["pluginassemblyid"] = Ref("pluginassembly", assemblyId) });
}

static void EnsureCustomApi(ServiceClient service, Api api, Guid pluginTypeId, string? privilegio, string solution)
{
    Guid customApiId;
    var existing = FindSingleOrNone(service, "customapi", ("uniquename", api.Nome));
    if (existing is not null)
    {
        Log($"reutilizando Custom API {api.Nome}");
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
                ["uniquename"] = api.Nome, ["name"] = api.Nome, ["displayname"] = api.Rotulo, ["description"] = api.Descricao,
                ["bindingtype"] = new OptionSetValue(0), ["isfunction"] = false, ["isprivate"] = false, ["executeprivilegename"] = privilegio,
                ["allowedcustomprocessingsteptype"] = new OptionSetValue(0), ["plugintypeid"] = Ref("plugintype", pluginTypeId),
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
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = p.Nome, ["name"] = $"{api.Nome}.{p.Nome}", ["displayname"] = p.Nome,
            ["description"] = p.Descricao, ["type"] = new OptionSetValue(p.Tipo), ["isoptional"] = p.Opcional, ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
    foreach (var p in api.Saidas)
    {
        if (ChildExists(service, "customapiresponseproperty", customApiId, p.Nome)) continue;
        Log($"criando resposta {api.Nome}.{p.Nome}");
        CreateInSolution(service, new Entity("customapiresponseproperty")
        {
            ["customapiid"] = Ref("customapi", customApiId), ["uniquename"] = p.Nome, ["name"] = $"{api.Nome}.{p.Nome}", ["displayname"] = p.Nome,
            ["description"] = p.Descricao, ["type"] = new OptionSetValue(p.Tipo), ["iscustomizable"] = new BooleanManagedProperty(false),
        }, solution);
    }
}

/// <summary>Step idempotente por nome; assíncrono (mode 1) apaga o job que deu certo e guarda o que falhou.</summary>
static void EnsureStep(ServiceClient service, Guid pluginTypeId, Step step, string solution)
{
    var dados = new Entity("sdkmessageprocessingstep")
    {
        ["stage"] = new OptionSetValue(step.Stage), ["mode"] = new OptionSetValue(step.Mode), ["rank"] = 1, ["filteringattributes"] = step.Filtro,
        ["eventhandler"] = Ref("plugintype", pluginTypeId), ["asyncautodelete"] = step.Mode == 1,
    };
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", step.Nome)) is { } existing)
    {
        stepId = existing.Id;
        dados.Id = stepId;
        service.Update(dados);
        Log($"step reconciliado: {step.Nome}");
    }
    else
    {
        var message = FindSingleOrNone(service, "sdkmessage", ("name", step.Mensagem)) ?? throw new InvalidOperationException($"sdkmessage {step.Mensagem} nao encontrada.");
        var filtro = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid"),
            Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, Multas) } },
        }).Entities.Single();
        dados["name"] = step.Nome;
        dados["supporteddeployment"] = new OptionSetValue(0);
        dados["sdkmessageid"] = Ref("sdkmessage", message.Id);
        dados["sdkmessagefilterid"] = Ref("sdkmessagefilter", filtro.Id);
        stepId = service.Create(dados);
        Log($"step criado: {step.Nome}");
    }
    EnsureSolutionComponent(service, stepId, solution, StepComponentType);
    if (step.Imagem is null) return;
    var imagem = new Entity("sdkmessageprocessingstepimage")
    {
        ["name"] = "pre", ["entityalias"] = "pre", ["imagetype"] = new OptionSetValue(0), ["messagepropertyname"] = "Target",
        ["attributes"] = step.Imagem, ["sdkmessageprocessingstepid"] = Ref("sdkmessageprocessingstep", stepId),
    };
    if (FindSingleOrNone(service, "sdkmessageprocessingstepimage", ("sdkmessageprocessingstepid", stepId), ("entityalias", "pre")) is { } atual)
    {
        imagem.Id = atual.Id;
        service.Update(imagem);
    }
    else service.Create(imagem);
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

internal sealed record Param(string Nome, int Tipo, string Descricao, bool Opcional = false);
internal sealed record Api(string TypeName, string Nome, string Rotulo, string Descricao, string? Privilegio, Param[] Entradas, Param[] Saidas);
internal sealed record Step(string TypeName, string Nome, string Mensagem, int Stage, int Mode, string? Filtro, string? Imagem);

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
