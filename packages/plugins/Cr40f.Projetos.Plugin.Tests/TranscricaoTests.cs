using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Cr40f.Projetos.Plugin.Tests;

public sealed class TranscricaoTests
{
    private const string Chave = "gsk_teste_nao_real";
    private static readonly Guid AtualizacaoId = Guid.NewGuid();

    [Fact]
    public void Anexo_que_nao_e_audio_e_ignorado()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        new Transcricao(sistema, trace, http).Executar(Anexo("image/png"));
        Assert.Empty(http.Pedidos);
        Assert.Empty(sistema.Atualizados);
    }

    [Fact]
    public void Audio_de_outra_tabela_e_ignorado()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm", tabela: "cr40f_funcionarios"));
        Assert.Empty(http.Pedidos);
        Assert.Empty(sistema.Atualizados);
    }

    [Fact]
    public void Sem_chave_registra_no_trace_e_nao_grava()
    {
        var (sistema, http, trace) = Cenario(comChave: false);
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm"));
        Assert.Empty(http.Pedidos);
        Assert.Empty(sistema.Atualizados);
        Assert.Contains(trace.Linhas, l => l.Contains("sem chave"));
    }

    [Fact]
    public void Sucesso_grava_o_texto_e_manda_o_multipart_da_groq()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Resposta = (HttpStatusCode.OK, "{\"text\":\" Bom dia, segue o briefing. \"}");
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm;codecs=opus"));

        Assert.Equal("Bom dia, segue o briefing.", Transcrito(sistema));
        var pedido = Assert.Single(http.Pedidos);
        Assert.Equal(GroqClient.Endpoint, pedido.Url);
        Assert.Equal("Bearer " + Chave, pedido.Autorizacao);
        Assert.Contains("name=model", pedido.Corpo);
        Assert.Contains("whisper-large-v3-turbo", pedido.Corpo);
        Assert.Contains("name=language", pedido.Corpo);
        Assert.Contains("filename=audio.webm", pedido.Corpo);
        Assert.DoesNotContain(trace.Linhas, l => l.Contains(Chave));
    }

    [Fact]
    public void Segundo_audio_soma_ao_texto_existente()
    {
        var (sistema, http, trace) = Cenario(comChave: true, transcricaoAtual: "Primeiro áudio.");
        http.Resposta = (HttpStatusCode.OK, "{\"text\":\"Segundo áudio.\"}");
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/ogg"));
        Assert.Equal("Primeiro áudio.\n\nSegundo áudio.", Transcrito(sistema));
    }

    [Fact]
    public void Corpo_ausente_no_target_e_lido_do_anexo()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Resposta = (HttpStatusCode.OK, "{\"text\":\"ok\"}");
        var anexo = Anexo("audio/mpeg");
        sistema.Linhas[("annotation", anexo.Id)] = new Entity("annotation", anexo.Id) { ["documentbody"] = anexo["documentbody"] };
        anexo.Attributes.Remove("documentbody");
        new Transcricao(sistema, trace, http).Executar(anexo);
        Assert.Equal("ok", Transcrito(sistema));
        Assert.Contains("filename=audio.mp3", http.Pedidos.Single().Corpo);
    }

    [Fact]
    public void Erro_http_grava_mensagem_curta_sem_lancar()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Resposta = (HttpStatusCode.BadRequest, "{\"error\":{\"message\":\"file must be one of the supported formats\"}}");
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm"));
        Assert.Equal("A Groq não transcreveu o áudio (400: file must be one of the supported formats).", Transcrito(sistema));
    }

    [Fact]
    public void Chave_invalida_grava_aviso_sem_a_chave()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Resposta = (HttpStatusCode.Unauthorized, "{\"error\":{\"message\":\"Invalid API Key\"}}");
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm"));
        Assert.Contains("groq.transcricao", Transcrito(sistema));
        Assert.DoesNotContain(Chave, Transcrito(sistema));
    }

    [Fact]
    public void Falha_de_rede_grava_mensagem_sem_lancar()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Falha = new HttpRequestException("rede caiu");
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm"));
        Assert.Equal("Não foi possível falar com a Groq para transcrever o áudio.", Transcrito(sistema));
    }

    [Fact]
    public void Timeout_grava_mensagem_sem_lancar()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        http.Falha = new TaskCanceledException();
        new Transcricao(sistema, trace, http).Executar(Anexo("audio/webm"));
        Assert.Equal("A Groq demorou demais para transcrever o áudio.", Transcrito(sistema));
    }

    [Fact]
    public void Audio_grande_demais_nao_chama_a_groq()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        var anexo = Anexo("audio/webm");
        anexo["documentbody"] = new string('A', (int)(Transcricao.MaxBytes / 3 * 4) + 8);
        new Transcricao(sistema, trace, http).Executar(anexo);
        Assert.Empty(http.Pedidos);
        Assert.Equal(Transcricao.MsgGrande, Transcrito(sistema));
    }

    [Fact]
    public void Erro_inesperado_grava_mensagem_generica_sem_lancar()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        var anexo = Anexo("audio/webm");
        anexo["documentbody"] = "isto não é base64!";
        new Transcricao(sistema, trace, http).Executar(anexo);
        Assert.Equal("Não foi possível transcrever o áudio agora.", Transcrito(sistema));
    }

    [Fact]
    public void Plugin_ignora_mensagem_que_nao_e_create()
    {
        var (sistema, http, trace) = Cenario(comChave: true);
        var provider = new Provider(sistema, trace, "Update", Anexo("audio/webm"));
        new TranscreverAudioPlugin().Execute(provider);
        Assert.Empty(sistema.Atualizados);
    }

    private static (FakeService, FakeHttp, FakeTrace) Cenario(bool comChave, string? transcricaoAtual = null)
    {
        var sistema = new FakeService();
        if (comChave) sistema.Segredos[Transcricao.Segredo] = Chave;
        sistema.Linhas[(Transcricao.Tabela, AtualizacaoId)] = new Entity(Transcricao.Tabela, AtualizacaoId) { [Transcricao.Campo] = transcricaoAtual };
        return (sistema, new FakeHttp(), new FakeTrace());
    }

    private static Entity Anexo(string mime, string tabela = Transcricao.Tabela) => new("annotation", Guid.NewGuid())
    {
        ["objectid"] = new EntityReference(tabela, AtualizacaoId),
        ["mimetype"] = mime,
        ["documentbody"] = Convert.ToBase64String(Encoding.UTF8.GetBytes("áudio de teste")),
    };

    private static string? Transcrito(FakeService s) => s.Linhas[(Transcricao.Tabela, AtualizacaoId)].GetAttributeValue<string>(Transcricao.Campo);
}

