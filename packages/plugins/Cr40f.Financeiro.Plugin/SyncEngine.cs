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
            {
                mudancas.Add(new Mudanca { Entidade = Codigos.Reserva, Id = r.Id, Campo = Codigos.ReservaOpLookup, LimparLookup = true, Motivo = "OP cancelada." });
                if (r.FatStatus == Codigos.ReservaFatPagamentoPendente)
                    Set(mudancas, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, Codigos.ReservaFatPendente, "OP cancelada.");
            }
            Reverter(mudancas, op, Codigos.ReservaFatPendente, "OP cancelada.");
            return mudancas;
        }
        var ativos = op.Pagantes.Where(p => p.Status != Codigos.PagCancelado).ToList();
        var pagos = ativos.Where(p => p.Status == Codigos.PagPago || p.Status == Codigos.PagAutorizado).ToList();
        var total = op.ValorCents ?? op.Reservas.Sum(r => r.CpValorCents);
        var somaPaga = pagos.Sum(p => p.ValorCents);
        var totalConhecido = op.ValorCents.HasValue || op.Reservas.All(r => r.CpId.HasValue);
        var todosPagos = ativos.Count > 0 && pagos.Count == ativos.Count;
        // OP marcada como Paga à mão (baixa manual) fica quitada enquanto nenhum pagante ativo voltar a ficar pendente,
        // mesmo que a soma não cubra o total: a decisão do financeiro prevalece sobre o cálculo.
        var quitada = todosPagos && ((totalConhecido && somaPaga >= total && total > 0) || op.Status == Codigos.OpPaga);

        if (quitada)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpPaga, "Todos os pagantes ativos pagos e soma cobre o total da OP.");
            MarcarReservasPagas(mudancas, op, "OP paga.");
        }
        else if (pagos.Count > 0)
        {
            Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpParcial, "Há pagamento, mas não cobre todos os pagantes ou o total.");
            Reverter(mudancas, op, Codigos.ReservaFatPagamentoPendente, "Pagamento deixou de cobrir a OP.");
        }
        else
        {
            if (ativos.Count > 0)
                Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpPendente, "Pagantes gerados, nenhum pago.");
            else
                Set(mudancas, Codigos.Op, op.Id, Codigos.OpStatus, op.Status, Codigos.OpAberta, "Nenhum pagante ativo.");
            Reverter(mudancas, op, Codigos.ReservaFatPagamentoPendente, "OP sem pagamento.");
        }
        return mudancas;
    }

    /// <summary>
    /// Baixa manual: alguém marcou a OP como Paga (substitui os flows legados "Dar Baixa Status OP -> Pagantes" e "OP -> Geral").
    /// Pagantes ativos ainda não pagos viram Pago; reservas viram Pago e composições Concluída. A OP não muda.
    /// </summary>
    public static IReadOnlyList<Mudanca> ComputeBaixaManual(OpSnapshot op)
    {
        var mudancas = new List<Mudanca>();
        if (op.Status != Codigos.OpPaga) return mudancas;
        const string motivo = "OP marcada como paga manualmente.";
        foreach (var p in op.Pagantes.Where(p => p.Status != Codigos.PagCancelado && p.Status != Codigos.PagPago && p.Status != Codigos.PagAutorizado))
            Set(mudancas, Codigos.Pagante, p.Id, Codigos.PaganteStatus, p.Status, Codigos.PagPago, motivo);
        MarcarReservasPagas(mudancas, op, motivo);
        return mudancas;
    }

    /// <summary>Reserva vira Pago e a composição Concluída; reservas com status de faturamento protegido (cancelado, cortesia...) ficam como estão.</summary>
    internal static void MarcarReservasPagas(List<Mudanca> list, OpSnapshot op, string motivo)
    {
        foreach (var r in op.Reservas.Where(r => !Codigos.FatProtegido(r.FatStatus)))
        {
            Set(list, Codigos.Reserva, r.Id, Codigos.ReservaFatStatus, r.FatStatus, Codigos.ReservaFatPago, motivo);
            if (r.CpId is { } cp) Set(list, Codigos.Composicao, cp, Codigos.CpStatus, r.CpStatus, Codigos.CpConcluida, motivo);
        }
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
