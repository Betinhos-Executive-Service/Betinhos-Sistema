using System;
using System.Collections.Generic;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class ContactRetentionTests
    {
        private const string ServiceTable = "cr40f_reservadeveculos";
        private const string ServicePassengerTable = "cr40f_servicosporpassageiro";

        // Caso OS-11115/OS-10762 no PROD (27/10/2026): solicitante de uma OS e passageiro de outra do mesmo motorista.
        [Fact]
        public void KeepsContactWhenItIsPassengerInAnotherServiceOfTheDriver()
        {
            Assert.True(Invoke(new FakeService(ServicePassengerTable)));
        }

        [Fact]
        public void KeepsContactWhenItIsRequesterInAnotherServiceOfTheDriver()
        {
            Assert.True(Invoke(new FakeService(ServiceTable)));
        }

        [Fact]
        public void ReleasesContactWhenNoOtherServiceUsesIt()
        {
            Assert.False(Invoke(new FakeService()));
        }

        private static bool Invoke(IOrganizationService service)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.ServicePassengerRepository",
                throwOnError: true);
            var repository = Activator.CreateInstance(
                type,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { service, new NullTracingService() },
                culture: null);
            var method = type.GetMethod("IsContactInOtherServiceForEmployee");
            return (bool)method.Invoke(repository, new object[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() });
        }

        private sealed class FakeService : IOrganizationService
        {
            private readonly HashSet<string> tablesWithMatch;

            public FakeService(params string[] tablesWithMatch)
            {
                this.tablesWithMatch = new HashSet<string>(tablesWithMatch);
            }

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var entities = new List<Entity>();
                if (tablesWithMatch.Contains(((QueryExpression)query).EntityName)) entities.Add(new Entity());
                return new EntityCollection(entities);
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }

        private sealed class NullTracingService : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }
    }
}
