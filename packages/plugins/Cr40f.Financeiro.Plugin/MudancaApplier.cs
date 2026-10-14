using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

public static class MudancaApplier
{
    public const int OrigemManual = 202410000, OrigemAutomatico = 202410001;

    public static void Apply(IOrganizationService service, Guid opId, IReadOnlyList<Mudanca> mudancas, string origem, Guid usuarioId)
    {
        foreach (var m in mudancas)
        {
            var row = new Entity(m.Entidade, m.Id);
            if (m.LimparLookup) row[m.Campo] = null;
            else row[m.Campo] = new OptionSetValue(m.Para!.Value);
            service.Update(row);

            var log = new Entity(Codigos.Log);
            log["cr40f_name"] = $"{m.Entidade}.{m.Campo}: {m.De?.ToString() ?? "—"} → {(m.LimparLookup ? "(limpo)" : m.Para?.ToString())}";
            log["cr40f_op"] = new EntityReference(Codigos.Op, opId);
            if (m.Entidade == Codigos.Reserva) log["cr40f_reserva"] = new EntityReference(Codigos.Reserva, m.Id);
            log["cr40f_entidade"] = m.Entidade;
            log["cr40f_campo"] = m.Campo;
            log["cr40f_de"] = m.De?.ToString();
            log["cr40f_para"] = m.LimparLookup ? "" : m.Para?.ToString();
            log["cr40f_motivo"] = m.Motivo;
            log["cr40f_origem"] = new OptionSetValue(origem == "automatico" ? OrigemAutomatico : OrigemManual);
            log["cr40f_usuario"] = new EntityReference("systemuser", usuarioId);
            service.Create(log);
        }
    }
}
