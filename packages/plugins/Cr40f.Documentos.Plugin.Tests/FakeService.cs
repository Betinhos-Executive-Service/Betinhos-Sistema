using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Documentos.Plugin.Tests;

/// <summary>Só RetrieveMultiple: devolve as linhas da tabela pedida, sem aplicar filtro (os filtros são conferidos em Consultas).</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<QueryExpression> Consultas { get; } = new();

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            lista.Add(linha);
        }
        return this;
    }

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expressao = (QueryExpression)query;
        Consultas.Add(expressao);
        var linhas = _tabelas.TryGetValue(expressao.EntityName, out var lista) ? lista : new List<Entity>();
        return new EntityCollection(new List<Entity>(linhas)) { MoreRecords = false };
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
    public void Update(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
