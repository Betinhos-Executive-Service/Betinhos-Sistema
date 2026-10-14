using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Financeiro.Plugin;

public static class SyncEngine
{
    public static IReadOnlyList<Mudanca> Compute(OpSnapshot op)
    {
        var mudancas = new List<Mudanca>();
        if (op.Status == Codigos.OpCancelada)
        {
            foreach (var r in op.Reservas)
                mudancas.Add(new Mudanca { Entidade = Codigos.Reserva, Id = r.Id, Campo = Codigos.ReservaOpLookup, LimparLookup = true, Motivo = "OP cancelada." });
            Reverter(mudancas, op, Codigos.ReservaFatPendente, "OP cancelada.");
            return mudancas;
        }
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
        else if (pagos.Count > 0)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpParcial, "Há pagamento, mas não cobre todos os pagantes ou o total.");
        }
        else
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpAberta, "Nenhum pagante ativo pago.");
            Reverter(mudancas, op, Codigos.ReservaFatPagamentoPendente, "OP sem pagamento.");
        }
        return mudancas;
    }

    /// <summary>Desfaz só o que este motor marcou (PagoPorEstaOp); CP acompanha a reserva. `alvo` = status de faturamento de destino.</summary>
    internal static void Reverter(List<Mudanca> list, OpSnapshot op, int alvo, string motivo)
    {
        foreach (var r in op.Reservas.Where(r => r.PagoPorEstaOp && r.FatStatus == Codigos.ReservaFatPago))
        {
            Set(list, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, alvo, motivo);
            if (r.CpId is { } cp) Set(list, Codigos.Composicao, cp, Codigos.CpStatus, r.CpStatus, Codigos.CpPendente, motivo);
        }
    }

    internal static void Set(List<Mudanca> list, string entidade, System.Guid id, string campo, int? de, int para, string motivo)
    {
        if (de == para) return; // idempotência: só grava o que muda
        list.Add(new Mudanca { Entidade = entidade, Id = id, Campo = campo, De = de, Para = para, Motivo = motivo });
    }
}
