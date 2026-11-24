using System.Linq;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaParcelasTests
{
    [Theory]
    [InlineData(100.00, 3, "33.33,33.33,33.34")]
    [InlineData(0.05, 2, "0.02,0.03")]
    [InlineData(300.00, 3, "100.00,100.00,100.00")]
    [InlineData(130.16, 1, "130.16")]
    [InlineData(130.16, 3, "43.38,43.38,43.40")]
    [InlineData(1000.00, 3, "333.33,333.33,333.34")]
    public void Divide_truncando_e_sobra_na_ultima(double valor, int n, string esperado)
    {
        var plano = MultaParcelas.Dividir((decimal)valor, n, "2026-12");
        Assert.Equal(esperado, string.Join(",", plano.Select(p => p.Valor.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture))));
        Assert.Equal((decimal)valor, plano.Sum(p => p.Valor));
        Assert.All(plano, p => Assert.Equal(n, p.Total));
        Assert.Equal(Enumerable.Range(1, n), plano.Select(p => p.Numero));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    public void Recusa_fora_do_teto(int n) => Assert.Throws<System.ArgumentOutOfRangeException>(() => MultaParcelas.Dividir(100m, n, "2026-12"));

    [Fact]
    public void Termo_antigo_com_doze_parcelas_ainda_divide_com_resto_na_ultima()
    {
        var plano = MultaParcelas.Dividir(1000m, 12, "2026-12");
        Assert.Equal(1000m, plano.Sum(p => p.Valor));
        Assert.Equal(83.37m, plano[11].Valor);
    }

    [Fact]
    public void Competencias_viram_o_ano()
    {
        var plano = MultaParcelas.Dividir(90m, 3, "2026-11-01");
        Assert.Equal(new[] { "2026-11-01", "2026-12-01", "2027-01-01" }, plano.Select(p => p.Competencia));
    }

    [Theory]
    [InlineData("2026-11-17", "2026-10-01", "2027-11-01")]
    [InlineData("2027-01-05", "2026-12-01", "2028-01-01")]
    public void Janela_vai_do_mes_anterior_ate_doze_meses(string hoje, string de, string ate)
    {
        Assert.Equal((de, ate), MultaParcelas.Janela(hoje));
    }

    [Fact]
    public void Mes_por_extenso() => Assert.Equal("10/2026", MultaParcelas.MesBr("2026-10-01"));
}
