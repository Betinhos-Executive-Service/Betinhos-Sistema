using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Portal.Plugin.Tests;

/// <summary>Tabelas em memória: Update/Retrieve e RetrieveMultiple com filtro Equal (demais operadores ignorados).</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<Entity> Atualizados { get; } = new();
    public int Leituras { get; private set; }

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

    public void Update(Entity entity) { Atualizados.Add(entity); var alvo = _tabelas[entity.LogicalName].Single(e => e.Id == entity.Id); foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value; }
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) { Leituras++; return Linhas(entityName).Single(e => e.Id == id); }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        Leituras++;
        var expressao = (QueryExpression)query;
        return new EntityCollection(Linhas(expressao.EntityName)
            .Where(e => Atende(e, expressao.Criteria) && expressao.LinkEntities.All(l => Linhas(l.LinkToEntityName)
                .Any(alvo => Equals(alvo.Id, Valor(e, l.LinkFromAttributeName)) && Atende(alvo, l.LinkCriteria))))
            .ToList());
    }

    private static bool Atende(Entity e, FilterExpression filtro) =>
        filtro.Conditions.All(c => c.Operator != ConditionOperator.Equal || Equals(Valor(e, c.AttributeName), c.Values[0]));

    private static object? Valor(Entity e, string atributo) => !e.Contains(atributo) ? null : e[atributo] switch { OptionSetValue o => o.Value, EntityReference r => r.Id, var v => v };

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}

sealed class FakeContext : IPluginExecutionContext
{
    public FakeContext(string message, string entity, Guid id, int depth) { MessageName = message; PrimaryEntityName = entity; PrimaryEntityId = id; Depth = depth; }
    public int Stage => 40;
    public IPluginExecutionContext ParentContext => null!;
    public int Mode => 0;
    public int IsolationMode => 2;
    public int Depth { get; }
    public string MessageName { get; }
    public string PrimaryEntityName { get; }
    public Guid? RequestId => null;
    public string SecondaryEntityName => "none";
    public ParameterCollection InputParameters { get; } = new();
    public ParameterCollection OutputParameters { get; } = new();
    public ParameterCollection SharedVariables { get; } = new();
    public Guid UserId => Guid.Empty;
    public Guid InitiatingUserId => Guid.Empty;
    public Guid BusinessUnitId => Guid.Empty;
    public Guid OrganizationId => Guid.Empty;
    public string OrganizationName => "teste";
    public Guid PrimaryEntityId { get; }
    public EntityImageCollection PreEntityImages { get; } = new();
    public EntityImageCollection PostEntityImages { get; } = new();
    public EntityReference OwningExtension => null!;
    public Guid CorrelationId => Guid.Empty;
    public bool IsExecutingOffline => false;
    public bool IsOfflinePlayback => false;
    public bool IsInTransaction => true;
    public Guid OperationId => Guid.Empty;
    public DateTime OperationCreatedOn => DateTime.UtcNow;
}
