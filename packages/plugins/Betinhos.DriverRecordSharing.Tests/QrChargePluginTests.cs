using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using FakeService = Betinhos.DriverRecordSharing.Tests.ChecklistFakeService;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class QrChargePluginTests
    {
        private const string Table = "cr40f_cobrancastripe";
        private static readonly DateTime Now = new DateTime(2026, 10, 21, 15, 0, 20, DateTimeKind.Utc);

        // ---------- criar ----------

        [Fact]
        public void CriarSemPermissaoDevolveErroSemChamarStripe()
        {
            var world = new World(canCharge: false);

            var result = world.Run(world.CreateCommand(38000));

            Assert.Equal("Você não está liberado para cobrar por QR code.", Erro(result));
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarParaReservaDeOutroMotoristaDevolveErro()
        {
            var world = new World();
            var other = world.Service.Driver("Outro", "pessoa.ficticia2@betinhos.com.br", null, null);
            world.Reserva["cr40f_motorista"] = other.ToEntityReference();

            Assert.Equal("Este serviço não está com você.", Erro(world.Run(world.CreateCommand(1000))));
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarRecusaValorAcimaDoSaldoDescontandoPagoParcial()
        {
            var world = new World(receivable: new Money(380m));
            world.Charge("cs_test_pago", "pago", 100m);

            Assert.Equal("O valor não pode passar de R$ 280,00.", Erro(world.Run(world.CreateCommand(28001))));
            Assert.Empty(world.Stripe.Posts);
            Assert.Null(Erro(world.Run(world.CreateCommand(28000))));
        }

        [Fact]
        public void CriarMontaSessaoNoStripeEGravaACobranca()
        {
            var world = new World();
            world.Stripe.NextCreated = "cs_test_novo";

            var result = Parse(world.Run(world.CreateCommand(38000, email: "ana@mail.com", idioma: "en-US")));

            var post = world.Stripe.Posts.Single();
            Assert.Equal("/v1/checkout/sessions", post.Path);
            var form = post.Form.ToDictionary(pair => pair.Key, pair => pair.Value);
            Assert.Equal("payment", form["mode"]);
            Assert.Equal("brl", form["line_items[0][price_data][currency]"]);
            Assert.Equal("38000", form["line_items[0][price_data][unit_amount]"]);
            Assert.Equal("Serviço 4521", form["line_items[0][price_data][product_data][name]"]);
            Assert.Equal("1", form["line_items[0][quantity]"]);
            Assert.Equal("en", form["locale"]);
            Assert.Equal("ana@mail.com", form["customer_email"]);
            Assert.Equal(world.Reserva.Id.ToString("D"), form["client_reference_id"]);
            Assert.Equal(world.Driver.Id.ToString("D"), form["metadata[motorista_id]"]);
            Assert.Equal("Ana Souza", form["metadata[pagante_nome]"]);
            Assert.Equal("https://betinhos.com.br", form["success_url"]);
            // 15:00 + 32 min: pelo menos 30 min de validade, estável dentro do mesmo minuto.
            Assert.Equal("1792596720", form["expires_at"]);
            Assert.DoesNotContain(form.Keys, key => key.StartsWith("payment_method_types"));
            Assert.Equal("reserva-" + world.Reserva.Id.ToString("N") + "-1-38000-202610211532", post.IdempotencyKey);

            Assert.Equal("cs_test_novo", result["sessionId"]);
            Assert.Equal("aguardando", result["status"]);
            Assert.Equal(38000, Convert.ToInt64(result["valorCentavos"]));
            Assert.Equal("2026-10-21T15:32:00Z", result["expiraEm"]);
            var row = world.Service.Rows(Table).Single();
            Assert.Equal("aguardando", row["cr40f_status"]);
            Assert.Equal(380m, row["cr40f_valor"]);
            Assert.Equal("en-US", row["cr40f_idioma"]);
            Assert.Equal(world.Reserva.Id, ((EntityReference)row["cr40f_reserva"]).Id);
            Assert.Equal(world.Driver.Id, ((EntityReference)row["cr40f_motorista"]).Id);
        }

        [Fact]
        public void CriarSemEmailNaoEnviaCustomerEmailEIgnoraMotoristaDoCliente()
        {
            var world = new World();
            var command = world.CreateCommand(1000, email: "", idioma: "es-ES").Replace("\"acao\"", "\"motoristaId\":\"" + Guid.NewGuid().ToString("D") + "\",\"acao\"");

            world.Run(command);

            var form = world.Stripe.Posts.Single().Form.ToDictionary(pair => pair.Key, pair => pair.Value);
            Assert.False(form.ContainsKey("customer_email"));
            Assert.Equal("es", form["locale"]);
            Assert.Equal(world.Driver.Id.ToString("D"), form["metadata[motorista_id]"]);
        }

        [Theory]
        [InlineData("pt-BR", "pt-BR")]
        [InlineData("en-US", "en")]
        [InlineData("es-ES", "es")]
        [InlineData("fr-FR", "pt-BR")]
        public void IdiomaViraLocaleDoStripe(string idioma, string locale)
        {
            Assert.Equal(locale, QrChargeRules.StripeLocale(idioma));
        }

        [Fact]
        public void CriarReaproveitaSessaoAbertaDoMesmoValor()
        {
            var world = new World();
            world.Charge("cs_test_aberta", "aguardando", 380m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_aberta"] = Session("cs_test_aberta", "open", "unpaid", 38000);

            var result = Parse(world.Run(world.CreateCommand(38000)));

            Assert.Empty(world.Stripe.Posts);
            Assert.Equal("cs_test_aberta", result["sessionId"]);
            Assert.Equal("aguardando", result["status"]);
        }

        [Fact]
        public void CriarNaoReaproveitaSessaoVencidaNemDeOutroValor()
        {
            var world = new World();
            world.Charge("cs_test_vencida", "aguardando", 380m, Now.AddMinutes(-1));
            world.Charge("cs_test_outrovalor", "aguardando", 100m, Now.AddMinutes(20));

            world.Stripe.Sessions["cs_test_outrovalor"] = Session("cs_test_outrovalor", "open", "unpaid", 10000);

            world.Run(world.CreateCommand(38000));

            Assert.Equal(2, world.Stripe.Posts.Count);
            Assert.Contains("-3-38000-", world.Stripe.Posts[1].IdempotencyKey);
        }

        [Fact]
        public void CriarExpiraOutraCobrancaAbertaAntesDeCriarParaNaoSomarAlemDoSaldo()
        {
            var world = new World(receivable: 500m);
            var antiga = world.Charge("cs_test_antiga", "aguardando", 500m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_antiga"] = Session("cs_test_antiga", "open", "unpaid", 50000);

            var result = Parse(world.Run(world.CreateCommand(30000)));

            Assert.Equal("/v1/checkout/sessions/cs_test_antiga/expire", world.Stripe.Posts[0].Path);
            Assert.Equal("/v1/checkout/sessions", world.Stripe.Posts[1].Path);
            Assert.Equal("cancelado", antiga["cr40f_status"]);
            Assert.Equal("aguardando", result["status"]);
            Assert.Equal(2, world.Service.Rows(Table).Count);
        }

        [Fact]
        public void CriarDescobrePagoAoExpirarARecalculaSaldoERecusa()
        {
            var world = new World(receivable: 500m);
            var antiga = world.Charge("cs_test_antiga", "aguardando", 500m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_antiga"] = Session("cs_test_antiga", "complete", "paid", 50000);

            var erro = Erro(world.Run(world.CreateCommand(30000)));

            Assert.Equal("Este serviço já foi pago por QR code.", erro);
            Assert.Equal("pago", antiga["cr40f_status"]);
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarEmServicoJaPagoPorQrDizQueJaFoiPago()
        {
            // Caso do OS-1939 no DEV: o app esqueceu o pagamento e tentou outro QR.
            var world = new World(receivable: 380m);
            world.Charge("cs_test_pago", "pago", 380m);

            Assert.Equal("Este serviço já foi pago por QR code.", Erro(world.Run(world.CreateCommand(38000))));
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarEmServicoSemValorAReceberMantemMensagemGenerica()
        {
            var world = new World(receivable: 0m);
            Assert.Equal("Este serviço não tem valor a receber por QR code.", Erro(world.Run(world.CreateCommand(1000))));
        }

        [Fact]
        public void CriarContaPagamentoEmProcessamentoNoSaldo()
        {
            var world = new World(receivable: 500m);
            var antiga = world.Charge("cs_test_antiga", "aguardando", 300m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_antiga"] = Session("cs_test_antiga", "complete", "unpaid", 30000, url: null);

            Assert.Equal("O valor não pode passar de R$ 200,00.", Erro(world.Run(world.CreateCommand(30000))));
            Assert.Equal("aguardando", antiga["cr40f_status"]);
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarAbaixoDoMinimoDoStripeEhRecusado()
        {
            var world = new World();
            Assert.Equal("O valor mínimo é R$ 0,50.", Erro(world.Run(world.CreateCommand(49))));
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void CriarEmToqueDuploConcorrenteNaoGravaSegundaLinha()
        {
            var world = new World();
            world.Stripe.NextCreated = "cs_test_dupla";
            // O outro toque gravou a linha entre a consulta das cobranças e a criação desta.
            world.Stripe.OnCreate = () => world.Charge("cs_test_dupla", "aguardando", 380m);

            var result = Parse(world.Run(world.CreateCommand(38000)));

            Assert.Equal("cs_test_dupla", result["sessionId"]);
            Assert.Single(world.Service.Rows(Table));
            Assert.Empty(world.Service.Created);
        }

        [Fact]
        public void ConsultarComLinhaDuplicadaUsaAPrimeira()
        {
            var world = new World();
            world.Charge("cs_test_x", "aguardando", 380m);
            world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "open", "unpaid", 38000);

            Assert.Equal("aguardando", Parse(world.Run(Command("consultar", "cs_test_x")))["status"]);
        }

        // ---------- resumo ----------

        [Fact]
        public void ResumoSemCobrancaDevolveSaldoIgualAoValorAReceber()
        {
            var world = new World(receivable: 380m);

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Equal(38000L, Convert.ToInt64(result["recebivelCentavos"]));
            Assert.Equal(0L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Equal(38000L, Convert.ToInt64(result["saldoCentavos"]));
            Assert.Null(result["ultimaPaga"]);
            Assert.Null(result["aberta"]);
            Assert.Empty(world.Stripe.Gets);
        }

        [Fact]
        public void ResumoReconhecePagoGravadoMesmoSemPermissaoDeCobrar()
        {
            var world = new World(canCharge: false, receivable: 380m);
            var paid = world.Charge("cs_test_pago", "pago", 380m, Now.AddMinutes(-10));
            paid["cr40f_pagoem"] = Now.AddMinutes(-20);
            paid["cr40f_pagantenome"] = "Ana Souza";

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Equal(38000L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Equal(0L, Convert.ToInt64(result["saldoCentavos"]));
            var ultima = (Dictionary<string, object>)result["ultimaPaga"];
            Assert.Equal("cs_test_pago", ultima["sessionId"]);
            Assert.Equal("pago", ultima["status"]);
            Assert.Equal(38000L, Convert.ToInt64(ultima["valorCentavos"]));
            Assert.Equal("2026-10-21T14:40:20Z", ultima["pagoEm"]);
            Assert.Equal("Ana Souza", ultima["paganteNome"]);
            Assert.Null(result["aberta"]);
        }

        [Fact]
        public void ResumoDevolveCobrancaAbertaParaRetomar()
        {
            var world = new World(receivable: 380m);
            world.Charge("cs_test_pago", "pago", 100m);
            var abertaRow = world.Charge("cs_test_aberta", "aguardando", 280m, Now.AddMinutes(20));
            abertaRow["cr40f_pagantenome"] = "John Smith";
            abertaRow["cr40f_paganteemail"] = "john@mail.com";
            abertaRow["cr40f_idioma"] = "en-US";
            world.Stripe.Sessions["cs_test_aberta"] = Session("cs_test_aberta", "open", "unpaid", 28000);

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Equal(10000L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Equal(28000L, Convert.ToInt64(result["saldoCentavos"]));
            var aberta = (Dictionary<string, object>)result["aberta"];
            Assert.Equal("cs_test_aberta", aberta["sessionId"]);
            Assert.Equal("aguardando", aberta["status"]);
            Assert.Equal("https://checkout.stripe.com/c/pay/cs_test_aberta", aberta["url"]);
            Assert.Equal(28000L, Convert.ToInt64(aberta["valorCentavos"]));
            Assert.Equal("John Smith", aberta["paganteNome"]);
            Assert.Equal("john@mail.com", aberta["paganteEmail"]);
            Assert.Equal("en-US", aberta["idioma"]);
            Assert.Empty(world.Stripe.Posts);
        }

        [Fact]
        public void ResumoGravaPagoQuandoOStripeDizQueAAbertaFoiPaga()
        {
            var world = new World(receivable: 380m);
            var row = world.Charge("cs_test_aberta", "aguardando", 380m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_aberta"] = Session("cs_test_aberta", "complete", "paid", 38000);

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Equal("pago", row["cr40f_status"]);
            Assert.Equal(38000L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Equal(0L, Convert.ToInt64(result["saldoCentavos"]));
            Assert.Null(result["aberta"]);
            Assert.Equal("cs_test_aberta", ((Dictionary<string, object>)result["ultimaPaga"])["sessionId"]);
        }

        [Fact]
        public void ResumoNaoOfereceRetomarCobrancaDeOutroMotoristaNemVencida()
        {
            var world = new World(receivable: 380m);
            var other = world.Service.Driver("Outro", "pessoa.ficticia2@betinhos.com.br", null, null);
            world.Charge("cs_test_outro", "aguardando", 380m, Now.AddMinutes(20), driver: other);
            world.Stripe.Sessions["cs_test_outro"] = Session("cs_test_outro", "open", "unpaid", 38000);
            world.Charge("cs_test_vencida", "aguardando", 380m, Now.AddMinutes(-1));

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Null(result["aberta"]);
            Assert.Single(world.Stripe.Gets);
        }

        [Fact]
        public void ResumoDescontaPagamentoEmProcessamentoDoSaldo()
        {
            var world = new World(receivable: 500m);
            world.Charge("cs_test_proc", "aguardando", 300m, Now.AddMinutes(20));
            world.Stripe.Sessions["cs_test_proc"] = Session("cs_test_proc", "complete", "unpaid", 30000, url: null);

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Equal(0L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Equal(20000L, Convert.ToInt64(result["saldoCentavos"]));
            Assert.Null(result["aberta"]);
        }

        [Fact]
        public void ResumoComStripeForaDoArSegueComOPagoGravado()
        {
            var world = new World(receivable: 380m);
            world.Charge("cs_test_pago", "pago", 100m);
            world.Charge("cs_test_aberta", "aguardando", 280m, Now.AddMinutes(20));
            world.Stripe.Failure = new StripeException(503, "", "Stripe respondeu HTTP 503.");

            var result = Parse(world.Run(world.SummaryCommand()));

            Assert.Null(Erro(world.Run(world.SummaryCommand())));
            Assert.Equal(10000L, Convert.ToInt64(result["pagoCentavos"]));
            Assert.Null(result["aberta"]);
        }

        [Fact]
        public void ResumoDeReservaDeOutroMotoristaDevolveErro()
        {
            var world = new World();
            var other = world.Service.Driver("Outro", "pessoa.ficticia2@betinhos.com.br", null, null);
            world.Reserva["cr40f_motorista"] = other.ToEntityReference();

            Assert.Equal("Este serviço não está com você.", Erro(world.Run(world.SummaryCommand())));
        }

        // ---------- consultar ----------

        [Fact]
        public void ConsultarPagoGravaTarifaLiquidoECartao()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "paid", 38000,
                "\"payment_intent\":{\"id\":\"pi_1\",\"last_payment_error\":null,\"latest_charge\":{\"created\":1792600000," +
                "\"payment_method_details\":{\"card\":{\"country\":\"US\",\"brand\":\"visa\",\"wallet\":{\"type\":\"apple_pay\"}}}," +
                "\"balance_transaction\":{\"fee\":1520,\"net\":36480}}}");

            var result = Parse(world.Run(Command("consultar", "cs_test_x")));

            Assert.Equal("pago", result["status"]);
            Assert.Equal("", result["recusa"]);
            Assert.Equal("pago", row["cr40f_status"]);
            Assert.Equal("pi_1", row["cr40f_paymentintentid"]);
            Assert.Equal(15.2m, row["cr40f_tarifa"]);
            Assert.Equal(364.8m, row["cr40f_valorliquido"]);
            Assert.Equal("US", row["cr40f_paiscartao"]);
            Assert.Equal("visa", row["cr40f_bandeira"]);
            Assert.Equal("apple_pay", row["cr40f_carteira"]);
            Assert.NotNull(row["cr40f_pagoem"]);
            Assert.Contains("expand%5B%5D=payment_intent.latest_charge.balance_transaction", world.Stripe.Gets.Single());
        }

        [Fact]
        public void ConsultarExpiradoMarcaExpirado()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "expired", "unpaid", 38000);

            Assert.Equal("expirado", Parse(world.Run(Command("consultar", "cs_test_x")))["status"]);
            Assert.Equal("expirado", row["cr40f_status"]);
        }

        [Fact]
        public void ConsultarAbertoComRecusaMostraMotivoSemGravar()
        {
            var world = new World();
            world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "open", "unpaid", 38000,
                "\"payment_intent\":{\"id\":\"pi_1\",\"last_payment_error\":{\"message\":\"Your card was declined.\"}}");

            var result = Parse(world.Run(Command("consultar", "cs_test_x")));

            Assert.Equal("aguardando", result["status"]);
            Assert.Equal("Your card was declined.", result["recusa"]);
            Assert.Empty(world.Service.Updated);
        }

        [Fact]
        public void ConsultarCanceladoLocalContinuaCancelado()
        {
            var world = new World();
            world.Charge("cs_test_x", "cancelado", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "expired", "unpaid", 38000);

            Assert.Equal("cancelado", Parse(world.Run(Command("consultar", "cs_test_x")))["status"]);
        }

        [Fact]
        public void ConsultarCobrancaDeOutroMotoristaDevolveErro()
        {
            var world = new World();
            var other = world.Service.Driver("Outro", "pessoa.ficticia2@betinhos.com.br", null, null);
            world.Charge("cs_test_x", "aguardando", 380m, driver: other);

            Assert.Equal("Esta cobrança não é sua.", Erro(world.Run(Command("consultar", "cs_test_x"))));
            Assert.Empty(world.Stripe.Gets);
        }

        [Fact]
        public void SincronizarNaoExigeDonoParaOWebhook()
        {
            var world = new World(callerIsDriver: false);
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "paid", 38000);

            var result = Parse(world.Run(Command("sincronizar", "cs_test_x")));

            Assert.Equal(true, result["ok"]);
            Assert.Single(result);
            Assert.Equal("pago", row["cr40f_status"]);
        }

        [Fact]
        public void SincronizarComStripeForaDoArLancaParaOWebhookReenviar()
        {
            var world = new World(callerIsDriver: false);
            world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Failure = new StripeException(503, "", "Stripe respondeu HTTP 503.");

            Assert.Throws<InvalidPluginExecutionException>(() => world.Run(Command("sincronizar", "cs_test_x")));
        }

        [Fact]
        public void SincronizarSessaoDeOutroAmbienteEhErroDeNegocio()
        {
            var world = new World(callerIsDriver: false);
            Assert.Equal("Cobrança não encontrada.", Erro(world.Run(Command("sincronizar", "cs_test_desconhecida"))));
        }

        [Fact]
        public void ConsultarPagamentoEmProcessamentoSemLinkViraAviso()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "unpaid", 38000, url: null);

            Assert.Equal(QrChargeRules.ProcessingMessage, Erro(world.Run(Command("consultar", "cs_test_x"))));
            Assert.Equal("aguardando", row["cr40f_status"]);
        }

        [Fact]
        public void SemPagamentoDevidoContaComoPago()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "no_payment_required", 38000);

            Assert.Equal("pago", Parse(world.Run(Command("consultar", "cs_test_x")))["status"]);
            Assert.Equal("pago", row["cr40f_status"]);
        }

        [Fact]
        public void CancelarPagamentoEmProcessamentoRecusaSemCancelar()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "unpaid", 38000, url: null);

            Assert.Contains("processamento", Erro(world.Run(Command("cancelar", "cs_test_x"))));
            Assert.Equal("aguardando", row["cr40f_status"]);
            Assert.Empty(world.Stripe.Posts);
        }

        // ---------- cancelar ----------

        [Fact]
        public void CancelarJaPagoDevolvePagoSemExpirar()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "complete", "paid", 38000);

            Assert.Equal("pago", Parse(world.Run(Command("cancelar", "cs_test_x")))["status"]);
            Assert.Empty(world.Stripe.Posts);
            Assert.Equal("pago", row["cr40f_status"]);
        }

        [Fact]
        public void CancelarAbertoExpiraNoStripeEMarcaCancelado()
        {
            var world = new World();
            var row = world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Sessions["cs_test_x"] = Session("cs_test_x", "open", "unpaid", 38000);

            Assert.Equal("cancelado", Parse(world.Run(Command("cancelar", "cs_test_x")))["status"]);
            Assert.Equal("/v1/checkout/sessions/cs_test_x/expire", world.Stripe.Posts.Single().Path);
            Assert.Equal("cancelado", row["cr40f_status"]);
        }

        // ---------- falhas ----------

        [Fact]
        public void StripeForaDoArViraErroSemVazarChave()
        {
            var world = new World();
            world.Charge("cs_test_x", "aguardando", 380m);
            world.Stripe.Failure = new StripeException(401, "api_key_invalid", "Stripe respondeu HTTP 401.");

            var erro = Erro(world.Run(Command("consultar", "cs_test_x")));

            Assert.Equal("O Stripe recusou a chave da Betinhos. Avise a operação.", erro);
            Assert.DoesNotContain("sk_", erro);
        }

        [Fact]
        public void SemChaveConfiguradaAvisaOperacao()
        {
            var world = new World();
            world.Charge("cs_test_x", "aguardando", 380m);
            var handler = new QrChargeCommandHandler(world.Service, world.User.Id, null, () => null, null, () => Now);

            Assert.Contains("ainda não está configurada", Erro(handler.Handle(Command("consultar", "cs_test_x"))));
        }

        [Fact]
        public void ConfigAceitaChavePuraOuJsonERecusaFormatoInvalido()
        {
            Assert.Equal("sk_test_abc123", QrChargeConfig.Parse(null, " sk_test_abc123 ").StripeKey);
            var json = QrChargeConfig.Parse("{\"successUrl\":\"https://x.com/fim\"}", "{\"chave\":\"rk_live_Z9\"}");
            Assert.Equal("rk_live_Z9", json.StripeKey);
            Assert.Equal("https://x.com/fim", json.SuccessUrl);
            Assert.False(QrChargeConfig.Parse(null, "token-qualquer").IsConfigured);
            Assert.Equal(QrChargeConfig.DefaultSuccessUrl, QrChargeConfig.Parse("{\"successUrl\":\"http://inseguro\"}", "sk_test_a").SuccessUrl);
        }

        [Fact]
        public void SessaoComIdForaDoFormatoNaoChegaAoStripe()
        {
            var world = new World();
            Assert.Equal("Cobrança inválida.", Erro(world.Run(Command("consultar", "cs_test_x/../../v1/customers"))));
            Assert.Empty(world.Stripe.Gets);
        }

        // ---------- apoio ----------

        private static string Command(string acao, string sessionId) =>
            QrChargeRules.Serialize(new Dictionary<string, object> { ["acao"] = acao, ["sessionId"] = sessionId });

        private static Dictionary<string, object> Parse(string json) => QrChargeRules.ParseJson(json);

        private static string Erro(string json) => QrChargeRules.Str(Parse(json), "erro");

        private static string Session(string id, string status, string paymentStatus, long amount, string extra = null, string url = "padrao") =>
            "{\"id\":\"" + id + "\",\"url\":" + (url == null ? "null" : "\"https://checkout.stripe.com/c/pay/" + id + "\"") + ",\"status\":\"" + status +
            "\",\"payment_status\":\"" + paymentStatus + "\",\"amount_total\":" + amount + ",\"expires_at\":1792596720" +
            (extra == null ? "" : "," + extra) + "}";

        private sealed class World
        {
            public readonly FakeService Service = new FakeService();
            public readonly FakeStripe Stripe = new FakeStripe();
            public readonly Entity Driver;
            public readonly Entity User;
            public readonly Entity Reserva;

            public World(bool canCharge = true, object receivable = null, bool callerIsDriver = true)
            {
                Driver = Service.Driver("Motorista", "pessoa.ficticia1@betinhos.com.br", null, null);
                Driver["cr40f_podecobrarqrcode"] = canCharge;
                User = Service.User(callerIsDriver ? "pessoa.ficticia1@betinhos.com.br" : "pessoa.ficticia3@betinhos.com.br");
                Reserva = new Entity("cr40f_reservadeveculos", Guid.NewGuid())
                {
                    ["cr40f_motorista"] = Driver.ToEntityReference(),
                    ["cr40f_valor_a_receber"] = receivable ?? 380m,
                    ["cr40f_id"] = "4521"
                };
                Service.Rows("cr40f_reservadeveculos").Add(Reserva);
            }

            public string CreateCommand(long cents, string email = "ana@mail.com", string idioma = "pt-BR") =>
                QrChargeRules.Serialize(new Dictionary<string, object>
                {
                    ["acao"] = "criar",
                    ["reservaId"] = Reserva.Id.ToString("D"),
                    ["valorCentavos"] = cents,
                    ["pagante"] = new Dictionary<string, object> { ["nome"] = "Ana Souza", ["email"] = email },
                    ["idioma"] = idioma
                });

            public string SummaryCommand() =>
                QrChargeRules.Serialize(new Dictionary<string, object> { ["acao"] = "resumo", ["reservaId"] = Reserva.Id.ToString("D") });

            public Entity Charge(string sessionId, string status, decimal valor, DateTime? expiresAt = null, Entity driver = null)
            {
                var row = new Entity(Table, Guid.NewGuid())
                {
                    ["cr40f_sessionid"] = sessionId,
                    ["cr40f_status"] = status,
                    ["cr40f_valor"] = valor,
                    ["cr40f_expiraem"] = expiresAt ?? Now.AddMinutes(30),
                    ["cr40f_reserva"] = Reserva.ToEntityReference(),
                    ["cr40f_motorista"] = (driver ?? Driver).ToEntityReference()
                };
                Service.Rows(Table).Add(row);
                return row;
            }

            public string Run(string command) =>
                new QrChargeCommandHandler(Service, User.Id, null, () => Stripe, "https://betinhos.com.br", () => Now).Handle(command);
        }

        private sealed class StripePost
        {
            public string Path;
            public IList<KeyValuePair<string, string>> Form;
            public string IdempotencyKey;
        }

        private sealed class FakeStripe : IStripeGateway
        {
            public readonly Dictionary<string, string> Sessions = new Dictionary<string, string>();
            public readonly List<StripePost> Posts = new List<StripePost>();
            public readonly List<string> Gets = new List<string>();
            public string NextCreated = "cs_test_criada";
            public StripeException Failure;
            public Action OnCreate;

            public Dictionary<string, object> Get(string pathAndQuery)
            {
                if (Failure != null) throw Failure;
                Gets.Add(pathAndQuery);
                var id = pathAndQuery.Substring("/v1/checkout/sessions/".Length).Split('?')[0];
                return QrChargeRules.ParseJson(Sessions[id]);
            }

            public Dictionary<string, object> Post(string path, IList<KeyValuePair<string, string>> form, string idempotencyKey)
            {
                if (Failure != null) throw Failure;
                Posts.Add(new StripePost { Path = path, Form = form, IdempotencyKey = idempotencyKey });
                if (path.EndsWith("/expire"))
                {
                    var id = path.Split('/')[4];
                    Sessions[id] = Session(id, "expired", "unpaid", 38000);
                    return QrChargeRules.ParseJson(Sessions[id]);
                }
                OnCreate?.Invoke();
                var amount = long.Parse(form.First(pair => pair.Key == "line_items[0][price_data][unit_amount]").Value);
                Sessions[NextCreated] = Session(NextCreated, "open", "unpaid", amount);
                return QrChargeRules.ParseJson(Sessions[NextCreated]);
            }
        }
    }
}
