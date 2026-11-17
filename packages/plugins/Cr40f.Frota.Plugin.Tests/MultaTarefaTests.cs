using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaTarefaTests
{
    private const string Hoje = "2026-11-17";
    private static readonly Guid Junior = Guid.NewGuid(), Outro = Guid.NewGuid();

    private static (FakeMundo Mundo, Entity Multa) Cenario(int status = MultaCodigos.Identificar)
    {
        var mundo = new FakeMundo();
        var equipe = mundo.Add(new Entity("cr40f_plannerequipe") { ["cr40f_nome"] = "Frota", ["cr40f_responsavelprincipal"] = new EntityReference("cr40f_funcionarios", Junior) });
        mundo.Add(new Entity("cr40f_plannerequipemembro") { ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", Outro) });
        mundo.Add(new Entity("cr40f_plannerequipemembro") { ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", Junior) });
        var multa = mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "1A2B3C",
            ["cr40f_placa"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()) { Name = "ABC1D23" },
            ["cr40f_status"] = new OptionSetValue(status),
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 19, 0, 0, 0, DateTimeKind.Utc),
        });
        return (mundo, multa);
    }

    private static MultaTarefa Tarefa(FakeMundo mundo) => new(mundo, Hoje, "https://exemplo.invalid/sistema/");
    private static Entity UnicaTarefa(FakeMundo mundo) => mundo.Linhas(MultaTarefa.Tarefas).Single();
    private static List<Entity> Eventos(FakeMundo mundo) => mundo.Linhas(MultaTarefa.Eventos);

    [Fact]
    public void Cria_a_tarefa_da_multa_nova_com_a_equipe_Frota()
    {
        var (mundo, multa) = Cenario();

        Tarefa(mundo).Sincronizar(multa.Id, criacao: true, statusAnterior: null);

        var t = UnicaTarefa(mundo);
        Assert.Equal("Multa 1A2B3C · ABC1D23 · Definir o responsável", t["cr40f_titulo"]);
        Assert.Equal(MultaTarefa.Codigo(multa.Id), t["cr40f_codigoorigem"]);
        Assert.Equal(MultaTarefa.OrigemMulta, t.GetAttributeValue<OptionSetValue>("cr40f_origem").Value);
        Assert.Equal(multa.Id, t.GetAttributeValue<EntityReference>("cr40f_multa").Id);
        Assert.Equal(MultaTarefa.Afazer, t.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(MultaTarefa.Urgente, t.GetAttributeValue<OptionSetValue>("cr40f_prioridade").Value);
        Assert.Equal(new DateTime(2026, 11, 19, 12, 0, 0, DateTimeKind.Utc), t["cr40f_prazo"]);
        Assert.Contains("https://exemplo.invalid/sistema/#/frota-multas?registro=multa:" + multa.Id.ToString("D"), (string)t["cr40f_descricao"]);
        Assert.Equal(Junior, t.GetAttributeValue<EntityReference>("cr40f_cr40f_funcionarioresponsavel").Id);
        Assert.Equal(new[] { Junior, Outro }, mundo.Linhas(MultaTarefa.Responsaveis).Select(r => r.GetAttributeValue<EntityReference>("cr40f_funcionario").Id));
        Assert.Single(mundo.Linhas(MultaTarefa.TarefaEquipes));
        Assert.Contains(Eventos(mundo), e => e.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value == 100000000 && (string)e["cr40f_descricao"] == "Tarefa criada.");
        var atribuicao = Eventos(mundo).Single(e => (string)e["cr40f_campo"] == "notification:assignment");
        Assert.Equal(100000003, atribuicao.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value);
        Assert.Contains(Junior.ToString(), (string)atribuicao["cr40f_valornovo"]);
        Assert.Contains("\"sourceType\":\"multa\"", (string)atribuicao["cr40f_valornovo"]);
    }

    [Fact]
    public void Nao_duplica_a_tarefa()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        Assert.Single(mundo.Linhas(MultaTarefa.Tarefas));
    }

    [Fact]
    public void Multa_antiga_sem_tarefa_nao_ganha_tarefa_no_update()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, criacao: false, statusAnterior: MultaCodigos.Identificar);
        Assert.Empty(mundo.Linhas(MultaTarefa.Tarefas));
    }

    [Fact]
    public void Sincroniza_titulo_checklist_e_registra_a_etapa_nova()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Indicar), ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Outro) { Name = "Bruno (fictício)" } });

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Identificar);

        var t = UnicaTarefa(mundo);
        Assert.Equal("Multa 1A2B3C · ABC1D23 · Avisar o motorista", t["cr40f_titulo"]);
        var checklist = Json.Ler<List<ItemChecklist>>((string)t["cr40f_checklistjson"]);
        Assert.Equal(new[] { "multa-definir-responsavel:True", "multa-avisar-motorista:False", "multa-registrar-indicacao:False", "multa-registrar-pagamento:False", "multa-registrar-acerto:False" },
            checklist.Select(i => $"{i.Id}:{i.Done}"));
        Assert.Equal("Definir o responsável", checklist[0].Title);
        var etapa = Eventos(mundo).Single(e => (string)e["cr40f_campo"] == "multa:etapa");
        Assert.Equal(100000002, etapa.GetAttributeValue<OptionSetValue>("cr40f_tipo").Value);
        Assert.Equal("Multa: 1. Identificar o responsável → 2. Indicar no órgão.", etapa["cr40f_descricao"]);
    }

    [Fact]
    public void Fecha_quando_a_multa_encerra_e_reabre_se_concluida_com_a_multa_aberta()
    {
        var (mundo, multa) = Cenario(MultaCodigos.Acertar);
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Encerrada) });

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Acertar);
        Assert.Equal(MultaTarefa.Concluida, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Contains(Eventos(mundo), e => (string)e["cr40f_descricao"] == "Tarefa concluída: a multa foi encerrada.");

        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_status"] = new OptionSetValue(MultaCodigos.Recurso) });
        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Encerrada);
        Assert.Equal(MultaTarefa.Afazer, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Contains(Eventos(mundo), e => (string)e["cr40f_descricao"] == "Tarefa reaberta: a multa ainda está aberta.");
    }

    [Theory]
    [InlineData("2026-11-10", MultaTarefa.Urgente)]
    [InlineData("2026-11-20", MultaTarefa.Urgente)]
    [InlineData("2026-11-24", MultaTarefa.Alta)]
    [InlineData("2026-12-01", MultaTarefa.Media)]
    [InlineData(null, MultaTarefa.Media)]
    public void Prioridade_pelo_proximo_prazo(string? prazo, int esperada) => Assert.Equal(esperada, MultaTarefa.Prioridade(prazo, Hoje));

    [Fact]
    public void Plugin_relanca_a_falha_com_trace_para_o_job_assincrono()
    {
        var mundo = new FakeMundo();
        var ctx = Contexto.Gravacao("Create", new Entity(MultaMapper.Tabela, Guid.NewGuid()), stage: 40);

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTarefaPlugin(), ctx, mundo));

        Assert.Contains("tarefa da multa", erro.Message);
        Assert.Contains(mundo.Traces, t => t.StartsWith("MultaTarefa"));
    }
}
