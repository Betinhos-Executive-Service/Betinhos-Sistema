using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>Tabelas em memória: Create/Update/Retrieve e RetrieveMultiple com filtro Equal (sem join).</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<QueryExpression> Consultas { get; } = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            lista.Add(linha);
        }
        return this;
    }

    /// <summary>Nome da tabela cujo Create deve falhar (simula usuário que o Dataverse ainda não aceita).</summary>
    public string? FalharCriacaoEm { get; set; }

    public Action<Entity>? AoCriar { get; set; }
    public Guid Create(Entity entity) { AoCriar?.Invoke(entity); if (entity.LogicalName == FalharCriacaoEm) throw new InvalidOperationException("Create recusado em " + entity.LogicalName);  if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid(); Carimbar(entity, true); Com(entity); Criados.Add(entity); return entity.Id; }
    public void Update(Entity entity) { Atualizados.Add(entity); var alvo = _tabelas[entity.LogicalName].Single(e => e.Id == entity.Id); foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value; Carimbar(alvo, false); }

    private static int _relogio;
    /// <summary>Só nas tabelas da configuração do App: a plataforma carimba createdon/modifiedon, e a marca do rascunho e a ordem das exceções dependem deles.</summary>
    private static void Carimbar(Entity e, bool criacao)
    {
        if (!e.LogicalName.StartsWith("cr40f_appconfig", StringComparison.Ordinal)) return;
        var agora = new DateTime(2026, 11, 23, 12, 0, 0, DateTimeKind.Utc).AddSeconds(System.Threading.Interlocked.Increment(ref _relogio));
        if (criacao) e["createdon"] = agora;
        e["modifiedon"] = agora;
    }
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => _tabelas[entityName].Single(e => e.Id == id);

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expressao = (QueryExpression)query;
        Consultas.Add(expressao);
        var linhas = (_tabelas.TryGetValue(expressao.EntityName, out var lista) ? lista : new List<Entity>())
            .Where(e => expressao.Criteria.Conditions.All(c => c.Operator == ConditionOperator.Null ? Valor(e, c.AttributeName, expressao.EntityName) is null : c.Operator != ConditionOperator.Equal || Equals(Valor(e, c.AttributeName, expressao.EntityName), c.Values[0])))
            .ToList();
        return new EntityCollection(linhas) { MoreRecords = false };
    }

    private static object? Valor(Entity e, string atributo, string tabela)
    {
        if (atributo == tabela + "id" || atributo == "cr40f_funcionariosid") return e.Id;
        if (!e.Contains(atributo)) return null;
        return e[atributo] switch { OptionSetValue o => o.Value, EntityReference r => r.Id, string s => s.ToLowerInvariant(), var v => v };
    }

    public List<(string Tabela, Guid Id)> Excluidos { get; } = new();
    public void Delete(string entityName, Guid id) { _tabelas[entityName].RemoveAll(e => e.Id == id); Excluidos.Add((entityName, id)); }
    public List<Entity> Linhas(string tabela) => _tabelas.TryGetValue(tabela, out var lista) ? lista : new List<Entity>();
    public List<OrganizationRequest> Executados { get; } = new();
    /// <summary>Execute falha (simula SetState recusado pelo Dataverse).</summary>
    public bool FalharExecute { get; set; }
    /// <summary>Execute aceito sem efeito (simula systemuser que continua habilitado).</summary>
    public bool IgnorarExecute { get; set; }
    public OrganizationResponse Execute(OrganizationRequest request)
    {
        Executados.Add(request);
        if (FalharExecute) throw new InvalidOperationException("Execute recusado: " + request.RequestName);
        // SetState de systemuser: estado 1 = desabilitado.
        if (!IgnorarExecute && request is Microsoft.Crm.Sdk.Messages.SetStateRequest { EntityMoniker.LogicalName: "systemuser" } estado)
            _tabelas["systemuser"].Single(e => e.Id == estado.EntityMoniker.Id)["isdisabled"] = estado.State.Value == 1;
        return new OrganizationResponse();
    }
    public List<(string Relacao, Guid Id, Guid Alvo)> Associados { get; } = new();
    public List<(string Relacao, Guid Id, Guid Alvo)> Desassociados { get; } = new();

    private static (string Tabela, string Coluna) Intersecao(string relacao) => relacao switch
    {
        "systemuserroles_association" => ("systemuserroles", "roleid"),
        "systemuserprofiles_association" => ("systemuserprofiles", "fieldsecurityprofileid"),
        _ => throw new NotSupportedException(relacao),
    };

    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            Com(new Entity(tabela, Guid.NewGuid()) { ["systemuserid"] = entityId, [coluna] = alvo.Id });
            Associados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }

    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            if (_tabelas.TryGetValue(tabela, out var linhas))
                linhas.RemoveAll(e => e.GetAttributeValue<Guid>("systemuserid") == entityId && e.GetAttributeValue<Guid>(coluna) == alvo.Id);
            Desassociados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }
}
