using System;
using Cr40f.Financeiro.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

public class MudancaApplierTests
{
    static Mudanca Para(int para) => new() { Entidade = Codigos.Reserva, Id = Guid.NewGuid(), Campo = Codigos.ReservaFatStatus, De = Codigos.ReservaFatPendente, Para = para };

    [Fact]
    public void MesmoValor_JaAplicada() =>
        Assert.True(MudancaApplier.JaAplicada(Para(Codigos.ReservaFatPago), new OptionSetValue(Codigos.ReservaFatPago)));

    [Fact]
    public void ValorDiferente_Aplica() =>
        Assert.False(MudancaApplier.JaAplicada(Para(Codigos.ReservaFatPago), new OptionSetValue(Codigos.ReservaFatPendente)));

    [Fact]
    public void CampoVazio_Aplica() => Assert.False(MudancaApplier.JaAplicada(Para(Codigos.ReservaFatPago), null));

    [Fact]
    public void LimparLookup_JaVazio_JaAplicada()
    {
        var m = new Mudanca { Entidade = Codigos.Reserva, Id = Guid.NewGuid(), Campo = Codigos.ReservaOpLookup, LimparLookup = true };
        Assert.True(MudancaApplier.JaAplicada(m, null));
        Assert.False(MudancaApplier.JaAplicada(m, new EntityReference(Codigos.Op, Guid.NewGuid())));
    }
}
