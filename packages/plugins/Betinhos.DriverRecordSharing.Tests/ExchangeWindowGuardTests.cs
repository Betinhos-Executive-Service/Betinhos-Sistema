using System;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ExchangeWindowGuardTests
    {
        [Theory]
        [InlineData("new_mododajanela")]
        [InlineData("new_m1antesde")]
        [InlineData("new_alertajanela")]
        [InlineData("new_localdatroca")]
        [InlineData("new_motivoforadajanelamotorista2")]
        public void DirectUpdateOfNewWindowFieldsIsBlocked(string attribute)
        {
            var context = ExchangeUpdate(null, attribute);

            var exception = Assert.Throws<TargetInvocationException>(() => InvokeGuard(context, new ThrowingService()));

            Assert.Contains("[FORBIDDEN_LIFECYCLE]", exception.InnerException.Message);
        }

        private static RemoteExecutionContext ExchangeUpdate(RemoteExecutionContext parent, params string[] attributes)
        {
            var id = Guid.NewGuid();
            var target = new Entity("cr40f_trocasdecarro", id);
            foreach (var attribute in attributes) target[attribute] = null;
            var context = new RemoteExecutionContext
            {
                MessageName = "Update",
                PrimaryEntityName = "cr40f_trocasdecarro",
                PrimaryEntityId = id,
                Stage = 10,
                ParentContext = parent
            };
            context.InputParameters["Target"] = target;
            return context;
        }

        private static void InvokeGuard(IPluginExecutionContext context, IOrganizationService service)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType("Betinhos.DriverRecordSharing.ExchangeMutationGuard", throwOnError: true);
            type.GetMethod("Validate", BindingFlags.Static | BindingFlags.Public).Invoke(null, new object[] { context, service, null });
        }

        private sealed class ThrowingService : IOrganizationService
        {
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
        }
    }
}
