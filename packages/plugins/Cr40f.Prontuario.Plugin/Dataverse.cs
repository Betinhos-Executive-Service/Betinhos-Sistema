using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Prontuario.Plugin;

/// <summary>Erro de regra: a mensagem (pt-BR) vai inteira para quem chamou.</summary>
public sealed class ProntuarioException : Exception
{
    public ProntuarioException(string mensagem) : base(mensagem) { }
}

public interface IPermissoes
{
    /// <summary>A pessoa consegue criar uma anotação ligada a este funcionário?</summary>
    bool PodeAnotar(Guid usuarioId, EntityReference funcionario);
}

public interface IConfiguracao
{
    /// <summary>URL do gatilho HTTP do flow (variável de ambiente), ou null se ausente.</summary>
    string? UrlEnvio();
}

/// <summary>
/// Mesmo critério do Dataverse para criar nota ligada a um registro: prvCreateNote e prvAppendNote
/// (em qualquer profundidade) e AppendTo no funcionário. Consulta com o serviço do sistema.
/// </summary>
public sealed class PermissoesDataverse : IPermissoes
{
    private readonly IOrganizationService _sistema;
    public PermissoesDataverse(IOrganizationService sistema) { _sistema = sistema; }

    public bool PodeAnotar(Guid usuarioId, EntityReference funcionario)
    {
        foreach (var privilegio in new[] { "prvCreateNote", "prvAppendNote" })
        {
            var resposta = (RetrieveUserPrivilegeByPrivilegeNameResponse)_sistema.Execute(new RetrieveUserPrivilegeByPrivilegeNameRequest { PrivilegeName = privilegio, UserId = usuarioId });
            if (resposta.RolePrivileges is null || resposta.RolePrivileges.Length == 0) return false;
        }
        var acesso = (RetrievePrincipalAccessResponse)_sistema.Execute(new RetrievePrincipalAccessRequest { Principal = new EntityReference("systemuser", usuarioId), Target = funcionario });
        return (acesso.AccessRights & AccessRights.AppendToAccess) != 0;
    }
}

/// <summary>Lê a variável de ambiente pelo serviço do sistema: quem pede não precisa ler variáveis.</summary>
public sealed class ConfiguracaoDataverse : IConfiguracao
{
    private readonly IOrganizationService _sistema;
    public ConfiguracaoDataverse(IOrganizationService sistema) { _sistema = sistema; }

    public string? UrlEnvio()
    {
        var def = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 1 };
        def.Criteria.AddCondition("schemaname", ConditionOperator.Equal, Liberacao.VariavelUrlEnvio);
        var definicao = _sistema.RetrieveMultiple(def).Entities.FirstOrDefault();
        if (definicao is null) return null;
        var val = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
        val.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, definicao.Id);
        var valor = _sistema.RetrieveMultiple(val).Entities.FirstOrDefault()?.GetAttributeValue<string>("value");
        var url = (string.IsNullOrWhiteSpace(valor) ? definicao.GetAttributeValue<string>("defaultvalue") : valor)?.Trim();
        return string.IsNullOrEmpty(url) ? null : url;
    }
}
