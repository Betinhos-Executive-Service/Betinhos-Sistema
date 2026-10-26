using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Passageiros de um serviço, na mesma regra do link de cadastro e da Custom API de foto.</summary>
public static class PassageirosDoServico
{
    /// <summary>Colunas que a reserva precisa trazer para o fallback.</summary>
    public static readonly string[] ColunasReserva = { "cr40f_passageiro1", "cr40f_passageiro2", "cr40f_passageiro3", "cr40f_passageiro4" };

    /// <summary>Filhos cr40f_servicosporpassageiro (por cr40f_ordemdeselecao); sem filhos, lookups passageiro1..4. Sem duplicatas.</summary>
    public static List<Guid> Ids(IOrganizationService sistema, Entity reserva)
    {
        var q = new QueryExpression("cr40f_servicosporpassageiro") { ColumnSet = new ColumnSet("cr40f_bancodedados", "cr40f_ordemdeselecao") };
        q.Criteria.AddCondition("cr40f_geral", ConditionOperator.Equal, reserva.Id);
        q.AddOrder("cr40f_ordemdeselecao", OrderType.Ascending);
        var filhos = sistema.RetrieveMultiple(q).Entities
            .OrderBy(e => e.GetAttributeValue<int?>("cr40f_ordemdeselecao") ?? int.MaxValue)
            .Select(e => e.GetAttributeValue<EntityReference>("cr40f_bancodedados")?.Id)
            .ToList();
        var origem = filhos.Count > 0 ? filhos : Enumerable.Range(1, 4).Select(n => reserva.GetAttributeValue<EntityReference>("cr40f_passageiro" + n)?.Id).ToList();
        return origem.Where(id => id is Guid g && g != Guid.Empty).Select(id => id!.Value).Distinct().ToList();
    }
}
