using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Prontuario.Plugin.Tests;

/// <summary>Tabelas em memória com RowVersion (concorrência otimista) e Execute configurável.</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    private int _versao;
    public List<Entity> Criados { get; } = new();
    public List<OrganizationRequest> Executados { get; } = new();
    public Func<OrganizationRequest, OrganizationResponse?>? AoExecutar { get; set; }

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            linha.RowVersion = (++_versao).ToString();
            lista.Add(linha);
        }
        return this;
    }

    public Entity? Linha(string tabela, Guid id) => _tabelas.TryGetValue(tabela, out var l) ? l.SingleOrDefault(e => e.Id == id) : null;

    public Guid Create(Entity entity)
    {
        if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
        var copia = new Entity(entity.LogicalName, entity.Id);
        foreach (var kv in entity.Attributes) copia[kv.Key] = kv.Value;
        Com(copia); Criados.Add(entity);
        return entity.Id;
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        var linha = Linha(entityName, id) ?? throw new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147220969, Message = "Does Not Exist" });
        // Devolve cópia, como o Dataverse: mudar o retorno não altera a tabela.
        var copia = new Entity(entityName, id) { RowVersion = linha.RowVersion };
        foreach (var kv in linha.Attributes) copia[kv.Key] = kv.Value;
        return copia;
    }

    public void Update(Entity entity) => Execute(new UpdateRequest { Target = entity });

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        var linhas = (_tabelas.TryGetValue(q.EntityName, out var l) ? l : new List<Entity>())
            .Where(e => q.Criteria.Conditions.All(c => Equals(Valor(e, c.AttributeName, q.EntityName), c.Values[0])))
            .ToList();
        return new EntityCollection(linhas);
    }

    private static object? Valor(Entity e, string atributo, string tabela)
    {
        if (atributo == tabela + "id") return e.Id;
        if (!e.Contains(atributo)) return null;
        return e[atributo] is EntityReference r ? r.Id : e[atributo];
    }

    public OrganizationResponse Execute(OrganizationRequest request)
    {
        Executados.Add(request);
        if (request is UpdateRequest up)
        {
            var alvo = Linha(up.Target.LogicalName, up.Target.Id) ?? throw new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147220969 });
            if (up.ConcurrencyBehavior == ConcurrencyBehavior.IfRowVersionMatches && up.Target.RowVersion != alvo.RowVersion)
                throw new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882), Message = "The version of the existing record doesn't match" });
            foreach (var kv in up.Target.Attributes) alvo[kv.Key] = kv.Value;
            alvo.RowVersion = (++_versao).ToString();
            return new UpdateResponse();
        }
        return AoExecutar?.Invoke(request) ?? throw new NotSupportedException(request.RequestName);
    }

    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}
