using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// Registra o plugin de acesso de motoristas, as Custom APIs (sem plugintype) e os steps
// sincronos PostOperation (stage 40; o Dataverse nao aceita step customizado no stage 30 de Custom API) que carregam a configuracao nao segura. A configuracao segura e gravada por outro script.
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
const string TipoReativar = "Cr40f.Acesso.Plugin.ReativarAcessoMotoristaPlugin";
const string ApiReativar = "cr40f_ReativarAcessoMotorista";
// Configuracao do App Motoristas (fase A): 4 Custom APIs sem configuracao no step (nao usam Entra nem segredo).
const string TipoAppConfigEfetiva = "Cr40f.Acesso.Plugin.AppConfigEfetivaPlugin";
const string TipoAppConfigRascunho = "Cr40f.Acesso.Plugin.AppConfigSalvarRascunhoPlugin";
const string TipoAppConfigPublicar = "Cr40f.Acesso.Plugin.AppConfigPublicarPlugin";
const string TipoAppConfigPessoa = "Cr40f.Acesso.Plugin.AppConfigDefinirPessoaPlugin";
const string ApiAppConfigEfetiva = "cr40f_AppConfigEfetiva";
const string ApiAppConfigRascunho = "cr40f_AppConfigSalvarRascunho";
const string ApiAppConfigPublicar = "cr40f_AppConfigPublicar";
const string ApiAppConfigPessoa = "cr40f_AppConfigDefinirPessoa";
// Recibo personalizado (fase B2): step sincrono PreOperation no Create de cr40f_recibos_v2, sem configuracao.
const string TipoReciboPersonalizado = "Cr40f.Acesso.Plugin.ReciboPersonalizadoPlugin";
const string StepReciboPersonalizado = "Cr40f.Acesso: recibo personalizado (Create cr40f_recibos_v2)";
// Bloqueio generico dos modulos desligados no App (ideias e treinamentos): um tipo, dois steps sincronos PreOperation, sem configuracao.
// O Update da participacao so dispara pelas colunas que o motorista grava (o push e o lembrete do flow nao passam por aqui).
const string TipoAppConfigBloqueio = "Cr40f.Acesso.Plugin.AppConfigBloqueioPlugin";
const string StepBloqueioIdeias = "Cr40f.Acesso: bloqueio ideias (Create cr40f_boasideias)";
const string StepBloqueioTreinamentos = "Cr40f.Acesso: bloqueio treinamentos (Update cr40f_treinamentoparticipacao)";
const string ColunasBloqueioTreinamentos = "cr40f_abertoem,cr40f_confirmadoem,cr40f_assinadoem,cr40f_nomeassinante,cr40f_assinaturajson,cr40f_nota,cr40f_aprovado,cr40f_tentativas,cr40f_respostasjson,cr40f_concluidoem,cr40f_conteudosnapshot,cr40f_conteudohash";
const int PluginAssemblyComponentType = 91;

Log("autenticando no Dataverse");
var tokenCacheDirectory = Path.Combine(Path.GetTempPath(), "Betinhos", "Dataverse");
Directory.CreateDirectory(tokenCacheDirectory);
var tokenCachePath = Path.Combine(tokenCacheDirectory, "acesso.msalcache.bin");
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
var tipoCadastrar = UpsertPluginType(service, assemblyId, TipoCadastrar);
var tipoEncerrar = UpsertPluginType(service, assemblyId, TipoEncerrar);
var tipoReativar = UpsertPluginType(service, assemblyId, TipoReativar);
var tipoAppConfigEfetiva = UpsertPluginType(service, assemblyId, TipoAppConfigEfetiva);
var tipoAppConfigRascunho = UpsertPluginType(service, assemblyId, TipoAppConfigRascunho);
var tipoAppConfigPublicar = UpsertPluginType(service, assemblyId, TipoAppConfigPublicar);
var tipoAppConfigPessoa = UpsertPluginType(service, assemblyId, TipoAppConfigPessoa);
var tipoReciboPersonalizado = UpsertPluginType(service, assemblyId, TipoReciboPersonalizado);
var tipoAppConfigBloqueio = UpsertPluginType(service, assemblyId, TipoAppConfigBloqueio);

