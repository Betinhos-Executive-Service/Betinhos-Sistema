using System;
using System.Net;
using System.Net.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Projetos.Plugin;

/// <summary>
/// Step assíncrono pós-operação no Create de annotation: anexo de áudio (mimetype audio/*) numa cr40f_projetoatualizacao
/// é transcrito pela Groq e o texto vai para cr40f_projetoatualizacao.cr40f_transcricao. Nunca lança exceção: é async e
/// não há o que reverter; falha vira mensagem curta no campo. O filtro por tabela e mimetype fica aqui, porque o step de
/// annotation não filtra por objecttypecode.
/// </summary>
public sealed class TranscreverAudioPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != "Create" || !context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity alvo) || alvo.LogicalName != "annotation") return;
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        // Serviço do sistema: lê a chave em cr40f_segredo (segurança de coluna) e grava a transcrição sem depender do papel de quem anexou.
        new Transcricao(factory.CreateOrganizationService(null), tracing).Executar(alvo);
    }
}

public sealed class Transcricao
{
    public const string Tabela = "cr40f_projetoatualizacao";
    public const string Campo = "cr40f_transcricao";
    public const string Segredo = "groq.transcricao";
    // Limite de upload da Groq (o mesmo do WhatsApp Inbox).
    public const long MaxBytes = 25L * 1024 * 1024;
    // Igual ao cr40f_texto da atualização (memo de 20000).
    public const int MaxTexto = 20000;
    public const string MsgGrande = "Áudio grande demais para transcrever (limite de 25 MB).";
    public const string MsgVazio = "Áudio sem conteúdo para transcrever.";

    private readonly IOrganizationService _sistema;
    private readonly ITracingService _tracing;
    private readonly HttpMessageHandler? _handler;

    public Transcricao(IOrganizationService sistema, ITracingService tracing, HttpMessageHandler? handler = null)
    {
        _sistema = sistema;
        _tracing = tracing;
        _handler = handler;
    }

    public void Executar(Entity anexo)
    {
        // objectid traz a tabela; objecttypecode cobre o caso em que a referência chega sem LogicalName.
        if (!(anexo.GetAttributeValue<EntityReference>("objectid") is { } dono)) return;
        var tabela = string.IsNullOrEmpty(dono.LogicalName) ? anexo.GetAttributeValue<string>("objecttypecode") : dono.LogicalName;
        if (tabela != Tabela) return;
        var mime = MimeBase(anexo);
        if (!mime.StartsWith("audio/", StringComparison.Ordinal)) return;
        try
        {
            var corpo = anexo.GetAttributeValue<string>("documentbody");
            if (corpo == null)
                corpo = _sistema.Retrieve("annotation", anexo.Id, new ColumnSet("documentbody")).GetAttributeValue<string>("documentbody");
            if (string.IsNullOrEmpty(corpo)) { Gravar(dono.Id, MsgVazio); return; }
            // Tamanho pelo base64 antes de decodificar: não carrega na memória um arquivo que a Groq recusaria.
            if (corpo.Length / 4L * 3 > MaxBytes) { _tracing.Trace("Transcrição: anexo {0} acima de 25 MB", anexo.Id); Gravar(dono.Id, MsgGrande); return; }
            var audio = Convert.FromBase64String(corpo);
            if (audio.Length > MaxBytes) { Gravar(dono.Id, MsgGrande); return; }

            var chave = SecretReader.ReadTable(_sistema, Segredo, _tracing);
            if (chave == null) { _tracing.Trace("Transcrição: sem chave ({0}); anexo {1} ficou sem texto", Segredo, anexo.Id); return; }

            var resultado = GroqClient.Transcrever(audio, mime, chave, _handler);
            _tracing.Trace("Transcrição: anexo {0} → {1}", anexo.Id, resultado.Ok ? $"{resultado.Texto.Length} caracteres" : resultado.Texto);
            Gravar(dono.Id, resultado.Ok && resultado.Texto.Length == 0 ? "Áudio sem fala reconhecida." : resultado.Texto);
        }
        catch (Exception erro)
        {
            // Nunca rastreia a chave: só o tipo e a mensagem do erro.
            _tracing.Trace("Transcrição: anexo {0} falhou ({1}: {2})", anexo.Id, erro.GetType().Name, erro.Message);
            try { Gravar(dono.Id, "Não foi possível transcrever o áudio agora."); }
            catch (Exception gravar) { _tracing.Trace("Transcrição: não gravou a mensagem de erro ({0})", gravar.GetType().Name); }
        }
    }

    private static string MimeBase(Entity anexo) =>
        (anexo.GetAttributeValue<string>("mimetype") ?? "").Split(';')[0].Trim().ToLowerInvariant();

    // Mais de um áudio na mesma atualização: os textos se somam, um parágrafo por áudio.
    private void Gravar(Guid atualizacaoId, string texto)
    {
        var atual = _sistema.Retrieve(Tabela, atualizacaoId, new ColumnSet(Campo)).GetAttributeValue<string>(Campo);
        var final = string.IsNullOrWhiteSpace(atual) ? texto : atual + "\n\n" + texto;
        if (final.Length > MaxTexto) final = final.Substring(0, MaxTexto);
        _sistema.Update(new Entity(Tabela, atualizacaoId) { [Campo] = final });
    }
}
