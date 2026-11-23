using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkCadastroTests
    {
        private static readonly Guid ServiceId = Guid.NewGuid();
        private static readonly DateTime Expires = new DateTime(2026, 11, 30, 15, 30, 0, DateTimeKind.Utc);

        private static Guid AddLink(Fake fake, Guid serviceId, int status, bool passenger = false)
        {
            var link = new Entity("cr40f_linkcadastro", Guid.NewGuid())
            {
                ["cr40f_reserva"] = new EntityReference("cr40f_reservadeveculos", serviceId),
                ["cr40f_status"] = new OptionSetValue(status)
            };
            if (passenger) link["cr40f_passageiro"] = new EntityReference("cr40f_bancodedados", Guid.NewGuid());
            fake.Rows.Add(link);
            return link.Id;
        }

        private static int Status(Fake fake, Guid id) => fake.Rows.Single(r => r.Id == id).GetAttributeValue<OptionSetValue>("cr40f_status").Value;

        [Fact]
        public void Sha256Hex_MatchesKnownVector_LowerCase()
        {
            Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", TrackingLinkCadastro.Sha256Hex("abc"));
        }

        [Fact]
        public void Base64Url_HasNoPaddingNorUnsafeCharacters()
        {
            var token = TrackingLinkCadastro.Base64Url(Enumerable.Repeat((byte)0xfb, 32).ToArray());

            Assert.Equal(43, token.Length);
            Assert.DoesNotContain("=", token);
            Assert.DoesNotContain("+", token);
            Assert.DoesNotContain("/", token);
        }

        [Fact]
        public void Create_RevokesWholeServiceLinksOnly_AndWritesNewOne()
        {
            var fake = new Fake();
            var active = AddLink(fake, ServiceId, 1);
            var partial = AddLink(fake, ServiceId, 2);
            var expired = AddLink(fake, ServiceId, 3);
            var single = AddLink(fake, ServiceId, 1, passenger: true);
            var other = AddLink(fake, Guid.NewGuid(), 1);
            var bytes = Enumerable.Repeat((byte)7, 32).ToArray();

            var created = TrackingLinkCadastro.Create(fake, ServiceId, Expires, () => bytes);

            Assert.Equal(4, Status(fake, active));
            Assert.Equal(4, Status(fake, partial));
            Assert.Equal(3, Status(fake, expired));
            Assert.Equal(1, Status(fake, single));
            Assert.Equal(1, Status(fake, other));
            var row = fake.Rows.Single(r => r.Id == created.Id);
            Assert.Equal(TrackingLinkCadastro.Sha256Hex(TrackingLinkCadastro.Base64Url(bytes)), created.Hash);
            Assert.Matches("^[0-9a-f]{64}$", created.Hash);
            Assert.Equal(created.Hash, row.GetAttributeValue<string>("cr40f_tokenhash"));
            Assert.Equal(ServiceId, row.GetAttributeValue<EntityReference>("cr40f_reserva").Id);
            Assert.Equal("cr40f_reservadeveculos", row.GetAttributeValue<EntityReference>("cr40f_reserva").LogicalName);
            Assert.Null(row.GetAttributeValue<EntityReference>("cr40f_passageiro"));
            Assert.Equal(Expires, row.GetAttributeValue<DateTime>("cr40f_expiraem"));
            Assert.Equal(1, row.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
            Assert.Equal(0, row.GetAttributeValue<int>("cr40f_envios"));
            Assert.Equal("Link de acompanhamento até 30/11/2026 15:30 UTC", row.GetAttributeValue<string>("cr40f_name"));
        }

        [Fact]
        public void Create_WithoutInjectedBytes_GeneratesDifferentHashesEachTime()
        {
            var fake = new Fake();

            var first = TrackingLinkCadastro.Create(fake, ServiceId, Expires);
            var second = TrackingLinkCadastro.Create(fake, ServiceId, Expires);

            Assert.NotEqual(first.Hash, second.Hash);
            Assert.Equal(4, Status(fake, first.Id));
            Assert.Equal(1, Status(fake, second.Id));
        }

        [Fact]
        public void CadastroExpiry_IsNowPlusValidityHours()
        {
            var now = new DateTime(2026, 11, 23, 12, 0, 0, DateTimeKind.Utc);

            Assert.Equal(now.AddHours(6.5), GenerateTrackingLinkPlugin.CadastroExpiry(new Dictionary<string, object> { ["validadeHoras"] = 6.5 }, now));
            Assert.Null(GenerateTrackingLinkPlugin.CadastroExpiry(new Dictionary<string, object>(), now));
        }

        [Theory]
        [InlineData("org23b93544", "dev")]
        [InlineData("ORG23B93544", "dev")]
        [InlineData("outraorg", "prod")]
        [InlineData(null, "prod")]
        public void CadastroPayload_ChoosesEnvironmentByOrganization(string organization, string ambiente)
        {
            var payload = GenerateTrackingLinkPlugin.CadastroPayload("abc", organization);

            Assert.Equal("abc", payload["hash"]);
            Assert.Equal(ambiente, payload["ambiente"]);
        }

        [Fact]
        public void TryCreateCadastro_AddsCadastroToPayload()
        {
            var fake = new Fake();
            var payload = new Dictionary<string, object> { ["validadeHoras"] = 6.0 };

            var created = GenerateTrackingLinkPlugin.TryCreateCadastro(fake, ServiceId, payload, "org23b93544", null);

            var cadastro = (Dictionary<string, object>)payload["cadastro"];
            Assert.Equal(created.Hash, cadastro["hash"]);
            Assert.Equal("dev", cadastro["ambiente"]);
        }

        [Fact]
        public void TryCreateCadastro_FailureLeavesPayloadWithoutCadastro()
        {
            var fake = new Fake { FailOnCreate = true };
            var payload = new Dictionary<string, object> { ["validadeHoras"] = 6.0 };

            Assert.Null(GenerateTrackingLinkPlugin.TryCreateCadastro(fake, ServiceId, payload, "x", null));
            Assert.False(payload.ContainsKey("cadastro"));
        }

        [Fact]
        public void RevokeCadastro_WhenWorkerFails_MarksRevoked_AndToleratesNullAndErrors()
        {
            var fake = new Fake();
            var created = TrackingLinkCadastro.Create(fake, ServiceId, Expires);

            GenerateTrackingLinkPlugin.RevokeCadastro(fake, created, null);
            GenerateTrackingLinkPlugin.RevokeCadastro(fake, null, null);
            fake.FailOnUpdate = true;
            GenerateTrackingLinkPlugin.RevokeCadastro(fake, created, null);

            Assert.Equal(4, Status(fake, created.Id));
        }

        [Fact]
        public void SyncCadastroExpiry_UsesWorkerExpiry_AndToleratesErrors()
        {
            var fake = new Fake();
            var created = TrackingLinkCadastro.Create(fake, ServiceId, Expires);
            var worker = Expires.AddHours(1);

            GenerateTrackingLinkPlugin.SyncCadastroExpiry(fake, created, worker, null);
            Assert.Equal(worker, fake.Rows.Single(r => r.Id == created.Id).GetAttributeValue<DateTime>("cr40f_expiraem"));

            fake.FailOnUpdate = true;
            GenerateTrackingLinkPlugin.SyncCadastroExpiry(fake, created, Expires, null);
        }

        [Theory]
        [InlineData(202410008, true)]
        [InlineData(202410002, true)]
        [InlineData(202410010, true)]
        [InlineData(202410001, false)]
        public void RevokePlugin_ConcludeOrCancel_RevokesWholeServiceLinks(int status, bool revoked)
        {
            var fake = new Fake();
            var whole = AddLink(fake, ServiceId, 1);
            var single = AddLink(fake, ServiceId, 2, passenger: true);

            Run(fake, status);

            Assert.Equal(revoked ? 4 : 1, Status(fake, whole));
            Assert.Equal(2, Status(fake, single));
        }

        [Fact]
        public void RevokePlugin_FailureToRevoke_DoesNotThrow()
        {
            var fake = new Fake { FailOnRetrieveMultiple = true };

            Run(fake, 202410008);
        }

        private static void Run(Fake fake, int status)
        {
            var context = new Context
            {
                MessageName = "Update",
                PrimaryEntityName = "cr40f_reservadeveculos",
                PrimaryEntityId = ServiceId,
                InputParameters = new ParameterCollection
                {
                    { "Target", new Entity("cr40f_reservadeveculos", ServiceId) { ["cr40f_status"] = new OptionSetValue(status) } }
                }
            };
            new RevokeTrackingLinkPlugin(null, null).Execute(new Provider(context, fake));
        }

        private sealed class Provider : IServiceProvider, IOrganizationServiceFactory, ITracingService
        {
            private readonly IPluginExecutionContext context;
            private readonly IOrganizationService system;

            public Provider(IPluginExecutionContext context, IOrganizationService system) { this.context = context; this.system = system; }

            public object GetService(Type serviceType)
            {
                if (serviceType == typeof(IPluginExecutionContext)) return context;
                if (serviceType == typeof(IOrganizationServiceFactory)) return this;
                if (serviceType == typeof(ITracingService)) return this;
                throw new NotSupportedException(serviceType.Name);
            }

            public IOrganizationService CreateOrganizationService(Guid? userId) => system;
            public void Trace(string format, params object[] args) { }
        }

        private sealed class Context : IPluginExecutionContext
        {
            public int Mode { get; set; }
            public int IsolationMode { get; set; }
            public int Depth { get; set; } = 1;
            public string MessageName { get; set; }
            public string PrimaryEntityName { get; set; }
            public Guid? RequestId { get; set; }
            public string SecondaryEntityName { get; set; }
            public ParameterCollection InputParameters { get; set; } = new ParameterCollection();
            public ParameterCollection OutputParameters { get; set; } = new ParameterCollection();
            public ParameterCollection SharedVariables { get; set; } = new ParameterCollection();
            public Guid UserId { get; set; }
            public Guid InitiatingUserId { get; set; }
            public Guid BusinessUnitId { get; set; }
            public Guid OrganizationId { get; set; }
            public string OrganizationName { get; set; }
            public Guid PrimaryEntityId { get; set; }
            public EntityImageCollection PreEntityImages { get; set; } = new EntityImageCollection();
            public EntityImageCollection PostEntityImages { get; set; } = new EntityImageCollection();
            public EntityReference OwningExtension { get; set; }
            public Guid CorrelationId { get; set; }
            public bool IsExecutingOffline { get; set; }
            public bool IsOfflinePlayback { get; set; }
            public bool IsInTransaction { get; set; } = true;
            public Guid OperationId { get; set; }
            public DateTime OperationCreatedOn { get; set; }
            public int Stage { get; set; } = 40;
            public IPluginExecutionContext ParentContext { get; set; }
        }

        // Tabelas em memória: Create/Update e RetrieveMultiple com Equal e In (demais condições ignoradas).
        private sealed class Fake : IOrganizationService
        {
            public readonly List<Entity> Rows = new List<Entity>();
            public bool FailOnCreate, FailOnUpdate, FailOnRetrieveMultiple;

            public Guid Create(Entity entity)
            {
                if (FailOnCreate) throw new InvalidOperationException("create");
                if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
                Rows.Add(entity);
                return entity.Id;
            }

            public void Update(Entity entity)
            {
                if (FailOnUpdate) throw new InvalidOperationException("update");
                var target = Rows.Single(r => r.LogicalName == entity.LogicalName && r.Id == entity.Id);
                foreach (var pair in entity.Attributes) target[pair.Key] = pair.Value;
            }

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                if (FailOnRetrieveMultiple) throw new InvalidOperationException("query");
                var q = (QueryExpression)query;
                var rows = Rows.Where(r => r.LogicalName == q.EntityName && q.Criteria.Conditions.All(c => Matches(r, c))).ToList();
                return new EntityCollection(rows);
            }

            private static bool Matches(Entity row, ConditionExpression condition)
            {
                if (condition.Operator != ConditionOperator.Equal && condition.Operator != ConditionOperator.In) return true;
                object value = null;
                if (row.Contains(condition.AttributeName))
                {
                    var raw = row[condition.AttributeName];
                    value = raw is OptionSetValue o ? o.Value : raw is EntityReference r ? (object)r.Id : raw;
                }
                return condition.Values.Any(v => Equals(v, value));
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => Rows.Single(r => r.LogicalName == entityName && r.Id == id);
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
