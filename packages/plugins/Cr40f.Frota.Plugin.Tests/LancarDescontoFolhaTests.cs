using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class LancarDescontoFolhaTests
{
    private const string Hoje = "2026-11-18";

    private static (FakeMundo Mundo, Guid Multa, List<Guid> Parcelas) Cenario(int n)
    {
        var mundo = new FakeMundo();
        var multa = mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "TST0001",
            ["cr40f_status"] = new OptionSetValue(MultaCodigos.Acertar),
            ["cr40f_valorpago"] = new Money(60m),
            ["new_valorguia"] = new Money(100m),
            ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        });
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, $"{{\"acerto\":\"folha\",\"competencia\":\"2026-11\",\"parcelas\":{n}}}", Hoje);
        mundo.Atualizados.Clear();
        return (mundo, multa.Id, mundo.Linhas(PassoMultaPlugin.Parcelas).Select(p => p.Id).ToList());
    }

    private static Action<Guid, string, string> Passo(FakeMundo mundo) => (multa, passo, dados) => PassoMultaPlugin.Executar(mundo, multa, passo, dados, Hoje);

    private static int Status(FakeMundo m, Guid id) => m.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == id).GetAttributeValue<OptionSetValue>("new_status").Value;
    private static int StatusMulta(FakeMundo m, Guid id) => m.Linhas(MultaMapper.Tabela).Single(p => p.Id == id).GetAttributeValue<OptionSetValue>("cr40f_status").Value;

    [Fact]
    public void Lanca_a_primeira_e_a_multa_segue_aberta()
    {
        var (mundo, multa, ids) = Cenario(2);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[0] }, "lancar", Hoje, Passo(mundo));
        Assert.True(r.Parcelas.Single().Ok);
        Assert.Equal(PassoMultaPlugin.Descontada, Status(mundo, ids[0]));
        Assert.Equal(new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc), mundo.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == ids[0])["new_lancadoem"]);
        Assert.Empty(r.Encerradas);
        Assert.Equal(MultaCodigos.Acertar, StatusMulta(mundo, multa));
    }

    [Fact]
    public void Lancar_a_ultima_encerra_e_desfazer_reabre()
    {
        var (mundo, multa, ids) = Cenario(2);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, ids, "lancar", Hoje, Passo(mundo));
        Assert.Equal(new[] { multa.ToString() }, r.Encerradas);
        Assert.Equal(MultaCodigos.Encerrada, StatusMulta(mundo, multa));

        var d = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[1] }, "desfazer", Hoje, Passo(mundo));
        Assert.Equal(new[] { multa.ToString() }, d.Reabertas);
        Assert.Equal(PassoMultaPlugin.Prevista, Status(mundo, ids[1]));
        Assert.Null(mundo.Linhas(PassoMultaPlugin.Parcelas).Single(p => p.Id == ids[1])["new_lancadoem"]);
        Assert.Equal(MultaCodigos.Acertar, StatusMulta(mundo, multa));
        Assert.Null(mundo.Linhas(MultaMapper.Tabela).Single(p => p.Id == multa).GetAttributeValue<DateTime?>("cr40f_encerradaem"));
    }

    [Fact]
    public void Lote_com_recusa_no_meio_segue_as_outras()
    {
        var (mundo, _, ids) = Cenario(3);
        LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[1] }, "lancar", Hoje, Passo(mundo));
        var inexistente = Guid.NewGuid();
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { ids[0], ids[1], inexistente, ids[2] }, "lancar", Hoje, Passo(mundo));
        Assert.Equal(new[] { true, false, false, true }, r.Parcelas.Select(p => p.Ok));
        Assert.Equal("Esta parcela já foi lançada.", r.Parcelas[1].Erro);
        Assert.Equal("Parcela não encontrada.", r.Parcelas[2].Erro);
        Assert.Single(r.Encerradas);
    }

    [Fact]
    public void Desfazer_parcela_prevista_recusa()
    {
        var (mundo, _, ids) = Cenario(1);
        var r = LancarDescontoFolhaPlugin.Executar(mundo, ids, "desfazer", Hoje, Passo(mundo));
        Assert.Equal("Esta parcela ainda não foi lançada.", r.Parcelas.Single().Erro);
    }

    [Theory]
    [InlineData("apagar", 1, "Ação inválida: use lancar ou desfazer.")]
    [InlineData("lancar", 0, "Escolha de 1 a 200 parcelas.")]
    [InlineData("lancar", 201, "Escolha de 1 a 200 parcelas.")]
    public void Entrada_invalida_recusa(string acao, int quantos, string mensagem)
    {
        var mundo = new FakeMundo();
        var ids = Enumerable.Range(0, quantos).Select(_ => Guid.NewGuid()).ToList();
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => LancarDescontoFolhaPlugin.Executar(mundo, ids, acao, Hoje, Passo(mundo)));
        Assert.Equal(mensagem, erro.Message);
    }

    [Fact]
    public void Parcela_de_termo_lanca_sem_mexer_em_multa()
    {
        var mundo = new FakeMundo();
        var p = mundo.Add(new Entity(PassoMultaPlugin.Parcelas, Guid.NewGuid()) { ["new_status"] = new OptionSetValue(PassoMultaPlugin.Prevista), ["new_termo"] = new EntityReference("new_termomulta", Guid.NewGuid()) });
        var r = LancarDescontoFolhaPlugin.Executar(mundo, new[] { p.Id }, "lancar", Hoje, (_, _, _) => throw new Exception("não deveria chamar o passo"));
        Assert.True(r.Parcelas.Single().Ok);
        Assert.Empty(r.Encerradas);
    }
}
