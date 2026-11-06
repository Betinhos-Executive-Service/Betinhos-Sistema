using System;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ExchangeLifecycleCommandHandlerTests
    {
        [Fact]
        public void UnboundCommandRejectsUnknownCommandBeforeTouchingData()
        {
            var context = new RemoteExecutionContext { MessageName = "new_ExecutarComandoTroca" };
            context.InputParameters["new_Troca"] = new EntityReference("cr40f_trocasdecarro", Guid.NewGuid());
            context.InputParameters["new_Comando"] = "apagar";
            context.InputParameters["new_Motivo"] = "teste";
            var handler = CreateHandler(context);

            var exception = Assert.Throws<TargetInvocationException>(() => handler.GetType().GetMethod("Execute").Invoke(handler, null));

            Assert.Contains("[EXCHANGE_COMMAND_INVALID]", exception.InnerException.Message);
        }

        [Fact]
        public void UnboundCommandRequiresExchangeReference()
        {
            var context = new RemoteExecutionContext { MessageName = "new_ExecutarComandoTroca" };
            context.InputParameters["new_Comando"] = "cancelar";
            context.InputParameters["new_Motivo"] = "teste";
            var handler = CreateHandler(context);

            var exception = Assert.Throws<TargetInvocationException>(() => handler.GetType().GetMethod("Execute").Invoke(handler, null));

            Assert.Contains("Troca alvo", exception.InnerException.Message);
        }

        [Fact]
        public void MinimumCustomApiDateIsTreatedAsNotProvided()
        {
            var context = new RemoteExecutionContext();
            context.InputParameters["new_DataEfetiva"] = DateTime.MinValue;
            var handler = CreateHandler(context);

            var result = InvokeReadEffectiveAt(handler);

            Assert.Null(result);
        }

        [Fact]
        public void InternalCompletionCanSkipClientExpectedVersion()
        {
            var context = new RemoteExecutionContext();
            var handler = CreateHandler(context);
            var exchange = new Entity("cr40f_trocasdecarro") { RowVersion = "10" };

            var exception = Record.Exception(() => InvokeValidateExpectedVersion(handler, exchange, false));

            Assert.Null(exception);
        }

        [Fact]
        public void CompensationReusesOriginalOperationNumber()
        {
            var handler = CreateHandler(new RemoteExecutionContext());
            var original = new Entity("cr40f_trocasdecarro", Guid.NewGuid())
            {
                ["cr40f_id"] = "OT-0001",
                ["new_tipodetroca"] = new OptionSetValue(100000000),
                ["cr40f_motorista1"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_motorista2"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_veiculo1antesdatroca"] = new EntityReference("cr40f_veiculos", Guid.NewGuid())
            };

            var compensation = InvokeBuildCompensation(handler, original);

            Assert.Equal("REV-0001", compensation.GetAttributeValue<string>("cr40f_id"));
        }

        [Fact]
        public void CompensationFallsBackToGuidWhenOriginalNumberIsMissing()
        {
            var originalId = Guid.NewGuid();
            var handler = CreateHandler(new RemoteExecutionContext());
            var original = new Entity("cr40f_trocasdecarro", originalId)
            {
                ["new_tipodetroca"] = new OptionSetValue(100000000),
                ["cr40f_motorista1"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_motorista2"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_veiculo1antesdatroca"] = new EntityReference("cr40f_veiculos", Guid.NewGuid())
            };

            var compensation = InvokeBuildCompensation(handler, original);

            Assert.Equal("REV-" + originalId.ToString("N"), compensation.GetAttributeValue<string>("cr40f_id"));
        }

        [Fact]
        public void CompensationDoesNotReuseAReversalNumber()
        {
            var originalId = Guid.NewGuid();
            var handler = CreateHandler(new RemoteExecutionContext());
            var original = new Entity("cr40f_trocasdecarro", originalId)
            {
                ["cr40f_id"] = "REV-0001",
                ["new_tipodetroca"] = new OptionSetValue(100000000),
                ["cr40f_motorista1"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_motorista2"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_veiculo1antesdatroca"] = new EntityReference("cr40f_veiculos", Guid.NewGuid())
            };

            var compensation = InvokeBuildCompensation(handler, original);

            Assert.Equal("REV-" + originalId.ToString("N"), compensation.GetAttributeValue<string>("cr40f_id"));
        }

        [Fact]
        public void HandoffCompensationReturnsTheVehicleToTheOriginalDriver()
        {
            var handler = CreateHandler(new RemoteExecutionContext());
            var driver1 = Guid.NewGuid();
            var driver2 = Guid.NewGuid();
            var original = new Entity("cr40f_trocasdecarro", Guid.NewGuid())
            {
                ["new_tipodetroca"] = new OptionSetValue(100000003),
                ["cr40f_motorista1"] = new EntityReference("cr40f_funcionarios", driver1),
                ["cr40f_motorista2"] = new EntityReference("cr40f_funcionarios", driver2),
                ["cr40f_veiculo1antesdatroca"] = new EntityReference("cr40f_veiculos", Guid.NewGuid())
            };

            var compensation = InvokeBuildCompensation(handler, original);

            Assert.Equal(100000003, compensation.GetAttributeValue<OptionSetValue>("new_tipodetroca").Value);
            Assert.Equal(driver2, compensation.GetAttributeValue<EntityReference>("cr40f_motorista1").Id);
            Assert.Equal(driver1, compensation.GetAttributeValue<EntityReference>("cr40f_motorista2").Id);
        }

        [Fact]
        public void ReturnCompensationKeepsTheBaseLocation()
        {
            var handler = CreateHandler(new RemoteExecutionContext());
            var location = Guid.NewGuid();
            var vehicle = Guid.NewGuid();
            var original = new Entity("cr40f_trocasdecarro", Guid.NewGuid())
            {
                ["new_tipodetroca"] = new OptionSetValue(100000001),
                ["cr40f_motorista1"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_veiculo1antesdatroca"] = new EntityReference("cr40f_veiculos", vehicle),
                ["new_localdebase"] = new EntityReference("new_localdebase", location)
            };

            var compensation = InvokeBuildCompensation(handler, original);

            Assert.Equal(100000002, compensation.GetAttributeValue<OptionSetValue>("new_tipodetroca").Value);
            Assert.Equal(vehicle, compensation.GetAttributeValue<EntityReference>("cr40f_veiculo2antesdatroca").Id);
            Assert.Equal(location, compensation.GetAttributeValue<EntityReference>("new_localdebase").Id);
        }

        [Theory]
        [InlineData(100000003, true, false, false, "EXCHANGE_HANDOFF_INVALID")]
        [InlineData(100000003, true, true, true, "EXCHANGE_HANDOFF_INVALID")]
        [InlineData(100000000, true, true, false, "EXCHANGE_LOCATION_NOT_ALLOWED", true)]
        public void RegistrationShapeRejectsInvalidCombinations(int type, bool hasDriver2, bool hasVehicle1, bool hasVehicle2, string code, bool hasLocation = false)
        {
            var error = Assert.Throws<TargetInvocationException>(() => InvokeValidateRegistrationShape(type, hasDriver2, hasVehicle1, hasVehicle2, hasLocation));
            Assert.Contains(code, error.InnerException?.Message ?? error.Message);
        }

        [Theory]
        [InlineData(100000001, false, true, false, true)]
        [InlineData(100000002, false, false, true, false)]
        [InlineData(100000003, true, true, false, false)]
        public void RegistrationShapeAcceptsValidCombinations(int type, bool hasDriver2, bool hasVehicle1, bool hasVehicle2, bool hasLocation)
        {
            InvokeValidateRegistrationShape(type, hasDriver2, hasVehicle1, hasVehicle2, hasLocation);
        }

        private static void InvokeValidateRegistrationShape(int type, bool hasDriver2, bool hasVehicle1, bool hasVehicle2, bool hasLocation)
        {
            var handlerType = typeof(ServiceDriverSharePlugin).Assembly.GetType("Betinhos.DriverRecordSharing.ExchangeLifecycleCommandHandler", throwOnError: true);
            var method = handlerType.GetMethod("ValidateRegistrationShape", BindingFlags.Static | BindingFlags.NonPublic);
            method.Invoke(null, new object[]
            {
                type,
                hasDriver2 ? new EntityReference("cr40f_funcionarios", Guid.NewGuid()) : null,
                hasVehicle1 ? new EntityReference("cr40f_veiculos", Guid.NewGuid()) : null,
                hasVehicle2 ? new EntityReference("cr40f_veiculos", Guid.NewGuid()) : null,
                hasLocation ? new EntityReference("new_localdebase", Guid.NewGuid()) : null
            });
        }

        private static object CreateHandler(IPluginExecutionContext context)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.ExchangeLifecycleCommandHandler",
                throwOnError: true);
            var service = new UnsupportedOrganizationService();
            return Activator.CreateInstance(
                type,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { service, service, null, context },
                culture: null);
        }

        private static DateTime? InvokeReadEffectiveAt(object handler)
        {
            var method = handler.GetType().GetMethod("ReadEffectiveAt", BindingFlags.Instance | BindingFlags.NonPublic);
            return (DateTime?)method.Invoke(handler, null);
        }

        private static void InvokeValidateExpectedVersion(object handler, Entity exchange, bool required)
        {
            var method = handler.GetType().GetMethod("ValidateExpectedVersion", BindingFlags.Instance | BindingFlags.NonPublic);
            method.Invoke(handler, new object[] { exchange, required });
        }

        private static Entity InvokeBuildCompensation(object handler, Entity original)
        {
            var method = handler.GetType().GetMethod("BuildCompensation", BindingFlags.Instance | BindingFlags.NonPublic);
            return (Entity)method.Invoke(handler, new object[] { original, "teste", DateTime.UtcNow });
        }

        private sealed class UnsupportedOrganizationService : IOrganizationService
        {
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
