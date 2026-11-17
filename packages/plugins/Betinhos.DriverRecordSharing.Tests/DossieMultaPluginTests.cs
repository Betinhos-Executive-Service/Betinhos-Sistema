using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class DossieMultaPluginTests
    {
        private static readonly DateTime Infracao = new DateTime(2026, 11, 10, 16, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void JuntaNotificacaoServicoNoHorarioEViagensComMotorista()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(-1), Infracao.AddHours(2), "S-100", "Cliente Alfa (fictício)", "Concluído");
            s.Reserva(Infracao.AddHours(-20), Infracao.AddHours(-18), "S-099", "Cliente Beta (fictício)", "Concluído");

            var d = Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s));

            var multa = (Dictionary<string, object>)d["multa"];
            Assert.Equal("1A2B3C", multa["auto"]);
            Assert.Equal("ABC1D23", multa["placa"]);
            Assert.Equal("2026-11-10T16:00:00Z", multa["dataHora"]);
            Assert.Equal("2026-11-30", multa["dataParaIndicar"]);
            Assert.Equal("605-03", ((Dictionary<string, object>)multa["infracao"])["codigo"]);
            var servico = (Dictionary<string, object>)((object[])d["servicos"]).Single();
            Assert.Equal("S-100", servico["codigo"]);
            Assert.Equal("Cliente Alfa (fictício)", servico["cliente"]);
            Assert.Equal(true, servico["noHorario"]);
            var viagem = (Dictionary<string, object>)((object[])((Dictionary<string, object>)d["infleet"])["viagens"]).Single();
            Assert.Equal("Ana", viagem["motorista"]);
        }

        [Fact]
        public void SemServicoNoHorarioMostraOMaisProximo()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(3), null, "S-200", "Cliente Gama (fictício)", "Programado");

            var servico = (Dictionary<string, object>)((object[])Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s))["servicos"]).Single();

            Assert.Equal("S-200", servico["codigo"]);
            Assert.Equal(false, servico["noHorario"]);
        }

        [Fact]
        public void InfleetForaDoArViraErroEODossieSai()
        {
            var s = Cenario();
            s.InfleetFalha = true;

            var d = Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s));

            Assert.Equal("Infleet fora do ar.", ((Dictionary<string, object>)d["infleet"])["erro"]);
            Assert.Empty((object[])d["servicos"]);
        }

        [Fact]
        public void ReservaCanceladaNaoEntraComoServico()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(-1), Infracao.AddHours(2), "S-300", "Cliente Cancelado (fictício)", "Cancelado", 202410002);
            s.Reserva(Infracao.AddHours(-1), Infracao.AddHours(2), "S-301", "Cliente Ressalva (fictício)", "Cancelado com Ressalvas", 202410010);
            s.Reserva(Infracao.AddMinutes(-30), Infracao.AddHours(1), "S-302", "Cliente Ativo (fictício)", "Em Execução", 202410006);

            var servico = (Dictionary<string, object>)((object[])Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s))["servicos"]).Single();

            Assert.Equal("S-302", servico["codigo"]);
            Assert.Equal(true, servico["noHorario"]);
        }

        [Fact]
        public void SoReservaCanceladaNaJanelaDeixaServicosVazio()
        {
            var s = Cenario();
            s.Reserva(Infracao.AddHours(-1), Infracao.AddHours(2), "S-300", "Cliente Cancelado (fictício)", "Cancelado", 202410002);

            Assert.Empty((object[])Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s))["servicos"]);
        }

        [Fact]
        public void FalhaNaAgendaDevolveServicosVaziosEOResto()
        {
            var s = Cenario();
            s.AgendaFalha = true;
            var tracing = new Rastro();

            var d = Ler(DossieMultaPlugin.Montar(s, s.Multa.Id, s, tracing));

            Assert.Empty((object[])d["servicos"]);
            Assert.Equal("1A2B3C", ((Dictionary<string, object>)d["multa"])["auto"]);
            Assert.NotNull(((Dictionary<string, object>)d["infleet"])["viagens"]);
            Assert.Contains(tracing.Linhas, l => l.Contains("agenda"));
        }

        [Fact]
        public void ErroInesperadoDoInfleetNaoVazaNoDossieEVaiParaOTrace()
        {
            var s = Cenario();
            s.InfleetErroInesperado = true;
            var tracing = new Rastro();

            var json = DossieMultaPlugin.Montar(s, s.Multa.Id, s, tracing);
            var d = Ler(json);

            Assert.Equal("Não foi possível consultar o InFleet.", ((Dictionary<string, object>)d["infleet"])["erro"]);
            Assert.DoesNotContain("token-secreto", json);
            Assert.Contains(tracing.Linhas, l => l.Contains("token-secreto"));
        }

        [Fact]
        public void PluginDevolveODossieNaSaida()
        {
            var s = Cenario();
            var ctx = new RemoteExecutionContext { MessageName = DossieMultaPlugin.MessageName, InitiatingUserId = Guid.NewGuid(), UserId = Guid.NewGuid(), Depth = 1 };
            ctx.InputParameters["new_MultaId"] = s.Multa.Id;

            new DossieMultaPlugin((system, tracing) => s).Execute(new Provider(ctx, s));

            Assert.Contains("\"auto\":\"1A2B3C\"", (string)ctx.OutputParameters["new_DossieJson"]);
        }

        private static Dictionary<string, object> Ler(string json) => (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(json);

        private static Mundo Cenario()
        {
            var s = new Mundo();
            s.Veiculo = s.Add(new Entity("cr40f_veiculos") { ["cr40f_placa"] = "ABC1D23" });
            var infracao = s.Add(new Entity("cr40f_infracaodetransito") { ["cr40f_codigodainfracao"] = "605-03", ["cr40f_descricaodainfracao"] = "Avançar sinal vermelho", ["cr40f_valordamulta"] = new Money(293.47m) });
            s.Add(new Entity("cr40f_funcionarios") { ["new_infleetdriverid"] = "drv-1", ["new_apelido"] = "Ana", ["cr40f_nomecompleto"] = "Ana Souza (fictício)" });
            s.Multa = s.Add(new Entity("cr40f_multas")
            {
                ["cr40f_novacoluna"] = "1A2B3C", ["cr40f_dataehorario"] = Infracao, ["cr40f_localdainfracao"] = "Av. de Teste, 100",
                ["cr40f_placa"] = s.Veiculo.ToEntityReference(), ["cr40f_codigodainfracao"] = infracao.ToEntityReference(),
                ["cr40f_dataparaindicar"] = new DateTime(2026, 11, 30, 0, 0, 0, DateTimeKind.Utc),
            });
            return s;
        }

        private sealed class Rastro : ITracingService
        {
            public readonly List<string> Linhas = new List<string>();
            public void Trace(string format, params object[] args) => Linhas.Add(args.Length == 0 ? format : string.Format(format, args));
        }

        private sealed class Provider : IServiceProvider, IOrganizationServiceFactory, ITracingService
        {
            private readonly IPluginExecutionContext ctx; private readonly Mundo mundo;
            public Provider(IPluginExecutionContext ctx, Mundo mundo) { this.ctx = ctx; this.mundo = mundo; }
            public object GetService(Type type) => type == typeof(IPluginExecutionContext) ? (object)ctx : type == typeof(IOrganizationServiceFactory) || type == typeof(ITracingService) ? this : null;
            public IOrganizationService CreateOrganizationService(Guid? userId) => mundo;
            public void Trace(string format, params object[] args) { }
        }

        private sealed class Mundo : IOrganizationService, ITermoInfleet
        {
            private readonly Dictionary<string, List<Entity>> tabelas = new Dictionary<string, List<Entity>>();
            public Entity Veiculo, Multa;
            public bool InfleetFalha, InfleetErroInesperado, AgendaFalha;

            public Entity Add(Entity e)
            {
                if (e.Id == Guid.Empty) e.Id = Guid.NewGuid();
                if (!tabelas.TryGetValue(e.LogicalName, out var lista)) tabelas[e.LogicalName] = lista = new List<Entity>();
                lista.Add(e);
                return e;
            }

            public void Reserva(DateTime saida, DateTime? retorno, string codigo, string cliente, string status, int statusCodigo = 202410008)
            {
                var r = Add(new Entity("cr40f_reservadeveculos")
                {
                    ["cr40f_veiculo"] = Veiculo.ToEntityReference(), ["cr40f_dataehorriodesada"] = saida, ["cr40f_horrioprevistoderetorno"] = retorno,
                    ["cr40f_idnovo"] = codigo, ["cr40f_cliente"] = new EntityReference("cr40f_clientes1", Guid.NewGuid()) { Name = cliente },
                    ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()) { Name = "Ana Souza (fictício)" }, ["cr40f_status"] = new OptionSetValue(statusCodigo),
                });
                r.FormattedValues["cr40f_status"] = status;
            }

            public Dictionary<string, object> Coletar(string placa, DateTime infracaoUtc)
            {
                if (InfleetErroInesperado) throw new InvalidOperationException("falha com token-secreto");
                if (InfleetFalha) throw new InfleetUnavailableException("Infleet fora do ar.");
                return new Dictionary<string, object>
                {
                    ["veiculoId"] = "vf-1",
                    ["viagens"] = new[] { new Dictionary<string, object> { ["inicio"] = "2026-11-10T15:40:00Z", ["fim"] = "2026-11-10T16:20:00Z", ["motoristaInfleet"] = "drv-1" } },
                };
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => tabelas[entityName].Single(e => e.Id == id);

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var q = (QueryExpression)query;
                if (AgendaFalha && q.EntityName == "cr40f_reservadeveculos") throw new InvalidOperationException("agenda fora");
                IEnumerable<Entity> linhas = tabelas.TryGetValue(q.EntityName, out var lista) ? lista : new List<Entity>();
                foreach (var c in q.Criteria.Conditions) linhas = linhas.Where(e => Casa(e, c)).ToList();
                return new EntityCollection(linhas.ToList());
            }

            private static bool Casa(Entity e, ConditionExpression c)
            {
                object valor = e.Contains(c.AttributeName) ? e[c.AttributeName] : null;
                if (valor is EntityReference r) valor = r.Id;
                if (c.AttributeName == "statecode" && valor == null) valor = 0;
                switch (c.Operator)
                {
                    case ConditionOperator.Equal: return Equals(valor, c.Values[0]);
                    case ConditionOperator.In: return c.Values.Contains(valor);
                    case ConditionOperator.GreaterEqual: return valor is DateTime a && a >= (DateTime)c.Values[0];
                    case ConditionOperator.LessEqual: return valor is DateTime b && b <= (DateTime)c.Values[0];
                    default: throw new NotSupportedException(c.Operator.ToString());
                }
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
