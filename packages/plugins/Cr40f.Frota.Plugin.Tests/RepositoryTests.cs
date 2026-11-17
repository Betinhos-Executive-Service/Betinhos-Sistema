using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class RepositoryTests
{
    [Fact]
    public void Mapeia_lookup_multisselecao_e_datas_no_fuso_de_Sao_Paulo()
    {
        var veiculoId = Guid.NewGuid();
        var m = new Entity("cr40f_manutencoes", Guid.NewGuid())
        {
            ["cr40f_descricao"] = "Freio",
            ["cr40f_status"] = new OptionSetValue(Codigos.Realizado),
            ["cr40f_graudamanutencao"] = new OptionSetValue(3),
            ["cr40f_placa_carro"] = new EntityReference("cr40f_veiculos", veiculoId) { Name = "ABC1A11" },
            ["new_servicosmanutencao"] = new OptionSetValueCollection { new OptionSetValue(100000007), new OptionSetValue(100000008) },
            ["cr40f_valor"] = new Money(150m),
            ["createdon"] = new DateTime(2026, 10, 20, 1, 30, 0, DateTimeKind.Utc), // 19/10 22:30 em São Paulo
            ["cr40f_agendarpara"] = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), // somente data
            ["cr40f_janelafim"] = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc), // somente data
            ["cr40f_datadaaprovacao"] = new DateTime(2026, 10, 14, 13, 0, 0, DateTimeKind.Utc), // 14/10 10:00 em São Paulo
            ["cr40f_kmrealizado"] = 85200,
        };
        var service = new FakeService().Com(m, new Entity("cr40f_veiculos", veiculoId) { ["cr40f_placa"] = "ABC1A11", ["cr40f_statusdoveiculo"] = new OptionSetValue(Codigos.VeiculoAtivo) });
        var dados = new FrotaRepository(service).Carregar("2026-10-20");
        var manut = dados.Manutencoes.Single();
        Assert.Equal(veiculoId.ToString(), manut.VeiculoId);
        Assert.Equal("ABC1A11", manut.VeiculoLabel);
        Assert.Equal(new[] { 100000007, 100000008 }, manut.Servicos);
        Assert.Equal(150m, manut.Valor);
        Assert.Equal("2026-10-19", manut.CriadoEm);
        Assert.Equal("2026-10-25", manut.AgendarPara);
        Assert.Equal("2026-10-26", manut.JanelaFim);
        Assert.Equal("2026-10-14", manut.DataAprovacao);
        Assert.Equal(85200m, manut.KmRealizado);
        Assert.Equal(4, service.Consultas.Count);
        Assert.Equal(Codigos.VeiculoAtivo, dados.Veiculos.Single().Status);
    }

    [Fact]
    public void Plugin_devolve_json_com_total()
    {
        var json = FrotaPendenciasPlugin.Gerar(new FakeService(), "2026-10-20");
        Assert.Contains("\"total\":0", json);
        Assert.Equal("2026-10-20", FrotaPendenciasPlugin.ResolverHoje(null, new DateTime(2026, 10, 21, 2, 0, 0, DateTimeKind.Utc), () => throw new TimeZoneNotFoundException()));
    }
}
