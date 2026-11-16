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

        // ---------- fase 2: conferir, repetida, janela e galeria ----------

        private const string OutroSha = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
        private const string Hash = "f0f0f0f0f0f0f0f0";

        [Fact]
        public void ConferirSemProvaParecidaDevolveLivre()
        {
            var world = new World();
            world.Prova(OutroSha, dhash: "0123456789abcdef", tabela: "cr40f_despesaoperacional", registro: "OUTRA");

            var result = world.Run(Conferir(Sha, Hash));

            Assert.True((bool)result["ok"]);
            Assert.Equal("livre", result["resultado"]);
            Assert.False(result.ContainsKey("usadaEm"));
        }

        [Fact]
        public void ConferirComMesmoShaEmOutroRegistroDevolveRepetidaSoComAData()
        {
            var world = new World();
            world.Prova(Sha, recebidoEm: Now.AddDays(-40), tabela: "cr40f_colisao_v2", registro: "OUTRA");

            var result = world.Run(Conferir(Sha, null));

            Assert.Equal("repetida", result["resultado"]);
            Assert.Equal(Iso(Now.AddDays(-40)), result["usadaEm"]);
            Assert.Equal(new[] { "ok", "resultado", "usadaEm" }, result.Keys.OrderBy(key => key).ToArray());
        }

        [Fact]
        public void ConferirAchaOShaOriginalDaGaleria()
        {
            var world = new World();
            world.Prova(OutroSha, shaOriginal: Sha, tabela: "cr40f_despesaoperacional", registro: "OUTRA");

            Assert.Equal("repetida", world.Run(Conferir(Sha, null))["resultado"]);
        }

        [Theory]
        [InlineData(null, "parecida-em-observacao")]
        [InlineData("observar", "parecida-em-observacao")]
        [InlineData("bloquear", "repetida")]
        public void ConferirParecidaPorDHashSegueOModo(string modo, string esperado)
        {
            var world = new World(modo: modo);
            // 3 bits diferentes do hash novo, guardado como hash da foto já carimbada.
            world.Prova(OutroSha, dhashCarimbo: "f0f0f0f0f0f0f0f7", tabela: "cr40f_manutencoes", registro: "OUTRA");

            var result = world.Run(Conferir(Sha, Hash));

            Assert.Equal(esperado, result["resultado"]);
            Assert.Equal(esperado == "repetida", result.ContainsKey("usadaEm"));
        }

        [Fact]
        public void ConferirComDistanciaQuatroDevolveLivre()
        {
            var world = new World(modo: "bloquear");
            world.Prova(OutroSha, dhash: "f0f0f0f0f0f0f0ff", tabela: "cr40f_manutencoes", registro: "OUTRA");

            Assert.Equal("livre", world.Run(Conferir(Sha, Hash))["resultado"]);
        }

        [Fact]
        public void ConferirNoMesmoRegistroLiberaOReenvio()
        {
            var world = new World(modo: "bloquear");
            world.Prova(Sha, dhash: Hash, tabela: "cr40f_despesas", registro: "R-1");

            Assert.Equal("livre", world.Run(Conferir(Sha, Hash))["resultado"]);
        }

        [Fact]
        public void ConferirIgnoraProvaComMaisDe12Meses()
        {
            var world = new World(modo: "bloquear");
            world.Prova(Sha, dhash: Hash, recebidoEm: Now.AddMonths(-12).AddDays(-1), tabela: "cr40f_colisao_v2", registro: "OUTRA");

            Assert.Equal("livre", world.Run(Conferir(Sha, Hash))["resultado"]);
        }

        [Fact]
        public void RegistrarSemConferirComShaRepetidoGravaSeloRepetida()
        {
            var world = new World();
            world.Prova(Sha, tabela: "cr40f_colisao_v2", registro: "OUTRA");

            AssertSelo(world, world.Run(Registrar(world.Run(Emitir()))), ProvaMidiaHandler.SeloRepetida);
        }

        [Fact]
        public void RegistrarComParecidaNoModoObservarGravaSeloParecida()
        {
            var world = new World();
            world.Prova(OutroSha, dhash: "f0f0f0f0f0f0f0f1", tabela: "cr40f_colisao_v2", registro: "OUTRA");
            var command = Registrar(world.Run(Emitir()));
            command["dhashes"] = new[] { Hash, "0000000000000000" };

            AssertSelo(world, world.Run(command), ProvaMidiaHandler.SeloParecida);
            var row = world.Service.Created.Last();
            Assert.Equal(Hash, row["cr40f_dhash"]);
            Assert.Equal(0xf0f0, row["cr40f_dhashfaixa1"]);
            Assert.Equal(0xf0f0, row["cr40f_dhashfaixa4"]);
            Assert.Equal("0000000000000000", row["cr40f_dhashcarimbo"]);
            // dHash de baixa entropia é guardado, mas sem faixas: não entra na busca das outras fotos.
            Assert.False(row.Contains("cr40f_dhashcarimbofaixa2"));
        }

        [Fact]
        public void RegistrarGaleriaComDataDentroDaJanelaGravaMetadadosSemSelo()
        {
            var world = new World();
            var colisao = world.Service.Rows("cr40f_colisao_v2");
            var id = Guid.NewGuid();
            colisao.Add(new Entity("cr40f_colisao_v2", id) { ["cr40f_datahora"] = Now.AddHours(-30) });
            var command = Galeria(world, "colisao", "cr40f_colisao_v2", id.ToString(), dataGravada: "2026-11-15T03:30:00-03:00");

            var result = world.Run(command);

            Assert.Empty((System.Collections.ArrayList)result["selos"]);
            var row = world.Service.Created.Last();
            Assert.Equal(100000002, row.GetAttributeValue<OptionSetValue>("cr40f_origemcaptura").Value);
            Assert.Equal(new DateTime(2026, 11, 15, 6, 30, 0, DateTimeKind.Utc), row["cr40f_datagravada"]);
            Assert.Equal("-03:00", row["cr40f_fusogravado"]);
            Assert.Equal("Apple", row["cr40f_marca"]);
            Assert.Equal("iPhone 15", row["cr40f_modelo"]);
            Assert.Equal(id, row.GetAttributeValue<EntityReference>("cr40f_colisao").Id);
        }

        [Fact]
        public void RegistrarRecalculaAJanelaComADataDoRegistroENaoComADeclarada()
        {
            var world = new World();
            var id = Guid.NewGuid();
            world.Service.Rows("cr40f_colisao_v2").Add(new Entity("cr40f_colisao_v2", id) { ["cr40f_datahora"] = Now.AddHours(-2) });
            // O app declarou uma referência antiga para a foto de 3 dias atrás caber; o servidor usa a data da colisão.
            var command = Galeria(world, "colisao", "cr40f_colisao_v2", id.ToString(), dataGravada: Iso(Now.AddDays(-3)), dataReferencia: Iso(Now.AddDays(-4)));

            AssertSelo(world, world.Run(command), ProvaMidiaHandler.SeloForaDaJanela);
        }

        [Fact]
        public void RegistrarGaleriaComIdProvisorioUsaADataDeclarada()
        {
            var world = new World();
            var command = Galeria(world, "despesa", "cr40f_despesaoperacional", "novo-abc", dataGravada: Iso(Now.AddDays(-3)), dataReferencia: Iso(Now.AddDays(-4)));

            Assert.Empty((System.Collections.ArrayList)world.Run(command)["selos"]);
            Assert.False(world.Service.Created.Last().Contains("cr40f_colisao"));
        }

        [Fact]
        public void RegistrarGaleriaComDataNoFuturoGravaForaDaJanela()
        {
            var world = new World();
            var command = Galeria(world, "despesa", "cr40f_despesaoperacional", "novo-abc", dataGravada: Iso(Now.AddMinutes(20)), dataReferencia: Iso(Now));

            AssertSelo(world, world.Run(command), ProvaMidiaHandler.SeloForaDaJanela);
        }

        [Fact]
        public void RegistrarGaleriaSemDataGravaSemData()
        {
            var world = new World();
            var command = Galeria(world, "despesa", "cr40f_despesaoperacional", "novo-abc", dataGravada: null, dataReferencia: Iso(Now));

            AssertSelo(world, world.Run(command), ProvaMidiaHandler.SeloSemData);
        }

        [Fact]
        public void RegistrarPdfGravaPaginasSemSeloDeData()
        {
            var world = new World();
            var command = Galeria(world, "devolucao", "cr40f_despesaoperacional", Guid.NewGuid().ToString(), dataGravada: null);
            command["tipoMidia"] = "pdf";
            command["paginas"] = 7;
            command.Remove("dhashes");

            var result = world.Run(command);

            Assert.Empty((System.Collections.ArrayList)result["selos"]);
            var row = world.Service.Created.Last();
            Assert.Equal(100000002, row.GetAttributeValue<OptionSetValue>("cr40f_tipomidia").Value);
            Assert.Equal(100000006, row.GetAttributeValue<OptionSetValue>("cr40f_tela").Value);
            Assert.Equal(7, row["cr40f_paginas"]);
        }

        [Fact]
        public void RegistrarComManutencaoRealPreencheOLookup()
        {
            var world = new World();
            var id = Guid.NewGuid();
            var emitted = world.Run(Emitir("finalizar", "cr40f_manutencoes", id.ToString()));
            var command = Registrar(emitted, registroId: id.ToString());
            command["tela"] = "finalizar";
            command["tabela"] = "cr40f_manutencoes";

            Assert.Empty((System.Collections.ArrayList)world.Run(command)["selos"]);
            Assert.Equal(id, world.Service.Created.Last().GetAttributeValue<EntityReference>("cr40f_manutencao").Id);
        }

        [Theory]
        [InlineData("xyz")]
        [InlineData("f0f0f0f0f0f0f0f0f0")]
        public void DHashMalformadoRecusa(string hash)
        {
            var world = new World();
            var result = world.Run(Conferir(Sha, hash));

            Assert.False((bool)result["ok"]);
            Assert.Contains("dhash", (string)result["erro"]);
        }

        [Fact]
        public void HammingAteTresTemSempreUmaFaixaIgual()
        {
            var random = new Random(1611);
            var buffer = new byte[8];
            for (var round = 0; round < 5000; round++)
            {
                random.NextBytes(buffer);
                var hash = BitConverter.ToUInt64(buffer, 0);
                var other = hash;
                var flips = random.Next(0, 4);
                foreach (var bit in Enumerable.Range(0, 64).OrderBy(_ => random.Next()).Take(flips)) other ^= 1UL << bit;

                Assert.True(ProvaMidiaRepetida.Distancia(hash, other) <= ProvaMidiaRepetida.LimiteParecida);
                Assert.Contains(Enumerable.Range(0, ProvaMidiaRepetida.Faixas), band => ProvaMidiaRepetida.Faixa(hash, band) == ProvaMidiaRepetida.Faixa(other, band));
            }
        }

        // ---------- revisão: dHash de baixa entropia, sessão do rascunho, id real, idempotência e câmera nativa ----------

        private const string Zero = "0000000000000000";

        [Fact]
        public void DHashZeroNaoCasaComOutroDHashZeroDeArquivoDiferente()
        {
            var world = new World(modo: "bloquear");
            world.Prova(OutroSha, dhash: Zero, tabela: "cr40f_colisao_v2", registro: "OUTRA");

            Assert.Equal("livre", world.Run(Conferir(Sha, Zero))["resultado"]);
            Assert.Contains(world.Traces, line => line.Contains("baixa entropia"));
        }

        [Fact]
        public void ShaIgualContinuaBloqueandoComDHashZero()
        {
            var world = new World();
            world.Prova(Sha, dhash: Zero, tabela: "cr40f_colisao_v2", registro: "OUTRA");

            Assert.Equal("repetida", world.Run(Conferir(Sha, Zero))["resultado"]);
        }

        [Fact]
        public void ConsultaPorFaixasParaNoTetoERegistraNoTrace()
        {
            var world = new World(modo: "bloquear");
            // Faixa igual, distância 4: lidas e descartadas; acima do teto o resto (incluindo a parecida) não é lido.
            for (var i = 0; i < ProvaMidiaRepetida.LinhasPorPagina * ProvaMidiaRepetida.PaginasMaximas; i++)
                world.Prova(OutroSha, dhash: "f0f0f0f0f0f0f0ff", tabela: "cr40f_manutencoes", registro: "OUTRA-" + i);
            world.Prova(OutroSha, dhash: "f0f0f0f0f0f0f0f1", tabela: "cr40f_manutencoes", registro: "ALEM-DO-TETO");

            Assert.Equal("livre", world.Run(Conferir(Sha, Hash))["resultado"]);
            Assert.Contains(world.Traces, line => line.Contains("linhas=1000 teto=atingido"));
        }

        [Fact]
        public void RegistrarComIdRealValidaAAssinaturaPelaSessaoEGravaOsDois()
        {
            var world = new World();
            var id = Guid.NewGuid().ToString();
            var command = Registrar(world.Run(Emitir("despesa", "cr40f_despesas", "novo-abc")), registroId: id);
            command["sessaoId"] = "novo-abc";

            Assert.Empty((System.Collections.ArrayList)world.Run(command)["selos"]);
            var row = world.Service.Created.Single();
            Assert.Equal(id, row["cr40f_registroorigemid"]);
            Assert.Equal("novo-abc", row["cr40f_sessaoid"]);
        }

        [Fact]
        public void ConferirNaMesmaSessaoDoRascunhoLiberaSoParaOMesmoMotorista()
        {
            var world = new World(modo: "bloquear");
            world.Prova(Sha, dhash: Hash, tabela: "cr40f_despesas", registro: Guid.NewGuid().ToString(), sessao: "novo-abc", motorista: world.Driver.Id);
            Assert.Equal("livre", world.Run(Conferir(Sha, Hash, registroId: "novo-abc"))["resultado"]);

            var other = new World(modo: "bloquear", service: world.Service, email: "bia@betinhos.com.br");
            Assert.Equal("repetida", other.Run(Conferir(Sha, Hash, registroId: "novo-abc"))["resultado"]);
        }

        [Fact]
        public void DevolucaoComOMesmoComprovanteDaDespesaLibera()
        {
            var world = new World();
            var despesa = Guid.NewGuid().ToString();
            world.Prova(Sha, tabela: "cr40f_despesaoperacional", registro: despesa, sessao: "novo-abc", motorista: world.Driver.Id);

            Assert.Equal("livre", world.Run(Conferir(Sha, null, "devolucao", "cr40f_despesaoperacional", despesa))["resultado"]);
        }

        [Fact]
        public void ColisaoNovaComIdRealPreencheOLookup()
        {
            var world = new World();
            var id = Guid.NewGuid();
            var command = Registrar(world.Run(Emitir("colisao", "cr40f_colisao_v2", "novo-abc")), registroId: id.ToString());
            command["tela"] = "colisao";
            command["tabela"] = "cr40f_colisao_v2";
            command["sessaoId"] = "novo-abc";

            Assert.Empty((System.Collections.ArrayList)world.Run(command)["selos"]);
            Assert.Equal(id, world.Service.Created.Single().GetAttributeValue<EntityReference>("cr40f_colisao").Id);
        }

        [Fact]
        public void MudarADataDaDespesaDepoisDaEscolhaNaoGeraForaDaJanela()
        {
            var world = new World();
            var id = Guid.NewGuid();
            // O app declarou hoje na escolha; depois o motorista trocou a data do gasto para 3 dias atrás, que é a do registro.
            world.Service.Rows("cr40f_despesaoperacional").Add(new Entity("cr40f_despesaoperacional", id) { ["cr40f_datagasto"] = Now.AddDays(-3) });
            var command = Galeria(world, "despesa", "cr40f_despesaoperacional", id.ToString(), dataGravada: Iso(Now.AddDays(-3).AddHours(1)), dataReferencia: Iso(Now));

            Assert.Empty((System.Collections.ArrayList)world.Run(command)["selos"]);
        }

        [Fact]
        public void RegistrarComOMesmoIdClienteDevolveAProvaExistente()
        {
            var world = new World();
            world.Prova(OutroSha, dhash: "f0f0f0f0f0f0f0f1", tabela: "cr40f_colisao_v2", registro: "OUTRA");
            var command = Registrar(world.Run(Emitir()));
            command["dhashes"] = new[] { Hash };
            command["idCliente"] = "6b1f0c2e-4a5d-4e8f-9a7b-1c2d3e4f5a6b";

            var first = world.Run(command);
            var second = world.Run(command);

            Assert.Single(world.Service.Created);
            Assert.Equal(first["provaId"], second["provaId"]);
            Assert.Equal(new[] { ProvaMidiaHandler.SeloParecida }, ((System.Collections.ArrayList)second["selos"]).Cast<string>().ToArray());
            Assert.Equal("6b1f0c2e-4a5d-4e8f-9a7b-1c2d3e4f5a6b", world.Service.Created.Single()["cr40f_idcliente"]);
        }

        [Fact]
        public void IdClienteMalformadoRecusa()
        {
            var world = new World();
            var command = Registrar(world.Run(Emitir()));
            command["idCliente"] = "x' or 1=1";

            Assert.False((bool)world.Run(command)["ok"]);
            Assert.Empty(world.Service.Created);
        }

        [Fact]
        public void OriginalDaCameraNativaReenviadoPelaGaleriaNoutroRegistroERepetida()
        {
            var world = new World();
            var command = Registrar(world.Run(Emitir()));
            command["origemCaptura"] = "camera-nativa";
            command["sha256Original"] = OutroSha;
            world.Run(command);
            Assert.Equal(OutroSha, world.Service.Created.Single()["cr40f_sha256original"]);

            var result = world.Run(Conferir(OutroSha, null, registroId: "R-2"));

            Assert.Equal("repetida", result["resultado"]);
        }

        private static Dictionary<string, object> Conferir(string sha, string dhash, string tela = "despesa", string tabela = "cr40f_despesas", string registroId = "R-1") => new Dictionary<string, object>
        {
            ["acao"] = "conferir",
            ["tela"] = tela,
            ["tabela"] = tabela,
            ["registroId"] = registroId,
            ["sha256"] = sha,
            ["dhashes"] = dhash == null ? new string[0] : new[] { dhash }
        };

        private static Dictionary<string, object> Galeria(World world, string tela, string tabela, string registro, string dataGravada, string dataReferencia = null)
        {
            var command = Registrar(world.Run(Emitir(tela, tabela, registro)), registroId: registro);
            command["tela"] = tela;
            command["tabela"] = tabela;
            command["origemCaptura"] = "galeria";
            command["dhashes"] = new[] { Hash };
            command["dataReferencia"] = dataReferencia;
            command["metadados"] = new Dictionary<string, object> { ["dataGravada"] = dataGravada, ["offset"] = "-03:00", ["marca"] = "Apple", ["modelo"] = "iPhone 15", ["software"] = "17.1" };
            return command;
        }

        private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);

        // ---------- apoio ----------

        private static void AssertSelo(World world, Dictionary<string, object> result, string seal)
        {
            Assert.True((bool)result["ok"]);
            Assert.Equal(new[] { seal }, ((System.Collections.ArrayList)result["selos"]).Cast<string>().ToArray());
            var row = world.Service.Created.Single();
            var expected = ProvaMidiaHandler.Selos[seal];
            Assert.Equal(new[] { expected }, row.GetAttributeValue<OptionSetValueCollection>("cr40f_selos").Select(option => option.Value).ToArray());
        }

        private static Dictionary<string, object> Emitir(string tela = "despesa", string tabela = "cr40f_despesas", string registroId = "R-1") => new Dictionary<string, object>
        {
            ["acao"] = "emitir",
            ["tela"] = tela,
            ["tabela"] = tabela,
            ["registroId"] = registroId
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

            public World(bool withKey = true, FakeService service = null, string email = "ana@betinhos.com.br", string modo = null)
            {
                Service = service ?? new FakeService();
                Driver = Service.Driver("Motorista " + email, email, null, null);
                var user = Service.User(email);
                if (withKey && service == null) Service.Rows(SecretReader.Table).Add(new Entity(SecretReader.Table, Guid.NewGuid()) { [SecretReader.NameColumn] = "midia.prova-captura", [SecretReader.ValueColumn] = Key });
                if (modo != null)
                {
                    var definition = new Entity("environmentvariabledefinition", Guid.NewGuid()) { ["schemaname"] = ProvaMidiaHandler.ModoVariavel, ["defaultvalue"] = "observar" };
                    Service.Rows("environmentvariabledefinition").Add(definition);
                    Service.Rows("environmentvariablevalue").Add(new Entity("environmentvariablevalue", Guid.NewGuid()) { ["environmentvariabledefinitionid"] = definition.Id, ["value"] = modo });
                }
                Handler = new ProvaMidiaHandler(Service, user.Id, new ListTracing(Traces), () => _now);
            }

            /// <summary>Prova já gravada (de outro registro, salvo indicação), com o dHash e as faixas como o registrar grava.</summary>
            public void Prova(string sha, string tabela, string registro, string dhash = null, string dhashCarimbo = null, string shaOriginal = null, DateTime? recebidoEm = null, string sessao = null, Guid? motorista = null)
            {
                var row = new Entity(ProvaMidiaHandler.Table, Guid.NewGuid())
                {
                    ["cr40f_sessaoid"] = sessao,
                    ["cr40f_motorista"] = motorista.HasValue ? new EntityReference("cr40f_funcionarios", motorista.Value) : null,
                    ["cr40f_sha256"] = sha,
                    ["cr40f_sha256original"] = shaOriginal,
                    ["cr40f_tabelaorigem"] = tabela,
                    ["cr40f_registroorigemid"] = registro,
                    ["cr40f_recebidoem"] = recebidoEm ?? Now.AddDays(-1)
                };
                var hashes = new[] { dhash, dhashCarimbo };
                for (var slot = 0; slot < hashes.Length; slot++)
                {
                    if (hashes[slot] == null) continue;
                    var value = ProvaMidiaRepetida.Parse(hashes[slot]);
                    row[ProvaMidiaHandler.ColunasDHash[slot]] = hashes[slot];
                    for (var band = 0; band < ProvaMidiaRepetida.Faixas; band++) row[ProvaMidiaHandler.ColunaFaixa(slot, band)] = ProvaMidiaRepetida.Faixa(value, band);
                }
                Service.Rows(ProvaMidiaHandler.Table).Add(row);
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
