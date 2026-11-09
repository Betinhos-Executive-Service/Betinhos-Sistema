using System;
using System.Linq;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ServiceVehicleSynchronizerTests
    {
        [Fact]
        public void LinkedExchangeGeneralNeverUsesGenericVehicleSynchronization()
        {
            var serviceId = Guid.NewGuid();
            var record = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_ot"] = new EntityReference("cr40f_trocasdecarro", Guid.NewGuid()),
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
                ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()),
                ["cr40f_dataehorriodesada"] = DateTime.UtcNow
            };
            var service = new TrackingOrganizationService(record);

            InvokeSyncService(service, serviceId);

            Assert.Equal(0, service.UpdateCount);
            Assert.Equal(0, service.RetrieveMultipleCount);
        }

        [Theory]
        [InlineData(100000002)]
        [InlineData(100000003)]
        public void VehicleDefinedByInfleetOrDriverIsNeverReplacedByPossession(int origin)
        {
            var driverId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
            var serviceDate = new DateTime(2026, 10, 12, 18, 0, 0, DateTimeKind.Utc);
            var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()),
                ["new_origemveiculo"] = new OptionSetValue(origin),
                ["cr40f_dataehorriodesada"] = serviceDate
            };
            var possessions = new EntityCollection(new[]
            {
                Possession(driverId, Guid.NewGuid(), serviceDate.AddHours(-2), null)
            });
            var service = new TrackingOrganizationService(serviceRecord, possessions);

            InvokeSyncService(service, serviceId);

            Assert.Equal(0, service.UpdateCount);
        }

        [Fact]
        public void EmployeeDriverNeverGetsVehicleFromPossession()
        {
            var driverId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
            var serviceDate = new DateTime(2026, 11, 3, 8, 0, 0, DateTimeKind.Utc);
            var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["new_origemveiculo"] = new OptionSetValue(100000000),
                ["cr40f_dataehorriodesada"] = serviceDate
            };
            var possessions = new EntityCollection(new[]
            {
                Possession(driverId, Guid.NewGuid(), serviceDate.AddDays(-1), null)
            });
            var service = new TrackingOrganizationService(serviceRecord, possessions, Driver(driverId, linkType: 0));

            InvokeSyncService(service, serviceId);

            Assert.Equal(0, service.UpdateCount);
            Assert.Equal(0, service.RetrieveMultipleCount);
        }

        [Theory]
        [InlineData(202410000)]
        [InlineData(202410004)]
        [InlineData(202410001)]
        [InlineData(202410005)]
        public void EmployeeDriverLosesVehicleLeftByPreviousThirdPartyPossession(int openStatus)
        {
            var driverId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
            var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()),
                ["new_origemveiculo"] = new OptionSetValue(100000000),
                ["cr40f_status"] = new OptionSetValue(openStatus),
                ["cr40f_dataehorriodesada"] = new DateTime(2026, 11, 3, 8, 0, 0, DateTimeKind.Utc)
            };
            var service = new TrackingOrganizationService(serviceRecord, driver: Driver(driverId, linkType: 0));

            InvokeSyncService(service, serviceId);

            Assert.Equal(1, service.UpdateCount);
            Assert.Null(service.LastUpdate.GetAttributeValue<EntityReference>("cr40f_veiculo"));
            Assert.Equal(100000000, service.LastUpdate.GetAttributeValue<OptionSetValue>("new_origemveiculo").Value);
            Assert.Equal(0, service.RetrieveMultipleCount);
        }

        [Theory]
        [InlineData(202410006)]
        [InlineData(202410008)]
        [InlineData(202410002)]
        public void StartedOrClosedEmployeeServiceKeepsHistoricalPossessionVehicle(int status)
        {
            var driverId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
            var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", Guid.NewGuid()),
                ["new_origemveiculo"] = new OptionSetValue(100000000),
                ["cr40f_status"] = new OptionSetValue(status),
                ["cr40f_dataehorriodesada"] = new DateTime(2026, 9, 3, 8, 0, 0, DateTimeKind.Utc)
            };
            var service = new TrackingOrganizationService(serviceRecord, driver: Driver(driverId, linkType: 0));

            InvokeSyncService(service, serviceId);

            Assert.Equal(0, service.UpdateCount);
        }

        [Fact]
        public void PossessionChangeResyncsServicesThatHaveNotStartedYet()
        {
            var possession = Possession(Guid.NewGuid(), Guid.NewGuid(), DateTime.UtcNow, null);
            var service = new TrackingOrganizationService(possession);

            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.ServiceVehicleSynchronizer",
                throwOnError: true);
            var instance = Activator.CreateInstance(
                type,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { service, new NullTracingService() },
                culture: null);
            type.GetMethod("SyncServicesForPossessionChange", BindingFlags.Instance | BindingFlags.Public)
                .Invoke(instance, new object[] { possession.Id, null });

            var query = Assert.IsType<QueryExpression>(service.LastQuery);
            var statusCondition = query.Criteria.Conditions.Single(condition => condition.AttributeName == "cr40f_status");
            Assert.Equal(
                new object[] { 202410000, 202410004, 202410001, 202410005 },
                statusCondition.Values.ToArray());
        }

        [Fact]
        public void SelectsThePossessionActiveAtTheServiceInstantWhenTwoShareTheSameDate()
        {
            var driverId = Guid.NewGuid();
            var firstVehicleId = Guid.NewGuid();
            var secondVehicleId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
            var serviceDate = new DateTime(2026, 7, 7, 10, 0, 0, DateTimeKind.Utc);
            var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["cr40f_dataehorriodesada"] = serviceDate
            };
            var possessions = new EntityCollection(new[]
            {
                Possession(driverId, firstVehicleId, new DateTime(2026, 7, 7, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 7, 10, 30, 0, DateTimeKind.Utc)),
                Possession(driverId, secondVehicleId, new DateTime(2026, 7, 7, 11, 30, 0, DateTimeKind.Utc), null)
            });
            var service = new TrackingOrganizationService(serviceRecord, possessions, Driver(driverId, linkType: 1));

            InvokeSyncService(service, serviceId);

            Assert.Equal(1, service.UpdateCount);
            Assert.Equal(firstVehicleId, service.LastUpdate.GetAttributeValue<EntityReference>("cr40f_veiculo").Id);
        }

        [Fact]
        public void RejectsPossessionsThatOverlapTheServiceInstant()
        {
            var driverId = Guid.NewGuid();
            var serviceId = Guid.NewGuid();
        var serviceRecord = new Entity("cr40f_reservadeveculos", serviceId)
            {
                ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["cr40f_dataehorriodesada"] = new DateTime(2026, 7, 7, 12, 0, 0, DateTimeKind.Utc)
            };
            var possessions = new EntityCollection(new[]
            {
                Possession(driverId, Guid.NewGuid(), new DateTime(2026, 7, 7, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 7, 13, 0, 0, DateTimeKind.Utc)),
                Possession(driverId, Guid.NewGuid(), new DateTime(2026, 7, 7, 11, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 7, 14, 0, 0, DateTimeKind.Utc))
            });
            var service = new TrackingOrganizationService(serviceRecord, possessions, Driver(driverId, linkType: 1));

            var error = Assert.Throws<TargetInvocationException>(() => InvokeSyncService(service, serviceId));

            Assert.IsType<InvalidPluginExecutionException>(error.InnerException);
        }

        private static Entity Possession(Guid driverId, Guid vehicleId, DateTime start, DateTime? end)
        {
            var possession = new Entity("new_possedeveiculo", Guid.NewGuid())
            {
                ["new_motorista"] = new EntityReference("cr40f_funcionarios", driverId),
                ["new_veiculo"] = new EntityReference("cr40f_veiculos", vehicleId),
                ["new_iniciodaposse"] = start
            };
            if (end.HasValue)
            {
                possession["new_fimdaposse"] = end.Value;
            }

            return possession;
        }

        private static Entity Driver(Guid driverId, int linkType)
        {
            return new Entity("cr40f_funcionarios", driverId)
            {
                ["cr40f_tipodevinculo"] = new OptionSetValue(linkType)
            };
        }

        private static void InvokeSyncService(IOrganizationService service, Guid serviceId)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.ServiceVehicleSynchronizer",
                throwOnError: true);
            var instance = Activator.CreateInstance(
                type,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { service, new NullTracingService() },
                culture: null);
            type.GetMethod("SyncService", BindingFlags.Instance | BindingFlags.Public)
                .Invoke(instance, new object[] { serviceId });
        }

        private sealed class NullTracingService : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }

        private sealed class TrackingOrganizationService : IOrganizationService
        {
            private readonly Entity _record;
            private readonly EntityCollection _possessions;
            private readonly Entity _driver;

            public TrackingOrganizationService(Entity record, EntityCollection possessions = null, Entity driver = null)
            {
                _record = record;
                _possessions = possessions ?? new EntityCollection();
                _driver = driver;
            }

            public int UpdateCount { get; private set; }
            public int RetrieveMultipleCount { get; private set; }
            public Entity LastUpdate { get; private set; }
            public QueryBase LastQuery { get; private set; }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) =>
                entityName == "cr40f_funcionarios" ? _driver : _record;
            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                RetrieveMultipleCount++;
                LastQuery = query;
                return _possessions;
            }
            public void Update(Entity entity)
            {
                UpdateCount++;
                LastUpdate = entity;
            }
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
        }
    }
}
