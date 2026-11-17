using System;
using System.Collections.Generic;
using System.Linq;
using Betinhos.Planner.Notifications;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.Planner.Notifications.Tests
{
    /// <summary>Dataverse mínimo em memória: Retrieve, RetrieveMultiple (Equal/In) e a captura do SendAppNotification.</summary>
    internal sealed class Mundo : IServiceProvider, IOrganizationServiceFactory, ITracingService
    {
        private readonly Dictionary<string, List<Entity>> _tabelas = new Dictionary<string, List<Entity>>();
        private readonly IPluginExecutionContext _ctx;
        public List<OrganizationRequest> Notificacoes { get; } = new List<OrganizationRequest>();
        /// <summary>Usuários que não enxergam nada (simula falta de privilégio de leitura): o Retrieve falha.</summary>
        public HashSet<Guid> SemLeitura { get; } = new HashSet<Guid>();

        public Mundo(IPluginExecutionContext ctx) { _ctx = ctx; }

        public Entity Add(Entity e)
        {
            if (e.Id == Guid.Empty) e.Id = Guid.NewGuid();
            if (!_tabelas.ContainsKey(e.LogicalName)) _tabelas[e.LogicalName] = new List<Entity>();
            _tabelas[e.LogicalName].Add(e);
            return e;
        }

        public object GetService(Type t) =>
            t == typeof(IPluginExecutionContext) ? _ctx : t == typeof(IOrganizationServiceFactory) || t == typeof(ITracingService) ? (object)this : null;

        public IOrganizationService CreateOrganizationService(Guid? userId) => new Visao(this, userId);
        public void Trace(string format, params object[] args) { }

        private sealed class Visao : IOrganizationService
        {
            private readonly Mundo _m;
            private readonly Guid? _u;
            public Visao(Mundo m, Guid? u) { _m = m; _u = u; }

            public Entity Retrieve(string n, Guid id, ColumnSet c)
            {
                if (_u.HasValue && _m.SemLeitura.Contains(_u.Value)) throw new InvalidPluginExecutionException("Sem privilégio de leitura.");
                return _m._tabelas[n].Single(r => r.Id == id);
            }

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var q = (QueryExpression)query;
                IEnumerable<Entity> linhas = _m._tabelas.ContainsKey(q.EntityName) ? _m._tabelas[q.EntityName] : new List<Entity>();
                foreach (var c in q.Criteria.Conditions) linhas = linhas.Where(r => Casa(q.EntityName, r, c)).ToList();
                return new EntityCollection(linhas.ToList());
            }

            private static bool Casa(string tabela, Entity r, ConditionExpression c)
            {
                object v = c.AttributeName == tabela + "id" || c.AttributeName == "cr40f_funcionariosid" ? (object)r.Id
                    : r.Contains(c.AttributeName) ? r[c.AttributeName] : null;
                if (c.AttributeName == "statecode" && v == null) v = new OptionSetValue(0);
                if (c.AttributeName == "isdisabled" && v == null) v = false;
                if (v is OptionSetValue o) v = o.Value;
                var valores = c.Values.Select(x => x is OptionSetValue ov ? (object)ov.Value : x);
                return valores.Any(x => Equals(x, v));
            }

            public OrganizationResponse Execute(OrganizationRequest r)
            {
                if (r.RequestName != "SendAppNotification") throw new NotSupportedException(r.RequestName);
                _m.Notificacoes.Add(r);
                return new OrganizationResponse();
            }

            public Guid Create(Entity e) { throw new NotSupportedException(); }
            public void Update(Entity e) { throw new NotSupportedException(); }
            public void Delete(string n, Guid id) { throw new NotSupportedException(); }
            public void Associate(string n, Guid id, Relationship rel, EntityReferenceCollection rs) { throw new NotSupportedException(); }
            public void Disassociate(string n, Guid id, Relationship rel, EntityReferenceCollection rs) { throw new NotSupportedException(); }
        }
    }

    public class PlannerTaskEventNotificationPluginTests
    {
        private static readonly Guid Junior = Guid.NewGuid(), UsuarioJunior = Guid.NewGuid(), Autor = Guid.NewGuid(), UsuarioAutor = Guid.NewGuid();
        private const string Codigo = "MULTA:11111111-1111-1111-1111-111111111111";
        private const string TituloTarefa = "Multa 1A2B3C · ABC1D23 · Definir o responsável";

        private sealed class Cena
        {
            public Mundo Mundo;
            public RemoteExecutionContext Ctx;
        }

        /// <summary>Evento cr40f_plannertarefaevento já gravado e contexto de Create (post-operation assíncrono).</summary>
        private static Cena Montar(string campo, string valorNovo, int depth, int origemTarefa = 100000003)
        {
            var ctx = new RemoteExecutionContext
            {
                MessageName = "Create", Depth = depth, PrimaryEntityName = "cr40f_plannertarefaevento",
                UserId = Guid.NewGuid(), InitiatingUserId = UsuarioAutor,
            };
            var mundo = new Mundo(ctx);
            mundo.Add(new Entity("cr40f_funcionarios", Junior) { ["cr40f_usuariodataverse"] = new EntityReference("systemuser", UsuarioJunior) });
            mundo.Add(new Entity("cr40f_funcionarios", Autor) { ["cr40f_usuariodataverse"] = new EntityReference("systemuser", UsuarioAutor) });
            mundo.Add(new Entity("systemuser", UsuarioJunior) { ["isdisabled"] = false });
            mundo.Add(new Entity("systemuser", UsuarioAutor) { ["isdisabled"] = false });
            var tarefa = mundo.Add(new Entity("cr40f_plannertarefa")
            {
                ["cr40f_titulo"] = TituloTarefa, ["cr40f_origem"] = new OptionSetValue(origemTarefa),
                ["cr40f_codigoorigem"] = Codigo, ["statecode"] = new OptionSetValue(0),
            });
            var evento = mundo.Add(new Entity("cr40f_plannertarefaevento")
            {
                ["cr40f_tarefa"] = tarefa.ToEntityReference(), ["cr40f_campo"] = campo, ["cr40f_valornovo"] = valorNovo, ["cr40f_descricao"] = "Responsáveis atribuídos.",
            });
            ctx.PrimaryEntityId = evento.Id;
            ctx.InputParameters["Target"] = new Entity("cr40f_plannertarefaevento", evento.Id);
            return new Cena { Mundo = mundo, Ctx = ctx };
        }

        private static string Contexto(string sourceType, string sourceCode, string actor = null) =>
            "{" + (actor == null ? "" : "\"actorEmployeeId\":\"" + actor + "\",") +
            "\"assigneeIds\":[\"" + Junior + "\"],\"sourceType\":\"" + sourceType + "\",\"sourceCode\":\"" + sourceCode + "\"}";

        private static void Rodar(Cena c) { new PlannerTaskEventNotificationPlugin().Execute(c.Mundo); }

        [Fact]
        public void Atribuicao_da_tarefa_de_multa_gerada_pelo_sistema_dispara_o_sininho_no_depth_2()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo), depth: 2);
            Rodar(c);

            var n = Assert.Single(c.Mundo.Notificacoes);
            Assert.Equal(UsuarioJunior, ((EntityReference)n["Recipient"]).Id);
            Assert.Equal("Nova tarefa:", n["Title"]);
            Assert.Equal(TituloTarefa, n["Body"]);
        }

        [Fact]
        public void Depth_2_da_multa_dispara_mesmo_quando_o_iniciador_nao_le_o_evento()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo), depth: 2);
            c.Mundo.SemLeitura.Add(c.Ctx.InitiatingUserId);

            Rodar(c);

            Assert.Single(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Atribuicao_da_multa_no_depth_1_tambem_funciona()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo), depth: 1);
            Rodar(c);
            Assert.Single(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Depth_3_continua_ignorado_mesmo_para_a_multa()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo), depth: 3);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Theory]
        [InlineData("manual")]
        [InlineData("")]
        [InlineData("cotacao")]
        public void Depth_2_sem_ser_de_multa_continua_ignorado(string sourceType)
        {
            var c = Montar("notification:assignment", Contexto(sourceType, Codigo), depth: 2);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Depth_2_de_outro_tipo_de_notificacao_da_multa_continua_ignorado()
        {
            var c = Montar("notification:status", Contexto("multa", Codigo), depth: 2);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Depth_2_com_ator_informado_continua_ignorado_mesmo_para_a_multa()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo, Autor.ToString()), depth: 2);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Evento_da_multa_numa_tarefa_que_nao_e_de_multa_e_ignorado()
        {
            var c = Montar("notification:assignment", Contexto("multa", Codigo), depth: 2, origemTarefa: 100000000);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Evento_da_multa_com_codigo_diferente_do_da_tarefa_e_ignorado()
        {
            var c = Montar("notification:assignment", Contexto("multa", "MULTA:22222222-2222-2222-2222-222222222222"), depth: 2);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }

        [Fact]
        public void Atribuicao_manual_do_usuario_no_depth_1_continua_igual_e_nao_notifica_o_proprio_ator()
        {
            var valor = "{\"actorEmployeeId\":\"" + Autor + "\",\"assigneeIds\":[\"" + Junior + "\",\"" + Autor + "\"]}";
            var c = Montar("notification:assignment", valor, depth: 1);
            Rodar(c);
            var n = Assert.Single(c.Mundo.Notificacoes);
            Assert.Equal(UsuarioJunior, ((EntityReference)n["Recipient"]).Id);
        }

        [Fact]
        public void Atribuicao_sem_ator_e_sem_ser_de_multa_continua_ignorada_no_depth_1()
        {
            var c = Montar("notification:assignment", "{\"assigneeIds\":[\"" + Junior + "\"]}", depth: 1);
            Rodar(c);
            Assert.Empty(c.Mundo.Notificacoes);
        }
    }
}
