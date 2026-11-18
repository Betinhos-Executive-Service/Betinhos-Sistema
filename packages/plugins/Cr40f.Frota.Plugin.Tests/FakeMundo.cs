using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Tests;

/// <summary>Dataverse em memória para os plugins das multas. Filtros: Equal, In, NotNull, GreaterEqual, LessEqual (só no Criteria raiz).</summary>
public sealed class FakeMundo : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();
    public List<string> Traces { get; } = new();

    public List<Entity> Linhas(string tabela)
    {
        if (!_tabelas.TryGetValue(tabela, out var lista)) _tabelas[tabela] = lista = new List<Entity>();
        return lista;
    }

    public Entity Add(Entity linha)
    {
        if (linha.Id == Guid.Empty) linha.Id = Guid.NewGuid();
        Linhas(linha.LogicalName).Add(linha);
        return linha;
    }

    /// <summary>Definição de variável de ambiente com o valor padrão (como a migration cria).</summary>
    public FakeMundo Variavel(string schema, string valor)
    {
        Add(new Entity("environmentvariabledefinition") { ["schemaname"] = schema, ["defaultvalue"] = valor });
        return this;
    }

    private static Entity Copia(Entity e, Guid id)
    {
        var c = new Entity(e.LogicalName, id);
        foreach (var a in e.Attributes) c[a.Key] = a.Value;
        foreach (var f in e.FormattedValues) c.FormattedValues[f.Key] = f.Value;
        return c;
    }

    public Guid Create(Entity entity)
    {
        var c = Copia(entity, entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id);
        Linhas(c.LogicalName).Add(c);
        Criados.Add(c);
        return c.Id;
    }

    public void Update(Entity entity)
    {
        var atual = Linhas(entity.LogicalName).Single(r => r.Id == entity.Id);
        foreach (var a in entity.Attributes) atual[a.Key] = a.Value;
        Atualizados.Add(Copia(entity, entity.Id));
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) =>
        Copia(Linhas(entityName).SingleOrDefault(r => r.Id == id) ?? throw new InvalidOperationException($"{entityName} {id} não existe."), id);

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        IEnumerable<Entity> linhas = Linhas(q.EntityName);
        foreach (var c in q.Criteria.Conditions) linhas = linhas.Where(r => Casa(r, c)).ToList();
        if (q.TopCount is int top) linhas = linhas.Take(top);
        return new EntityCollection(linhas.Select(r => Copia(r, r.Id)).ToList()) { MoreRecords = false };
    }

    private static object? Norm(object? v) => v switch { OptionSetValue o => o.Value, EntityReference r => r.Id, Money m => m.Value, _ => v };

    private static bool Casa(Entity r, ConditionExpression c)
    {
        var v = Norm(r.Contains(c.AttributeName) ? r[c.AttributeName] : c.AttributeName == r.LogicalName + "id" ? r.Id : null); // chave primária não vem em Attributes
        if (c.AttributeName == "statecode" && v == null) v = 0;
        switch (c.Operator)
        {
            case ConditionOperator.Equal:
                return Equals(v, Norm(c.Values[0])) || (v is string s && string.Equals(s, Convert.ToString(c.Values[0]), StringComparison.OrdinalIgnoreCase));
            case ConditionOperator.In: return c.Values.Select(Norm).Any(x => Equals(x, v));
            case ConditionOperator.NotNull: return v != null;
            case ConditionOperator.Null: return v == null;
            case ConditionOperator.GreaterEqual: return v is DateTime a && a >= (DateTime)c.Values[0];
            case ConditionOperator.LessEqual: return v is DateTime b && b <= (DateTime)c.Values[0];
            default: throw new NotSupportedException(c.Operator.ToString());
        }
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException(request.RequestName);
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
