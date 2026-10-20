using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

/// <summary>
/// Mantém cr40f_valor da OP igual à soma das composições das suas reservas (reserva.new_composicaodepreco →
/// new_valortotal), a mesma soma que o SyncEngine usa quando a OP não tem valor. Nenhum outro processo preenche esse
/// campo (PROD 18/10/2026: 596 OPs, 0 com valor), então relatórios e Power BI liam vazio.
/// Steps (síncronos): composição Update (qualquer campo: new_valortotal é calculada e nunca vem no Update) pós; composição Delete pré e pós; reserva Create pós;
/// reserva Update(cr40f_financeiro, new_composicaodepreco) pós com imagem "pre"; reserva Delete pós com imagem "pre".
/// </summary>
public sealed class ValorOpPlugin : IPlugin
{
    public const string ImagemAnterior = "pre";
    public const string OpsDaComposicaoExcluida = "Cr40f.ValorOp.OpsDaComposicaoExcluida";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var service = factory.CreateOrganizationService(null);

        try
        {
            var ops = OpsAfetadas(context, service);
            if (ops.Count == 0) return;
            foreach (var opId in ops) Atualizar(service, opId, tracing);
        }
        catch (Exception error)
        {
            tracing.Trace("Cr40f.ValorOp: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível atualizar o valor da OP. " + error.Message, error);
        }
    }

    /// <summary>OPs cujo valor pode ter mudado com esta operação. No pré-Delete da composição só guarda as OPs e devolve vazio.</summary>
    public static HashSet<Guid> OpsAfetadas(IPluginExecutionContext context, IOrganizationService service)
    {
        var ops = new HashSet<Guid>();
        var entidade = context.PrimaryEntityName;
        var mensagem = context.MessageName;

        if (entidade == Codigos.Composicao)
        {
            if (mensagem == "Delete" && context.Stage < 40)
            {
                // Antes de excluir: depois, o vínculo reserva → composição já foi removido e não dá mais para achar as OPs.
                context.SharedVariables[OpsDaComposicaoExcluida] = string.Join(",", OpsDasReservasDaComposicao(service, context.PrimaryEntityId));
                return ops;
            }
            if (mensagem == "Delete")
            {
                var guardadas = (context.SharedVariables.Contains(OpsDaComposicaoExcluida) ? context.SharedVariables[OpsDaComposicaoExcluida] as string : null) ?? "";
                foreach (var parte in guardadas.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) if (Guid.TryParse(parte, out var id)) ops.Add(id);
                return ops;
            }
            if (mensagem == "Update") ops.UnionWith(OpsDasReservasDaComposicao(service, context.PrimaryEntityId));
            return ops;
        }

        if (entidade == Codigos.Reserva)
        {
            var anterior = context.PreEntityImages.Contains(ImagemAnterior) ? context.PreEntityImages[ImagemAnterior] : null;
            var opAnterior = anterior?.GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup)?.Id;
            if (opAnterior.HasValue) ops.Add(opAnterior.Value);
            if (mensagem == "Create" || mensagem == "Update")
            {
                var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
                Guid? opAtual = target != null && target.Contains(Codigos.ReservaOpLookup)
                    ? target.GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup)?.Id
                    : mensagem == "Update"
                        ? service.Retrieve(Codigos.Reserva, context.PrimaryEntityId, new ColumnSet(Codigos.ReservaOpLookup)).GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup)?.Id
                        : null;
                if (opAtual.HasValue) ops.Add(opAtual.Value);
            }
        }
        return ops;
    }

    static IEnumerable<Guid> OpsDasReservasDaComposicao(IOrganizationService service, Guid composicaoId) =>
        service.RetrieveMultiple(new QueryExpression(Codigos.Reserva)
        {
            ColumnSet = new ColumnSet(Codigos.ReservaOpLookup),
            Criteria =
            {
                Conditions =
                {
                    new ConditionExpression(Codigos.ReservaCpLookup, ConditionOperator.Equal, composicaoId),
                    new ConditionExpression(Codigos.ReservaOpLookup, ConditionOperator.NotNull),
                },
            },
        }).Entities.Select(r => r.GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup)!.Id).Distinct();

    /// <summary>Recalcula e grava só se mudou. OP sem reservas fica sem valor (null).</summary>
    public static void Atualizar(IOrganizationService service, Guid opId, ITracingService? tracing = null)
    {
        var op = service.Retrieve(Codigos.Op, opId, new ColumnSet(Codigos.OpValor));
        var atual = SnapshotLoader.Cents(op.GetAttributeValue<Money>(Codigos.OpValor));
        var novo = Calcular(ValoresDasReservas(service, opId));
        if (atual == novo) return;
        service.Update(new Entity(Codigos.Op, opId) { [Codigos.OpValor] = novo is null ? null : new Money(novo.Value / 100m) });
        tracing?.Trace("Cr40f.ValorOp: OP {0} {1} → {2}", opId, atual, novo);
    }

    /// <summary>Centavos da composição de cada reserva da OP (0 sem composição), como no SnapshotLoader.</summary>
    static List<int> ValoresDasReservas(IOrganizationService service, Guid opId)
    {
        var reservas = service.RetrieveMultiple(new QueryExpression(Codigos.Reserva)
        {
            ColumnSet = new ColumnSet(Codigos.ReservaCpLookup),
            Criteria = { Conditions = { new ConditionExpression(Codigos.ReservaOpLookup, ConditionOperator.Equal, opId) } },
        }).Entities;
        var cpIds = reservas.Select(r => r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id).Where(id => id.HasValue).Select(id => (object)id!.Value).Distinct().ToArray();
        var valorPorCp = cpIds.Length == 0 ? new Dictionary<Guid, int>() : service.RetrieveMultiple(new QueryExpression(Codigos.Composicao)
        {
            ColumnSet = new ColumnSet(Codigos.CpValor),
            Criteria = { Conditions = { new ConditionExpression($"{Codigos.Composicao}id", ConditionOperator.In, cpIds) } },
        }).Entities.ToDictionary(c => c.Id, c => SnapshotLoader.Cents(c.GetAttributeValue<Money>(Codigos.CpValor)) ?? 0);
        return reservas.Select(r =>
        {
            var cp = r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id;
            return cp.HasValue && valorPorCp.TryGetValue(cp.Value, out var v) ? v : 0;
        }).ToList();
    }

    /// <summary>Soma em centavos; null quando a OP não tem reserva.</summary>
    public static int? Calcular(IReadOnlyCollection<int> centavosPorReserva) => centavosPorReserva.Count == 0 ? null : centavosPorReserva.Sum();
}
