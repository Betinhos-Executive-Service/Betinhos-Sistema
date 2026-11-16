using System;
using System.IO;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class PluginsTests
{
    [Fact]
    public void Comando_despacha_pela_mensagem_e_devolve_json()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Solicitado), [M.Veiculo] = new EntityReference("cr40f_veiculos", Guid.NewGuid()) });
        var json = ManutencaoComandoPlugin.Executar(memoria, ManutencaoComandoPlugin.Agendar, "{\"manutencaoId\":\"" + id + "\",\"inicio\":\"2026-11-18\",\"fim\":\"2026-11-18\"}", () => DateTime.UtcNow);
        Assert.Contains("\"geralId\":\"", json);
        Assert.Equal(M.Agendado, memoria.Linha(M.Tabela, id).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Comando_com_json_invalido_da_erro_legivel()
    {
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => ManutencaoComandoPlugin.Executar(new MemoriaService(), ManutencaoComandoPlugin.Cancelar, "não é json", () => DateTime.UtcNow));
        Assert.Equal("Pedido inválido.", erro.Message);
    }

    [Fact]
    public void Comando_desconhecido_e_recusado()
        => Assert.Throws<InvalidPluginExecutionException>(() => ManutencaoComandoPlugin.Executar(new MemoriaService(), "cr40f_Outra", "{}", () => DateTime.UtcNow));

    [Fact]
    public void Espelho_programa_a_manutencao_quando_a_linha_ganha_motorista()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Agendado) });
        var pre = new Entity(G.Tabela, Guid.NewGuid())
        {
            [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
            [G.Manutencao] = new EntityReference(M.Tabela, id),
            [G.Status] = new OptionSetValue(G.StatusAProgramar),
        };
        var target = new Entity(G.Tabela, pre.Id)
        {
            [G.Status] = new OptionSetValue(G.StatusProgramado),
            [G.Motorista] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        };

        GeralManutencaoEspelhoPlugin.Aplicar(memoria, target, pre);

        Assert.Equal(M.Programado, memoria.Linha(M.Tabela, id).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Espelho_ignora_linha_de_servico()
    {
        var memoria = new MemoriaService();
        var pre = new Entity(G.Tabela, Guid.NewGuid()) { [G.Categoria] = new OptionSetValue(100000000) };
        GeralManutencaoEspelhoPlugin.Aplicar(memoria, new Entity(G.Tabela, pre.Id) { [G.Status] = new OptionSetValue(G.StatusProgramado) }, pre);
        Assert.Empty(memoria.Atualizados);
    }

    [Fact]
    public void Espelho_nao_grava_quando_nada_muda()
    {
        var id = Guid.NewGuid();
        var memoria = new MemoriaService().Com(new Entity(M.Tabela, id) { [M.Status] = new OptionSetValue(M.Agendado) });
        var pre = new Entity(G.Tabela, Guid.NewGuid()) { [G.Categoria] = new OptionSetValue(G.CategoriaManutencao), [G.Manutencao] = new EntityReference(M.Tabela, id), [G.Status] = new OptionSetValue(G.StatusAProgramar) };
        GeralManutencaoEspelhoPlugin.Aplicar(memoria, new Entity(G.Tabela, pre.Id) { [G.Motorista] = null }, pre);
        Assert.Empty(memoria.Atualizados);
    }

    [Fact]
    public void Registrador_usa_os_atributos_da_imagem_pre_do_espelho()
    {
        // O registrador (net8) não referencia o plugin: o literal dele tem de acompanhar a constante.
        var programa = File.ReadAllText(FixtureParidade.Caminho("..", "..", "..", "..", "..", "..", "packages", "plugins", "tools", "Cr40f.Frota.Registrar", "Program.cs"));
        Assert.Contains("\"" + GeralManutencaoEspelhoPlugin.AtributosPre + "\");", programa);
    }
}
