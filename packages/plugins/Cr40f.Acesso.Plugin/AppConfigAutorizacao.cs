using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Quem pode mexer na configuração do App Motoristas. Sempre com o serviço do sistema: operador comum pode não ler role/systemuserroles.</summary>
public sealed class AppConfigAutorizacao
{
    public const string FuncaoGestor = "Perfil - Operacional - Gestor";
    private static readonly string[] Admin = { "Administrador do Sistema", "System Administrator" };
    private readonly IOrganizationService _service;
    public AppConfigAutorizacao(IOrganizationService service) { _service = service; }

    private string?[] Papeis(Guid userId)
    {
        var vinculos = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet("roleid") };
        vinculos.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
        var nomes = new System.Collections.Generic.List<string?>();
        foreach (var roleId in _service.RetrieveMultiple(vinculos).Entities.Select(e => (Guid)e["roleid"]))
        {
            var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
            q.Criteria.AddCondition("roleid", ConditionOperator.Equal, roleId);
            nomes.AddRange(_service.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<string>("name")));
        }
        return nomes.ToArray();
    }

    public bool EhAdmin(Guid userId) => Papeis(userId).Any(n => Admin.Contains(n));
    public bool EhGestor(Guid userId) => Papeis(userId).Any(n => n == FuncaoGestor || Admin.Contains(n));

    /// <summary>Usuário de aplicativo (conta de serviço dos flows): systemuser com applicationid.</summary>
    public bool EhContaDeServico(Guid userId)
    {
        var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("applicationid"), TopCount = 1 };
        q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
        return _service.RetrieveMultiple(q).Entities.Any(e => e.GetAttributeValue<Guid?>("applicationid") is { } id && id != Guid.Empty);
    }

    public void ExigirGestor(Guid userId)
    {
        if (!EhGestor(userId)) throw new AcessoException("SEM_PERMISSAO", "Só quem tem a função '" + FuncaoGestor + "' ou Administrador do Sistema pode alterar a configuração do App.");
    }

    public void ExigirAdmin(Guid userId)
    {
        if (!EhAdmin(userId)) throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema pode mexer no grupo piloto.");
    }
}
