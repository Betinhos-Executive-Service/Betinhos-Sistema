using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoConfigTests
{
    private const string Unsecure = "{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://x/main.aspx\",\"dominio\":\"betinhos.com.br\"}";

    [Fact]
    public void Parse_le_as_duas_configuracoes()
    {
        var cfg = AcessoConfig.Parse(Unsecure, "{\"clientSecret\":\"s3gr3d0\"}");
        Assert.Equal("t", cfg.TenantId);
        Assert.Equal("s3gr3d0", cfg.ClientSecret);
        Assert.Equal("betinhos.com.br", cfg.Dominio);
        Assert.Equal("https://x/main.aspx", cfg.AppUrl);
    }

    [Fact]
    public void Parse_sem_secret_lanca_CONFIG_AUSENTE()
    {
        var erro = Assert.Throws<AcessoException>(() => AcessoConfig.Parse(Unsecure, ""));
        Assert.Equal("CONFIG_AUSENTE", erro.Codigo);
        Assert.StartsWith("CONFIG_AUSENTE: ", erro.Message);
    }

    [Fact]
    public void Parse_sem_dominio_usa_padrao()
        => Assert.Equal("betinhos.com.br", AcessoConfig.Parse(Unsecure.Replace(",\"dominio\":\"betinhos.com.br\"", ""), "{\"clientSecret\":\"s\"}").Dominio);

    [Fact]
    public void Etapas_serializa_em_ordem()
    {
        var etapas = new Etapas();
        etapas.Feita("usuario", "criado");
        etapas.Pulada("licenca", "já tinha");
        etapas.Erro("grupo", "Graph 503");
        Assert.Equal("[{\"etapa\":\"usuario\",\"estado\":\"feita\",\"detalhe\":\"criado\"},{\"etapa\":\"licenca\",\"estado\":\"pulada\",\"detalhe\":\"já tinha\"},{\"etapa\":\"grupo\",\"estado\":\"erro\",\"detalhe\":\"Graph 503\"}]", etapas.ToJson());
    }

    [Fact]
    public void JsonLeve_le_objetos_aninhados_e_listas()
    {
        var obj = JsonLeve.Ler("{\"value\":[{\"id\":\"1\",\"skuId\":\"a\"}],\"n\":2}");
        var lista = Assert.IsType<System.Collections.Generic.List<object?>>(obj["value"]);
        var item = Assert.IsType<System.Collections.Generic.Dictionary<string, object?>>(lista[0]);
        Assert.Equal("a", item["skuId"]);
        Assert.Equal("2", System.Convert.ToString(obj["n"], System.Globalization.CultureInfo.InvariantCulture));
    }

    [Theory]
    [InlineData("{\"tenantId\":\"t\",", "{\"clientSecret\":\"s\"}")]
    [InlineData(Unsecure, "{\"clientSecret\":\"segredo-vazado")]
    public void Parse_json_malformado_lanca_CONFIG_AUSENTE_sem_texto_original(string unsecure, string secure)
    {
        var erro = Assert.Throws<AcessoException>(() => AcessoConfig.Parse(unsecure, secure));
        Assert.Equal("CONFIG_AUSENTE", erro.Codigo);
        Assert.DoesNotContain("segredo", erro.Message);
        Assert.Null(erro.InnerException);
    }
}
