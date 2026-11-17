using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Post-operation ASSÍNCRONO em Create e Update de cr40f_multas (decisão do plano, spec §11): a multa já está gravada quando roda,
/// então uma falha do Planner nunca a bloqueia. A falha vai para o trace e o job fica com erro em "Trabalhos do sistema";
/// o próximo Update da multa tenta de novo. Grava com o serviço do sistema.
/// </summary>
public sealed class MultaTarefaPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var system = factory.CreateOrganizationService(null);
        try
        {
            var pre = context.PreEntityImages.Contains("pre") ? context.PreEntityImages["pre"] : null;
            var anterior = pre?.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value;
            var hoje = FrotaPendenciasPlugin.ResolverHoje(null, DateTime.UtcNow);
            new MultaTarefa(system, hoje, Variaveis.Ler(system, "new_URLSistemaBetinhos")).Sincronizar(context.PrimaryEntityId, context.MessageName == "Create", anterior);
        }
        catch (Exception error)
        {
            tracing.Trace("MultaTarefa {0} {1}: {2}", context.MessageName, context.PrimaryEntityId, error);
            throw new InvalidPluginExecutionException("Não foi possível sincronizar a tarefa da multa no Planner. " + error.Message, error);
        }
    }
}
