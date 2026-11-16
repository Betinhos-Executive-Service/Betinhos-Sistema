using System;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class CicloTests
{
    [Fact]
    public void Janela_de_um_dia()
    {
        var (inicio, fim) = Ciclo.ValidarJanela("2026-11-18", "2026-11-18");
        Assert.Equal(new DateTime(2026, 11, 18), inicio);
        Assert.Equal(inicio, fim);
    }

    [Fact]
    public void Janela_de_semana_vai_de_segunda_a_domingo()
    {
        var (inicio, fim) = Ciclo.ValidarJanela("2026-11-16", "2026-11-22");
        Assert.Equal(DayOfWeek.Monday, inicio.DayOfWeek);
        Assert.Equal(DayOfWeek.Sunday, fim.DayOfWeek);
    }

    [Theory]
    [InlineData("2026-11-17", "2026-11-23")] // terça a segunda
    [InlineData("2026-11-16", "2026-11-20")] // segunda a sexta
    [InlineData("2026-11-20", "2026-11-18")] // fim antes do início
    [InlineData("18/11/2026", "18/11/2026")] // formato errado
    public void Janela_invalida_e_recusada(string inicio, string fim)
    {
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarJanela(inicio, fim));
        Assert.Contains("janela", erro.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Inicio_do_dia_em_Brasilia_em_UTC()
    {
        var utc = Ciclo.InicioDoDiaUtc(new DateTime(2026, 11, 16));
        Assert.Equal(new DateTime(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc), utc);
        Assert.Equal(DateTimeKind.Utc, utc.Kind);
    }

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Agendado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Realizado, false)]
    [InlineData(M.Reprovado, false)]
    [InlineData(M.Cancelado, false)]
    public void Agendar_so_em_aberto(int status, bool pode)
        => Confere(() => Ciclo.ExigirAgendavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Agendado, false)]
    [InlineData(M.Programado, false)]
    public void Reprovar_so_solicitado(int status, bool pode)
        => Confere(() => Ciclo.ExigirReprovavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Realizado, false)]
    [InlineData(M.Cancelado, false)]
    public void Cancelar_antes_de_encerrar(int status, bool pode)
        => Confere(() => Ciclo.ExigirCancelavel(status), pode);

    [Theory]
    [InlineData(M.Solicitado, true)] // escritório lança depois do fato
    [InlineData(M.Agendado, true)]
    [InlineData(M.Programado, true)]
    [InlineData(M.Reprovado, false)]
    [InlineData(M.Cancelado, false)]
    public void Concluir_em_aberto(int status, bool pode)
        => Confere(() => Ciclo.ExigirConcluivel(status), pode);

    [Fact]
    public void Conclusao_exige_servicos_do_catalogo_km_valor_e_pagamento()
    {
        var ok = PedidoValido();
        Ciclo.ValidarConclusao(ok);
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Servicos = Array.Empty<int>())));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Servicos = new[] { 999 })));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Km = 0)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Valor = 0)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Pagamento = 1)));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Estabelecimento = " ")));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.CidadeId = "")));
        Assert.Throws<InvalidPluginExecutionException>(() => Ciclo.ValidarConclusao(Com(ok, p => p.Data = "ontem")));
    }

    [Theory]
    [InlineData("2026-11-18T11:30:00-03:00", "2026-11-18T14:30:00Z")] // com deslocamento: converte para UTC
    [InlineData("2026-11-18T14:30:00Z", "2026-11-18T14:30:00Z")] // já em UTC
    [InlineData("2026-11-18T14:30:00", "2026-11-18T14:30:00Z")] // sem fuso: assume UTC
    public void Data_hora_vira_UTC(string entrada, string esperadoUtc)
    {
        var data = Ciclo.LerDataHora(entrada);
        Assert.Equal(DateTime.Parse(esperadoUtc, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal), data);
        Assert.Equal(new DateTime(2026, 11, 18, 14, 30, 0), data);
        Assert.Equal(DateTimeKind.Utc, data.Kind);
    }

    [Theory]
    [InlineData(M.Agendado, G.StatusProgramado, true, M.Programado)]
    [InlineData(M.Programado, G.StatusProgramado, true, null)] // já está
    [InlineData(M.Agendado, G.StatusProgramado, false, null)] // programado sem motorista não vale
    [InlineData(M.Programado, G.StatusAProgramar, false, M.Agendado)] // saiu da programação
    [InlineData(M.Programado, G.StatusConcluido, true, null)] // conclusão é do Concluir
    [InlineData(M.Programado, G.StatusCancelado, true, null)] // cancelamento é do Cancelar
    [InlineData(M.Realizado, G.StatusProgramado, true, null)] // encerrada não muda
    [InlineData(M.Solicitado, G.StatusProgramado, true, null)] // sem encaixe não espelha
    public void Espelho_da_programacao(int manutencao, int geral, bool motorista, int? esperado)
        => Assert.Equal(esperado, Ciclo.Espelho(manutencao, geral, motorista));

    internal static ConcluirPedido PedidoValido() => new()
    {
        ManutencaoId = Guid.NewGuid().ToString(),
        Servicos = new[] { 100000007 },
        Km = 85200,
        Data = "2026-11-18T14:30:00Z",
        Valor = 380.50m,
        Pagamento = M.PagamentoCartao,
        Estabelecimento = "Auto Center Centro",
        CidadeId = Guid.NewGuid().ToString(),
        RealizadoPorId = Guid.NewGuid().ToString(),
        ServicoRealizado = "Troca das pastilhas dianteiras",
        Comentario = "Barulho resolvido",
        LinkNotaFiscal = "https://sharepoint/nota.jpg",
    };

    static ConcluirPedido Com(ConcluirPedido origem, Action<ConcluirPedido> mudar)
    {
        var copia = Json.Ler<ConcluirPedido>(Json.Serializar(origem));
        mudar(copia);
        return copia;
    }

    static void Confere(Action acao, bool pode)
    {
        if (pode) acao();
        else Assert.Throws<InvalidPluginExecutionException>(acao);
    }
}
