using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class SecretReaderTests
    {
        private sealed class Svc : IOrganizationService
        {
            public bool SecretWorks;
            public string LastRequest;
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                LastRequest = request.RequestName + ":" + request.Parameters["EnvironmentVariableName"];
                if (!SecretWorks) throw new InvalidPluginExecutionException("not a secret");
                var response = new OrganizationResponse();
                response.Results["EnvironmentVariableSecretValue"] = "sk-secret";
                return response;
            }
            public EntityCollection RetrieveMultiple(QueryBase query) => new EntityCollection();
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
            public void Disassociate(string a, Guid b, Relationship c, EntityReferenceCollection d) => throw new NotSupportedException();
        }

        [Fact]
        public void Read_UsesSecretMessage()
        {
            var svc = new Svc { SecretWorks = true };
            Assert.Equal("sk-secret", SecretReader.Read(svc, "new_AnthropicKeyCombustivel"));
            Assert.Equal("RetrieveEnvironmentVariableSecretValue:new_AnthropicKeyCombustivel", svc.LastRequest);
        }

        [Fact]
        public void Read_FallsBackToStringVariable()
        {
            Assert.Null(SecretReader.Read(new Svc { SecretWorks = false }, "new_AnthropicKeyCombustivel"));
        }
    }
}
