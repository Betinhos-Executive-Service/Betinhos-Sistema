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
            if (!m.LimparLookup && m.Para is null) throw new InvalidPluginExecutionException($"Mudança sem valor de destino: {m.Entidade}.{m.Campo} ({m.Id}).");
            var row = new Entity(m.Entidade, m.Id);
            if (m.LimparLookup) row[m.Campo] = null;
            else row[m.Campo] = new OptionSetValue(m.Para!.Value);
            service.Update(row);

            LogWriter.Write(service, opId, m.Id, m.Entidade, m.Campo, m.De?.ToString(), m.LimparLookup ? "" : m.Para?.ToString(), m.Motivo,
                origem == "automatico" ? OrigemAutomatico : OrigemManual, usuarioId, m.LimparLookup ? "(limpo)" : null);
        }
    }
}
