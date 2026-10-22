using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public static class Autorizacao
{
    public const string FuncaoGestao = "Acesso - Gestão de Motoristas";
    private static readonly string[] Admin = { "Administrador do Sistema", "System Administrator" };

    public static void Exigir(IOrganizationService service, Guid userId)
    {
        var vinculos = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet("roleid") };
        vinculos.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
        var roleIds = service.RetrieveMultiple(vinculos).Entities.Select(e => (Guid)e["roleid"]).ToArray();
        foreach (var roleId in roleIds)
        {
            var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
            q.Criteria.AddCondition("roleid", ConditionOperator.Equal, roleId);
            var nome = service.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<string>("name")).FirstOrDefault();
            if (nome == FuncaoGestao || Admin.Contains(nome)) return;
        }
        throw new AcessoException("SEM_PERMISSAO", "Só quem tem a função '" + FuncaoGestao + "' ou Administrador do Sistema pode gerir acessos.");
    }
}
