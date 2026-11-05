using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Financeiro.Plugin;

public static class MudancaApplier
{
    public const int OrigemManual = 202410000, OrigemAutomatico = 202410001;

    public static void Apply(IOrganizationService service, Guid opId, IReadOnlyList<Mudanca> mudancas, string origem, Guid usuarioId)
    {
        foreach (var m in mudancas)
        {
            if (!m.LimparLookup && m.Para is null) throw new InvalidPluginExecutionException($"Mudança sem valor de destino: {m.Entidade}.{m.Campo} ({m.Id}).");
            // Cada update pode disparar outro step do financeiro dentro da mesma transação (a flag cr40f_sync não chega
            // ao pipeline filho), que já grava o mesmo destino. Relê o valor atual e pula o que já está certo, para não
            // gravar nem registrar em dobro.
            var atual = service.Retrieve(m.Entidade, m.Id, new ColumnSet(m.Campo)).Attributes.TryGetValue(m.Campo, out var v) ? v : null;
            if (JaAplicada(m, atual)) continue;
            var row = new Entity(m.Entidade, m.Id);
            if (m.LimparLookup) row[m.Campo] = null;
            else row[m.Campo] = new OptionSetValue(m.Para!.Value);
            service.Update(row);

            LogWriter.Write(service, opId, m.Id, m.Entidade, m.Campo, ((atual as OptionSetValue)?.Value ?? m.De)?.ToString(), m.LimparLookup ? "" : m.Para?.ToString(), m.Motivo,
                origem == "automatico" ? OrigemAutomatico : OrigemManual, usuarioId, m.LimparLookup ? "(limpo)" : null);
        }
    }

    public static bool JaAplicada(Mudanca m, object? atual) =>
        m.LimparLookup ? atual is null : atual is OptionSetValue o && o.Value == m.Para;
}