// Tipos de parametro/resposta (customapirequestparameter.type): 0 = Boolean, 7 = Integer, 10 = String, 12 = Guid (8 seria Money).
EnsureCustomApi(service, ApiCadastrar, "Acesso | Cadastrar acesso de motorista", "Cria conta Microsoft, licenca, grupo e funcionario; devolve credenciais e etapas.", solutionUniqueName,
    requestParams: new[] { ("NomeCompleto", 10, false), ("Celular", 10, false), ("EmailPessoal", 10, true), ("PrefixoEmail", 10, true), ("TipoVinculo", 7, true), ("FuncionarioId", 12, true), ("CriarNovo", 0, true), ("Cpf", 10, true) },
    responseProps: new[] { ("EmailMicrosoft", 10), ("SenhaTemporaria", 10), ("FuncionarioId", 10), ("UsuarioEntraId", 10), ("LinkApp", 10), ("Etapas", 10) });
EnsureCustomApi(service, ApiEncerrar, "Acesso | Encerrar acesso de motorista", "Remove grupo, licenca e conta no Entra; nao altera o cadastro do funcionario.", solutionUniqueName,
    requestParams: new[] { ("FuncionarioId", 12, false), ("Confirmacao", 10, false) },
    responseProps: new[] { ("Etapas", 10) });
EnsureCustomApi(service, ApiReativar, "Acesso | Reativar acesso de motorista", "Reativa a conta no Entra, redefine a senha e devolve licenca, grupo e usuario do Dataverse.", solutionUniqueName,
    requestParams: new[] { ("FuncionarioId", 12, false) },
    responseProps: new[] { ("EmailMicrosoft", 10), ("SenhaTemporaria", 10), ("LinkApp", 10), ("Etapas", 10) });
EnsureCustomApi(service, ApiAppConfigEfetiva, "Configuracao do App | Efetiva", "Configuracao efetiva do App Motoristas (modulos e funcoes ligados) de um motorista.", solutionUniqueName,
    requestParams: new[] { ("Funcionario", 12, true) },
    responseProps: new[] { ("Resultado", 10) });
EnsureCustomApi(service, ApiAppConfigRascunho, "Configuracao do App | Salvar rascunho", "Grava ou descarta o rascunho da matriz de modulos e funcoes do App Motoristas.", solutionUniqueName,
    requestParams: new[] { ("Conteudo", 10, true), ("Base", 10, true), ("Descartar", 0, true) },
    responseProps: new[] { ("Marca", 10) });
EnsureCustomApi(service, ApiAppConfigPublicar, "Configuracao do App | Publicar", "Publica o rascunho como a versao seguinte da configuracao do App Motoristas.", solutionUniqueName,
    requestParams: new[] { ("Nota", 10, true) },
    responseProps: new[] { ("Numero", 7) });
EnsureCustomApi(service, ApiAppConfigPessoa, "Configuracao do App | Definir pessoa", "Cria ou encerra a excecao de um motorista a uma chave da configuracao, ou a entrada dele no grupo piloto.", solutionUniqueName,
    requestParams: new[] { ("Funcionario", 12, false), ("Tipo", 10, false), ("Chave", 10, true), ("Ligado", 0, true), ("Motivo", 10, true), ("Validade", 10, true), ("Encerrar", 0, true) },
    responseProps: new[] { ("Resultado", 10) });
