using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Cadastro.Plugin.Tests;

/// <summary>Tabelas em memória: Create/Update/Retrieve e RetrieveMultiple com filtro Equal (sem join; demais operadores ignorados).</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();
    /// <summary>Simula usuário sem privilégio de leitura em todo Retrieve.</summary>
    public bool NegarLeitura { get; set; }

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            lista.Add(linha);
        }
        return this;
    }

    public IEnumerable<Entity> Linhas(string tabela) => _tabelas.TryGetValue(tabela, out var l) ? l : Enumerable.Empty<Entity>();

    public Guid Create(Entity entity) { if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid(); Com(entity); Criados.Add(entity); return entity.Id; }
    public void Update(Entity entity) { Atualizados.Add(entity); var alvo = _tabelas[entity.LogicalName].Single(e => e.Id == entity.Id); foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value; }
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        if (NegarLeitura) throw new InvalidOperationException("Principal user is missing prvReadcr40f_reservadeveculos privilege");
        return Linhas(entityName).Single(e => e.Id == id);
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expressao = (QueryExpression)query;
        var linhas = Linhas(expressao.EntityName)
            .Where(e => expressao.Criteria.Conditions.All(c => c.Operator != ConditionOperator.Equal || Equals(Valor(e, c.AttributeName, expressao.EntityName), c.Values[0])))
            .ToList();
        return new EntityCollection(linhas) { MoreRecords = false };
    }

    private static object? Valor(Entity e, string atributo, string tabela)
    {
        if (atributo == tabela + "id") return e.Id;
        if (!e.Contains(atributo)) return null;
        return e[atributo] switch { OptionSetValue o => o.Value, EntityReference r => r.Id, var v => v };
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
