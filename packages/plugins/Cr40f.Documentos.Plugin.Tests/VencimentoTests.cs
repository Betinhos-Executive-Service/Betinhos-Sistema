using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class VencimentoTests
{
    private const string Hoje = "2026-10-19";

    [Theory]
    [InlineData("2026-10-18", "vencido", -1)]
    [InlineData("2026-10-19", "vence7", 0)]
    [InlineData("2026-10-26", "vence7", 7)]
    [InlineData("2026-10-27", "vence30", 8)]
    [InlineData("2026-11-18", "vence30", 30)]
    [InlineData("2026-11-19", "vence60", 31)]
    [InlineData("2026-12-18", "vence60", 60)]
    [InlineData("2026-12-19", "ok", 61)]
    public void Limites_dos_marcos_iguais_ao_shell(string validade, string status, int dias)
    {
        var estado = Vencimento.EstadoDe(validade, Hoje, temValidade: true);
        Assert.Equal(status, estado.Status);
        Assert.Equal(dias, estado.Dias);
    }

    [Fact]
    public void Sem_validade_no_documento_nao_alerta()
    {
        var estado = Vencimento.EstadoDe(null, Hoje, temValidade: true);
        Assert.Equal(Status.SemValidade, estado.Status);
        Assert.Null(estado.Dias);
    }

    [Fact]
    public void Tipo_sem_validade_nao_alerta_mesmo_com_data()
    {
        var estado = Vencimento.EstadoDe("2026-10-18", Hoje, temValidade: false);
        Assert.Equal(Status.SemValidade, estado.Status);
    }

    [Fact]
    public void Codigos_de_perfil_iguais_ao_shell()
    {
        Assert.Equal(Codigos.ObrigMotorista, Codigos.ObrigDeFuncao(202410000));
        Assert.Equal(Codigos.ObrigAdministrativo, Codigos.ObrigDeFuncao(202410001));
        Assert.Null(Codigos.ObrigDeFuncao(null));
        Assert.Equal(Codigos.ObrigAluguel, Codigos.ObrigDeCategoriaVeiculo(100000002));
        Assert.Null(Codigos.ObrigDeCategoriaVeiculo(999));
    }
}
