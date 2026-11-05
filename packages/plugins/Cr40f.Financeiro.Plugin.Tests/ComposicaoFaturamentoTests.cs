using Cr40f.Financeiro.Plugin;
using Xunit;

public class ComposicaoFaturamentoTests
{
    [Theory]
    [InlineData(Codigos.ReservaFatPendente)]
    [InlineData(null)]
    public void Concluida_PendenteViraComposicaoRealizada(int? fat) =>
        Assert.Equal(Codigos.ReservaFatComposicaoRealizada, ComposicaoFaturamento.Novo(Codigos.CpConcluida, fat));

    [Fact]
    public void Reaberta_ComposicaoRealizadaVoltaPendente() =>
        Assert.Equal(Codigos.ReservaFatPendente, ComposicaoFaturamento.Novo(Codigos.CpPendente, Codigos.ReservaFatComposicaoRealizada));

    [Theory]
    [InlineData(Codigos.CpConcluida, Codigos.ReservaFatPago)]
    [InlineData(Codigos.CpPendente, Codigos.ReservaFatPago)]
    [InlineData(Codigos.CpPendente, Codigos.ReservaFatPagamentoPendente)]
    [InlineData(Codigos.CpConcluida, Codigos.ReservaFatMensal)]
    [InlineData(Codigos.CpConcluida, 202410000)]
    [InlineData(Codigos.CpConcluida, Codigos.ReservaFatComposicaoRealizada)]
    [InlineData(Codigos.CpPendente, Codigos.ReservaFatPendente)]
    public void NuncaSobrescreveOutrosStatus(int cp, int fat) =>
        Assert.Null(ComposicaoFaturamento.Novo(cp, fat));
}
