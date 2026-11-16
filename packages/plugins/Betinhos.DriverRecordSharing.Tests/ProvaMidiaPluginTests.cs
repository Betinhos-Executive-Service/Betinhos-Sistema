using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using FakeService = Betinhos.DriverRecordSharing.Tests.ChecklistFakeService;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ProvaMidiaPluginTests
    {
        private const string Key = "chave-de-teste-prova-midia-0123456789";
        private static readonly DateTime Now = new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc);
        private const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        [Fact]
        public void EmitirDevolveCodigoAssinadoEHoraDoServidor()
        {
            var world = new World();

            var result = world.Run(Emitir());

            Assert.True((bool)result["ok"]);
            var code = (string)result["codigo"];
            Assert.Equal(6, code.Length);
            Assert.All(code, letter => Assert.Contains(letter, ProvaMidiaHandler.CodeAlphabet));
            Assert.Equal("2026-11-16T12:00:00.000Z", result["emitidoEm"]);
            Assert.True((bool)result["assinada"]);
            Assert.Equal(ProvaMidiaHandler.Sign(Key, world.Driver.Id, "despesa", "cr40f_despesas", "R-1", code, "2026-11-16T12:00:00.000Z"), result["assinatura"]);
            Assert.Empty(world.Service.Created);
        }

        [Fact]
        public void EmitirSemChaveDevolveCodigoNaoAssinado()
        {
            var world = new World(withKey: false);

            var result = world.Run(Emitir());

            Assert.True((bool)result["ok"]);
            Assert.False((bool)result["assinada"]);
            Assert.Null(result["assinatura"]);
            Assert.Contains(world.Traces, line => line.Contains("midia.prova-captura") && line.Contains("ausente"));
        }

        [Fact]
        public void RegistrarComAssinaturaValidaGravaSemSelo()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            world.Advance(TimeSpan.FromMinutes(3));

            var result = world.Run(Registrar(emitted));

            Assert.True((bool)result["ok"]);
            Assert.Empty((System.Collections.ArrayList)result["selos"]);
            var row = world.Service.Created.Single();
            Assert.Equal(Guid.Parse((string)result["provaId"]), row.Id);
            Assert.Equal("cr40f_provamidia", row.LogicalName);
            Assert.Equal(world.Driver.Id, row.GetAttributeValue<EntityReference>("cr40f_motorista").Id);
            Assert.Equal(100000000, row.GetAttributeValue<OptionSetValue>("cr40f_tela").Value);
            Assert.Equal("cr40f_despesas", row["cr40f_tabelaorigem"]);
            Assert.Equal("R-1", row["cr40f_registroorigemid"]);
            Assert.Equal("https://betinhos.sharepoint.com/foto.jpg", row["cr40f_link"]);
            Assert.Equal(Sha, row["cr40f_sha256"]);
            Assert.Equal(123, row["cr40f_tamanhobytes"]);
            Assert.Equal(emitted["codigo"], row["cr40f_codigo"]);
            Assert.Equal(Now, row["cr40f_emitidoem"]);
            Assert.Equal(Now.AddMinutes(3), row["cr40f_recebidoem"]);
            Assert.Equal(3, row["cr40f_atrasominutos"]);
            Assert.Equal(100000000, row.GetAttributeValue<OptionSetValue>("cr40f_estadolocalizacao").Value);
            Assert.Equal(-22.9m, row["cr40f_latitude"]);
            Assert.Equal(-43.2m, row["cr40f_longitude"]);
            Assert.Equal(12m, row["cr40f_precisaometros"]);
            Assert.False(row.Contains("cr40f_selos"));
        }

        [Fact]
        public void RegistrarComAssinaturaAdulteradaGravaCodigoInvalido()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            emitted["assinatura"] = ProvaMidiaHandler.Sign("outra-chave", world.Driver.Id, "despesa", "cr40f_despesas", "R-1", (string)emitted["codigo"], (string)emitted["emitidoEm"]);

            AssertSelo(world, world.Run(Registrar(emitted)), ProvaMidiaHandler.SeloInvalido);
        }

        [Fact]
        public void RegistrarComRegistroDiferenteDoEmitidoGravaCodigoInvalido()
        {
            var world = new World();
            var emitted = world.Run(Emitir());

            AssertSelo(world, world.Run(Registrar(emitted, registroId: "R-2")), ProvaMidiaHandler.SeloInvalido);
        }

        [Fact]
        public void CodigoInvalidoNaoGravaEmitidoEmDeclaradoEContaAtrasoDaCaptura()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            emitted["codigo"] = "A|B";
            world.Advance(TimeSpan.FromMinutes(10));

            AssertSelo(world, world.Run(Registrar(emitted)), ProvaMidiaHandler.SeloInvalido);
            var row = world.Service.Created.Single();
            Assert.Null(row["cr40f_emitidoem"]);
            Assert.Equal(10, row["cr40f_atrasominutos"]);
        }

        [Fact]
        public void RegistrarCodigoDeOutroMotoristaGravaCodigoInvalido()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            var other = new World(service: world.Service, email: "bia@betinhos.com.br");

            AssertSelo(other, other.Run(Registrar(emitted)), ProvaMidiaHandler.SeloInvalido);
            Assert.Equal(other.Driver.Id, world.Service.Created.Single().GetAttributeValue<EntityReference>("cr40f_motorista").Id);
        }

        [Fact]
        public void RegistrarSemChaveGravaCodigoNaoAssinado()
        {
            var world = new World(withKey: false);
            var emitted = world.Run(Emitir());

            AssertSelo(world, world.Run(Registrar(emitted)), ProvaMidiaHandler.SeloNaoAssinado);
        }

        [Fact]
        public void RegistrarSemAssinaturaComChaveNoAmbienteGravaCodigoInvalido()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            emitted["assinatura"] = null;

            AssertSelo(world, world.Run(Registrar(emitted)), ProvaMidiaHandler.SeloInvalido);
        }

        [Fact]
        public void RegistrarComHoraDoCelularAbsurdaGravaSemHora()
        {
            var world = new World();
            var offline = new Dictionary<string, object> { ["codigo"] = "ZZ22QX", ["emitidoEm"] = null, ["assinatura"] = null };

            AssertSelo(world, world.Run(Registrar(offline, semRede: true, capturadoEm: "0001-01-01T00:00:00.000Z")), ProvaMidiaHandler.SeloSemRede);
            var row = world.Service.Created.Single();
            Assert.Null(row["cr40f_capturadoem"]);
            Assert.Null(row["cr40f_atrasominutos"]);
        }

        [Fact]
        public void RegistrarSemRedeGravaSeloEAtrasoDesdeACaptura()
        {
            var world = new World();
            var offline = new Dictionary<string, object> { ["codigo"] = "ZZ22QX", ["emitidoEm"] = null, ["assinatura"] = null };

            var result = world.Run(Registrar(offline, semRede: true, capturadoEm: "2026-11-16T10:30:00.000Z", estado: "negada"));

            AssertSelo(world, result, ProvaMidiaHandler.SeloSemRede);
            var row = world.Service.Created.Single();
            Assert.Equal(90, row["cr40f_atrasominutos"]);
            Assert.Null(row["cr40f_emitidoem"]);
            Assert.Equal(new DateTime(2026, 11, 16, 10, 30, 0, DateTimeKind.Utc), row["cr40f_capturadoem"]);
            Assert.Equal(100000001, row.GetAttributeValue<OptionSetValue>("cr40f_estadolocalizacao").Value);
            Assert.False(row.Contains("cr40f_latitude"));
        }

        [Theory]
        [InlineData("link", "http://betinhos.sharepoint.com/foto.jpg", "O link do arquivo precisa ser https.")]
        [InlineData("sha256", "abc", "A impressão digital (sha256) do arquivo é inválida.")]
        [InlineData("tipoMidia", "audio", "Tipo de mídia desconhecido.")]
        [InlineData("tela", "multa", "Tela desconhecida para a prova de mídia.")]
        public void RegistrarEntradaMalformadaRecusaSemGravar(string field, string value, string message)
        {
            var world = new World();
            var command = Registrar(world.Run(Emitir()));
            command[field] = value;

            var result = world.Run(command);

            Assert.False((bool)result["ok"]);
            Assert.Equal(message, result["erro"]);
            Assert.Empty(world.Service.Created);
        }

        [Fact]
        public void ComandoQueNaoEJsonRecusa()
        {
            var world = new World();
            var result = QrChargeRules.ParseJson(world.Handler.Handle("{nao e json"));
            Assert.False((bool)result["ok"]);
        }

        [Fact]
        public void TraceNuncaLevaAChave()
        {
            var world = new World();
            var emitted = world.Run(Emitir());
            world.Run(Registrar(emitted));
            emitted["assinatura"] = "adulterada";
            world.Run(Registrar(emitted));

            Assert.NotEmpty(world.Traces);
            Assert.DoesNotContain(world.Traces, line => line.Contains(Key));
            Assert.Contains(world.Traces, line => line.Contains("midia.prova-captura") && line.Contains("tabela"));
        }

        // ---------- apoio ----------

        private static void AssertSelo(World world, Dictionary<string, object> result, string seal)
        {
            Assert.True((bool)result["ok"]);
            Assert.Equal(new[] { seal }, ((System.Collections.ArrayList)result["selos"]).Cast<string>().ToArray());
            var row = world.Service.Created.Single();
            var expected = ProvaMidiaHandler.Selos[seal];
            Assert.Equal(new[] { expected }, row.GetAttributeValue<OptionSetValueCollection>("cr40f_selos").Select(option => option.Value).ToArray());
        }

        private static Dictionary<string, object> Emitir() => new Dictionary<string, object>
        {
            ["acao"] = "emitir",
            ["tela"] = "despesa",
            ["tabela"] = "cr40f_despesas",
            ["registroId"] = "R-1"
        };

        private static Dictionary<string, object> Registrar(Dictionary<string, object> emitted, string registroId = "R-1", bool semRede = false, string capturadoEm = "2026-11-16T12:00:05.000Z", string estado = "registrada")
        {
            var registrada = estado == "registrada";
            return new Dictionary<string, object>
            {
                ["acao"] = "registrar",
                ["codigo"] = emitted["codigo"],
                ["emitidoEm"] = emitted["emitidoEm"],
                ["assinatura"] = emitted["assinatura"],
                ["semRede"] = semRede,
                ["tela"] = "despesa",
                ["tabela"] = "cr40f_despesas",
                ["registroId"] = registroId,
                ["link"] = "https://betinhos.sharepoint.com/foto.jpg",
                ["tipoMidia"] = "foto",
                ["tamanhoBytes"] = 123,
                ["duracaoSegundos"] = null,
                ["sha256"] = Sha,
                ["origemCaptura"] = "camera-ao-vivo",
                ["capturadoEm"] = capturadoEm,
                ["localizacao"] = new Dictionary<string, object>
                {
                    ["estado"] = estado,
                    ["latitude"] = registrada ? (object)(-22.9) : null,
                    ["longitude"] = registrada ? (object)(-43.2) : null,
                    ["precisaoMetros"] = registrada ? (object)12 : null
                }
            };
        }

        private sealed class World
        {
            public readonly FakeService Service;
            public readonly Entity Driver;
            public readonly List<string> Traces = new List<string>();
            public readonly ProvaMidiaHandler Handler;
            private DateTime _now = Now;

            public World(bool withKey = true, FakeService service = null, string email = "ana@betinhos.com.br")
            {
                Service = service ?? new FakeService();
                Driver = Service.Driver("Motorista " + email, email, null, null);
                var user = Service.User(email);
                if (withKey && service == null) Service.Rows(SecretReader.Table).Add(new Entity(SecretReader.Table, Guid.NewGuid()) { [SecretReader.NameColumn] = "midia.prova-captura", [SecretReader.ValueColumn] = Key });
                Handler = new ProvaMidiaHandler(Service, user.Id, new ListTracing(Traces), () => _now);
            }

            public void Advance(TimeSpan delta) => _now = _now.Add(delta);

            public Dictionary<string, object> Run(Dictionary<string, object> command) =>
                QrChargeRules.ParseJson(Handler.Handle(QrChargeRules.Serialize(command)));
        }

        private sealed class ListTracing : ITracingService
        {
            private readonly List<string> _lines;
            public ListTracing(List<string> lines) { _lines = lines; }
            public void Trace(string format, params object[] args) => _lines.Add(args == null || args.Length == 0 ? format : string.Format(format, args));
        }
    }
}
