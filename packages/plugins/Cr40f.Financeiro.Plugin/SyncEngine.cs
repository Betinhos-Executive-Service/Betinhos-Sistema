using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Financeiro.Plugin;

public static class SyncEngine
{
    public static IReadOnlyList<Mudanca> Compute(OpSnapshot op)
    {
        var mudancas = new List<Mudanca>();
        if (op.Status == Codigos.OpCancelada) return mudancas; // Task 4
        var ativos = op.Pagantes.Where(p => p.Status != Codigos.PagCancelado).ToList();
        var pagos = ativos.Where(p => p.Status == Codigos.PagPago || p.Status == Codigos.PagAutorizado).ToList();
        var total = op.ValorCents ?? op.Reservas.Sum(r => r.CpValorCents);
        var somaPaga = pagos.Sum(p => p.ValorCents);
        var quitada = ativos.Count > 0 && pagos.Count == ativos.Count && somaPaga >= total && total > 0;

        if (quitada)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpPaga, "Todos os pagantes ativos pagos e soma cobre o total da OP.");
            foreach (var r in op.Reservas)
            {
                Set(mudancas, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, Codigos.ReservaFatPago, "OP paga.");
                if (r.CpId is { } cp) Set(mudancas, Codigos.Composicao, cp, Codigos.CpStatus, r.CpStatus, Codigos.CpConcluida, "OP paga.");
            }
        }
        return mudancas;
    }

    internal static void Set(List<Mudanca> list, string entidade, System.Guid id, string campo, int? de, int para, string motivo)
    {
        if (de == para) return; // idempotência: só grava o que muda
        list.Add(new Mudanca { Entidade = entidade, Id = id, Campo = campo, De = de, Para = para, Motivo = motivo });
    }
}
