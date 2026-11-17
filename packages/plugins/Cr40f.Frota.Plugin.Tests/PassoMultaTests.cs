using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class PassoMultaTests
{
    private const string Hoje = "2026-11-17";

    private static Entity Multa(FakeMundo mundo, int status, Action<Entity>? extra = null)
    {
        var m = new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "1A2B3C",
            ["cr40f_status"] = new OptionSetValue(status),
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
        };
        extra?.Invoke(m);
        return mundo.Add(m);
    }

    [Fact]
    public void Grava_o_passo_e_devolve_a_situacao_seguinte()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);

        var json = PassoMultaPlugin.Executar(mundo, multa.Id, Passos.AvisarMotorista, "{}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc), gravado["cr40f_datadeavisoaocondutor"]);
        Assert.Single(gravado.Attributes);
        Assert.Contains("\"pendentes\":[\"RegistrarIndicacao\"]", json);
        Assert.Contains("\"etapa\":\"indicar\"", json);
    }

    [Fact]
    public void Recusa_com_a_mensagem_do_que_fazer_e_nao_grava()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarIndicacao, "{\"canal\":\"dsv\",\"data\":\"2026-11-15\"}", Hoje));

        Assert.Equal("Avise o motorista antes de registrar a indicação.", erro.Message);
        Assert.Empty(mundo.Atualizados);
    }

    [Fact]
    public void Motorista_vira_lookup_e_avanca_para_indicar()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar);
        var motorista = Guid.NewGuid();

        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.DefinirResponsavel, $"{{\"responsavel\":\"motorista\",\"motoristaId\":\"{motorista}\"}}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(motorista, gravado.GetAttributeValue<EntityReference>("cr40f_motorista").Id);
        Assert.Equal("cr40f_funcionarios", gravado.GetAttributeValue<EntityReference>("cr40f_motorista").LogicalName);
        Assert.Equal(MultaCodigos.Motorista, gravado.GetAttributeValue<OptionSetValue>("cr40f_responsavel").Value);
        Assert.Equal(MultaCodigos.Indicar, gravado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void Motorista_que_nao_e_guid_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.DefinirResponsavel, "{\"responsavel\":\"motorista\",\"motoristaId\":\"f1\"}", Hoje));

        Assert.Equal("Motorista inválido.", erro.Message);
    }

    [Fact]
    public void Pagamento_grava_moeda_e_data()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Pagar, m =>
        {
            m["cr40f_responsavel"] = new OptionSetValue(MultaCodigos.Motorista);
            m["cr40f_vencimento"] = new DateTime(2026, 11, 20, 0, 0, 0, DateTimeKind.Utc);
        });

        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarPagamento, "{\"data\":\"2026-11-16\",\"valorPago\":175.88}", Hoje);

        var gravado = mundo.Atualizados.Single();
        Assert.Equal(175.88m, gravado.GetAttributeValue<Money>("cr40f_valorpago").Value);
        Assert.Equal(new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc), gravado["cr40f_pagaem"]);
        Assert.Equal(MultaCodigos.Acertar, gravado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void DadosJson_invalido_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Indicar);
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => PassoMultaPlugin.Executar(mundo, multa.Id, Passos.AvisarMotorista, "{nao e json", Hoje));
        Assert.Equal("Dados do passo inválidos.", erro.Message);
    }

    [Fact]
    public void Plugin_le_as_entradas_e_preenche_MultaJson()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Acertar);
        var ctx = Contexto.Api(PassoMultaPlugin.Mensagem, new Dictionary<string, object>
        {
            ["MultaId"] = multa.Id, ["Passo"] = Passos.RegistrarAcerto, ["DadosJson"] = "{\"acerto\":\"empresa\",\"motivo\":\"culpa-empresa\"}",
        });

        Contexto.Rodar(new PassoMultaPlugin(), ctx, mundo);

        Assert.Contains("\"etapa\":\"encerrada\"", (string)ctx.OutputParameters["MultaJson"]);
        Assert.Equal(MultaCodigos.Encerrada, mundo.Atualizados.Single().GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void Estado_le_datas_somente_data_e_meio_dia()
    {
        var e = new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
            ["cr40f_datadeavisoaocondutor"] = MultaMapper.DataGravada("2026-11-17"),
            ["cr40f_canalindicacao"] = new OptionSetValue(MultaCodigos.Senatran),
        };
        var estado = MultaMapper.Estado(e);
        Assert.Equal("2026-11-30", estado.DataParaIndicar);
        Assert.Equal("2026-11-17", estado.DataAviso);
        Assert.Equal(MultaCodigos.Senatran, estado.Canal);
    }

    // Desvio do plano: cobre o PrazoVencido{indicou:true} da correção da Task 2 (motorista indicado vira lookup).
    [Fact]
    public void PrazoVencido_indicado_sem_motorista_e_recusado_e_com_motorista_grava_o_lookup()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar, m => m["cr40f_dataparaindicar"] = new DateTime(2026, 11, 10, 0, 0, 0, DateTimeKind.Utc));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.PrazoVencido, "{\"indicou\":true,\"canal\":\"dsv\",\"data\":\"2026-11-09\"}", Hoje));
        Assert.Equal("Escolha o motorista que foi indicado.", erro.Message);
        Assert.Empty(mundo.Atualizados);

        var motorista = Guid.NewGuid();
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.PrazoVencido, $"{{\"indicou\":true,\"canal\":\"dsv\",\"data\":\"2026-11-09\",\"motoristaId\":\"{motorista}\"}}", Hoje);
        var gravado = mundo.Atualizados.Single();
        Assert.Equal(motorista, gravado.GetAttributeValue<EntityReference>("cr40f_motorista").Id);
        Assert.Equal(MultaCodigos.Pagar, gravado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }
}
