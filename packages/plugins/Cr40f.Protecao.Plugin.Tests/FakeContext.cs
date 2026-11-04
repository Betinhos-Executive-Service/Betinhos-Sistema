using System;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Protecao.Plugin.Tests;

sealed class FakeContext : IPluginExecutionContext
{
    public FakeContext(string message, string entity, Guid id) { MessageName = message; PrimaryEntityName = entity; PrimaryEntityId = id; }
    public int Stage => 20;
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
