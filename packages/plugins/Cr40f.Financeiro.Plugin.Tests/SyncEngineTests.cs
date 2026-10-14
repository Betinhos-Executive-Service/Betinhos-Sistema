using System;
using System.Linq;
using Cr40f.Financeiro.Plugin;
using Xunit;

public class SyncEngineTests
{
    internal static OpSnapshot Op(int? status, int? valor, params PaganteSnap[] pags)
    {
        var op = new OpSnapshot { Id = Guid.NewGuid(), Status = status, ValorCents = valor };
        op.Pagantes.AddRange(pags);
        return op;
    }
    internal static PaganteSnap Pag(int status, int cents) => new() { Id = Guid.NewGuid(), Status = status, ValorCents = cents };
    internal static ReservaSnap Res(int? fat, int? cp, bool pagoPorOp = false, int cpCents = 0) =>
        new() { Id = Guid.NewGuid(), FatStatus = fat, CpId = Guid.NewGuid(), CpStatus = cp, PagoPorEstaOp = pagoPorOp, CpValorCents = cpCents };

    [Fact]
    public void TodosPagosESomaCobreTotal_MarcaOpReservaECp()
    {
        var op = Op(Codigos.OpParcial, 10000, Pag(Codigos.PagPago, 6000), Pag(Codigos.PagAutorizado, 4000), Pag(Codigos.PagCancelado, 9999));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente));
        var m = SyncEngine.Compute(op);
        Assert.Contains(m, x => x.Entidade == Codigos.Op && x.Campo == Codigos.OpStatus && x.Para == Codigos.OpPaga);
        Assert.Contains(m, x => x.Entidade == Codigos.Reserva && x.Campo == Codigos.ReservaFatStatus && x.Para == Codigos.ReservaFatPago);
        Assert.Contains(m, x => x.Entidade == Codigos.Composicao && x.Campo == Codigos.CpStatus && x.Para == Codigos.CpConcluida);
        Assert.Equal(3, m.Count);
    }

    [Fact]
    public void TotalNuloUsaSomaDasCps()
    {
        var op = Op(Codigos.OpAberta, null, Pag(Codigos.PagPago, 5000));
        op.Reservas.Add(Res(Codigos.ReservaFatPagante, Codigos.CpPendente, cpCents: 5000));
        var m = SyncEngine.Compute(op);
        Assert.Contains(m, x => x.Entidade == Codigos.Op && x.Para == Codigos.OpPaga);
    }
}
