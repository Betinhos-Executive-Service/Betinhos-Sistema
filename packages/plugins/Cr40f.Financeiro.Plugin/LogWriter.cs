using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

public static class LogWriter
{
    /// <summary>Grava uma linha em cr40f_sincronizacaofinanceira. paraNome só altera o texto de cr40f_name.</summary>
    public static void Write(IOrganizationService service, Guid opId, Guid entidadeId, string entidade, string campo, string? de, string? para, string motivo, int origem, Guid usuarioId, string? paraNome = null)
    {
        var log = new Entity(Codigos.Log);
        log["cr40f_name"] = $"{entidade}.{campo}: {de ?? "—"} → {paraNome ?? para}";
        log["cr40f_op"] = new EntityReference(Codigos.Op, opId);
        if (entidade == Codigos.Reserva) log["cr40f_reserva"] = new EntityReference(Codigos.Reserva, entidadeId);
        log["cr40f_entidade"] = entidade;
        log["cr40f_campo"] = campo;
        log["cr40f_de"] = de;
        log["cr40f_para"] = para;
        log["cr40f_motivo"] = motivo;
        log["cr40f_origem"] = new OptionSetValue(origem);
        log["cr40f_usuario"] = new EntityReference("systemuser", usuarioId);
        service.Create(log);
    }
}
