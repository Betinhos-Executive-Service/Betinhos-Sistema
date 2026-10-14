using Cr40f.Financeiro.Plugin;
using Newtonsoft.Json;
using Xunit;

public class ContractsTests
{
    [Fact]
    public void RequestAceitaModoEOrigem()
    {
        var r = JsonConvert.DeserializeObject<SincronizarRequest>("{\"modo\":\"aplicar\",\"origem\":\"manual\"}")!;
        Assert.Equal("aplicar", r.Modo);
        Assert.Equal("manual", r.Origem);
    }

    [Fact]
    public void ModoInvalidoFalha()
    {
        var r = new SincronizarRequest { Modo = "x" };
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => r.Validate());
    }

    [Fact]
    public void OrigemInvalidaFalha()
    {
        var r = new SincronizarRequest { Origem = "x" };
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => r.Validate());
    }
}
