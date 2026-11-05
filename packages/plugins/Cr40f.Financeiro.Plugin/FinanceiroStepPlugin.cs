using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

/// <summary>
/// PostOperation Update de cr40f_pagantes e cr40f_financeiro (filtro cr40f_status) e de cr40f_composicaodeprecos (filtro new_status).
/// Substitui os flows legados de integração OP/CP/Geral (desligados em 05/11/2026).
/// </summary>
public sealed class FinanceiroStepPlugin : IPlugin
{
    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

        // Anti-loop: updates disparados pelo próprio motor (Depth > 1 com a flag) não reentram. A flag pode estar
        // vários níveis acima (ex.: baixa manual da OP → update do pagante), então a cadeia inteira é verificada.
        if (context.Depth > 1 && DentroDaSincronizacao(context)) return;
        if (context.MessageName != "Update") return;
        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not Entity target) return;

        try
        {
            if (target.LogicalName == Codigos.Composicao)
            {
                SincronizarComposicao(factory.CreateOrganizationService(null), tracing, context, target);
                return;
            }

            Guid? opId = null;
            var baixaManual = false;
            if (target.LogicalName == Codigos.Op)
            {
                // Cancelamento desvincula as reservas; Paga marcada à mão dá baixa em pagantes, reservas e composições.
                // Os demais status da OP são derivados dos pagantes.
                var novo = target.GetAttributeValue<OptionSetValue>(Codigos.OpStatus)?.Value;
                if (novo != Codigos.OpCancelada && novo != Codigos.OpPaga) return;
                opId = target.Id;
                baixaManual = novo == Codigos.OpPaga;
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
            if (baixaManual)
            {
                var mudancas = SyncEngine.ComputeBaixaManual(SnapshotLoader.Load(service, opId.Value));
                tracing.Trace("Cr40f.Financeiro baixa manual op={0} mudancas={1}", opId, mudancas.Count);
                MudancaApplier.Apply(service, opId.Value, mudancas, "automatico", context.InitiatingUserId);
                return;
            }
            SincronizarFinanceiroPlugin.Executar(service, tracing, opId.Value, new SincronizarRequest { Modo = "aplicar", Origem = "automatico" }, context.InitiatingUserId);
        }
        catch (Exception error)
        {
            tracing.Trace("Cr40f.Financeiro step: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível sincronizar o financeiro. " + error.Message, error);
        }
    }

    public static bool DentroDaSincronizacao(IPluginExecutionContext? context)
    {
        for (var c = context; c is not null; c = c.ParentContext)
            if (c.SharedVariables.Contains(SincronizarFinanceiroPlugin.SharedFlag)) return true;
        return false;
    }

    /// <summary>Composição concluída/reaberta → status de faturamento das reservas ligadas a ela (ver <see cref="ComposicaoFaturamento"/>).</summary>
    private static void SincronizarComposicao(IOrganizationService service, ITracingService tracing, IPluginExecutionContext context, Entity target)
    {
        var cpStatus = target.GetAttributeValue<OptionSetValue>(Codigos.CpStatus)?.Value;
        if (cpStatus is null) return;
        var reservas = service.RetrieveMultiple(new QueryExpression(Codigos.Reserva)
        {
            ColumnSet = new ColumnSet(Codigos.ReservaFatStatus, Codigos.ReservaOpLookup),
            Criteria = { Conditions = { new ConditionExpression(Codigos.ReservaCpLookup, ConditionOperator.Equal, target.Id) } },
        }).Entities;
        context.SharedVariables[SincronizarFinanceiroPlugin.SharedFlag] = true;
        foreach (var r in reservas)
        {
            var de = r.GetAttributeValue<OptionSetValue>(Codigos.ReservaFatStatus)?.Value;
            if (ComposicaoFaturamento.Novo(cpStatus, de) is not { } para) continue;
            service.Update(new Entity(Codigos.Reserva, r.Id) { [Codigos.ReservaFatStatus] = new OptionSetValue(para) });
            tracing.Trace("Cr40f.Financeiro CP {0} → reserva {1}: {2} → {3}", target.Id, r.Id, de, para);
            if (r.GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup)?.Id is { } opId)
                LogWriter.Write(service, opId, r.Id, Codigos.Reserva, Codigos.ReservaFatStatus, de?.ToString(), para.ToString(),
                    cpStatus == Codigos.CpConcluida ? "Composição concluída." : "Composição reaberta.", MudancaApplier.OrigemAutomatico, context.InitiatingUserId);
        }
    }
}
