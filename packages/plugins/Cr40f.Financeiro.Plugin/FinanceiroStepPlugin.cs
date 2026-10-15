using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

/// <summary>PostOperation Update de cr40f_pagantes e cr40f_financeiro (filtro cr40f_status). Chama o motor em modo aplicar.</summary>
public sealed class FinanceiroStepPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

        // Anti-loop: updates disparados pelo próprio motor (Depth > 1 com a flag) não reentram.
        if (context.Depth > 1 && (context.SharedVariables.Contains(SincronizarFinanceiroPlugin.SharedFlag) || context.ParentContext?.SharedVariables.Contains(SincronizarFinanceiroPlugin.SharedFlag) == true)) return;
        if (context.MessageName != "Update") return;
        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not Entity target) return;

        try
        {
            Guid? opId = null;
            if (target.LogicalName == Codigos.Op)
            {
                // Ruling 14/10: em OP só o cancelamento propaga (desvincular reservas). Outros status da OP são derivados dos pagantes;
                // marcação manual de OP continua sendo tratada pelo flow "Flow Dar Baixa Status OP -> Pagantes" (assíncrono), que então aciona o step de Pagante.
                var novo = target.GetAttributeValue<OptionSetValue>(Codigos.OpStatus)?.Value;
                if (novo != Codigos.OpCancelada) return;
                opId = target.Id;
            }
            if (target.LogicalName == Codigos.Pagante)
            {
                var service0 = factory.CreateOrganizationService(null);
                var pagante = service0.Retrieve(Codigos.Pagante, target.Id, new ColumnSet(Codigos.PaganteOpLookup));
                opId = pagante.GetAttributeValue<EntityReference>(Codigos.PaganteOpLookup)?.Id;
            }
            if (opId is null) return;

            context.SharedVariables[SincronizarFinanceiroPlugin.SharedFlag] = true;
            var service = factory.CreateOrganizationService(null);
            SincronizarFinanceiroPlugin.Executar(service, tracing, opId.Value, new SincronizarRequest { Modo = "aplicar", Origem = "automatico" }, context.InitiatingUserId);
        }
        catch (Exception error)
        {
            tracing.Trace("Cr40f.Financeiro step: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível sincronizar o financeiro. " + error.Message, error);
        }
    }
}
