using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

public static class SnapshotLoader
{
    public static OpSnapshot Load(IOrganizationService service, Guid opId)
    {
        var op = service.Retrieve(Codigos.Op, opId, new ColumnSet(Codigos.OpStatus, Codigos.OpValor));
        var snap = new OpSnapshot
        {
            Id = opId,
            Status = op.GetAttributeValue<OptionSetValue>(Codigos.OpStatus)?.Value,
            ValorCents = Cents(op.GetAttributeValue<Money>(Codigos.OpValor)),
        };

        var pagantes = service.RetrieveMultiple(new QueryExpression(Codigos.Pagante)
        {
            ColumnSet = new ColumnSet(Codigos.PaganteStatus, Codigos.PaganteValor),
            Criteria = { Conditions = { new ConditionExpression(Codigos.PaganteOpLookup, ConditionOperator.Equal, opId) } },
        }).Entities;
        snap.Pagantes.AddRange(pagantes.Select(p => new PaganteSnap
        {
            Id = p.Id,
            Status = p.GetAttributeValue<OptionSetValue>(Codigos.PaganteStatus)?.Value,
            ValorCents = Cents(p.GetAttributeValue<Money>(Codigos.PaganteValor)) ?? 0,
        }));

        var reservas = service.RetrieveMultiple(new QueryExpression(Codigos.Reserva)
        {
            ColumnSet = new ColumnSet(Codigos.ReservaFatStatus, Codigos.ReservaCpLookup),
            Criteria = { Conditions = { new ConditionExpression(Codigos.ReservaOpLookup, ConditionOperator.Equal, opId) } },
        }).Entities;
        var cpIds = reservas.Select(r => r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id).Where(id => id.HasValue).Select(id => (object)id!.Value).ToArray();
        var cps = cpIds.Length == 0 ? new Entity[0] : service.RetrieveMultiple(new QueryExpression(Codigos.Composicao)
        {
            ColumnSet = new ColumnSet(Codigos.CpStatus, Codigos.CpValor),
            Criteria = { Conditions = { new ConditionExpression($"{Codigos.Composicao}id", ConditionOperator.In, cpIds) } },
        }).Entities.ToArray();
        var cpById = cps.ToDictionary(c => c.Id);

        // A marca mais recente do log por reserva decide se a OP quitou a reserva.
        var ultimoPara = new Dictionary<Guid, string>();
        var logs = service.RetrieveMultiple(new QueryExpression(Codigos.Log)
        {
            ColumnSet = new ColumnSet("cr40f_reserva", "cr40f_para", "createdon"),
            Criteria =
            {
                Conditions =
                {
                    new ConditionExpression("cr40f_op", ConditionOperator.Equal, opId),
                    new ConditionExpression("cr40f_campo", ConditionOperator.Equal, Codigos.ReservaFatStatus),
                },
            },
            Orders = { new OrderExpression("createdon", OrderType.Descending) },
        }).Entities;
        foreach (var l in logs)
        {
            var rid = l.GetAttributeValue<EntityReference>("cr40f_reserva")?.Id;
            if (rid.HasValue && !ultimoPara.ContainsKey(rid.Value))
                ultimoPara[rid.Value] = l.GetAttributeValue<string>("cr40f_para") ?? "";
        }

        foreach (var r in reservas)
        {
            var cpRef = r.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup);
            cpById.TryGetValue(cpRef?.Id ?? Guid.Empty, out var cp);
            snap.Reservas.Add(new ReservaSnap
            {
                Id = r.Id,
                FatStatus = r.GetAttributeValue<OptionSetValue>(Codigos.ReservaFatStatus)?.Value,
                CpId = cpRef?.Id,
                CpStatus = cp?.GetAttributeValue<OptionSetValue>(Codigos.CpStatus)?.Value,
                CpValorCents = Cents(cp?.GetAttributeValue<Money>(Codigos.CpValor)) ?? 0,
                PagoPorEstaOp = ultimoPara.TryGetValue(r.Id, out var p) && p == Codigos.ReservaFatPago.ToString(),
            });
        }
        return snap;
    }

    internal static int? Cents(Money? money) => money == null ? null : (int)Math.Round(money.Value * 100m, MidpointRounding.AwayFromZero);
}
