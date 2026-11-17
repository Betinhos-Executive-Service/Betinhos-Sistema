using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultasDoDiaTests
{
    private const string Hoje = "2026-11-17";

    private static MultaResumo M(string auto, MultaEstado estado, string? motorista = "Ana (fictício)") =>
        new() { Id = Guid.NewGuid(), Auto = auto, Placa = "ABC1D23", Motorista = motorista, Estado = estado };

    [Fact]
    public void Monta_as_secoes_na_ordem_do_email()
    {
        var multas = new[]
        {
            M("A1", new MultaEstado { Status = MultaCodigos.Indicar, DataParaIndicar = "2026-11-10" }),
            M("A2", new MultaEstado { Status = MultaCodigos.Identificar, DataParaIndicar = "2026-11-21" }),
            M("A3", new MultaEstado { Status = MultaCodigos.Identificar, DataParaIndicar = "2026-12-20" }),
            M("A4", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-14", Canal = MultaCodigos.Senatran, DataParaIndicar = "2026-11-20" }),
            M("A5", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-16", Canal = MultaCodigos.Senatran, DataParaIndicar = "2026-12-20" }),
            M("A6", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-22", Responsavel = MultaCodigos.Empresa }),
            M("A7", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-23" }),
            M("A8", new MultaEstado { Status = MultaCodigos.Pagar }),
            M("A9", new MultaEstado { Status = MultaCodigos.Acertar }),
            M("A10", new MultaEstado { Status = MultaCodigos.Acertar }),
        };

        var r = MultasDoDia.Montar(multas, Hoje);

        Assert.Equal(new[] { "A1" }, r.PrazoVencido.Select(l => l.Auto));
        Assert.Equal(new[] { "A2" }, r.Indicar.Select(l => l.Auto));
        Assert.Equal("Definir o responsável", r.Indicar[0].Passo);
        Assert.Equal(new[] { "A4" }, r.Aceite.Select(l => l.Auto));
        Assert.Equal(new[] { "A6" }, r.Pagar.Select(l => l.Auto));
        Assert.Equal("Empresa", r.Pagar[0].Responsavel);
        Assert.Equal(2, r.AguardandoAcerto);
        Assert.Equal(6, r.Total);
    }

    [Fact]
    public void Pagar_inclui_guias_ja_vencidas_e_deixa_de_fora_as_de_mais_de_5_dias()
    {
        var multas = new[]
        {
            M("P0", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-17" }),
            M("P-1", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-16" }),
            M("P-30", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-10-18" }),
            M("P5", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-22" }),
            M("P6", new MultaEstado { Status = MultaCodigos.Pagar, Vencimento = "2026-11-23" }),
        };

        var r = MultasDoDia.Montar(multas, Hoje);

        Assert.Equal(new[] { "P-30", "P-1", "P0", "P5" }, r.Pagar.Select(l => l.Auto));
        Assert.Equal(4, r.Total);
    }

    [Fact]
    public void Multa_sem_prazo_de_indicacao_entra_no_fim_da_secao_Indicar()
    {
        var multas = new[]
        {
            M("S2", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10" }),
            M("S1", new MultaEstado { Status = MultaCodigos.Identificar }),
            M("A1", new MultaEstado { Status = MultaCodigos.Identificar, DataParaIndicar = "2026-11-20" }),
        };

        var r = MultasDoDia.Montar(multas, Hoje);

        Assert.Equal(new[] { "A1", "S1", "S2" }, r.Indicar.Select(l => l.Auto));
        Assert.Null(r.Indicar[1].Prazo);
        Assert.Equal("Definir o responsável (sem prazo informado)", r.Indicar[1].Passo);
        Assert.Equal("Indicar no órgão (sem prazo informado)", r.Indicar[2].Passo);
        Assert.Equal(3, r.Total);
    }

    [Fact]
    public void Indicar_sem_passo_pendente_mostra_Conferir_a_etapa()
    {
        var multas = new[]
        {
            M("C1", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-14", Canal = MultaCodigos.DsvDigital, DataParaIndicar = "2026-11-20" }),
            M("C2", new MultaEstado { Status = MultaCodigos.Indicar, DataAviso = "2026-11-10", DataIndicacao = "2026-11-14", Canal = MultaCodigos.DsvDigital }),
        };

        var r = MultasDoDia.Montar(multas, Hoje);

        Assert.Equal("Conferir a etapa", r.Indicar[0].Passo);
        Assert.Equal("Conferir a etapa (sem prazo informado)", r.Indicar[1].Passo);
    }

    [Fact]
    public void AceitePendente_so_com_indicacao_registrada_pela_Senatran_sem_aceite()
    {
        Assert.True(MultaEtapas.AceitePendente(new MultaEstado { DataIndicacao = "2026-11-14", Canal = MultaCodigos.Senatran }));
        Assert.False(MultaEtapas.AceitePendente(new MultaEstado { DataIndicacao = "2026-11-14", Canal = MultaCodigos.Senatran, AceiteEm = "2026-11-15" }));
        Assert.False(MultaEtapas.AceitePendente(new MultaEstado { DataIndicacao = "2026-11-14", Canal = MultaCodigos.DsvDigital }));
        Assert.False(MultaEtapas.AceitePendente(new MultaEstado { Canal = MultaCodigos.Senatran }));
    }

    [Fact]
    public void Plugin_le_as_abertas_inclusive_antigas_sem_tarefa()
    {
        var mundo = new FakeMundo();
        mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid()) { ["cr40f_novacoluna"] = "B1", ["cr40f_status"] = new OptionSetValue(MultaCodigos.Acertar) });
        mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid()) { ["cr40f_novacoluna"] = "B2", ["cr40f_status"] = new OptionSetValue(MultaCodigos.Encerrada) });

        var json = MultasDoDiaPlugin.Gerar(mundo, Hoje);

        Assert.Contains("\"aguardandoAcerto\":1", json);
        Assert.Contains("\"total\":1", json);
        Assert.Contains("\"hoje\":\"2026-11-17\"", json);
    }

    [Fact]
    public void Sem_itens_total_zero()
    {
        Assert.Equal(0, MultasDoDia.Montar(Array.Empty<MultaResumo>(), Hoje).Total);
    }
}
