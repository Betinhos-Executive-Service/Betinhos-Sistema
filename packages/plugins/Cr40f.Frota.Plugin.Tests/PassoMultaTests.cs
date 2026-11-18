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
    public void DadosJson_null_vale_dados_vazios_e_a_regra_recusa_sem_estourar()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Identificar);
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => PassoMultaPlugin.Executar(mundo, multa.Id, Passos.DefinirResponsavel, "null", Hoje));
        Assert.Equal("Escolha o responsável: motorista ou empresa.", erro.Message);
        Assert.Empty(mundo.Atualizados);
    }

    [Fact]
    public void Falha_tecnica_vira_mensagem_fixa_e_o_detalhe_fica_so_no_trace()
    {
        var mundo = new FakeMundo();
        var inexistente = Guid.NewGuid();
        var ctx = Contexto.Api(PassoMultaPlugin.Mensagem, new Dictionary<string, object> { ["MultaId"] = inexistente, ["Passo"] = Passos.AvisarMotorista, ["DadosJson"] = "{}" });

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new PassoMultaPlugin(), ctx, mundo));

        Assert.Equal("Não foi possível gravar o passo da multa. Recarregue a tela e tente de novo.", erro.Message);
        Assert.DoesNotContain(inexistente.ToString(), erro.Message);
        Assert.Contains(mundo.Traces, t => t.Contains(inexistente.ToString()));
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

        var provedor = Contexto.Rodar(new PassoMultaPlugin(), ctx, mundo);

        // Grava como quem chama (não SYSTEM nem o usuário iniciador).
        Assert.Equal(new Guid?[] { ctx.UserId, null }, provedor.UsuariosPedidos); // quem chama + SYSTEM (parcelas)
        Assert.NotEqual(ctx.UserId, ctx.InitiatingUserId);
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

    private static Entity MultaParaFolha(FakeMundo mundo, Guid motorista) => Multa(mundo, MultaCodigos.Acertar, m =>
    {
        m["cr40f_valorpago"] = new Money(100m);
        m["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", motorista);
        m["cr40f_pagaem"] = new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc);
    });

    [Fact]
    public void Folha_em_tres_cria_as_parcelas_e_nao_encerra()
    {
        var mundo = new FakeMundo();
        var motorista = Guid.NewGuid();
        var dono = Guid.NewGuid();
        var multa = MultaParaFolha(mundo, motorista);

        var json = PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\",\"parcelas\":3}", Hoje, mundo, dono);

        var parcelas = mundo.Criados.Where(e => e.LogicalName == PassoMultaPlugin.Parcelas).OrderBy(e => e.GetAttributeValue<int>("new_numero")).ToList();
        Assert.Equal(new[] { 33.33m, 33.33m, 33.34m }, parcelas.Select(p => p.GetAttributeValue<Money>("new_valor").Value));
        Assert.Equal(new[] { "Multa 1A2B3C · 1/3", "Multa 1A2B3C · 2/3", "Multa 1A2B3C · 3/3" }, parcelas.Select(p => p.GetAttributeValue<string>("new_name")));
        Assert.Equal(new DateTime(2027, 2, 1, 12, 0, 0, DateTimeKind.Utc), parcelas[2]["new_competencia"]);
        Assert.All(parcelas, p =>
        {
            Assert.Equal(multa.Id, p.GetAttributeValue<EntityReference>("new_multa").Id);
            Assert.Equal(motorista, p.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(100000000, p.GetAttributeValue<OptionSetValue>("new_status").Value);
            Assert.Equal(dono, p.GetAttributeValue<EntityReference>("ownerid").Id);
        });
        var gravado = mundo.Atualizados.Single();
        Assert.False(gravado.Contains("cr40f_status"));
        Assert.False(gravado.Contains("cr40f_encerradaem"));
        Assert.Contains("\"descontando\":true", json);
        Assert.Contains("\"proximoPasso\":\"Descontando em folha\"", json);
    }

    [Fact]
    public void Folha_sem_parcelas_informadas_gera_uma()
    {
        var mundo = new FakeMundo();
        var multa = MultaParaFolha(mundo, Guid.NewGuid());
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\"}", Hoje);
        var p = Assert.Single(mundo.Criados.Where(e => e.LogicalName == PassoMultaPlugin.Parcelas));
        Assert.Equal(100m, p.GetAttributeValue<Money>("new_valor").Value);
        Assert.Equal("Multa 1A2B3C · 1/1", p["new_name"]);
    }

    [Fact]
    public void Recusa_da_folha_nao_cria_parcela()
    {
        var mundo = new FakeMundo();
        var multa = Multa(mundo, MultaCodigos.Acertar, m => m["cr40f_valorpago"] = new Money(100m));
        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\"}", Hoje));
        Assert.Equal("A multa não tem motorista; defina o responsável antes.", erro.Message);
        Assert.Empty(mundo.Criados);
    }

    [Fact]
    public void Cancelar_com_parcela_prevista_e_recusado()
    {
        var mundo = new FakeMundo();
        var multa = MultaParaFolha(mundo, Guid.NewGuid());
        PassoMultaPlugin.Executar(mundo, multa.Id, Passos.RegistrarAcerto, "{\"acerto\":\"folha\",\"competencia\":\"2026-12\",\"parcelas\":2}", Hoje);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() =>
            PassoMultaPlugin.Executar(mundo, multa.Id, Passos.Cancelar, "{\"motivoTexto\":\"Teste de cancelamento\"}", Hoje));
        Assert.Equal("Esta multa tem parcelas previstas na folha e não pode ser cancelada.", erro.Message);
    }
}
