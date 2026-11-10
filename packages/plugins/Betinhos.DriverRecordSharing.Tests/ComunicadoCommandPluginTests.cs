using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ComunicadoCommandPluginTests
    {
        private const int Informativo = 100000000;
        private const int Ciencia = 100000001;
        private const int Todos = 100000000;
        private const int Selecionados = 100000001;
        private const int Rascunho = 100000000;
        private const int Disparado = 100000001;
        private const int PushEnviado = 100000001;
        private const int PushFalhou = 100000002;

        [Fact]
        public void TodosEnviaSomenteParaMotoristasComVinculoUnico()
        {
            var service = new FakeService();
            var valid = Driver("Apto", "apto@empresa.test");
            service.Drivers.AddRange(new[] { valid, Driver("Sem email", ""), Driver("Sem usuario", "ausente@empresa.test") });
            service.Users.Add(User("apto@empresa.test"));
            service.Header = Header(Todos);

            Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service);

            Assert.Single(service.Created);
            Assert.Equal(valid.Id, service.Created[0].GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(service.Users[0].Id, service.Created[0].GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal(Disparado, service.Header.GetAttributeValue<OptionSetValue>("new_estado").Value);
        }

        [Fact]
        public void SelecionadoSemVinculoRecusaDisparoInteiro()
        {
            var service = new FakeService();
            var valid = Driver("Apto", "apto@empresa.test");
            var invalid = Driver("Pendente", "");
            service.Drivers.AddRange(new[] { valid, invalid });
            service.Users.Add(User("apto@empresa.test"));
            service.Header = Header(Selecionados, new[] { valid.Id, invalid.Id });

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service));

            Assert.IsType<InvalidPluginExecutionException>(error.InnerException);
            Assert.Empty(service.Created);
            Assert.Equal(Rascunho, service.Header.GetAttributeValue<OptionSetValue>("new_estado").Value);
        }

        [Theory]
        [InlineData(1)]
        [InlineData(2)]
        public void SelecionadosValidosRecebemUmaCopiaCada(int count)
        {
            var service = new FakeService();
            for (var index = 0; index < count; index++)
            {
                var email = "driver" + index + "@empresa.test";
                service.Drivers.Add(Driver("Motorista " + index, email));
                service.Users.Add(User(email));
            }
            service.Header = Header(Selecionados, service.Drivers.Select(driver => driver.Id));

            Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service);

            Assert.Equal(count, service.Created.Count);
            Assert.Equal(count, service.Created.Select(row => row.GetAttributeValue<string>("new_chaveunica")).Distinct().Count());
        }

        [Fact]
        public void TodosSemMotoristaAptoNaoDispara()
        {
            var service = new FakeService { Header = Header(Todos) };
            service.Drivers.Add(Driver("Sem email", ""));

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service));

            Assert.Contains("Nenhum motorista ativo com acesso", error.InnerException.Message);
            Assert.Empty(service.Created);
        }

        [Fact]
        public void EmailDuplicadoEntreMotoristasNaoRecebeEmTodos()
        {
            var service = new FakeService();
            service.Drivers.AddRange(new[] { Driver("Um", "duplicado@empresa.test"), Driver("Dois", "duplicado@empresa.test"), Driver("Tres", "apto@empresa.test") });
            service.Users.AddRange(new[] { User("duplicado@empresa.test"), User("apto@empresa.test") });
            service.Header = Header(Todos);

            Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service);

            Assert.Single(service.Created);
            Assert.Equal("Tres", service.Drivers.Single(driver => driver.Id == service.Created[0].GetAttributeValue<EntityReference>("new_motorista").Id).GetAttributeValue<string>("cr40f_nomecompleto"));
        }

        [Fact]
        public void SegundoDisparoDoMesmoCabecalhoEhRecusado()
        {
            var service = new FakeService { Header = Header(Todos) };
            service.Header["new_estado"] = new OptionSetValue(Disparado);

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Dispatch", Context("new_ComunicadoId", service.Header.Id), service, service));

            Assert.Contains("já foi disparado", error.InnerException.Message);
            Assert.Empty(service.Created);
        }

        [Fact]
        public void AbrirInformativoMarcaLeituraUmaVez()
        {
            var service = DriverService(Informativo);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);

            Invoke("Open", context, service);
            var readAt = service.Recipient.GetAttributeValue<DateTime>("new_lidoem");
            Invoke("Open", context, service);

            Assert.NotEqual(default(DateTime), readAt);
            Assert.Equal(readAt, service.Recipient.GetAttributeValue<DateTime>("new_lidoem"));
            Assert.Single(service.Updated);
        }

        [Fact]
        public void OutroUsuarioNaoPodeAbrirDestinatario()
        {
            var service = DriverService(Informativo);

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Open", Context("new_DestinatarioId", service.Recipient.Id, Guid.NewGuid()), service));

            Assert.Contains("não pertence", error.InnerException.Message);
            Assert.Empty(service.Updated);
        }

        [Fact]
        public void CienciaExigeAberturaEAssinaturaValida()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            context.InputParameters["new_AssinaturaJson"] = "[]";

            var beforeOpen = Assert.Throws<TargetInvocationException>(() => Invoke("Acknowledge", context, service));
            Assert.Contains("Abra", beforeOpen.InnerException.Message);
            Invoke("Open", context, service);
            var emptySignature = Assert.Throws<TargetInvocationException>(() => Invoke("Acknowledge", context, service));

            Assert.Contains("assinatura", emptySignature.InnerException.Message, StringComparison.OrdinalIgnoreCase);
            Assert.False(service.Recipient.Contains("new_cienteem"));
        }

        [Fact]
        public void CienciaUsaNomeDoCadastroERepeticaoNaoSubstituiDados()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            Invoke("Open", context, service);
            context.InputParameters["new_AssinaturaJson"] = "[[[0.1,0.2],[0.4,0.5]]]";
            context.InputParameters["new_Observacao"] = "  Recebi a orientação  ";

            Invoke("Acknowledge", context, service);
            var signedAt = service.Recipient.GetAttributeValue<DateTime>("new_cienteem");
            context.InputParameters["new_Observacao"] = "Alterada";
            Invoke("Acknowledge", context, service);

            Assert.Equal("Motorista de teste", service.Recipient.GetAttributeValue<string>("new_nomeassinante"));
            Assert.Equal("Recebi a orientação", service.Recipient.GetAttributeValue<string>("new_observacao"));
            Assert.Equal(signedAt, service.Recipient.GetAttributeValue<DateTime>("new_cienteem"));
            Assert.Equal(2, service.Updated.Count);
        }

        [Fact]
        public void EvidenciaComCarimboValidoEhVerificadaEGuardaSoOContrato()
        {
            var stored = Parse(Build(Evidence().Replace("\"v\":1,", "\"v\":1,\"extra\":\"x\",")));

            Assert.Equal(true, stored["ipVerificado"]);
            Assert.False(stored.ContainsKey("extra"));
            Assert.Equal("2.1.860", stored["appVersion"]);
            Assert.Equal("203.0.113.7", ((Dictionary<string, object>)stored["ipStamp"])["ip"]);
            var geo = (Dictionary<string, object>)stored["geo"];
            Assert.Equal("ok", geo["status"]);
            Assert.Equal(-23.18, Convert.ToDouble(geo["lat"]));
            Assert.True(stored.ContainsKey("servidorEm"));
        }

        [Fact]
        public void EvidenciaComAssinaturaInvalidaNaoEhVerificada()
        {
            Assert.Equal(false, Parse(Build(Evidence(secret: "outro-segredo")))["ipVerificado"]);
            Assert.Equal(false, Parse(Build(Evidence(sig: "AAAA")))["ipVerificado"]);
            Assert.Equal(false, Parse(Build(Evidence(sig: "!!!não-base64")))["ipVerificado"]);
        }

        [Fact]
        public void IpAdulteradoDepoisDeAssinarNaoEhVerificado()
        {
            var raw = Evidence(ip: "203.0.113.7").Replace("\"ip\":\"203.0.113.7\"", "\"ip\":\"198.51.100.9\"");

            Assert.Equal(false, Parse(Build(raw))["ipVerificado"]);
        }

        [Fact]
        public void CarimboVencidoOuDoFuturoNaoEhVerificado()
        {
            var now = DateTime.UtcNow;

            Assert.Equal(false, Parse(Build(Evidence(at: now.AddMinutes(-6)), now: now))["ipVerificado"]);
            Assert.Equal(false, Parse(Build(Evidence(at: now.AddMinutes(6)), now: now))["ipVerificado"]);
            Assert.Equal(true, Parse(Build(Evidence(at: now.AddMinutes(-4)), now: now))["ipVerificado"]);
        }

        [Theory]
        [InlineData("")]
        [InlineData(null)]
        public void SemSegredoNaoVerificaIp(string secret)
        {
            Assert.Equal(false, Parse(Build(Evidence(), secret))["ipVerificado"]);
        }

        [Fact]
        public void SemCarimboGravaIpNuloENaoVerificado()
        {
            var stored = Parse(Build("{\"v\":1,\"appVersion\":\"2.1.860\",\"ipStamp\":null,\"geo\":{\"status\":\"negada\"}}"));

            Assert.Null(stored["ipStamp"]);
            Assert.Equal(false, stored["ipVerificado"]);
            var geo = (Dictionary<string, object>)stored["geo"];
            Assert.Equal("negada", geo["status"]);
            Assert.False(geo.ContainsKey("lat"));
        }

        [Fact]
        public void GeoInvalidaOuDesconhecidaNaoGravaCoordenadas()
        {
            var outOfRange = Parse(Build(Evidence(geo: "{\"status\":\"ok\",\"lat\":91,\"lon\":0,\"accuracy\":5}")));
            var negative = Parse(Build(Evidence(geo: "{\"status\":\"ok\",\"lat\":1,\"lon\":0,\"accuracy\":-1}")));
            var unknown = Parse(Build(Evidence(geo: "{\"status\":\"qualquer\"}")));

            Assert.Equal("indisponivel", ((Dictionary<string, object>)outOfRange["geo"])["status"]);
            Assert.False(((Dictionary<string, object>)outOfRange["geo"]).ContainsKey("lat"));
            Assert.Equal("indisponivel", ((Dictionary<string, object>)negative["geo"])["status"]);
            Assert.Null(unknown["geo"]);
        }

        [Fact]
        public void TextosLongosSaoTruncados()
        {
            var raw = Evidence().Replace("Mozilla/5.0 (Linux; Android 14)", new string('u', 900)).Replace("\"Android\"", "\"" + new string('p', 300) + "\"");
            var stored = Parse(Build(raw));

            Assert.Equal(400, ((string)stored["userAgent"]).Length);
            Assert.Equal(100, ((string)stored["platform"]).Length);
        }

        [Theory]
        [InlineData("isto não é json")]
        [InlineData("[1,2]")]
        public void JsonInvalidoGravaMarcaDeErroSemTravar(string raw)
        {
            var stored = Parse(Build(raw));

            Assert.Equal("formato", stored["erro"]);
            Assert.True(stored.ContainsKey("servidorEm"));
            Assert.False(stored.ContainsKey("ipVerificado"));
        }

        [Fact]
        public void JsonAcimaDeQuatroMilCaracteresGravaMarcaDeErro()
        {
            var raw = Evidence().Replace("Mozilla/5.0 (Linux; Android 14)", new string('u', 4100));

            Assert.Equal("formato", Parse(Build(raw))["erro"]);
        }

        [Fact]
        public void SemEvidenciaNaoHaNadaParaGravar()
        {
            Assert.Null(Build(null));
            Assert.Null(Build("   "));
        }

        [Fact]
        public void AbrirSemEvidenciaMantemCompatibilidade()
        {
            var service = DriverService(Informativo);

            Invoke("Open", Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id), service);

            Assert.NotEqual(default(DateTime), service.Recipient.GetAttributeValue<DateTime>("new_abertoem"));
            Assert.False(service.Recipient.Contains("new_evidenciaaberturajson"));
        }

        [Fact]
        public void AbrirGravaEvidenciaSoNaPrimeiraVez()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            context.InputParameters["new_EvidenciaJson"] = Evidence();

            Invoke("Open", context, service);
            var first = service.Recipient.GetAttributeValue<string>("new_evidenciaaberturajson");
            context.InputParameters["new_EvidenciaJson"] = Evidence(ip: "198.51.100.9");
            Invoke("Open", context, service);

            Assert.Equal(true, Parse(first)["ipVerificado"]);
            Assert.Equal(first, service.Recipient.GetAttributeValue<string>("new_evidenciaaberturajson"));
            Assert.Single(service.Updated);
        }

        [Fact]
        public void AbrirInformativoGravaEvidenciaNaLeitura()
        {
            var service = DriverService(Informativo);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            context.InputParameters["new_EvidenciaJson"] = Evidence();

            Invoke("Open", context, service);

            Assert.True(service.Recipient.Contains("new_lidoem"));
            Assert.Equal(true, Parse(service.Recipient.GetAttributeValue<string>("new_evidenciaaberturajson"))["ipVerificado"]);
        }

        [Fact]
        public void AbrirComEvidenciaInvalidaAindaMarcaAbertura()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            context.InputParameters["new_EvidenciaJson"] = "{quebrado";

            Invoke("Open", context, service);

            Assert.True(service.Recipient.Contains("new_abertoem"));
            Assert.Equal("formato", Parse(service.Recipient.GetAttributeValue<string>("new_evidenciaaberturajson"))["erro"]);
        }

        [Fact]
        public void CienciaGravaEvidenciaJuntoComAAssinatura()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            Invoke("Open", context, service);
            context.InputParameters["new_AssinaturaJson"] = "[[[0.1,0.2],[0.4,0.5]]]";
            context.InputParameters["new_EvidenciaJson"] = Evidence();

            Invoke("Acknowledge", context, service);
            var stored = service.Recipient.GetAttributeValue<string>("new_evidenciacienciajson");
            context.InputParameters["new_EvidenciaJson"] = Evidence(ip: "198.51.100.9");
            Invoke("Acknowledge", context, service);

            Assert.Equal(true, Parse(stored)["ipVerificado"]);
            Assert.Equal(stored, service.Recipient.GetAttributeValue<string>("new_evidenciacienciajson"));
            Assert.False(service.Recipient.Contains("new_evidenciaaberturajson"));
        }

        [Fact]
        public void CienciaSemEvidenciaMantemCompatibilidade()
        {
            var service = DriverService(Ciencia);
            var context = Context("new_DestinatarioId", service.Recipient.Id, service.Users[0].Id);
            Invoke("Open", context, service);
            context.InputParameters["new_AssinaturaJson"] = "[[[0.1,0.2],[0.4,0.5]]]";

            Invoke("Acknowledge", context, service);

            Assert.True(service.Recipient.Contains("new_cienteem"));
            Assert.False(service.Recipient.Contains("new_evidenciacienciajson"));
        }

        [Fact]
        public void ConstrutoresAceitamConfiguracaoSegura()
        {
            Assert.NotNull(new ComunicadoCommandPlugin());
            Assert.NotNull(new ComunicadoCommandPlugin(null, null));
        }

        [Fact]
        public void ReenvioAlteraSomentePushFalho()
        {
            var service = DriverService(Informativo);
            service.Header = Header(Todos);
            service.Recipient["new_comunicado"] = new EntityReference("new_comunicadomotorista", service.Header.Id);
            service.Recipient["new_pushstatus"] = new OptionSetValue(PushFalhou);
            var context = Context("new_DestinatarioId", service.Recipient.Id);

            Invoke("RetryPush", context, service, service);

            Assert.Equal(Rascunho, service.Recipient.GetAttributeValue<OptionSetValue>("new_pushstatus").Value);
            Assert.Empty(service.Created);
            var second = Assert.Throws<TargetInvocationException>(() => Invoke("RetryPush", context, service, service));
            Assert.Contains("após falha", second.InnerException.Message);
        }

        [Fact]
        public void LembreteReenviaPushEnviadoSomenteEnquantoPendente()
        {
            var service = DriverService(Ciencia);
            service.Header = Header(Todos);
            service.Recipient["new_comunicado"] = new EntityReference("new_comunicadomotorista", service.Header.Id);
            service.Recipient["new_pushstatus"] = new OptionSetValue(PushEnviado);
            var context = Context("new_DestinatarioId", service.Recipient.Id);

            Invoke("RetryPush", context, service, service);
            Assert.Equal(Rascunho, service.Recipient.GetAttributeValue<OptionSetValue>("new_pushstatus").Value);

            service.Recipient["new_pushstatus"] = new OptionSetValue(PushEnviado);
            service.Recipient["new_cienteem"] = DateTime.UtcNow;
            var concluded = Assert.Throws<TargetInvocationException>(() => Invoke("RetryPush", context, service, service));
            Assert.Contains("pendente", concluded.InnerException.Message);
        }

        [Fact]
        public void LembreteDeInformativoLidoEhRecusado()
        {
            var service = DriverService(Informativo);
            service.Header = Header(Todos);
            service.Recipient["new_comunicado"] = new EntityReference("new_comunicadomotorista", service.Header.Id);
            service.Recipient["new_pushstatus"] = new OptionSetValue(PushEnviado);
            service.Recipient["new_lidoem"] = DateTime.UtcNow;
            var context = Context("new_DestinatarioId", service.Recipient.Id);

            Assert.Throws<TargetInvocationException>(() => Invoke("RetryPush", context, service, service));
            Assert.Empty(service.Updated);
        }

        [Fact]
        public void CabecalhoDisparadoNaoPodeSerExcluido()
        {
            var service = new FakeService { Header = Header(Todos) };
            service.Header["new_estado"] = new OptionSetValue(Disparado);
            var context = new RemoteExecutionContext { MessageName = "Delete", PrimaryEntityName = "new_comunicadomotorista" };
            context.InputParameters["Target"] = new EntityReference("new_comunicadomotorista", service.Header.Id);

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("GuardDispatchedHeaderDelete", context, service));

            Assert.Contains("não pode ser excluído", error.InnerException.Message);
        }

        [Fact]
        public void RascunhoPodeSerExcluido()
        {
            var service = new FakeService { Header = Header(Todos) };
            var context = new RemoteExecutionContext { MessageName = "Delete", PrimaryEntityName = "new_comunicadomotorista" };
            context.InputParameters["Target"] = new EntityReference("new_comunicadomotorista", service.Header.Id);

            Assert.Null(Record.Exception(() => Invoke("GuardDispatchedHeaderDelete", context, service)));
        }

        [Fact]
        public void CabecalhoDisparadoNaoAceitaEdicaoDeConteudoOuEstado()
        {
            var service = new FakeService { Header = Header(Todos) };
            service.Header["new_estado"] = new OptionSetValue(Disparado);
            var target = new Entity("new_comunicadomotorista", service.Header.Id) { ["new_corpo"] = "Texto alterado" };
            var context = new RemoteExecutionContext { MessageName = "Update", PrimaryEntityName = "new_comunicadomotorista" };
            context.InputParameters["Target"] = target;

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("GuardDispatchedHeader", context, service));

            Assert.Contains("não pode ser alterado", error.InnerException.Message);
        }

        [Fact]
        public void CabecalhoRascunhoAceitaEdicaoEDisparo()
        {
            var service = new FakeService { Header = Header(Todos) };
            var target = new Entity("new_comunicadomotorista", service.Header.Id) { ["new_estado"] = new OptionSetValue(Disparado) };
            var context = new RemoteExecutionContext { MessageName = "Update", PrimaryEntityName = "new_comunicadomotorista" };
            context.InputParameters["Target"] = target;

            var error = Record.Exception(() => Invoke("GuardDispatchedHeader", context, service));

            Assert.Null(error);
        }

        private const string Secret = "segredo-de-teste";

        private static void Invoke(string method, params object[] args) => InvokeWith(Secret, method, args);

        private static void InvokeWith(string secret, string method, params object[] args)
        {
            var target = typeof(ComunicadoCommandPlugin).GetMethod(method, BindingFlags.Static | BindingFlags.Instance | BindingFlags.NonPublic);
            target.Invoke(target.IsStatic ? null : new ComunicadoCommandPlugin(null, secret), args);
        }

        private static string Sign(string ip, string ts, string secret = Secret)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
                return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(ip + "|" + ts))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static string Stamp(DateTime moment) => moment.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

        private static string Evidence(string ip = "203.0.113.7", DateTime? at = null, string secret = Secret, string sig = null, string geo = null)
        {
            var ts = Stamp(at ?? DateTime.UtcNow);
            return "{\"v\":1,\"appVersion\":\"2.1.860\",\"userAgent\":\"Mozilla/5.0 (Linux; Android 14)\",\"platform\":\"Android\",\"model\":\"SM-A546\","
                + "\"ipStamp\":{\"ip\":\"" + ip + "\",\"ts\":\"" + ts + "\",\"sig\":\"" + (sig ?? Sign(ip, ts, secret)) + "\"},"
                + "\"geo\":" + (geo ?? "{\"status\":\"ok\",\"lat\":-23.18,\"lon\":-45.88,\"accuracy\":30,\"ts\":\"2026-11-10T13:40:00.000Z\"}") + "}";
        }

        private static Dictionary<string, object> Parse(string json) =>
            (Dictionary<string, object>)new System.Web.Script.Serialization.JavaScriptSerializer().DeserializeObject(json);

        private static string Build(string raw, string secret = Secret, DateTime? now = null) =>
            ComunicadoCommandPlugin.BuildEvidence(raw, secret, now ?? DateTime.UtcNow);

        private static RemoteExecutionContext Context(string key, Guid id, Guid? userId = null)
        {
            var context = new RemoteExecutionContext { InitiatingUserId = userId ?? Guid.NewGuid() };
            context.InputParameters[key] = id;
            return context;
        }

        private static Entity Header(int scope, IEnumerable<Guid> selected = null)
        {
            return new Entity("new_comunicadomotorista", Guid.NewGuid())
            {
                ["new_titulo"] = "Orientação operacional",
                ["new_corpo"] = "Leia este comunicado.",
                ["new_tipo"] = new OptionSetValue(Informativo),
                ["new_escopo"] = new OptionSetValue(scope),
                ["new_estado"] = new OptionSetValue(Rascunho),
                ["new_alvosjson"] = "[" + string.Join(",", (selected ?? Enumerable.Empty<Guid>()).Select(id => "\"" + id.ToString("D") + "\"")) + "]"
            };
        }

        private static Entity Driver(string name, string email)
        {
            return new Entity("cr40f_funcionarios", Guid.NewGuid())
            {
                ["cr40f_nomecompleto"] = name,
                ["cr40f_emailmicrosoft"] = email
            };
        }

        private static Entity User(string email)
        {
            return new Entity("systemuser", Guid.NewGuid()) { ["internalemailaddress"] = email };
        }

        private static FakeService DriverService(int type)
        {
            var service = new FakeService();
            var driver = Driver("Motorista de teste", "driver@empresa.test");
            var user = User("driver@empresa.test");
            service.Drivers.Add(driver);
            service.Users.Add(user);
            service.Recipient = new Entity("new_comunicadodestinatario", Guid.NewGuid())
            {
                ["ownerid"] = new EntityReference("systemuser", user.Id),
                ["new_motorista"] = new EntityReference("cr40f_funcionarios", driver.Id),
                ["new_tipo"] = new OptionSetValue(type),
                ["new_pushstatus"] = new OptionSetValue(Rascunho)
            };
            return service;
        }

        private sealed class FakeService : IOrganizationService
        {
            public Entity Header;
            public Entity Recipient;
            public readonly List<Entity> Drivers = new List<Entity>();
            public readonly List<Entity> Users = new List<Entity>();
            public readonly List<Entity> Created = new List<Entity>();
            public readonly List<Entity> Updated = new List<Entity>();

            public Guid Create(Entity entity) { Created.Add(entity); return Guid.NewGuid(); }
            public void Update(Entity entity)
            {
                Updated.Add(entity);
                var existing = entity.LogicalName == "new_comunicadomotorista" ? Header : Recipient;
                foreach (var attribute in entity.Attributes) existing[attribute.Key] = attribute.Value;
            }
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
            {
                if (entityName == "new_comunicadomotorista" && Header?.Id == id) return Header;
                if (entityName == "new_comunicadodestinatario" && Recipient?.Id == id) return Recipient;
                if (entityName == "systemuser") return Users.Single(user => user.Id == id);
                if (entityName == "cr40f_funcionarios") return Drivers.Single(driver => driver.Id == id);
                throw new InvalidOperationException("Registro inesperado: " + entityName);
            }
            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var expression = (QueryExpression)query;
                IEnumerable<Entity> records;
                if (expression.EntityName == "cr40f_funcionarios") records = Drivers;
                else if (expression.EntityName == "systemuser") records = Users;
                else throw new InvalidOperationException("Consulta inesperada: " + expression.EntityName);
                var email = expression.Criteria.Conditions.FirstOrDefault(condition => condition.AttributeName == "internalemailaddress" || condition.AttributeName == "cr40f_emailmicrosoft");
                if (email != null) records = records.Where(row => string.Equals(row.GetAttributeValue<string>(email.AttributeName), Convert.ToString(email.Values[0]), StringComparison.OrdinalIgnoreCase));
                return new EntityCollection(records.ToList());
            }
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
