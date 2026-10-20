using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>Custom API global cr40f_FrotaPendencias: só leitura, no contexto de quem chama (flow do e-mail semanal e Agente Frota).</summary>
public sealed class FrotaPendenciasPlugin : IPlugin
{
    public const string Mensagem = "cr40f_FrotaPendencias";
    public const string ParametroHoje = "Hoje";
    public const string SaidaPendencias = "PendenciasJson";
    private const string FusoBrasilia = "E. South America Standard Time";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelas pendências da frota.");
            var service = factory.CreateOrganizationService(context.UserId);
            var entrada = context.InputParameters.Contains(ParametroHoje) ? context.InputParameters[ParametroHoje] : null;
            var hoje = ResolverHoje(entrada, DateTime.UtcNow);
            context.OutputParameters[SaidaPendencias] = Gerar(service, hoje);
            tracing.Trace("{0}: pendências de {1} geradas", Mensagem, hoje);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível montar as pendências da frota. " + error.Message, error);
        }
    }

    public static string Gerar(IOrganizationService service, string hoje)
        => Json.Serializar(Regras.Avaliar(new FrotaRepository(service).Carregar(hoje), hoje, DateTime.UtcNow));

    public static string ResolverHoje(object? entrada, DateTime utcAgora)
        => ResolverHoje(entrada, utcAgora, () => TimeZoneInfo.FindSystemTimeZoneById(FusoBrasilia));

    public static string ResolverHoje(object? entrada, DateTime utcAgora, Func<TimeZoneInfo> fuso)
    {
        if (entrada is DateTime informado && informado != DateTime.MinValue)
            return informado.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        DateTime local;
        try
        {
            local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcAgora, DateTimeKind.Utc), fuso());
        }
        catch (Exception) // No sandbox do Dataverse o fuso pode lançar SecurityException ou InvalidTimeZoneException.
        {
            local = utcAgora.AddHours(-3); // Brasília sem horário de verão desde 2019.
        }
        return local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
