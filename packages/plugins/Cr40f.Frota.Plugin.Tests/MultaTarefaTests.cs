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

    private static Entity AddEquipe(FakeMundo mundo, Guid? principal, params Guid[] membros)
    {
        var equipe = mundo.Add(new Entity("cr40f_plannerequipe") { ["cr40f_nome"] = "Frota" });
        if (principal is Guid p) equipe["cr40f_responsavelprincipal"] = new EntityReference("cr40f_funcionarios", p);
        foreach (var m in membros)
            mundo.Add(new Entity("cr40f_plannerequipemembro") { ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", m) });
        return equipe;
    }

    private static (FakeMundo Mundo, Entity Multa) Cenario(int status = MultaCodigos.Identificar, bool comEquipe = true)
    {
        var mundo = new FakeMundo();
        if (comEquipe) AddEquipe(mundo, Junior, Outro, Junior);
        var multa = mundo.Add(new Entity(MultaMapper.Tabela, Guid.NewGuid())
        {
            ["cr40f_novacoluna"] = "1A2B3C",
            ["cr40f_placa"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()) { Name = "ABC1D23" },
            ["cr40f_status"] = new OptionSetValue(status),
            ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 19, 0, 0, 0, DateTimeKind.Utc),
        });
        return (mundo, multa);
    }

    private static MultaTarefa Tarefa(FakeMundo mundo) => new(mundo, Hoje, "https://exemplo.invalid/sistema/", mundo.Traces.Add);
    private static List<Guid> Ids(FakeMundo mundo, string tabela, string coluna) => mundo.Linhas(tabela).Select(r => r.GetAttributeValue<EntityReference>(coluna).Id).ToList();
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
    public void Multa_descontando_em_folha_cria_a_tarefa_concluida_e_fecha_a_aberta()
    {
        var (mundo, multa) = Cenario(MultaCodigos.Acertar);
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        Assert.Equal(MultaTarefa.Afazer, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);

        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id)
        {
            ["cr40f_competenciadesconto"] = new DateTime(2026, 12, 1, 12, 0, 0, DateTimeKind.Utc),
            ["cr40f_acertoem"] = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc),
        });
        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Acertar);
        Assert.Equal(MultaTarefa.Concluida, UnicaTarefa(mundo).GetAttributeValue<OptionSetValue>("cr40f_status").Value);

        var (mundo2, multa2) = Cenario(MultaCodigos.Acertar);
        mundo2.Update(new Entity(MultaMapper.Tabela, multa2.Id)
        {
            ["cr40f_competenciadesconto"] = new DateTime(2026, 12, 1, 12, 0, 0, DateTimeKind.Utc),
            ["cr40f_acertoem"] = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc),
        });
        Tarefa(mundo2).Sincronizar(multa2.Id, true, null);
        Assert.Equal(MultaTarefa.Concluida, UnicaTarefa(mundo2).GetAttributeValue<OptionSetValue>("cr40f_status").Value);
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

    [Fact]
    public void Segunda_sincronizacao_igual_nao_grava_nada()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        var criados = mundo.Criados.Count;
        mundo.Atualizados.Clear();

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Identificar);

        Assert.Empty(mundo.Atualizados);
        Assert.Equal(criados, mundo.Criados.Count);
    }

    [Fact]
    public void So_grava_o_que_mudou()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Atualizados.Clear();
        mundo.Update(new Entity(MultaMapper.Tabela, multa.Id) { ["cr40f_dataparaindicar"] = new DateTime(2026, 12, 20, 0, 0, 0, DateTimeKind.Utc) });
        mundo.Atualizados.Clear();

        Tarefa(mundo).Sincronizar(multa.Id, false, MultaCodigos.Identificar);

        var u = Assert.Single(mundo.Atualizados);
        Assert.Equal(new[] { "cr40f_prazo", "cr40f_prioridade" }, u.Attributes.Select(a => a.Key).OrderBy(k => k).ToArray());
    }

    [Fact]
    public void Repara_a_tarefa_criada_sem_relacoes_nem_evento_de_atribuicao()
    {
        var (mundo, multa) = Cenario();
        var tarefa = mundo.Add(new Entity(MultaTarefa.Tarefas)
        {
            ["cr40f_codigoorigem"] = MultaTarefa.Codigo(multa.Id), ["cr40f_origem"] = new OptionSetValue(MultaTarefa.OrigemMulta),
            ["cr40f_status"] = new OptionSetValue(MultaTarefa.Afazer),
        });

        Tarefa(mundo).Sincronizar(multa.Id, false, null);

        Assert.Equal(new[] { Junior, Outro }, Ids(mundo, MultaTarefa.Responsaveis, "cr40f_funcionario"));
        Assert.Single(mundo.Linhas(MultaTarefa.TarefaEquipes));
        Assert.NotNull(tarefa.GetAttributeValue<EntityReference>("cr40f_equipeplanner"));
        Assert.Equal(Junior, tarefa.GetAttributeValue<EntityReference>("cr40f_cr40f_funcionarioresponsavel").Id);
        var atribuicao = Eventos(mundo).Single(e => (string)e["cr40f_campo"] == "notification:assignment");
        Assert.Contains(Junior.ToString(), (string)atribuicao["cr40f_valornovo"]);

        var criados = mundo.Criados.Count;
        Tarefa(mundo).Sincronizar(multa.Id, false, null);
        Assert.Equal(criados, mundo.Criados.Count);
    }

    [Fact]
    public void Repara_so_o_evento_quando_a_criacao_parou_depois_das_relacoes()
    {
        var (mundo, multa) = Cenario();
        Tarefa(mundo).Sincronizar(multa.Id, true, null);
        mundo.Linhas(MultaTarefa.Eventos).RemoveAll(e => (string)e["cr40f_campo"] == "notification:assignment");

        Tarefa(mundo).Sincronizar(multa.Id, false, null);

        Assert.Equal(2, mundo.Linhas(MultaTarefa.Responsaveis).Count);
        Assert.Single(Eventos(mundo), e => (string)e["cr40f_campo"] == "notification:assignment");
    }

    [Fact]
    public void Equipe_ausente_cria_a_tarefa_sem_responsavel_avisa_no_trace_e_completa_quando_a_equipe_aparece()
    {
        var (mundo, multa) = Cenario(comEquipe: false);

        Tarefa(mundo).Sincronizar(multa.Id, true, null);

        var t = UnicaTarefa(mundo);
        Assert.Null(t.GetAttributeValue<EntityReference>("cr40f_cr40f_funcionarioresponsavel"));
        Assert.Empty(mundo.Linhas(MultaTarefa.Responsaveis));
        Assert.DoesNotContain(Eventos(mundo), e => (string)e["cr40f_campo"] == "notification:assignment");
        Assert.Contains(mundo.Traces, x => x.Contains("equipe Planner \"Frota\" não encontrada"));

        AddEquipe(mundo, Junior, Outro);
        Tarefa(mundo).Sincronizar(multa.Id, false, null);

        Assert.Equal(new[] { Junior, Outro }, Ids(mundo, MultaTarefa.Responsaveis, "cr40f_funcionario"));
        Assert.Single(Eventos(mundo), e => (string)e["cr40f_campo"] == "notification:assignment");
    }

    [Fact]
    public void Equipe_vazia_cria_a_tarefa_sem_responsavel_e_avisa_no_trace()
    {
        var (mundo, multa) = Cenario(comEquipe: false);
        AddEquipe(mundo, null);

        Tarefa(mundo).Sincronizar(multa.Id, true, null);

        Assert.Single(mundo.Linhas(MultaTarefa.Tarefas));
        Assert.Empty(mundo.Linhas(MultaTarefa.Responsaveis));
        Assert.Single(mundo.Linhas(MultaTarefa.TarefaEquipes));
        Assert.Contains(mundo.Traces, x => x.Contains("não tem membros nem responsável principal"));
        Assert.DoesNotContain(Eventos(mundo), e => (string)e["cr40f_campo"] == "notification:assignment");
    }

    [Fact]
    public void Principal_fora_dos_membros_entra_primeiro_com_aviso()
    {
        var (mundo, multa) = Cenario(comEquipe: false);
        AddEquipe(mundo, Junior, Outro);

        Tarefa(mundo).Sincronizar(multa.Id, true, null);

        Assert.Equal(new[] { Junior, Outro }, Ids(mundo, MultaTarefa.Responsaveis, "cr40f_funcionario"));
        Assert.Equal(Junior, UnicaTarefa(mundo).GetAttributeValue<EntityReference>("cr40f_cr40f_funcionarioresponsavel").Id);
        Assert.Contains(mundo.Traces, x => x.Contains("não está entre os membros"));
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
