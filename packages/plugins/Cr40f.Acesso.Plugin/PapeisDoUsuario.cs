using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Papéis de uma pessoa: os diretos e os herdados das equipes de que ela é membro.</summary>
public static class PapeisDoUsuario
{
    public static List<Guid> IdsDiretos(IOrganizationService s, Guid usuario) => Ids(s, "systemuserroles", "systemuserid", usuario, "roleid");

    public static string? NomeDoPapel(IOrganizationService s, Guid roleId)
    {
        var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
        q.Criteria.AddCondition("roleid", ConditionOperator.Equal, roleId);
        return s.RetrieveMultiple(q).Entities.FirstOrDefault()?.GetAttributeValue<string>("name");
    }

    public static List<string> Nomes(IOrganizationService s, Guid usuario)
    {
        var ids = IdsDiretos(s, usuario);
        foreach (var equipe in Ids(s, "teammembership", "systemuserid", usuario, "teamid"))
            ids.AddRange(Ids(s, "teamroles", "teamid", equipe, "roleid"));
        return ids.Distinct().Select(id => NomeDoPapel(s, id)).Where(n => n != null).Select(n => n!).ToList();
    }

    /// <summary>Lê uma tabela de interseção: os valores de <paramref name="coluna"/> das linhas em que <paramref name="filtro"/> = <paramref name="valor"/>.</summary>
    public static List<Guid> Ids(IOrganizationService s, string tabela, string filtro, Guid valor, string coluna)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet(coluna) };
        q.Criteria.AddCondition(filtro, ConditionOperator.Equal, valor);
        return s.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<Guid>(coluna)).ToList();
    }
}
