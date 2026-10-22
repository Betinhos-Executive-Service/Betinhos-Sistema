using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>
/// systemuser do Dataverse ligado à conta do Entra. Precisa existir antes de gravar cr40f_emailmicrosoft:
/// o plugin DriverRecordSharing do App Motoristas exige um systemuser ativo com aquele e-mail.
/// </summary>
public sealed class UsuarioDataverseRepository
{
    private readonly IOrganizationService _svc;
    public UsuarioDataverseRepository(IOrganizationService svc) { _svc = svc; }

    /// <summary>true se criou; false se já existia ativo. Desativado → ACESSO_ENCERRADO (R10).</summary>
    public bool Garantir(Guid objectId, string upn, string nomeCompleto)
    {
        var consulta = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("systemuserid", "isdisabled", "domainname", "internalemailaddress"), TopCount = 1 };
        consulta.Criteria.AddCondition("azureactivedirectoryobjectid", ConditionOperator.Equal, objectId);
        var existente = _svc.RetrieveMultiple(consulta).Entities.FirstOrDefault();
        if (existente is not null)
        {
            if (existente.GetAttributeValue<bool>("isdisabled")) throw new AcessoException("ACESSO_ENCERRADO", "Acesso encerrado antes. Peça à TI para reativar a conta no Entra.");
            return false;
        }

        var partes = nomeCompleto.Trim().Split(new[] { ' ' }, 2, StringSplitOptions.RemoveEmptyEntries);
        var usuario = new Entity("systemuser")
        {
            ["azureactivedirectoryobjectid"] = objectId,
            ["domainname"] = upn,
            ["internalemailaddress"] = upn,
            ["firstname"] = partes[0],
            ["lastname"] = partes.Length > 1 ? partes[1].Trim() : partes[0],
            ["businessunitid"] = new EntityReference("businessunit", UnidadeRaiz()),
        };
        // Logo depois de licenciar, o Dataverse pode recusar a conta; a nova tentativa é idempotente.
        Guid id;
        try { id = _svc.Create(usuario); }
        catch (Exception) { throw new AcessoException("USUARIO_DATAVERSE_PENDENTE", "A conta foi criada, mas o Dataverse ainda não a reconhece. Tente de novo em alguns minutos."); }

        // O Dataverse completa o registro a partir do Entra e pode sobrescrever o e-mail ou deixar a conta desabilitada
        // até a licença sincronizar; o DriverRecordSharing procura internalemailaddress + isdisabled=false.
        var criado = _svc.Retrieve("systemuser", id, new ColumnSet("isdisabled", "internalemailaddress", "domainname"));
        var emailGravado = criado.GetAttributeValue<string>("internalemailaddress");
        if (!string.Equals(emailGravado, upn, StringComparison.OrdinalIgnoreCase))
            _svc.Update(new Entity("systemuser", id) { ["internalemailaddress"] = upn });
        // Criado por código, o systemuser nasce desabilitado (o admin center habilita na hora); habilita aqui.
        var desabilitado = criado.GetAttributeValue<bool>("isdisabled");
        if (desabilitado)
        {
            _svc.Execute(new SetStateRequest { EntityMoniker = new EntityReference("systemuser", id), State = new OptionSetValue(0), Status = new OptionSetValue(-1) });
            desabilitado = _svc.Retrieve("systemuser", id, new ColumnSet("isdisabled")).GetAttributeValue<bool>("isdisabled");
        }
        Estado = "isdisabled=" + desabilitado + "; email=" + (string.IsNullOrEmpty(emailGravado) ? "(vazio)" : emailGravado) + "; domainname=" + criado.GetAttributeValue<string>("domainname");
        return true;
    }

    /// <summary>Estado do systemuser recém-criado, para diagnóstico na lista de etapas.</summary>
    public string Estado { get; private set; } = "";

    private Guid UnidadeRaiz()
    {
        var consulta = new QueryExpression("businessunit") { ColumnSet = new ColumnSet("businessunitid"), TopCount = 1 };
        consulta.Criteria.AddCondition("parentbusinessunitid", ConditionOperator.Null);
        return _svc.RetrieveMultiple(consulta).Entities.First().Id;
    }
}
