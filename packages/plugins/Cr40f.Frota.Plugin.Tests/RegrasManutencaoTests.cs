// packages/plugins/Cr40f.Frota.Plugin.Tests/RegrasManutencaoTests.cs
using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class RegrasManutencaoTests
{
    const string Hoje = "2026-10-20";

    static ManutencaoRegistro M(string id, int status, int grau = 2) => new()
    {
        Id = id, Descricao = id, Status = status, Grau = grau, CriadoEm = "2026-09-01", VeiculoId = "v1", VeiculoLabel = "ABC1A11",
    };

    [Theory]
    [InlineData(Codigos.Agendado, "2026-10-19", true)]
    [InlineData(Codigos.Programado, "2026-10-19", true)]
    [InlineData(Codigos.Agendado, "2026-10-20", false)] // vence hoje
    [InlineData(Codigos.Solicitado, "2026-10-01", false)]
    [InlineData(Codigos.Realizado, "2026-10-01", false)]
    public void Atrasada_quando_a_janela_venceu_em_aberto(int status, string fim, bool esperado)
    {
        var m = M("a", status);
        m.JanelaFim = fim;
        Assert.Equal(esperado, Regras.Atrasada(m, Hoje));
    }

    [Fact]
    public void Sem_janela_usa_a_data_antiga_de_agendamento()
    {
        var m = M("a", Codigos.Programado);
        m.AgendarPara = "2026-10-15";
        Assert.True(Regras.Atrasada(m, Hoje));
        m.JanelaFim = "2026-10-25";
        Assert.False(Regras.Atrasada(m, Hoje));
    }

    [Fact]
    public void Prioridade_parada_conta_do_pedido_antes_do_encaixe_e_do_encaixe_depois()
    {
        var solicitada = M("s", Codigos.Solicitado, 3);
        solicitada.CriadoEm = "2026-10-17";
        Assert.Equal(3, Regras.PrioridadeParada(solicitada, Hoje));

        var encaixada = M("e", Codigos.Agendado, 4);
        encaixada.DataAprovacao = "2026-10-14";
        Assert.Equal(6, Regras.PrioridadeParada(encaixada, Hoje));
        encaixada.DataAprovacao = "2026-10-18";
        Assert.Null(Regras.PrioridadeParada(encaixada, Hoje));

        Assert.Null(Regras.PrioridadeParada(M("antiga", Codigos.Agendado, 4), Hoje)); // sem data do encaixe
        var programada = M("p", Codigos.Programado, 4);
        programada.DataAprovacao = "2026-09-01";
        Assert.Null(Regras.PrioridadeParada(programada, Hoje));
    }

    [Fact]
    public void Pendencia_atrasada_traz_o_fim_da_janela()
    {
        var m = M("a1", Codigos.Programado);
        m.JanelaFim = "2026-10-18";
        var p = Regras.Avaliar(new DadosFrota { Manutencoes = new List<ManutencaoRegistro> { m } }, Hoje, new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc)).Pendencias.Single();
        Assert.Equal("atrasada", p.Tipo);
        Assert.Equal("Janela até 18/10/2026 e ainda não realizada", p.Detalhe);
        Assert.Equal("a1", p.ManutencaoId);
    }

    [Fact]
    public void Preventiva_usa_o_km_da_realizacao()
    {
        var dados = new DadosFrota
        {
            Veiculos = { new Veiculo { Id = "v1", Placa = "ABC1A11", Status = Codigos.VeiculoAtivo, Categoria = Codigos.Proprio, Hodometro = 30000 } },
            Itens = { new ItemPlano { Id = "oleo", Nome = "Troca de óleo", Servico = 100000000, IntervaloKm = 10000 } },
            Manutencoes = { new ManutencaoRegistro { Id = "r", Status = Codigos.Realizado, DataManutencao = "2026-10-10", CriadoEm = "2026-10-09", Km = 20000, KmRealizado = 29500, VeiculoId = "v1", Servicos = { 100000000 } } },
        };
        Assert.Empty(Regras.Preventivas(dados, Hoje)); // 29.500 + 10.000 > 30.000 + aviso
        dados.Manutencoes[0].KmRealizado = null;
        Assert.Single(Regras.Preventivas(dados, Hoje)); // pelo km do pedido estaria a vencer
    }
}
