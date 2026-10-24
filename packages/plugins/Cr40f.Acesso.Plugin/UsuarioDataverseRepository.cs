using System;
using System.Linq;
using System.Threading;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>
/// systemuser do Dataverse ligado à conta do Entra. Precisa existir habilitado e licenciado antes de gravar
/// cr40f_emailmicrosoft: o DriverRecordSharing do App Motoristas compartilha registros com ele.
/// Só a sincronização oficial do Power Platform (addUser) gera um usuário licenciado; Create pelo SDK nasce desabilitado.
/// </summary>
public sealed class UsuarioDataverseRepository
{
    public const int Tentativas = 8;
    internal static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(2);   // 8 consultas em ~14 s; passou disso, a etapa fica pendente (não falha)
    private readonly IOrganizationService _svc;
    private readonly Action<TimeSpan> _esperar;

    public UsuarioDataverseRepository(IOrganizationService svc, Action<TimeSpan>? esperar = null) { _svc = svc; _esperar = esperar ?? Thread.Sleep; }

    /// <summary>true se existe habilitado e licenciado (islicensed sem valor conta como licenciado).</summary>
    public bool Pronto(Guid objectId)
    {
        var u = PorObjectId(objectId);
        return u is not null && !u.GetAttributeValue<bool>("isdisabled") && (u.GetAttributeValue<bool?>("islicensed") ?? true);
    }

    public Entity? PorObjectId(Guid objectId)
    {
        var consulta = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("systemuserid", "isdisabled", "islicensed"), TopCount = 1 };
        consulta.Criteria.AddCondition("azureactivedirectoryobjectid", ConditionOperator.Equal, objectId);
        return _svc.RetrieveMultiple(consulta).Entities.FirstOrDefault();
    }

    /// <summary>Desabilita o systemuser (estado 1, status padrão).</summary>
    public void Bloquear(Guid systemuserId) => _svc.Execute(new SetStateRequest
    {
        EntityMoniker = new EntityReference("systemuser", systemuserId), State = new OptionSetValue(1), Status = new OptionSetValue(-1),
    });

    /// <summary>Consulta de novo com esperas curtas: a sincronização do Power Platform leva alguns segundos.</summary>
    public bool AguardarPronto(Guid objectId)
    {
        for (var i = 0; i < Tentativas; i++)
        {
            if (i > 0) _esperar(Intervalo);
            if (Pronto(objectId)) return true;
        }
        return false;
    }
}
