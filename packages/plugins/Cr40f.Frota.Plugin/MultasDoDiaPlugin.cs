using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>Custom API global cr40f_MultasDoDia (spec §5.5): só leitura, no contexto de quem chama (flow "Multas | Multas de hoje").
/// Cobre todas as multas abertas, inclusive as antigas que não têm tarefa.</summary>
public sealed class MultasDoDiaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_MultasDoDia";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelas multas do dia.");
            var entrada = context.InputParameters.Contains("Hoje") ? context.InputParameters["Hoje"] : null;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(entrada, DateTime.UtcNow);
            context.OutputParameters["MultasJson"] = Gerar(factory.CreateOrganizationService(context.UserId), hoje);
            tracing.Trace("{0}: multas de {1} geradas", Mensagem, hoje);
        }
        catch (Exception error)
        {
            tracing.Trace("{0}: {1}", Mensagem, error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível montar as multas do dia. " + error.Message, error);
        }
    }

    public static string Gerar(IOrganizationService service, string hoje) => Json.Serializar(MultasDoDia.Montar(new MultaRepository(service).Abertas(), hoje));
}