EnsureApiStep(service, tipoCadastrar, ApiCadastrar, "Cr40f.Acesso: cadastrar acesso", config, solutionUniqueName);
EnsureApiStep(service, tipoEncerrar, ApiEncerrar, "Cr40f.Acesso: encerrar acesso", config, solutionUniqueName);
EnsureApiStep(service, tipoReativar, ApiReativar, "Cr40f.Acesso: reativar acesso", config, solutionUniqueName);
EnsureApiStep(service, tipoAppConfigEfetiva, ApiAppConfigEfetiva, "Cr40f.Acesso: configuracao do App efetiva", "", solutionUniqueName);
EnsureApiStep(service, tipoAppConfigRascunho, ApiAppConfigRascunho, "Cr40f.Acesso: configuracao do App salvar rascunho", "", solutionUniqueName);
EnsureApiStep(service, tipoAppConfigPublicar, ApiAppConfigPublicar, "Cr40f.Acesso: configuracao do App publicar", "", solutionUniqueName);
EnsureApiStep(service, tipoAppConfigPessoa, ApiAppConfigPessoa, "Cr40f.Acesso: configuracao do App definir pessoa", "", solutionUniqueName);
EnsureEntityStep(service, tipoReciboPersonalizado, "Create", "cr40f_recibos_v2", StepReciboPersonalizado, solutionUniqueName);
EnsureEntityStep(service, tipoAppConfigBloqueio, "Create", "cr40f_boasideias", StepBloqueioIdeias, solutionUniqueName);
EnsureEntityStep(service, tipoAppConfigBloqueio, "Update", "cr40f_treinamentoparticipacao", StepBloqueioTreinamentos, solutionUniqueName, ColunasBloqueioTreinamentos);

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
        service.Update(new Entity("pluginassembly", existing.Id) { ["description"] = CommitPublicado(), ["content"] = content, ["version"] = info.Version });
        return existing.Id;
    }
    Log($"criando assembly {info.Name}");
    return service.Create(new Entity("pluginassembly")
    {
        ["description"] = CommitPublicado(),
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
        service.Update(new Entity("sdkmessageprocessingstep", existing.Id) { ["configuration"] = config, ["stage"] = new OptionSetValue(40), ["mode"] = new OptionSetValue(0), ["eventhandler"] = Ref("plugintype", pluginTypeId) });
        EnsureSolutionComponent(service, existing.Id, solution, 92);
        Log($"step reconciliado: {name}");
        return;
    }
    var stepId = service.Create(new Entity("sdkmessageprocessingstep")
    {
        ["name"] = name, ["mode"] = new OptionSetValue(0), ["stage"] = new OptionSetValue(40), ["rank"] = 1, ["supporteddeployment"] = new OptionSetValue(0),
        ["sdkmessageid"] = Ref("sdkmessage", message.Id), ["eventhandler"] = Ref("plugintype", pluginTypeId), ["configuration"] = config, ["asyncautodelete"] = false,
    });
    EnsureSolutionComponent(service, stepId, solution, 92);
    Log($"step criado: {name}");
}

/// <summary>Step sincrono PreOperation (stage 20) idempotente por nome numa mensagem de tabela (ex.: Create). filteringAttributes (Update) limita as colunas que disparam o step.</summary>
static void EnsureEntityStep(ServiceClient service, Guid pluginTypeId, string messageName, string entidade, string name, string solution, string? filteringAttributes = null)
{
    var dados = new Entity("sdkmessageprocessingstep")
    {
        ["stage"] = new OptionSetValue(20), ["mode"] = new OptionSetValue(0), ["rank"] = 1, ["eventhandler"] = Ref("plugintype", pluginTypeId),
    };
    if (filteringAttributes is not null) dados["filteringattributes"] = filteringAttributes;
    Guid stepId;
    if (FindSingleOrNone(service, "sdkmessageprocessingstep", ("name", name)) is { } existing)
    {
        stepId = existing.Id;
        dados.Id = stepId;
        service.Update(dados);
        Log($"step reconciliado: {name}");
    }
    else
    {
        var message = FindSingleOrNone(service, "sdkmessage", ("name", messageName)) ?? throw new InvalidOperationException($"sdkmessage {messageName} nao encontrada.");
        var filtro = service.RetrieveMultiple(new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet("sdkmessagefilterid"),
            Criteria = { Conditions = { new ConditionExpression("sdkmessageid", ConditionOperator.Equal, message.Id), new ConditionExpression("primaryobjecttypecode", ConditionOperator.Equal, entidade) } },
        }).Entities.Single();
        dados["name"] = name;
        dados["supporteddeployment"] = new OptionSetValue(0);
        dados["sdkmessageid"] = Ref("sdkmessage", message.Id);
        dados["sdkmessagefilterid"] = Ref("sdkmessagefilter", filtro.Id);
        dados["asyncautodelete"] = false;
        stepId = service.Create(dados);
        Log($"step criado: {name}");
    }
    EnsureSolutionComponent(service, stepId, solution, 92);
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
