using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Documentos.Plugin;

/// <summary>Custom API global cr40f_DocumentosResumoSemanal: só leitura, no contexto de quem chama (o dono da conexão do flow).</summary>
public sealed class DocumentosResumoPlugin : IPlugin
{
    public const string Mensagem = "cr40f_DocumentosResumoSemanal";
    public const string ParametroHoje = "Hoje";
    public const string SaidaResumo = "ResumoJson";
    private const string FusoBrasilia = "E. South America Standard Time";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo resumo de documentos.");
            var service = factory.CreateOrganizationService(context.UserId);
            var entrada = context.InputParameters.Contains(ParametroHoje) ? context.InputParameters[ParametroHoje] : null;
            var hoje = ResolverHoje(entrada, DateTime.UtcNow);
            context.OutputParameters[SaidaResumo] = Gerar(service, hoje);
            tracing.Trace("{0}: resumo de {1} gerado", Mensagem, hoje);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível montar o resumo de documentos. " + error.Message, error);
        }
    }

    public static string Gerar(IOrganizationService service, string hoje)
    {
        var dados = new DocumentosRepository(service).Carregar();
        return Json.Serializar(ResumoBuilder.Montar(dados.Tipos, dados.Donos, dados.Docs, hoje));
    }

    public static string ResolverHoje(object? entrada, DateTime utcAgora)
    {
        if (entrada is DateTime informado && informado != DateTime.MinValue)
            return informado.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        DateTime local;
        try
        {
            local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcAgora, DateTimeKind.Utc), TimeZoneInfo.FindSystemTimeZoneById(FusoBrasilia));
        }
        catch (TimeZoneNotFoundException)
        {
            local = utcAgora.AddHours(-3); // Brasília sem horário de verão desde 2019.
        }
        return local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
