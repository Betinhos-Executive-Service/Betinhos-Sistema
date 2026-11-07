using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TreinamentoCommandPluginTests
    {
        private const string Header = "cr40f_treinamento";
        private const string Participacao = "cr40f_treinamentoparticipacao";
        private const int Rascunho = 100000000;
        private const int Publicado = 100000001;
        private const int PushPendente = 100000000;
        private const int PushEnviado = 100000001;
        private const int PushFalhou = 100000002;

        [Fact]
        public void EnfileiraPendentesSemLembreteRecenteEIgnoraOsOutros()
        {
            var service = new FakeService();
            var treinamento = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            var apta = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "createdon", DateTime.UtcNow.AddHours(-30));
            var recente = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "cr40f_lembradoem", DateTime.UtcNow.AddHours(-2));
            service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushPendente));
            service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_concluidoem", DateTime.UtcNow);

            var outputs = Run(service, "cr40f_TreinamentoId", treinamento);

            Assert.Equal(1, outputs["cr40f_Enfileirados"]);
            Assert.Equal(2, outputs["cr40f_Ignorados"]); // o recente e o que já está na fila; a concluída nem entra na conta
            var atualizada = service.Get(Participacao, apta);
            Assert.Equal(PushPendente, atualizada.GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
            Assert.Equal("", atualizada.GetAttributeValue<string>("cr40f_pusherro"));
            Assert.NotNull(atualizada.GetAttributeValue<DateTime?>("cr40f_lembradoem"));
            Assert.Equal(PushEnviado, service.Get(Participacao, recente).GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
            Assert.Single(service.Updated);
        }

        [Fact]
        public void LembreteAntigoVoltaParaAFilaEPushFalhoTambem()
        {
            var service = new FakeService();
            var treinamento = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "cr40f_lembradoem", DateTime.UtcNow.AddHours(-25));
            service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushFalhou), "cr40f_pusherro", "Falha", "createdon", DateTime.UtcNow.AddHours(-30));

            var outputs = Run(service, "cr40f_TreinamentoId", treinamento);

            Assert.Equal(2, outputs["cr40f_Enfileirados"]);
            Assert.Equal(0, outputs["cr40f_Ignorados"]);
        }

        [Fact]
        public void PrimeiroPushContaComoLembretePelaCriacaoDaParticipacao()
        {
            var service = new FakeService();
            var treinamento = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            var recemPublicada = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "createdon", DateTime.UtcNow.AddMinutes(-5));
            var antiga = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "createdon", DateTime.UtcNow.AddHours(-25));

            var outputs = Run(service, "cr40f_TreinamentoId", treinamento);

            Assert.Equal(1, outputs["cr40f_Enfileirados"]);
            Assert.Equal(1, outputs["cr40f_Ignorados"]);
            Assert.Equal(PushEnviado, service.Get(Participacao, recemPublicada).GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
            Assert.Equal(PushPendente, service.Get(Participacao, antiga).GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
        }

        [Fact]
        public void ParticipacaoUnicaIgnoraSeLembradaHaMenosDe24Horas()
        {
            var service = new FakeService();
            var treinamento = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            var outra = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado));
            var recente = service.Add(Participacao, "cr40f_treinamento", Ref(treinamento), "cr40f_pushstatus", new OptionSetValue(PushEnviado), "cr40f_lembradoem", DateTime.UtcNow.AddHours(-1));

            var outputs = Run(service, "cr40f_TreinamentoId", treinamento, "cr40f_ParticipacaoId", recente);

            Assert.Equal(0, outputs["cr40f_Enfileirados"]);
            Assert.Equal(1, outputs["cr40f_Ignorados"]);
            Assert.Equal(PushEnviado, service.Get(Participacao, outra).GetAttributeValue<OptionSetValue>("cr40f_pushstatus").Value);
        }

        [Fact]
        public void RecusaTreinamentoEmRascunho()
        {
            var service = new FakeService();
            var treinamento = service.Add(Header, "cr40f_estado", new OptionSetValue(Rascunho));

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(service, "cr40f_TreinamentoId", treinamento));

            Assert.Contains("publicado", error.Message);
        }

        [Fact]
        public void ParticipacaoDeOutroTreinamentoEhRecusada()
        {
            var service = new FakeService();
            var t1 = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            var t2 = service.Add(Header, "cr40f_estado", new OptionSetValue(Publicado));
            var p = service.Add(Participacao, "cr40f_treinamento", Ref(t2), "cr40f_pushstatus", new OptionSetValue(PushFalhou));

            Assert.Throws<InvalidPluginExecutionException>(() => Run(service, "cr40f_TreinamentoId", t1, "cr40f_ParticipacaoId", p));
            Assert.Empty(service.Updated);
        }

        [Fact]
        public void TreinamentoIdEhObrigatorio()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Run(new FakeService()));
        }

        private static EntityReference Ref(Guid treinamento) => new EntityReference(Header, treinamento);

        private static ParameterCollection Run(FakeService service, params object[] inputs)
        {
            var context = new RemoteExecutionContext { InitiatingUserId = Guid.NewGuid() };
            for (var index = 0; index < inputs.Length; index += 2) context.InputParameters[(string)inputs[index]] = inputs[index + 1];
            try
            {
                typeof(TreinamentoCommandPlugin).GetMethod("Lembrar", BindingFlags.Static | BindingFlags.NonPublic).Invoke(null, new object[] { context, service, service });
            }
            catch (TargetInvocationException error) { throw error.InnerException; }
            return context.OutputParameters;
        }

        private sealed class FakeService : IOrganizationService
        {
            private readonly List<Entity> rows = new List<Entity>();
            public readonly List<Entity> Updated = new List<Entity>();

            /// Atributos como pares nome, valor.
            public Guid Add(string table, params object[] attributes)
            {
                var entity = new Entity(table, Guid.NewGuid()) { ["statecode"] = new OptionSetValue(0) };
                for (var index = 0; index < attributes.Length; index += 2) entity[(string)attributes[index]] = attributes[index + 1];
                rows.Add(entity);
                return entity.Id;
            }

            public Entity Get(string table, Guid id) => rows.Single(row => row.LogicalName == table && row.Id == id);

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => Get(entityName, id);

            public void Update(Entity entity)
            {
                Updated.Add(entity);
                var existing = Get(entity.LogicalName, entity.Id);
                foreach (var attribute in entity.Attributes) existing[attribute.Key] = attribute.Value;
            }

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var expression = (QueryExpression)query;
                var found = rows.Where(row => row.LogicalName == expression.EntityName);
                foreach (var condition in expression.Criteria.Conditions)
                {
                    if (condition.Operator != ConditionOperator.Equal) throw new NotSupportedException("Operador não suportado: " + condition.Operator);
                    var expected = condition.Values[0];
                    found = found.Where(row => Matches(row, condition.AttributeName, expected));
                }
                return new EntityCollection(found.ToList());
            }

            private static bool Matches(Entity row, string attribute, object expected)
            {
                if (attribute == row.LogicalName + "id") return Equals(row.Id, expected);
                var value = row.Contains(attribute) ? row[attribute] : null;
                if (value is EntityReference reference) return Equals(reference.Id, expected);
                if (value is OptionSetValue option) return Equals(option.Value, expected);
                return Equals(value, expected);
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
