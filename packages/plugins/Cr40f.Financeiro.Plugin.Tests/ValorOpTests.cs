using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Financeiro.Plugin;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

public class ValorOpTests
{
    static readonly Guid Op1 = Guid.NewGuid(), Op2 = Guid.NewGuid(), Cp1 = Guid.NewGuid(), Cp2 = Guid.NewGuid(), R1 = Guid.NewGuid(), R2 = Guid.NewGuid(), R3 = Guid.NewGuid();

    static FakeService Base()
    {
        var s = new FakeService();
        s.Add(new Entity(Codigos.Op, Op1));
        s.Add(new Entity(Codigos.Op, Op2) { [Codigos.OpValor] = new Money(50m) });
        s.Add(new Entity(Codigos.Composicao, Cp1) { [Codigos.CpValor] = new Money(1000m) });
        s.Add(new Entity(Codigos.Composicao, Cp2) { [Codigos.CpValor] = new Money(246.66m) });
        s.Add(new Entity(Codigos.Reserva, R1) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op1), [Codigos.ReservaCpLookup] = new EntityReference(Codigos.Composicao, Cp1) });
        s.Add(new Entity(Codigos.Reserva, R2) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op1), [Codigos.ReservaCpLookup] = new EntityReference(Codigos.Composicao, Cp2) });
        s.Add(new Entity(Codigos.Reserva, R3) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op1) }); // sem composição: conta 0, como no SyncEngine
        return s;
    }

    [Fact]
    public void CalcularSomaCentavosENullSemReserva()
    {
        Assert.Equal(124666, ValorOpPlugin.Calcular(new[] { 100000, 24666, 0 }));
        Assert.Null(ValorOpPlugin.Calcular(Array.Empty<int>()));
    }

    [Fact]
    public void AtualizarGravaASomaDasComposicoesDasReservas()
    {
        var s = Base();
        ValorOpPlugin.Atualizar(s, Op1);
        Assert.Equal(1246.66m, s.Get(Codigos.Op, Op1).GetAttributeValue<Money>(Codigos.OpValor).Value);
        Assert.Equal(1, s.Updates);
    }

    [Fact]
    public void AtualizarNaoGravaQuandoNaoMudaELimpaOpSemReserva()
    {
        var s = Base();
        ValorOpPlugin.Atualizar(s, Op1);
        ValorOpPlugin.Atualizar(s, Op1);
        Assert.Equal(1, s.Updates);
        ValorOpPlugin.Atualizar(s, Op2); // Op2 tinha 50,00 e nenhuma reserva
        Assert.Null(s.Get(Codigos.Op, Op2).GetAttributeValue<Money>(Codigos.OpValor));
    }

    [Fact]
    public void ReservaMovidaRecalculaOpAntigaENova()
    {
        var s = Base();
        var ctx = new FakeContext("Update", Codigos.Reserva, R1, 40) { Target = new Entity(Codigos.Reserva, R1) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op2) } };
        ctx.PreEntityImages[ValorOpPlugin.ImagemAnterior] = new Entity(Codigos.Reserva, R1) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op1) };
        Assert.Equal(new[] { Op1, Op2 }.OrderBy(g => g), ValorOpPlugin.OpsAfetadas(ctx, s).OrderBy(g => g));
    }

    [Fact]
    public void ComposicaoAlteradaAchaAsOpsDasReservas()
    {
        var s = Base();
        Assert.Equal(new[] { Op1 }, ValorOpPlugin.OpsAfetadas(new FakeContext("Update", Codigos.Composicao, Cp2, 40), s));
    }

    [Fact]
    public void ComposicaoExcluidaGuardaAsOpsNoPreENoPosRecalcula()
    {
        var s = Base();
        var pre = new FakeContext("Delete", Codigos.Composicao, Cp1, 20);
        Assert.Empty(ValorOpPlugin.OpsAfetadas(pre, s));
        var pos = new FakeContext("Delete", Codigos.Composicao, Cp1, 40);
        pos.SharedVariables[ValorOpPlugin.OpsDaComposicaoExcluida] = pre.SharedVariables[ValorOpPlugin.OpsDaComposicaoExcluida];
        Assert.Equal(new[] { Op1 }, ValorOpPlugin.OpsAfetadas(pos, s));
    }

    [Fact]
    public void ReservaExcluidaUsaAImagemAnterior()
    {
        var s = Base();
        var ctx = new FakeContext("Delete", Codigos.Reserva, R2, 40);
        ctx.PreEntityImages[ValorOpPlugin.ImagemAnterior] = new Entity(Codigos.Reserva, R2) { [Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, Op1) };
        Assert.Equal(new[] { Op1 }, ValorOpPlugin.OpsAfetadas(ctx, s));
    }
}

/// <summary>Serviço em memória: Retrieve, Update e RetrieveMultiple com condições Equal, NotNull e In.</summary>
sealed class FakeService : IOrganizationService
{
    readonly Dictionary<(string, Guid), Entity> _rows = new();
    public int Updates { get; private set; }
    public void Add(Entity e) => _rows[(e.LogicalName, e.Id)] = e;
    public Entity Get(string name, Guid id) => _rows[(name, id)];

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => Clone(_rows[(entityName, id)]);
    public void Update(Entity entity)
    {
        Updates++;
        var row = _rows[(entity.LogicalName, entity.Id)];
        foreach (var a in entity.Attributes) row[a.Key] = a.Value;
    }
    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var q = (QueryExpression)query;
        var rows = _rows.Values.Where(r => r.LogicalName == q.EntityName && q.Criteria.Conditions.All(c => Matches(r, c)));
        return new EntityCollection(rows.Select(Clone).ToList());
    }

    static bool Matches(Entity r, ConditionExpression c)
    {
        object? v = c.AttributeName == r.LogicalName + "id" ? r.Id : r.Contains(c.AttributeName) ? r[c.AttributeName] : null;
        var id = v is EntityReference er ? er.Id : v as Guid?;
        return c.Operator switch
        {
            ConditionOperator.NotNull => v != null,
            ConditionOperator.Equal => id.HasValue && id.Value.Equals(c.Values[0]),
            ConditionOperator.In => id.HasValue && c.Values.Contains(id.Value),
            _ => throw new NotSupportedException(c.Operator.ToString()),
        };
    }

    static Entity Clone(Entity e)
    {
        var c = new Entity(e.LogicalName, e.Id);
        foreach (var a in e.Attributes) c[a.Key] = a.Value;
        return c;
    }

    public Guid Create(Entity entity) => throw new NotSupportedException();
    public void Delete(string entityName, Guid id) => throw new NotSupportedException();
    public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
}

sealed class FakeContext : IPluginExecutionContext
{
    public FakeContext(string message, string entity, Guid id, int stage) { MessageName = message; PrimaryEntityName = entity; PrimaryEntityId = id; Stage = stage; }
    public Entity? Target { set { if (value != null) InputParameters["Target"] = value; } }
    public int Stage { get; }
    public IPluginExecutionContext ParentContext => null!;
    public int Mode => 0;
    public int IsolationMode => 2;
    public int Depth => 1;
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
