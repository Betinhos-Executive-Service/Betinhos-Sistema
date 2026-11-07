using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_CobrancaQR: cobrança por QR code no Stripe Checkout, sempre em reais.
    // A chave do Stripe fica na configuração segura do step (só admin lê); o motorista nunca a vê.
    // Entrada new_Command (JSON com "acao"), saída new_Result (contrato de src/lib/qrCharge.ts ou {"erro"}).
    public sealed class QrChargePlugin : IPlugin
    {
        public const string MessageName = "new_CobrancaQR";
        public const string CommandParameter = "new_Command";
        public const string ResultParameter = "new_Result";
        private readonly QrChargeConfig _config;

        public QrChargePlugin(string unsecureConfig, string secureConfig)
        {
            _config = QrChargeConfig.Parse(unsecureConfig, secureConfig);
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada pela cobrança por QR.");
            var command = context.InputParameters.Contains(CommandParameter) ? Convert.ToString(context.InputParameters[CommandParameter], CultureInfo.InvariantCulture) : "";

            // Serviço elevado: o motorista não precisa de privilégio na tabela de cobranças; o handler confere o dono.
            var system = factory.CreateOrganizationService(null);
            var config = _config;
            var handler = new QrChargeCommandHandler(
                system,
                context.InitiatingUserId,
                tracing,
                () => config.IsConfigured ? new StripeHttpGateway(config.StripeKey) : null,
                config.SuccessUrl,
                () => DateTime.UtcNow);
            try
            {
                context.OutputParameters[ResultParameter] = handler.Handle(command);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("CobrancaQR falhou: {0}", error.GetType().Name);
                throw new InvalidPluginExecutionException("Não foi possível processar a cobrança por QR code agora.", error);
            }
        }
    }

    // Regras com Dataverse; o HTTP do Stripe chega por IStripeGateway para os testes.
    public sealed class QrChargeCommandHandler
    {
        private const string ChargeTable = "cr40f_cobrancastripe";
        private const string ServiceReceivable = "cr40f_valor_a_receber";
        private const string EmployeeCanCharge = "cr40f_podecobrarqrcode";
        private const string ChargeService = "cr40f_reserva";
        private const string ChargeDriver = "cr40f_motorista";
        private const string ChargeSession = "cr40f_sessionid";
        private const string ChargeStatus = "cr40f_status";
        private const string ChargeAmount = "cr40f_valor";
        private const string ChargeExpiresAt = "cr40f_expiraem";
        private const string ChargePaidAt = "cr40f_pagoem";
        private const string ChargePayerName = "cr40f_pagantenome";
        private const string ChargePayerEmail = "cr40f_paganteemail";
        private const string ChargeLanguage = "cr40f_idioma";
        private static readonly string[] ChargeColumns = { ChargeSession, ChargeStatus, ChargeAmount, ChargeExpiresAt, ChargeDriver, ChargePaidAt, ChargePayerName, ChargePayerEmail, ChargeLanguage, "createdon" };

        private readonly IOrganizationService _system;
        private readonly Guid _callerUserId;
        private readonly ITracingService _tracing;
        private readonly Func<IStripeGateway> _stripeFactory;
        private readonly string _successUrl;
        private readonly Func<DateTime> _utcNow;
        private IStripeGateway _stripe;

        public QrChargeCommandHandler(IOrganizationService system, Guid callerUserId, ITracingService tracing, Func<IStripeGateway> stripeFactory, string successUrl, Func<DateTime> utcNow)
        {
            _system = system ?? throw new ArgumentNullException(nameof(system));
            _callerUserId = callerUserId;
            _tracing = tracing ?? new NullTracing();
            _stripeFactory = stripeFactory;
            _successUrl = successUrl;
            _utcNow = utcNow ?? (() => DateTime.UtcNow);
        }

        public string Handle(string commandJson)
        {
            string action = null;
            try
            {
                Dictionary<string, object> command;
                try { command = QrChargeRules.ParseJson(commandJson ?? ""); }
                catch (Exception) { throw new Refusal("Comando de cobrança inválido."); }
                action = QrChargeRules.Str(command, "acao");
                switch (action)
                {
                    case "criar": return Create(command);
                    case "consultar": return Query(command);
                    case "sincronizar": return Synchronize(command);
                    case "cancelar": return Cancel(command);
                    case "resumo": return Summary(command);
                    default: throw new Refusal("Ação de cobrança desconhecida.");
                }
            }
            catch (Refusal refusal)
            {
                return QrChargeRules.ErrorJson(refusal.Message);
            }
            catch (StripeException error)
            {
                // Só o status e o código do Stripe vão para o rastreamento; nunca a chave nem o corpo.
                _tracing.Trace("CobrancaQR Stripe acao={0} status={1} code={2}", action, error.Status, error.Code);
                // No webhook a falha técnica vira exceção: o Flow responde 500 e o Stripe reenvia o evento.
                if (action == "sincronizar") throw new InvalidPluginExecutionException("O Stripe não respondeu ao sincronizar a cobrança; o webhook tenta de novo.");
                return QrChargeRules.ErrorJson(StripeMessage(error));
            }
        }

        // ---------- criar ----------

        private string Create(Dictionary<string, object> command)
        {
            var driverId = CallerDriverId();
            var employee = _system.Retrieve(PluginConfig.EmployeeTable, driverId, new ColumnSet(EmployeeCanCharge));
            if (employee.GetAttributeValue<bool?>(EmployeeCanCharge) != true) throw new Refusal("Você não está liberado para cobrar por QR code.");

            var reservaId = ReservaId(command);
            var valorCentavos = QrChargeRules.Long(command, "valorCentavos") ?? 0;
            var payer = QrChargeRules.Dict(command, "pagante");
            var payerName = (QrChargeRules.Str(payer, "nome") ?? "").Trim();
            var payerEmail = (QrChargeRules.Str(payer, "email") ?? "").Trim();
            var language = QrChargeRules.Str(command, "idioma");
            if (!QrChargeRules.Languages.Contains(language)) language = "pt-BR";
            if (payerName.Length == 0) throw new Refusal("Informe quem vai pagar.");
            if (payerEmail.Length > 0 && !QrChargeRules.IsValidEmail(payerEmail)) throw new Refusal("Confira o e-mail.");

            var service = OwnedService(reservaId, driverId);
            var receivable = Decimal(service.Attributes.Contains(ServiceReceivable) ? service[ServiceReceivable] : null);
            if (QrChargeRules.ValidateAmount(valorCentavos, long.MaxValue) is string invalidAmount) throw new Refusal(invalidAmount);

            var now = _utcNow();
            var charges = ChargesOf(reservaId);
            bool Open(Entity row) => Status(row) == QrChargeRules.Aguardando && (row.GetAttributeValue<DateTime?>(ChargeExpiresAt) ?? DateTime.MinValue) > now;

            // Dois toques não criam duas cobranças: reaproveita a aberta, do mesmo motorista e com o mesmo valor.
            var reusable = charges
                .Where(row => Open(row) && AmountCents(row) == valorCentavos && Driver(row) == driverId && QrChargeRules.IsValidSessionId(row.GetAttributeValue<string>(ChargeSession)))
                .OrderByDescending(row => row.GetAttributeValue<DateTime?>(ChargeExpiresAt))
                .FirstOrDefault();
            if (reusable != null)
            {
                var session = Fetch(reusable.GetAttributeValue<string>(ChargeSession));
                var status = Mirror(reusable, session);
                if (status == QrChargeRules.Pago || (status == QrChargeRules.Aguardando && session.Status == "open")) return Contract(reusable, session, status);
            }

            // Só um QR aberto por reserva: os outros abertos são expirados, senão a soma deles passaria do saldo.
            foreach (var row in charges.Where(row => Open(row) && row != reusable)) Release(row);

            // Pago e em processamento (pagamento assíncrono) já comprometem o saldo.
            var committed = charges.Where(row => Status(row) == QrChargeRules.Pago || Open(row)).Select(AmountCents);
            // Pago no total (inclusive descoberto agora ao expirar a aberta): a mensagem diz isso, não "sem valor a receber".
            var receivableCents = QrChargeRules.ToCents(receivable);
            if (receivableCents > 0 && PaidCents(charges) >= receivableCents) throw new Refusal(QrChargeRules.AlreadyPaidMessage);
            var invalid = QrChargeRules.ValidateAmount(valorCentavos, QrChargeRules.BalanceCents(receivable, committed));
            if (invalid != null) throw new Refusal(invalid);

            var expiresAt = QrChargeRules.ExpiresAt(now);
            var request = new QrChargeSessionRequest
            {
                ReservaId = reservaId,
                MotoristaId = driverId,
                ServiceCode = ServiceCode(service),
                ValorCentavos = valorCentavos,
                PaganteNome = payerName,
                PaganteEmail = payerEmail,
                Idioma = language,
                SuccessUrl = _successUrl,
                ExpiresAtUtc = expiresAt
            };
            var key = QrChargeRules.IdempotencyKey(reservaId, charges.Count + 1, valorCentavos, expiresAt);
            var created = QrChargeRules.ParseSession(Stripe().Post("/v1/checkout/sessions", QrChargeRules.BuildSessionForm(request), key));
            if (!QrChargeRules.IsValidSessionId(created.Id) || string.IsNullOrEmpty(created.Url)) throw new StripeException(200, "invalid_session", "Sessão do Stripe sem id ou link.");

            // Toque duplo concorrente: a mesma chave de idempotência devolve a mesma sessão; não grava outra linha.
            var existing = ChargesBySession(created.Id).FirstOrDefault();
            if (existing != null) return Contract(existing, created, Status(existing));

            _system.Create(new Entity(ChargeTable)
            {
                ["cr40f_name"] = Truncate("Serviço " + request.ServiceCode + " · " + payerName, 160),
                [ChargeSession] = created.Id,
                [ChargeStatus] = QrChargeRules.Aguardando,
                [ChargeAmount] = valorCentavos / 100m,
                [ChargePayerName] = Truncate(payerName, 200),
                [ChargePayerEmail] = payerEmail.Length > 0 ? Truncate(payerEmail, 320) : null,
                [ChargeLanguage] = language,
                [ChargeExpiresAt] = created.ExpiresAt ?? expiresAt,
                [ChargeService] = new EntityReference(PluginConfig.ServiceTable, reservaId),
                [ChargeDriver] = new EntityReference(PluginConfig.EmployeeTable, driverId)
            });
            _tracing.Trace("CobrancaQR criada reserva={0} valor={1}", reservaId, valorCentavos);
            return QrChargeRules.ContractJson(created.Id, created.Url, QrChargeRules.Aguardando, created.AmountTotal > 0 ? created.AmountTotal : valorCentavos, created.ExpiresAt ?? expiresAt, "");
        }

        // Expira no Stripe uma cobrança aberta que não será reaproveitada; se já tiver sido paga, grava o pagamento.
        private void Release(Entity row)
        {
            var sessionId = row.GetAttributeValue<string>(ChargeSession);
            if (!QrChargeRules.IsValidSessionId(sessionId)) return;
            var session = ExpireIfOpen(sessionId, Fetch(sessionId));
            Mirror(row, session, expiredAs: QrChargeRules.Cancelado);
        }

        // ---------- resumo ----------

        // Estado das cobranças do serviço para o app reidratar depois de recarregar: quanto já entrou por QR,
        // o saldo e a cobrança aberta para retomar. Vale para o motorista dono da reserva mesmo sem a permissão
        // de cobrar, para não pedir comprovante de novo a quem perdeu a permissão depois de cobrar.
        private string Summary(Dictionary<string, object> command)
        {
            var driverId = CallerDriverId();
            var reservaId = ReservaId(command);
            var service = OwnedService(reservaId, driverId);
            var receivableCents = QrChargeRules.ToCents(Decimal(service.Attributes.Contains(ServiceReceivable) ? service[ServiceReceivable] : null));
            var now = _utcNow();
            var charges = ChargesOf(reservaId);

            // As abertas são reconsultadas no Stripe: se o passageiro pagou e o webhook ainda não chegou, grava agora.
            Entity open = null;
            StripeSession openSession = null;
            var processingCents = 0L;
            var openRows = charges
                .Where(row => Status(row) == QrChargeRules.Aguardando && (row.GetAttributeValue<DateTime?>(ChargeExpiresAt) ?? DateTime.MinValue) > now && QrChargeRules.IsValidSessionId(row.GetAttributeValue<string>(ChargeSession)))
                .OrderByDescending(row => row.GetAttributeValue<DateTime?>(ChargeExpiresAt))
                .ToList();
            foreach (var row in openRows)
            {
                StripeSession session;
                try { session = Fetch(row.GetAttributeValue<string>(ChargeSession)); }
                catch (StripeException error)
                {
                    // Stripe fora do ar não derruba o resumo: o pago gravado continua valendo; só não oferece retomar.
                    _tracing.Trace("CobrancaQR resumo sem Stripe status={0} code={1}", error.Status, error.Code);
                    continue;
                }
                if (Mirror(row, session) != QrChargeRules.Aguardando) continue;
                if (session.Status == "open" && !string.IsNullOrEmpty(session.Url))
                {
                    if (open == null && Driver(row) == driverId) { open = row; openSession = session; }
                }
                else if (session.Status == "complete")
                {
                    // Pagamento assíncrono em processamento: compromete o saldo, mas não tem QR para retomar.
                    processingCents += AmountCents(row);
                }
            }

            var paidCents = PaidCents(charges);
            var lastPaid = charges
                .Where(row => Status(row) == QrChargeRules.Pago)
                .OrderByDescending(row => row.GetAttributeValue<DateTime?>(ChargePaidAt) ?? row.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue)
                .FirstOrDefault();
            Dictionary<string, object> lastPaidContract = null;
            if (lastPaid != null)
            {
                lastPaidContract = QrChargeRules.Contract(lastPaid.GetAttributeValue<string>(ChargeSession), "", QrChargeRules.Pago, AmountCents(lastPaid), lastPaid.GetAttributeValue<DateTime?>(ChargeExpiresAt), "");
                lastPaidContract["pagoEm"] = QrChargeRules.IsoUtc(lastPaid.GetAttributeValue<DateTime?>(ChargePaidAt));
                lastPaidContract["paganteNome"] = lastPaid.GetAttributeValue<string>(ChargePayerName) ?? "";
            }

            return QrChargeRules.Serialize(new Dictionary<string, object>
            {
                ["recebivelCentavos"] = receivableCents,
                ["pagoCentavos"] = paidCents,
                ["saldoCentavos"] = Math.Max(0, receivableCents - paidCents - processingCents),
                ["ultimaPaga"] = lastPaidContract,
                ["aberta"] = open == null ? null : OpenContract(open, openSession)
            });
        }

        // A cobrança retomada volta com pagante e idioma para o painel do passageiro sair igual.
        private static Dictionary<string, object> OpenContract(Entity row, StripeSession session)
        {
            var contract = QrChargeRules.Contract(session.Id ?? row.GetAttributeValue<string>(ChargeSession), session.Url, QrChargeRules.Aguardando, ContractAmount(row, session), session.ExpiresAt ?? row.GetAttributeValue<DateTime?>(ChargeExpiresAt), session.Refusal);
            contract["paganteNome"] = row.GetAttributeValue<string>(ChargePayerName) ?? "";
            contract["paganteEmail"] = row.GetAttributeValue<string>(ChargePayerEmail) ?? "";
            contract["idioma"] = row.GetAttributeValue<string>(ChargeLanguage) ?? "";
            return contract;
        }

        // ---------- consultar / sincronizar ----------

        private string Query(Dictionary<string, object> command)
        {
            var row = ChargeFor(command, checkOwner: true);
            var session = Fetch(row.GetAttributeValue<string>(ChargeSession));
            return Contract(row, session, Mirror(row, session));
        }

        // Webhook: só espelha o Stripe; não devolve dados da cobrança a quem chamou.
        private string Synchronize(Dictionary<string, object> command)
        {
            var row = ChargeFor(command, checkOwner: false);
            Mirror(row, Fetch(row.GetAttributeValue<string>(ChargeSession)));
            return QrChargeRules.Serialize(new Dictionary<string, object> { ["ok"] = true });
        }

        // ---------- cancelar ----------

        private string Cancel(Dictionary<string, object> command)
        {
            var row = ChargeFor(command, checkOwner: true);
            var sessionId = row.GetAttributeValue<string>(ChargeSession);
            var session = Fetch(sessionId);
            if (session.IsPaid || Status(row) == QrChargeRules.Pago) return Contract(row, session, Mirror(row, session));
            if (session.Status == "complete") throw new Refusal(QrChargeRules.ProcessingMessage + " Não dá para cancelar agora.");
            session = ExpireIfOpen(sessionId, session);
            if (session.IsPaid) return Contract(row, session, Mirror(row, session));
            if (session.Status == "complete") throw new Refusal(QrChargeRules.ProcessingMessage + " Não dá para cancelar agora.");
            return Contract(row, session, Mirror(row, session, expiredAs: QrChargeRules.Cancelado));
        }

        // ---------- apoio ----------

        private StripeSession ExpireIfOpen(string sessionId, StripeSession session)
        {
            if (session.IsPaid || session.Status != "open") return session;
            try
            {
                return QrChargeRules.ParseSession(Stripe().Post("/v1/checkout/sessions/" + sessionId + "/expire", null, null));
            }
            catch (StripeException error) when (error.Status >= 400 && error.Status < 500)
            {
                // O passageiro pode ter pago entre a consulta e o cancelamento: o dinheiro entrou.
                var current = Fetch(sessionId);
                if (current.Status == "open" && !current.IsPaid) throw;
                return current;
            }
        }

        // Espelha o Stripe na linha (status e, ao pagar, tarifa, líquido, cartão e data) e devolve o status novo.
        // expiredAs = cancelado quando foi a Betinhos que expirou a sessão.
        private string Mirror(Entity row, StripeSession session, string expiredAs = QrChargeRules.Expirado)
        {
            var current = Status(row);
            var status = QrChargeRules.NextStatus(session, current);
            if (status == QrChargeRules.Expirado) status = expiredAs;
            var update = new Entity(ChargeTable, row.Id);
            if (status != current) update[ChargeStatus] = status;
            if (status == QrChargeRules.Pago && !row.GetAttributeValue<DateTime?>(ChargePaidAt).HasValue && session.IsPaid)
            {
                update[ChargePaidAt] = session.PaidAt ?? _utcNow();
                update["cr40f_paymentintentid"] = session.PaymentIntentId;
                if (session.FeeCents.HasValue) update["cr40f_tarifa"] = session.FeeCents.Value / 100m;
                if (session.NetCents.HasValue) update["cr40f_valorliquido"] = session.NetCents.Value / 100m;
                update["cr40f_paiscartao"] = Truncate(session.CardCountry, 2);
                update["cr40f_bandeira"] = Truncate(session.CardBrand, 30);
                update["cr40f_carteira"] = Truncate(session.Wallet, 30);
            }
            if (update.Attributes.Count > 0)
            {
                _system.Update(update);
                foreach (var attribute in update.Attributes) row[attribute.Key] = attribute.Value;
            }
            return status;
        }

        // Contrato do app. Pagamento assíncrono (sessão concluída, ainda sem pagamento) não tem link para QR:
        // vira aviso para o motorista em vez de "aguardando" sem url, que o app recusaria.
        private string Contract(Entity row, StripeSession session, string status)
        {
            if (status == QrChargeRules.Aguardando && string.IsNullOrEmpty(session.Url)) throw new Refusal(QrChargeRules.ProcessingMessage);
            return QrChargeRules.ContractJson(
                session.Id ?? row.GetAttributeValue<string>(ChargeSession),
                session.Url,
                status,
                ContractAmount(row, session),
                session.ExpiresAt ?? row.GetAttributeValue<DateTime?>(ChargeExpiresAt),
                session.Refusal);
        }

        private StripeSession Fetch(string sessionId) =>
            QrChargeRules.ParseSession(Stripe().Get("/v1/checkout/sessions/" + sessionId + "?expand%5B%5D=payment_intent.latest_charge.balance_transaction"));

        private Entity ChargeFor(Dictionary<string, object> command, bool checkOwner)
        {
            var sessionId = QrChargeRules.Str(command, "sessionId");
            if (!QrChargeRules.IsValidSessionId(sessionId)) throw new Refusal("Cobrança inválida.");
            // Linha duplicada por toque concorrente: vale a mais antiga.
            var row = ChargesBySession(sessionId).FirstOrDefault() ?? throw new Refusal("Cobrança não encontrada.");
            if (checkOwner && Driver(row) != CallerDriverId()) throw new Refusal("Esta cobrança não é sua.");
            return row;
        }

        private List<Entity> ChargesBySession(string sessionId)
        {
            var query = new QueryExpression(ChargeTable) { ColumnSet = new ColumnSet(ChargeColumns), NoLock = true };
            query.Criteria.AddCondition(ChargeSession, ConditionOperator.Equal, sessionId);
            return _system.RetrieveMultiple(query).Entities.OrderBy(row => row.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MaxValue).ToList();
        }

        private List<Entity> ChargesOf(Guid reservaId)
        {
            var query = new QueryExpression(ChargeTable) { ColumnSet = new ColumnSet(ChargeColumns), NoLock = true };
            query.Criteria.AddCondition(ChargeService, ConditionOperator.Equal, reservaId);
            return _system.RetrieveMultiple(query).Entities.ToList();
        }

        private static Guid ReservaId(Dictionary<string, object> command)
        {
            if (!Guid.TryParse(QrChargeRules.Str(command, "reservaId") ?? "", out var reservaId) || reservaId == Guid.Empty) throw new Refusal("Serviço inválido.");
            return reservaId;
        }

        // A reserva precisa estar com o motorista que chama.
        private Entity OwnedService(Guid reservaId, Guid driverId)
        {
            var service = _system.Retrieve(PluginConfig.ServiceTable, reservaId, new ColumnSet(PluginConfig.ServiceDriverLookup, ServiceReceivable, PluginConfig.ServiceCode));
            var serviceDriver = service.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup);
            if (serviceDriver == null || serviceDriver.Id != driverId) throw new Refusal("Este serviço não está com você.");
            return service;
        }

        private static long PaidCents(IEnumerable<Entity> charges) => charges.Where(row => Status(row) == QrChargeRules.Pago).Sum(AmountCents);

        private Guid CallerDriverId()
        {
            var driver = new DriverResolver(_system, _tracing).ResolveFromUser(new EntityReference(PluginConfig.UserTable, _callerUserId));
            if (driver?.EmployeeReference == null) throw new Refusal("Seu usuário não está vinculado a um motorista ativo.");
            return driver.EmployeeReference.Id;
        }

        private IStripeGateway Stripe()
        {
            _stripe = _stripe ?? _stripeFactory?.Invoke();
            if (_stripe == null) throw new Refusal("A cobrança por QR code ainda não está configurada. Avise a operação.");
            return _stripe;
        }

        private static string StripeMessage(StripeException error)
        {
            if (error.Status == 401 || error.Status == 403) return "O Stripe recusou a chave da Betinhos. Avise a operação.";
            if (error.Code == "idempotency_error") return "Uma cobrança deste serviço está sendo criada. Tente de novo em instantes.";
            if (error.Status == 0 || error.Status >= 500 || error.Status == 429) return "O Stripe não respondeu agora. Tente de novo em instantes.";
            return "O Stripe recusou a cobrança (HTTP " + error.Status.ToString(CultureInfo.InvariantCulture) + "). Avise a operação.";
        }

        private static string Status(Entity row) => (row.GetAttributeValue<string>(ChargeStatus) ?? "").Trim().ToLowerInvariant();

        private static Guid Driver(Entity row) => row.GetAttributeValue<EntityReference>(ChargeDriver)?.Id ?? Guid.Empty;

        private static long AmountCents(Entity row) => QrChargeRules.ToCents(Decimal(row.Attributes.Contains(ChargeAmount) ? row[ChargeAmount] : null));

        private static long ContractAmount(Entity row, StripeSession session) => session.AmountTotal > 0 ? session.AmountTotal : AmountCents(row);

        private static string ServiceCode(Entity service) =>
            service.Attributes.Contains(PluginConfig.ServiceCode) ? Convert.ToString(service[PluginConfig.ServiceCode], CultureInfo.InvariantCulture) : "";

        // cr40f_valor_a_receber pode vir como Money ou decimal conforme o ambiente.
        private static decimal Decimal(object value)
        {
            switch (value)
            {
                case Money money: return money.Value;
                case null: return 0m;
                default:
                    try { return Convert.ToDecimal(value, CultureInfo.InvariantCulture); }
                    catch (Exception) { return 0m; }
            }
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value)) return value;
            return value.Length <= max ? value : value.Substring(0, max);
        }

        // Erro de negócio: volta como {"erro"} para o motorista ler, não como exceção.
        private sealed class Refusal : Exception
        {
            public Refusal(string message) : base(message) { }
        }

        private sealed class NullTracing : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }
    }
}
