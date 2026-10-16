using System;
using System.Linq;
using Cr40f.Financeiro.Plugin;
using Xunit;

public class FechamentoMensalTests
{
    static ReservaMensal R(string saidaUtc, int status = Codigos.ReservaConcluida, int fat = Codigos.ReservaFatMensal, bool temOp = false, int? cp = 10000) =>
        new() { Id = Guid.NewGuid(), SaidaUtc = DateTime.Parse(saidaUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal), Status = status, FatStatus = fat, TemOp = temOp, CpValorCents = cp };

    [Fact]
    public void JanelaDoMesEmSaoPaulo()
    {
        var (ini, fim) = FechamentoMensal.Janela("2026-09");
        Assert.Equal(new DateTime(2026, 9, 1, 3, 0, 0, DateTimeKind.Utc), ini);
        Assert.Equal(new DateTime(2026, 10, 1, 3, 0, 0, DateTimeKind.Utc), fim);
    }

    [Fact]
    public void FiltraElegiveis()
    {
        var dentro = R("2026-09-01T03:00:00Z");
        var lista = new[] { dentro, R("2026-09-01T02:59:00Z"), R("2026-10-01T03:00:00Z"), R("2026-09-10T12:00:00Z", status: 202410005), R("2026-09-10T12:00:00Z", fat: Codigos.ReservaFatPago), R("2026-09-10T12:00:00Z", temOp: true) };
        Assert.Equal(new[] { dentro.Id }, FechamentoMensal.Elegiveis(lista, "2026-09").Select(r => r.Id));
    }

    [Fact]
    public void MesAbertoNaoFecha()
    {
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.ValidarMes("2026-10", new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc)));
        FechamentoMensal.ValidarMes("2026-09", new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void MesInvalidoFalha() => Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.Janela("2026-13"));

    [Fact]
    public void TotalExigeComposicao()
    {
        Assert.Equal(25000, FechamentoMensal.TotalCents(new[] { R("2026-09-02T12:00:00Z", cp: 10000), R("2026-09-03T12:00:00Z", cp: 15000) }));
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => FechamentoMensal.TotalCents(new[] { R("2026-09-02T12:00:00Z", cp: null) }));
    }

    [Fact]
    public void DataSaoPauloVirouODiaAnterior() =>
        Assert.Equal(new DateTime(2026, 9, 30), FechamentoMensal.DataSaoPaulo(new DateTime(2026, 10, 1, 2, 30, 0, DateTimeKind.Utc)));
}
