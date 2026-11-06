using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class DriverNoticePluginTests
    {
        private const string Service = "cr40f_reservadeveculos";
        private const string Notice = "new_avisomotorista";
        private const string Employee = "cr40f_funcionarios";
        private const string Driver = "cr40f_motorista";
        private const string Status = "cr40f_status";
        private const string Departure = "cr40f_dataehorriodesada";
        private const string Viewed = "new_visualizacaodomotorista";
        private const string Programmed = "new_foiprogramado";
        private const string Exchange = "cr40f_ot";
        private const int Programado = 202410005;
        private const int Confirmado = 202410001;
        private const int Novo = 100000000;
        private const int Retirado = 100000001;
        private const int Pendente = 100000000;
        private const int Enviado = 100000001;
        private const int Falhou = 100000002;
        private const int SemApp = 100000003;
        private const int Visto = 100000004;
        private const int Cancelado = 100000005;

        private readonly FakeService system = new FakeService();
        private readonly Guid serviceId = Guid.NewGuid();
        private readonly Guid correlationId = Guid.NewGuid();
        private readonly Guid driverA;
        private readonly Guid driverB;
        private readonly Guid driverSemEmail;

        public DriverNoticePluginTests()
        {
            driverA = system.Add(Employee, "cr40f_emailmicrosoft", "a@betinhos.test");
            driverB = system.Add(Employee, "cr40f_emailmicrosoft", "b@betinhos.test");
            driverSemEmail = system.Add(Employee);
        }

        // ---------- Pré-operação: a regra do Renan ----------

        [Fact]
        public void TrocaDeMotoristaEmProgramadoZeraVisualizacaoNoTarget()
        {
            var target = Target(Driver, Ref(driverB));

            RunPre(target, Pre(driverA, Programado));

            Assert.True(target.Contains(Viewed));
            Assert.Null(target[Viewed]);
            Assert.True(target.GetAttributeValue<bool>(Programmed));
            Assert.Empty(system.Updated);
        }

        [Fact]
        public void RegravarOMesmoMotoristaNaoZera()
        {
            var target = Target(Driver, Ref(driverA));

            RunPre(target, Pre(driverA, Programado));

            Assert.False(target.Contains(Viewed));
            Assert.False(target.Contains(Programmed));
        }

        [Fact]
        public void LimparMotoristaZeraVisualizacao()
        {
            var target = Target(Driver, null);

            RunPre(target, Pre(driverA, Programado));

            Assert.True(target.Contains(Viewed));
            Assert.Null(target[Viewed]);
        }

        [Fact]
        public void TrocaEmConfirmadoZeraVisualizacaoEDesmarcaFoiProgramado()
        {
            var target = Target(Driver, Ref(driverB));

            RunPre(target, Pre(driverA, Confirmado));

            Assert.Null(target[Viewed]);
            Assert.False(target.GetAttributeValue<bool>(Programmed));
        }

        [Fact]
        public void TrocaEStatusNaMesmaGravacaoUsaOStatusFinal()
        {
            var target = Target(Driver, Ref(driverB), Status, new OptionSetValue(Programado));

            RunPre(target, Pre(driverA, Confirmado));

            Assert.True(target.GetAttributeValue<bool>(Programmed));
        }

        [Fact]
        public void TrocaEmServicoLigadoATrocaDeCarroNaoMexeNoFoiProgramado()
        {
            var pre = Pre(driverA, Confirmado);
            pre[Exchange] = new EntityReference("cr40f_trocasdecarro", Guid.NewGuid());
            var target = Target(Driver, Ref(driverB));

            RunPre(target, pre);

            Assert.Null(target[Viewed]);
            Assert.False(target.Contains(Programmed));
        }

        [Fact]
        public void SemPreImagemNaPreOperacaoDerrubaAGravacao()
        {
            var error = Assert.Throws<InvalidPluginExecutionException>(() => Execute(20, "Update", Target(Driver, Ref(driverB)), null));

            Assert.Contains("[DRIVER_NOTICE_CONFIG]", error.Message);
        }

        // ---------- Pós-operação: outbox ----------

        [Fact]
        public void TrocaEmProgramadoGeraNovoParaONovoERetiradoParaOAntigo()
        {
            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado, DateTime.UtcNow.AddDays(1)));

            var novo = Single(Novo);
            Assert.Equal(driverB, novo.GetAttributeValue<EntityReference>("new_funcionario").Id);
            Assert.Equal(serviceId, novo.GetAttributeValue<EntityReference>("new_reserva").Id);
            Assert.Equal(Pendente, Option(novo, "new_situacao"));
            var retirado = Single(Retirado);
            Assert.Equal(driverA, retirado.GetAttributeValue<EntityReference>("new_funcionario").Id);
            Assert.Equal(Pendente, Option(retirado, "new_situacao"));
            Assert.False(retirado.Contains("new_prazovisualizacao"));
        }

        [Fact]
        public void RegravarOMesmoMotoristaEmProgramadoNaoGeraAviso()
        {
            RunPost(Target(Driver, Ref(driverA)), Pre(driverA, Programado));

            Assert.Empty(Notices());
        }

        [Fact]
        public void LimparMotoristaEmProgramadoGeraSoRetirado()
        {
            RunPost(Target(Driver, null), Pre(driverA, Programado));

            AssertOnly(Retirado, driverA);
        }

        [Fact]
        public void TrocaEmConfirmadoNaoGeraAviso()
        {
            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Confirmado));

            Assert.Empty(Notices());
        }

        [Fact]
        public void ConfirmadoParaProgramadoGeraNovoSemRetirado()
        {
            RunPost(Target(Status, new OptionSetValue(Programado)), Pre(driverA, Confirmado));

            AssertOnly(Novo, driverA);
        }

        [Fact]
        public void TrocaEStatusParaProgramadoNaMesmaGravacaoGeraSoNovo()
        {
            RunPost(Target(Driver, Ref(driverB), Status, new OptionSetValue(Programado)), Pre(driverA, Confirmado));

            AssertOnly(Novo, driverB);
        }

        [Fact]
        public void TrocaSaindoDeProgramadoNaMesmaGravacaoGeraSoRetirado()
        {
            RunPost(Target(Driver, Ref(driverB), Status, new OptionSetValue(Confirmado)), Pre(driverA, Programado));

            AssertOnly(Retirado, driverA);
        }

        [Fact]
        public void CreateJaProgramadoGeraNovo()
        {
            var target = Target(Driver, Ref(driverA), Status, new OptionSetValue(Programado), Departure, DateTime.UtcNow.AddDays(2));

            Execute(40, "Create", target, null);

            Assert.Equal(driverA, Single(Novo).GetAttributeValue<EntityReference>("new_funcionario").Id);
        }

        [Fact]
        public void CreateProgramadoSemMotoristaNaoGeraAviso()
        {
            Execute(40, "Create", Target(Status, new OptionSetValue(Programado)), null);

            Assert.Empty(Notices());
        }

        [Fact]
        public void MotoristaSemEmailFicaSemApp()
        {
            RunPost(Target(Driver, Ref(driverSemEmail)), Pre(driverA, Programado));

            Assert.Equal(SemApp, Option(Single(Novo), "new_situacao"));
            Assert.Equal(Pendente, Option(Single(Retirado), "new_situacao"));
        }

        [Fact]
        public void SaidaEmMaisDeDuasHorasDaTrintaMinutosDePrazo()
        {
            var inicio = DateTime.UtcNow;

            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado, inicio.AddHours(3)));

            var prazo = Single(Novo).GetAttributeValue<DateTime>("new_prazovisualizacao");
            Assert.InRange(prazo, inicio.AddMinutes(30), DateTime.UtcNow.AddMinutes(30));
        }

        [Theory]
        [InlineData(90)]
        [InlineData(-30)]
        public void SaidaEmMenosDeDuasHorasOuJaPassadaVenceAgora(int minutosAteSaida)
        {
            var inicio = DateTime.UtcNow;

            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado, inicio.AddMinutes(minutosAteSaida)));

            Assert.InRange(Single(Novo).GetAttributeValue<DateTime>("new_prazovisualizacao"), inicio, DateTime.UtcNow);
        }

        [Fact]
        public void PrazoNaFronteiraDeDuasHorasContaComoMaisDeDuasHoras()
        {
            var agora = new DateTime(2026, 11, 6, 12, 0, 0, DateTimeKind.Utc);

            Assert.Equal(agora.AddMinutes(30), DriverNoticeRules.Deadline(agora, agora.AddHours(2)));
            Assert.Equal(agora, DriverNoticeRules.Deadline(agora, agora.AddHours(2).AddTicks(-1)));
            Assert.Equal(agora.AddMinutes(30), DriverNoticeRules.Deadline(agora, null));
        }

        [Fact]
        public void NovoCancelaNaoVistosDoMesmoServicoParaOutroMotorista()
        {
            var pendente = AddNotice(Novo, driverA, Pendente);
            var enviado = AddNotice(Novo, driverA, Enviado);
            var falhou = AddNotice(Novo, driverA, Falhou);
            var semApp = AddNotice(Novo, driverA, SemApp);
            var visto = AddNotice(Novo, driverA, Visto);
            var doMesmo = AddNotice(Novo, driverB, Enviado);
            var retirado = AddNotice(Retirado, driverA, Enviado);
            var outroServico = system.Add(Notice, "new_reserva", new EntityReference(Service, Guid.NewGuid()), "new_tipo", new OptionSetValue(Novo), "new_funcionario", Ref(driverA), "new_situacao", new OptionSetValue(Enviado));

            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado));

            foreach (var id in new[] { pendente, enviado, falhou, semApp })
            {
                Assert.Equal(Cancelado, Option(system.Get(Notice, id), "new_situacao"));
            }
            Assert.Equal(Visto, Option(system.Get(Notice, visto), "new_situacao"));
            Assert.Equal(Enviado, Option(system.Get(Notice, doMesmo), "new_situacao"));
            Assert.Equal(Enviado, Option(system.Get(Notice, retirado), "new_situacao"));
            Assert.Equal(Enviado, Option(system.Get(Notice, outroServico), "new_situacao"));
        }

        [Fact]
        public void MesmaCorrelacaoNaoDuplicaAviso()
        {
            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado));
            RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado));

            Assert.Equal(2, Notices().Count);
            Assert.Equal(
                $"{correlationId:N}:{serviceId:N}:{driverB:N}:Novo",
                Single(Novo).GetAttributeValue<string>("new_chaveidempotencia"));
        }

        [Fact]
        public void FalhaAoCriarAvisoDerrubaAGravacaoComErroClaro()
        {
            system.FailOnCreate = new InvalidOperationException("timeout SQL 0x80040223");

            var error = Assert.Throws<InvalidPluginExecutionException>(() =>
                RunPost(Target(Driver, Ref(driverB)), Pre(driverA, Programado)));

            Assert.StartsWith("[DRIVER_NOTICE_FAILED]", error.Message);
            Assert.Contains(correlationId.ToString("N"), error.Message);
            Assert.DoesNotContain("SQL", error.Message);
        }

        // ---------- Apoio ----------

        private void RunPre(Entity target, Entity pre) => Execute(20, "Update", target, pre);

        private void RunPost(Entity target, Entity pre) => Execute(40, "Update", target, pre);

        private void Execute(int stage, string message, Entity target, Entity pre)
        {
            var context = new RemoteExecutionContext
            {
                MessageName = message,
                PrimaryEntityName = Service,
                PrimaryEntityId = target.Id,
                Stage = stage,
                CorrelationId = correlationId,
                UserId = Guid.NewGuid()
            };
            context.InputParameters["Target"] = target;
            if (pre != null) context.PreEntityImages["pre"] = pre;
            new DriverNoticePlugin().Execute(new FakeProvider(context, system));
        }

        private Entity Target(params object[] attributes)
        {
            var entity = new Entity(Service, serviceId);
            for (var index = 0; index < attributes.Length; index += 2) entity[(string)attributes[index]] = attributes[index + 1];
            return entity;
        }

        private Entity Pre(Guid driver, int status, DateTime? departure = null)
        {
            var entity = new Entity(Service, serviceId) { [Driver] = Ref(driver), [Status] = new OptionSetValue(status), ["cr40f_id"] = "OS-1" };
            if (departure.HasValue) entity[Departure] = departure.Value;
            return entity;
        }

        private Guid AddNotice(int kind, Guid driver, int situation) => system.Add(
            Notice,
            "new_reserva", new EntityReference(Service, serviceId),
            "new_tipo", new OptionSetValue(kind),
            "new_funcionario", Ref(driver),
            "new_situacao", new OptionSetValue(situation));

        private static EntityReference Ref(Guid id) => new EntityReference(Employee, id);

        private static int Option(Entity row, string attribute) => row.GetAttributeValue<OptionSetValue>(attribute).Value;

        private List<Entity> Notices() => system.Rows.Where(row => row.LogicalName == Notice).ToList();

        private Entity Single(int kind) => Notices().Single(notice => Option(notice, "new_tipo") == kind);

        private void AssertOnly(int kind, Guid driver)
        {
            var notice = Assert.Single(Notices());
            Assert.Equal(kind, Option(notice, "new_tipo"));
            Assert.Equal(driver, notice.GetAttributeValue<EntityReference>("new_funcionario").Id);
        }

        private sealed class FakeProvider : IServiceProvider, IOrganizationServiceFactory, ITracingService
        {
            private readonly IPluginExecutionContext context;
            private readonly IOrganizationService system;

            public FakeProvider(IPluginExecutionContext context, IOrganizationService system)
            {
                this.context = context;
                this.system = system;
            }

            public object GetService(Type serviceType)
            {
                if (serviceType == typeof(IPluginExecutionContext)) return context;
                if (serviceType == typeof(IOrganizationServiceFactory)) return this;
                if (serviceType == typeof(ITracingService)) return this;
                throw new NotSupportedException(serviceType.Name);
            }

            public IOrganizationService CreateOrganizationService(Guid? userId)
            {
                Assert.Null(userId); // aviso nunca depende do privilégio de quem salvou
                return system;
            }

            public void Trace(string format, params object[] args) { }
        }

        private sealed class FakeService : IOrganizationService
        {
            public readonly List<Entity> Rows = new List<Entity>();
            public readonly List<Entity> Updated = new List<Entity>();
            public Exception FailOnCreate;

            public Guid Add(string table, params object[] attributes)
            {
                var entity = new Entity(table, Guid.NewGuid());
                for (var index = 0; index < attributes.Length; index += 2) entity[(string)attributes[index]] = attributes[index + 1];
                Rows.Add(entity);
                return entity.Id;
            }

            public Entity Get(string table, Guid id) => Rows.Single(row => row.LogicalName == table && row.Id == id);

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => Get(entityName, id);

            public Guid Create(Entity entity)
            {
                if (FailOnCreate != null) throw FailOnCreate;
                entity.Id = Guid.NewGuid();
                Rows.Add(entity);
                return entity.Id;
            }

            public void Update(Entity entity)
            {
                Updated.Add(entity);
                var existing = Get(entity.LogicalName, entity.Id);
                foreach (var attribute in entity.Attributes) existing[attribute.Key] = attribute.Value;
            }

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var expression = (QueryExpression)query;
                IEnumerable<Entity> found = Rows.Where(row => row.LogicalName == expression.EntityName);
                foreach (var condition in expression.Criteria.Conditions)
                {
                    found = found.Where(row => Matches(row, condition)).ToList();
                }
                return new EntityCollection(found.ToList());
            }

            private static bool Matches(Entity row, ConditionExpression condition)
            {
                var value = row.Contains(condition.AttributeName) ? row[condition.AttributeName] : null;
                if (value is EntityReference reference) value = reference.Id;
                if (value is OptionSetValue option) value = option.Value;
                switch (condition.Operator)
                {
                    case ConditionOperator.Equal: return Equals(value, condition.Values[0]);
                    case ConditionOperator.NotEqual: return !Equals(value, condition.Values[0]);
                    case ConditionOperator.In: return condition.Values.Contains(value);
                    default: throw new NotSupportedException(condition.Operator.ToString());
                }
            }

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
