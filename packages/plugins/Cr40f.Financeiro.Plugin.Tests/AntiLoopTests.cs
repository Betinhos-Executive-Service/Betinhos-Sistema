using System;
using Cr40f.Financeiro.Plugin;
using Xunit;

public class AntiLoopTests
{
    static FakeContext Ctx(FakeContext? pai = null) =>
        new("Update", Codigos.Pagante, Guid.NewGuid(), 40) { ParentContext = pai! };

    [Fact]
    public void SemFlag_NaoEstaDentro() => Assert.False(FinanceiroStepPlugin.DentroDaSincronizacao(Ctx(Ctx())));

    [Fact]
    public void FlagNoPai_EstaDentro()
    {
        var pai = Ctx();
        pai.SharedVariables[SincronizarFinanceiroPlugin.SharedFlag] = true;
        Assert.True(FinanceiroStepPlugin.DentroDaSincronizacao(Ctx(pai)));
    }

    // Baixa manual da OP grava o pagante: a flag fica no plugin da OP, dois níveis acima do step do pagante.
    [Fact]
    public void FlagNoAvo_EstaDentro()
    {
        var avo = Ctx();
        avo.SharedVariables[SincronizarFinanceiroPlugin.SharedFlag] = true;
        Assert.True(FinanceiroStepPlugin.DentroDaSincronizacao(Ctx(Ctx(avo))));
    }
}
