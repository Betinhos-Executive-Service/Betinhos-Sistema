using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Cr40f.GerarPagantes.Plugin.Tests;

public sealed class PluginSettingsTests
{
    private const string TableCielo = "cielo-tabela-0001";
    private const string TableGraph = "graph-tabela-0001";
    private const string VariableCielo = "cielo-variavel-0001";
    private const string VariableGraph = "graph-variavel-0001";

    private sealed class Svc : IOrganizationService
    {
        public bool TableThrows;
        public readonly Dictionary<string, string> Table = new();
        public readonly Dictionary<string, string> Variables = new()
        {
            [PluginSettings.CieloClientSecretVariable] = VariableCielo,
            [PluginSettings.GraphClientSecretVariable] = VariableGraph,
            [PluginSettings.CieloClientIdVariable] = "cielo-id"
        };
        private readonly Dictionary<Guid, string> _ids = new();

        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            var q = (QueryExpression)query;
            var result = new EntityCollection();
            if (q.EntityName == PluginSettings.SecretTable)
            {
                if (TableThrows) throw new InvalidPluginExecutionException("Could not find entity");
                var names = q.Criteria.Conditions.Single().Values.Cast<string>().ToList();
                foreach (var pair in Table.Where(pair => names.Contains(pair.Key)))
                    result.Entities.Add(new Entity(q.EntityName) { [PluginSettings.SecretNameColumn] = pair.Key, [PluginSettings.SecretValueColumn] = pair.Value });
                return result;
            }
            if (q.EntityName == "environmentvariabledefinition")
            {
                foreach (var name in q.Criteria.Conditions.Single().Values.Cast<string>().Where(Variables.ContainsKey))
                {
                    var id = Guid.NewGuid();
                    _ids[id] = name;
                    result.Entities.Add(new Entity(q.EntityName, id) { ["schemaname"] = name });
                }
                return result;
            }
            foreach (var id in q.Criteria.Conditions.Single().Values.Cast<Guid>())
                result.Entities.Add(new Entity(q.EntityName)
                {
                    ["environmentvariabledefinitionid"] = new EntityReference("environmentvariabledefinition", id),
                    ["value"] = Variables[_ids[id]]
                });
            return result;
        }

        public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
        public Guid Create(Entity entity) => throw new NotSupportedException();
        public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
        public void Update(Entity entity) => throw new NotSupportedException();
        public void Delete(string entityName, Guid id) => throw new NotSupportedException();
        public void Associate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
        public void Disassociate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
    }

    private sealed class Tracer : ITracingService
    {
        public readonly List<string> Lines = new();
        public void Trace(string format, params object[] args) => Lines.Add(string.Format(format, args));
    }

    [Fact]
    public void TableWinsOverEnvironmentVariables()
    {
        var svc = new Svc();
        svc.Table[PluginSettings.CieloClientSecretName] = "  " + TableCielo + "\n";
        svc.Table[PluginSettings.GraphClientSecretName] = TableGraph;
        var settings = PluginSettings.Load(svc);
        Assert.Equal(TableCielo, settings.CieloClientSecret);
        Assert.Equal(TableGraph, settings.GraphClientSecret);
        Assert.Equal("cielo-id", settings.CieloClientId);
    }

    [Fact]
    public void MissingOrEmptyRowFallsBackPerSecret()
    {
        var svc = new Svc();
        svc.Table[PluginSettings.GraphClientSecretName] = "   ";
        svc.Table[PluginSettings.CieloClientSecretName] = TableCielo;
        var settings = PluginSettings.Load(svc);
        Assert.Equal(TableCielo, settings.CieloClientSecret);
        Assert.Equal(VariableGraph, settings.GraphClientSecret);
    }

    [Fact]
    public void EmptyTableFallsBackToEnvironmentVariables()
    {
        var settings = PluginSettings.Load(new Svc());
        Assert.Equal(VariableCielo, settings.CieloClientSecret);
        Assert.Equal(VariableGraph, settings.GraphClientSecret);
    }

    [Fact]
    public void TableErrorDoesNotBreakLoadAndTracesNoValue()
    {
        var tracer = new Tracer();
        var settings = PluginSettings.Load(new Svc { TableThrows = true }, tracer);
        Assert.Equal(VariableCielo, settings.CieloClientSecret);
        Assert.Equal(VariableGraph, settings.GraphClientSecret);
        Assert.Contains(tracer.Lines, line => line.Contains("InvalidPluginExecutionException"));
        Assert.DoesNotContain(tracer.Lines, line => line.Contains("variavel-") || line.Contains("tabela-0001"));
    }

    [Fact]
    public void TracesNeverContainTableValues()
    {
        var tracer = new Tracer();
        var svc = new Svc();
        svc.Table[PluginSettings.CieloClientSecretName] = TableCielo;
        PluginSettings.Load(svc, tracer);
        Assert.Contains(tracer.Lines, line => line.Contains(PluginSettings.GraphClientSecretName));
        Assert.DoesNotContain(tracer.Lines, line => line.Contains(TableCielo) || line.Contains(VariableGraph));
    }
}
