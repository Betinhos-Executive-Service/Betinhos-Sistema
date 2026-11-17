using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class ItemChecklist
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "title", Order = 2)] public string Title { get; set; } = "";
    [DataMember(Name = "done", Order = 3)] public bool Done { get; set; }
}

[DataContract]
public sealed class ContextoAtribuicao
{
    [DataMember(Name = "actorEmployeeId", Order = 1)] public string ActorEmployeeId { get; set; } = "";
    [DataMember(Name = "actorUserId", Order = 2)] public string ActorUserId { get; set; } = "";
    [DataMember(Name = "creatorEmployeeId", Order = 3)] public string CreatorEmployeeId { get; set; } = "";
    [DataMember(Name = "assigneeIds", Order = 4)] public List<string> AssigneeIds { get; set; } = new();
    [DataMember(Name = "previousAssigneeIds", Order = 5)] public List<string> PreviousAssigneeIds { get; set; } = new();
    [DataMember(Name = "sourceType", Order = 6)] public string SourceType { get; set; } = "multa";
    [DataMember(Name = "sourceCode", Order = 7)] public string SourceCode { get; set; } = "";
    [DataMember(Name = "actorName", Order = 8)] public string ActorName { get; set; } = "Multas (Sistema Betinhos)";
}

/// <summary>
/// Tarefa do Planner de cada multa nova (spec §5.4), no modelo do flow checklist-planner.json: equipe "Frota" (principal primeiro),
/// relações de responsável e equipe, eventos "Tarefa criada." e notification:assignment (o PlannerTaskEventNotificationPlugin
/// dispara o sininho). A cobrança de "vence hoje"/"atrasada" continua com a cobrança diária do Planner.
/// </summary>
public sealed class MultaTarefa
{
    public const string Tarefas = "cr40f_plannertarefa", Eventos = "cr40f_plannertarefaevento", Responsaveis = "cr40f_plannertarearesponsavel";
    public const string TarefaEquipes = "cr40f_plannertarefaequipe", Equipes = "cr40f_plannerequipe", Membros = "cr40f_plannerequipemembro";
    public const int OrigemMulta = 100000003;
    public const int Afazer = 100000000, Concluida = 100000003, Cancelada = 100000004;
    public const int Media = 100000001, Alta = 100000002, Urgente = 100000003;
    private static readonly Dictionary<int, string> ChaveStatus = new() { [100000000] = "todo", [100000001] = "doing", [100000002] = "waiting", [100000003] = "done", [100000004] = "cancelled" };

    private readonly IOrganizationService _s;
    private readonly string _hoje;
    private readonly string _url;

    public MultaTarefa(IOrganizationService system, string hoje, string? urlSistema)
    {
        _s = system;
        _hoje = hoje;
        _url = (urlSistema ?? "").Trim().TrimEnd('#');
    }

    public static string Codigo(Guid multaId) => "MULTA:" + multaId.ToString("D");
    public static string Link(Guid multaId) => "#/frota-multas?registro=multa:" + multaId.ToString("D");

    public static int Prioridade(string? prazo, string hoje)
    {
        if (prazo == null) return Media;
        var dias = Regras.Dias(hoje, prazo);
        return dias <= 3 ? Urgente : dias <= 7 ? Alta : Media;
    }

    public void Sincronizar(Guid multaId, bool criacao, int? statusAnterior)
    {
        var linha = _s.Retrieve(MultaMapper.Tabela, multaId, new ColumnSet(MultaMapper.Colunas));
        var resumo = MultaResumo.De(linha);
        var situacao = MultaEtapas.Avaliar(resumo.Estado, _hoje);
        var tarefa = Buscar(multaId);
        if (tarefa == null)
        {
            if (criacao) Criar(resumo, situacao);
            return;
        }
        Atualizar(tarefa, resumo, situacao, statusAnterior);
    }

