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

public class FecharMesContractTests
{
    [Fact]
    public void RequestValidoDesserializa()
    {
        var id = System.Guid.NewGuid();
        var r = JsonConvert.DeserializeObject<FecharMesRequest>("{\"clienteId\":\"" + id + "\",\"mes\":\"2026-09\"}")!;
        r.Validate();
        Assert.Equal(id, r.ClienteId);
        Assert.Equal("2026-09", r.Mes);
    }

    [Fact]
    public void ClienteVazioFalha()
    {
        var r = new FecharMesRequest { Mes = "2026-09" };
        Assert.Throws<Microsoft.Xrm.Sdk.InvalidPluginExecutionException>(() => r.Validate());
    }
}