public sealed class FakeTrace : ITracingService
{
    public List<string> Linhas { get; } = new();
    public void Trace(string format, params object[] args) => Linhas.Add(string.Format(format, args));
}

public sealed class FakeHttp : HttpMessageHandler
{
    public sealed class Pedido
    {
        public Pedido(string url, string? autorizacao, string corpo) { Url = url; Autorizacao = autorizacao; Corpo = corpo; }
        public string Url { get; }
        public string? Autorizacao { get; }
        public string Corpo { get; }
    }
    public List<Pedido> Pedidos { get; } = new();
    public (HttpStatusCode Status, string Json) Resposta { get; set; } = (HttpStatusCode.OK, "{\"text\":\"\"}");
    public Exception? Falha { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var corpo = request.Content == null ? "" : await request.Content.ReadAsStringAsync();
        Pedidos.Add(new Pedido(request.RequestUri!.ToString(), request.Headers.Authorization?.ToString(), corpo));
        if (Falha != null) throw Falha;
        return new HttpResponseMessage(Resposta.Status) { Content = new StringContent(Resposta.Json, Encoding.UTF8, "application/json") };
    }
}

/// <summary>Linhas por (tabela, id) e a tabela cr40f_segredo por nome.</summary>
public sealed class FakeService : IOrganizationService
{
    public Dictionary<(string, Guid), Entity> Linhas { get; } = new();
    public Dictionary<string, string> Segredos { get; } = new();
    public List<Entity> Atualizados { get; } = new();

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        var linha = Linhas[(entityName, id)];
        var copia = new Entity(entityName, id);
        foreach (var kv in linha.Attributes) copia[kv.Key] = kv.Value;
        return copia;
    }

    public void Update(Entity entity)
    {
        Atualizados.Add(entity);
        var alvo = Linhas[(entity.LogicalName, entity.Id)];
        foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value;
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        if (q.EntityName != SecretReader.Table) throw new NotSupportedException(q.EntityName);
        var nome = (string)q.Criteria.Conditions.Single(c => c.AttributeName == SecretReader.NameColumn).Values[0];
        var linhas = Segredos.TryGetValue(nome, out var valor)
            ? new List<Entity> { new(SecretReader.Table, Guid.NewGuid()) { [SecretReader.ValueColumn] = valor } }
            : new List<Entity>();
        return new EntityCollection(linhas);
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}

public sealed class Provider : IServiceProvider, IOrganizationServiceFactory
{
    private readonly IOrganizationService _servico;
    private readonly ITracingService _trace;
    private readonly IPluginExecutionContext _contexto;

    public Provider(IOrganizationService servico, ITracingService trace, string mensagem, Entity alvo)
    {
        _servico = servico;
        _trace = trace;
        _contexto = new Contexto(mensagem, alvo);
    }

    public object? GetService(Type serviceType) =>
        serviceType == typeof(IPluginExecutionContext) ? _contexto
        : serviceType == typeof(ITracingService) ? _trace
        : serviceType == typeof(IOrganizationServiceFactory) ? this
        : null;

    public IOrganizationService CreateOrganizationService(Guid? userId) => _servico;

    private sealed class Contexto : IPluginExecutionContext
    {
        public Contexto(string mensagem, Entity alvo) { MessageName = mensagem; InputParameters = new ParameterCollection { ["Target"] = alvo }; }
        public string MessageName { get; }
        public ParameterCollection InputParameters { get; }
        public int Stage => 40;
        public IPluginExecutionContext? ParentContext => null;
        public int Mode => 1;
        public int IsolationMode => 2;
        public int Depth => 1;
        public string PrimaryEntityName => "annotation";
        public Guid? RequestId => null;
        public string? SecondaryEntityName => null;
        public ParameterCollection OutputParameters { get; } = new();
        public ParameterCollection SharedVariables { get; } = new();
        public Guid UserId => Guid.Empty;
        public Guid InitiatingUserId => Guid.Empty;
        public Guid BusinessUnitId => Guid.Empty;
        public Guid OrganizationId => Guid.Empty;
        public string? OrganizationName => null;
        public Guid PrimaryEntityId => Guid.Empty;
        public EntityImageCollection PreEntityImages { get; } = new();
        public EntityImageCollection PostEntityImages { get; } = new();
        public EntityReference? OwningExtension => null;
        public Guid CorrelationId => Guid.Empty;
        public bool IsExecutingOffline => false;
        public bool IsOfflinePlayback => false;
        public bool IsInTransaction => false;
        public Guid OperationId => Guid.Empty;
        public DateTime OperationCreatedOn => DateTime.UtcNow;
    }
}
