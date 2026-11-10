using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class SecretReaderTests
    {
        private const string TableValue = "sk-tabela-0001";

        private sealed class Svc : IOrganizationService
        {
            public bool SecretWorks;
            public bool TableThrows;
            public string TableRow;          // null = sem linha
            public string StringVariable;    // null = variável inexistente
            public string LastRequest;
            public string LastTableName;
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                LastRequest = request.RequestName + ":" + request.Parameters["EnvironmentVariableName"];
                if (!SecretWorks) throw new InvalidPluginExecutionException("not a secret");
                var response = new OrganizationResponse();
                response.Results["EnvironmentVariableSecretValue"] = "sk-secret";
                return response;
            }
            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var q = (QueryExpression)query;
                if (q.EntityName == SecretReader.Table)
                {
                    if (TableThrows) throw new InvalidPluginExecutionException("Could not find entity cr40f_segredo");
                    LastTableName = (string)q.Criteria.Conditions.Single(c => c.AttributeName == SecretReader.NameColumn).Values[0];
                    var rows = new EntityCollection();
                    if (TableRow != null) rows.Entities.Add(new Entity(SecretReader.Table) { [SecretReader.ValueColumn] = TableRow });
                    return rows;
                }
                var result = new EntityCollection();
                if (StringVariable == null) return result;
                if (q.EntityName == "environmentvariabledefinition") result.Entities.Add(new Entity(q.EntityName, Guid.NewGuid()));
                if (q.EntityName == "environmentvariablevalue") result.Entities.Add(new Entity(q.EntityName) { ["value"] = StringVariable });
                return result;
            }
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
            public void Disassociate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
        }

        private sealed class Tracer : ITracingService
        {
            public readonly List<string> Lines = new List<string>();
            public void Trace(string format, params object[] args) => Lines.Add(string.Format(format, args));
        }

        [Theory]
        [InlineData("new_AnthropicKeyCombustivel", "anthropic.combustivel")]
        [InlineData("new_AnthropicKeyObservacaoMotorista", "anthropic.observacao-motorista")]
        public void Read_TableWinsOverEnvironmentVariable(string variable, string secretName)
        {
            var svc = new Svc { SecretWorks = true, StringVariable = "sk-string", TableRow = "  " + TableValue + "\n" };
            Assert.Equal(TableValue, SecretReader.Read(svc, variable));
            Assert.Equal(secretName, svc.LastTableName);
            Assert.Null(svc.LastRequest);
        }

        [Fact]
        public void Read_EmptyTableRowFallsBackToSecretMessage()
        {
            var svc = new Svc { SecretWorks = true, TableRow = "   " };
            Assert.Equal("sk-secret", SecretReader.Read(svc, "new_AnthropicKeyCombustivel"));
            Assert.Equal("RetrieveEnvironmentVariableSecretValue:new_AnthropicKeyCombustivel", svc.LastRequest);
        }

        [Fact]
        public void Read_MissingRowFallsBackToStringVariable()
        {
            Assert.Equal("sk-string", SecretReader.Read(new Svc { StringVariable = "sk-string" }, "new_AnthropicKeyCombustivel"));
        }

        [Fact]
        public void Read_TableErrorFallsBackWithoutThrowingAndWithoutLoggingValues()
        {
            var trace = new Tracer();
            var svc = new Svc { TableThrows = true, StringVariable = "sk-string" };
            Assert.Equal("sk-string", SecretReader.Read(svc, "new_AnthropicKeyObservacaoMotorista", trace));
            Assert.Contains(trace.Lines, l => l.Contains("anthropic.observacao-motorista") && l.Contains("InvalidPluginExecutionException"));
            Assert.DoesNotContain(trace.Lines, l => l.Contains("sk-") || l.Contains("cr40f_segredo"));
        }

        [Fact]
        public void Read_NeverTracesTheValue()
        {
            var trace = new Tracer();
            var svc = new Svc { TableRow = TableValue };
            Assert.Equal(TableValue, SecretReader.Read(svc, "new_AnthropicKeyCombustivel", trace));
            Assert.DoesNotContain(trace.Lines, l => l.Contains(TableValue));
        }

        [Fact]
        public void Read_UnmappedVariableSkipsTable()
        {
            var svc = new Svc { TableRow = TableValue, StringVariable = "sk-string" };
            Assert.Equal("sk-string", SecretReader.Read(svc, "new_OutraVariavel"));
            Assert.Null(svc.LastTableName);
        }

        [Theory]
        [InlineData("new_AnthropicKeyCombustivel")]
        [InlineData("new_AnthropicKeyObservacaoMotorista")]
        public void Read_TableWinsOverSecureConfig(string variable)
        {
            var svc = new Svc { SecretWorks = true, StringVariable = "sk-string", TableRow = TableValue };
            Assert.Equal(TableValue, SecretReader.Read(svc, variable, null, "sk-secure"));
            Assert.Null(svc.LastRequest);
        }

        [Fact]
        public void Read_WithoutTableRowSecureConfigWinsOverEnvironmentVariable()
        {
            var svc = new Svc { SecretWorks = true, StringVariable = "sk-string" };
            Assert.Equal("sk-secure", SecretReader.Read(svc, "new_AnthropicKeyCombustivel", null, "  sk-secure\n"));
            Assert.NotNull(svc.LastTableName);
            Assert.Null(svc.LastRequest);
        }

        [Fact]
        public void Read_UnreadableTableFallsBackToSecureConfig()
        {
            var svc = new Svc { TableThrows = true, StringVariable = "sk-string" };
            Assert.Equal("sk-secure", SecretReader.Read(svc, "new_AnthropicKeyObservacaoMotorista", null, "sk-secure"));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Read_BlankSecureConfigFallsBackToEnvironmentVariable(string secure)
        {
            var svc = new Svc { TableRow = "  ", StringVariable = "sk-string" };
            Assert.Equal("sk-string", SecretReader.Read(svc, "new_AnthropicKeyCombustivel", null, secure));
        }

        [Fact]
        public void Read_FallsBackToNullWhenNothingConfigured()
        {
            Assert.Null(SecretReader.Read(new Svc(), "new_AnthropicKeyCombustivel"));
        }
    }
}