    private Entity? Buscar(Guid multaId)
    {
        var q = new QueryExpression(Tarefas) { ColumnSet = new ColumnSet("cr40f_status"), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_codigoorigem", ConditionOperator.Equal, Codigo(multaId));
        return _s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    private void Preencher(Entity t, MultaResumo m, MultaSituacao s)
    {
        t["cr40f_titulo"] = Limitar($"Multa {m.Auto} · {m.Placa ?? "sem placa"} · {s.ProximoPasso}", 200);
        t["cr40f_descricao"] = $"Multa {m.Auto} · {m.Placa ?? "sem placa"}.\nAbrir no Sistema Betinhos: {_url}{Link(m.Id)}";
        t["cr40f_checklistjson"] = Json.Serializar(Checklist(m.Estado, s));
        t["cr40f_prioridade"] = new OptionSetValue(Prioridade(s.ProximoPrazo, _hoje));
        t["cr40f_prazo"] = s.ProximoPrazo == null ? null : MultaMapper.DataGravada(s.ProximoPrazo);
    }

    private void Criar(MultaResumo m, MultaSituacao s)
    {
        var equipe = EquipeFrota();
        var responsaveis = equipe == null ? new List<Guid>() : Ordenar(MembrosDa(equipe.Id), equipe.GetAttributeValue<EntityReference>("cr40f_responsavelprincipal")?.Id);
        var t = new Entity(Tarefas)
        {
            ["cr40f_status"] = new OptionSetValue(MultaEtapas.Aberta(s.Etapa) ? Afazer : Concluida),
            ["cr40f_origem"] = new OptionSetValue(OrigemMulta),
            ["cr40f_codigoorigem"] = Codigo(m.Id),
            ["cr40f_multa"] = new EntityReference(MultaMapper.Tabela, m.Id),
        };
        Preencher(t, m, s);
        if (equipe != null) t["cr40f_equipeplanner"] = equipe.ToEntityReference();
        if (responsaveis.Count > 0) t["cr40f_cr40f_funcionarioresponsavel"] = new EntityReference("cr40f_funcionarios", responsaveis[0]);
        var id = _s.Create(t);
        var tarefa = new EntityReference(Tarefas, id);
        foreach (var f in responsaveis)
            _s.Create(new Entity(Responsaveis) { ["cr40f_tarefa"] = tarefa, ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", f), ["cr40f_name"] = $"{id}-{f}" });
        if (equipe != null)
            _s.Create(new Entity(TarefaEquipes) { ["cr40f_tarefa"] = tarefa, ["cr40f_equipe"] = equipe.ToEntityReference(), ["cr40f_name"] = $"{id}-{equipe.Id}" });
        Evento(id, 100000000, "Tarefa criada.", "", "", "");
        if (responsaveis.Count > 0)
        {
            var contexto = new ContextoAtribuicao { AssigneeIds = responsaveis.Select(g => g.ToString("D")).ToList(), SourceCode = Codigo(m.Id) };
            Evento(id, 100000003, "Responsáveis atribuídos.", "notification:assignment", "", Json.Serializar(contexto));
        }
    }

    private void Atualizar(Entity tarefa, MultaResumo m, MultaSituacao s, int? statusAnterior)
    {
        var u = new Entity(Tarefas, tarefa.Id);
        Preencher(u, m, s);
        var atual = tarefa.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value ?? Afazer;
        var aberta = MultaEtapas.Aberta(s.Etapa);
        int? novo = !aberta && atual != Concluida ? Concluida : aberta && (atual == Concluida || atual == Cancelada) ? Afazer : null;
        if (novo is int n) u["cr40f_status"] = new OptionSetValue(n);
        _s.Update(u);
        if (statusAnterior is int antes && MultaEtapas.Etapa(antes) != s.Etapa)
        {
            var de = MultaEtapas.Etapa(antes);
            Evento(tarefa.Id, 100000002, $"Multa: {MultaEtapas.RotuloEtapa[de]} → {MultaEtapas.RotuloEtapa[s.Etapa]}.", "multa:etapa", de, s.Etapa);
        }
        if (novo == Concluida) Evento(tarefa.Id, 100000002, "Tarefa concluída: a multa foi encerrada.", "status", ChaveStatus[atual], "done");
        else if (novo == Afazer) Evento(tarefa.Id, 100000002, "Tarefa reaberta: a multa ainda está aberta.", "status", ChaveStatus[atual], "todo");
    }

    public static List<ItemChecklist> Checklist(MultaEstado m, MultaSituacao s)
    {
        var etapa = s.Etapa;
        var depoisDe = new Func<string, bool>(e => Ordem(etapa) > Ordem(e));
        var itens = new List<ItemChecklist> { Item(Passos.DefinirResponsavel, etapa != MultaEtapas.Identificar) };
        var empresa = MultaEtapas.ResponsavelEfetivo(m) == MultaCodigos.Empresa;
        if (!empresa)
        {
            itens.Add(Item(Passos.AvisarMotorista, m.DataAviso != null || depoisDe(MultaEtapas.Indicar)));
            itens.Add(Item(Passos.RegistrarIndicacao, (m.DataIndicacao != null && m.Canal != null) || depoisDe(MultaEtapas.Indicar)));
            if (m.Canal == MultaCodigos.Senatran) itens.Add(Item(Passos.RegistrarAceite, m.AceiteEm != null || depoisDe(MultaEtapas.Indicar)));
        }
        itens.Add(Item(Passos.RegistrarPagamento, m.PagaEm != null));
        if (!empresa) itens.Add(Item(Passos.RegistrarAcerto, m.AcertoEm != null));
        return itens;
    }

    private static int Ordem(string etapa) => etapa switch
    {
        MultaEtapas.Identificar => 1, MultaEtapas.Indicar => 2, MultaEtapas.Pagar => 3, MultaEtapas.Recurso => 3, MultaEtapas.Acertar => 4, _ => 5,
    };

    private static ItemChecklist Item(string passo, bool feito) => new()
    {
        Id = "multa-" + string.Concat(passo.Select((c, i) => char.IsUpper(c) && i > 0 ? "-" + char.ToLowerInvariant(c) : char.ToLowerInvariant(c).ToString())),
        Title = MultaEtapas.RotuloPasso[passo],
        Done = feito,
    };

    private Entity? EquipeFrota()
    {
        var q = new QueryExpression(Equipes) { ColumnSet = new ColumnSet("cr40f_responsavelprincipal"), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_nome", ConditionOperator.Equal, "Frota");
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.AddOrder("createdon", OrderType.Ascending);
        return _s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    private List<Guid> MembrosDa(Guid equipeId)
    {
        var q = new QueryExpression(Membros) { ColumnSet = new ColumnSet("cr40f_funcionario") };
        q.Criteria.AddCondition("cr40f_equipe", ConditionOperator.Equal, equipeId);
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.Criteria.AddCondition("cr40f_funcionario", ConditionOperator.NotNull);
        return _s.RetrieveMultiple(q).Entities.Select(e => e.GetAttributeValue<EntityReference>("cr40f_funcionario").Id).Distinct().ToList();
    }

    private static List<Guid> Ordenar(List<Guid> membros, Guid? principal) =>
        principal is Guid p && membros.Contains(p) ? new[] { p }.Concat(membros.Where(m => m != p)).ToList() : membros;

    private void Evento(Guid tarefaId, int tipo, string descricao, string campo, string anterior, string novo) =>
        _s.Create(new Entity(Eventos)
        {
            ["cr40f_tarefa"] = new EntityReference(Tarefas, tarefaId), ["cr40f_tipo"] = new OptionSetValue(tipo), ["cr40f_descricao"] = descricao,
            ["cr40f_campo"] = campo, ["cr40f_valoranterior"] = anterior, ["cr40f_valornovo"] = novo, ["cr40f_ocorridoem"] = DateTime.UtcNow,
        });

    private static string Limitar(string texto, int max) => texto.Length <= max ? texto : texto.Substring(0, max);
}
