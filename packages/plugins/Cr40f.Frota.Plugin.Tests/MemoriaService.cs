using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Tests;

/// <summary>Dataverse em memória: Create/Update/Retrieve e RetrieveMultiple com condições Equal, NotEqual, Null e NotIn no nível raiz.</summary>
public sealed class MemoriaService : IOrganizationService
{
    readonly Dictionary<(string, Guid), Entity> _linhas = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();

    public MemoriaService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas) _linhas[(linha.LogicalName, linha.Id)] = Clonar(linha);
        return this;
    }

    public Entity Linha(string tabela, Guid id) => _linhas[(tabela, id)];
    public IEnumerable<Entity> Todas(string tabela) => _linhas.Values.Where(e => e.LogicalName == tabela);

    public Guid Create(Entity entity)
    {
        var id = entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id;
        var nova = Clonar(entity);
        nova.Id = id;
        if (!nova.Contains("statecode")) nova["statecode"] = new OptionSetValue(0);
        _linhas[(nova.LogicalName, id)] = nova;
        Criados.Add(Clonar(nova));
        return id;
    }

    public void Update(Entity entity)
    {
        if (!_linhas.TryGetValue((entity.LogicalName, entity.Id), out var atual)) throw new InvalidOperationException($"{entity.LogicalName} {entity.Id} não existe.");
        foreach (var a in entity.Attributes) atual[a.Key] = a.Value;
        Atualizados.Add(Clonar(entity));
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        if (!_linhas.TryGetValue((entityName, id), out var linha)) throw new InvalidPluginExecutionException($"{entityName} {id} não existe.");
        return Clonar(linha);
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        var linhas = Todas(q.EntityName).Where(e => q.Criteria.Conditions.All(c => Atende(e, c))).Select(Clonar).ToList();
        return new EntityCollection(linhas) { MoreRecords = false };
    }

    static bool Atende(Entity e, ConditionExpression c)
    {
        e.Attributes.TryGetValue(c.AttributeName, out var valor);
        object? bruto = valor switch { EntityReference r => r.Id, OptionSetValue o => o.Value, _ => valor };
        return c.Operator switch
        {
            ConditionOperator.Equal => Equals(bruto, c.Values[0]),
            ConditionOperator.NotEqual => !Equals(bruto, c.Values[0]),
            ConditionOperator.Null => bruto is null,
            ConditionOperator.NotIn => !c.Values.Any(v => Equals(v, bruto)),
            _ => throw new NotSupportedException(c.Operator.ToString()),
        };
    }

    static Entity Clonar(Entity origem)
    {
        var copia = new Entity(origem.LogicalName, origem.Id);
        foreach (var a in origem.Attributes) copia[a.Key] = a.Value;
        return copia;
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
