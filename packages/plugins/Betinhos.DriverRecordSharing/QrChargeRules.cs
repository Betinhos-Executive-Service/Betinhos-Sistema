using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Betinhos.DriverRecordSharing
{
    // Configuração do step da Custom API new_CobrancaQR.
    // Segura: a chave do Stripe ("sk_..." ou "rk_...") pura ou {"chave":"...","successUrl":"https://..."}.
    // Não segura (opcional): {"successUrl":"https://..."}.
    public sealed class QrChargeConfig
    {
        public const string DefaultSuccessUrl = "https://betinhos.com.br";

        public string StripeKey { get; private set; }
        public string SuccessUrl { get; private set; } = DefaultSuccessUrl;
        public bool IsConfigured => !string.IsNullOrEmpty(StripeKey);

        public static QrChargeConfig Parse(string unsecureConfig, string secureConfig)
        {
            var config = new QrChargeConfig();
            var secure = (secureConfig ?? "").Trim();
            var secureJson = secure.StartsWith("{") ? TryParse(secure) : null;
            var key = secureJson != null ? Text(secureJson, "chave") : secure;
            // Chave fora do formato do Stripe equivale a não configurada.
            if (key != null && Regex.IsMatch(key.Trim(), @"^(sk|rk)_(test|live)_[A-Za-z0-9]+$")) config.StripeKey = key.Trim();
            var url = Text(secureJson, "successUrl") ?? Text(TryParse((unsecureConfig ?? "").Trim()), "successUrl");
            if (Uri.TryCreate(url ?? "", UriKind.Absolute, out var parsed) && parsed.Scheme == Uri.UriSchemeHttps) config.SuccessUrl = url;
            return config;
        }

        private static Dictionary<string, object> TryParse(string json)
        {
            try { return string.IsNullOrEmpty(json) ? null : QrChargeRules.ParseJson(json); }
            catch (Exception) { return null; }
        }

        private static string Text(Dictionary<string, object> map, string key) => QrChargeRules.Str(map, key);
    }

    // Sessão do Checkout já interpretada; valores em centavos.
    public sealed class StripeSession
    {
        public string Id { get; set; }
        public string Url { get; set; }
        public string Status { get; set; }
        public string PaymentStatus { get; set; }
        public long AmountTotal { get; set; }
        public DateTime? ExpiresAt { get; set; }
        public string Refusal { get; set; }
        public string PaymentIntentId { get; set; }
        public long? FeeCents { get; set; }
        public long? NetCents { get; set; }
        public string CardCountry { get; set; }
        public string CardBrand { get; set; }
        public string Wallet { get; set; }
        public DateTime? PaidAt { get; set; }
        // Sem pagamento devido também libera o serviço.
        public bool IsPaid => PaymentStatus == "paid" || PaymentStatus == "no_payment_required";
    }

    public sealed class QrChargeSessionRequest
    {
        public Guid ReservaId { get; set; }
        public Guid MotoristaId { get; set; }
        public string ServiceCode { get; set; }
        public long ValorCentavos { get; set; }
        public string PaganteNome { get; set; }
        public string PaganteEmail { get; set; }
        public string Idioma { get; set; }
        public string SuccessUrl { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
    }

    // Regras puras da cobrança por QR (saldo, status, formulário e JSON do Stripe), sem Dataverse nem HTTP.
    public static class QrChargeRules
    {
        public const string Aguardando = "aguardando";
        public const string Pago = "pago";
        public const string Expirado = "expirado";
        public const string Cancelado = "cancelado";
        public const long MinimumCents = 50;
        public const string ProcessingMessage = "O pagamento está em processamento no banco do passageiro. Aguarde a confirmação.";
        public const string AlreadyPaidMessage = "Este serviço já foi pago por QR code.";
        public static readonly string[] Languages = { "pt-BR", "en-US", "es-ES" };
        private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");
        private static readonly Regex EmailPattern = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        private static readonly Regex SessionIdPattern = new Regex(@"^cs_(test|live)_[A-Za-z0-9]+$");

        public static string StripeLocale(string idioma) => idioma == "en-US" ? "en" : idioma == "es-ES" ? "es" : "pt-BR";

        public static bool IsValidEmail(string email) => EmailPattern.IsMatch(email ?? "");

        // O id vai no caminho da URL do Stripe: só aceita o formato de sessão do Checkout.
        public static bool IsValidSessionId(string sessionId) => SessionIdPattern.IsMatch(sessionId ?? "");

        public static long ToCents(decimal reais) => (long)Math.Round(reais * 100m, MidpointRounding.AwayFromZero);

        public static string FormatBrl(long cents) => (cents / 100m).ToString("C", PtBr).Replace(' ', ' ');

        // Saldo = valor a receber menos o que já entrou por QR; nunca negativo.
        public static long BalanceCents(decimal receivableReais, IEnumerable<long> paidCents) =>
            Math.Max(0, ToCents(receivableReais) - (paidCents ?? Enumerable.Empty<long>()).Sum());

        // Mensagem para o motorista ou null se o valor pode ser cobrado.
        public static string ValidateAmount(long valorCentavos, long balanceCents)
        {
            if (balanceCents <= 0) return "Este serviço não tem valor a receber por QR code.";
            if (valorCentavos <= 0) return "Informe o valor da cobrança.";
            // Mínimo do Stripe para BRL.
            if (valorCentavos < MinimumCents) return "O valor mínimo é R$ 0,50.";
            if (valorCentavos > balanceCents) return "O valor não pode passar de " + FormatBrl(balanceCents) + ".";
            return null;
        }

        // 30 min é o mínimo do Stripe; arredonda ao minuto e soma 2 min de folga (relógio e latência), e a chave
        // de idempotência repete os mesmos parâmetros num toque duplo.
        public static DateTime ExpiresAt(DateTime nowUtc)
        {
            var minute = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, nowUtc.Hour, nowUtc.Minute, 0, DateTimeKind.Utc);
            return minute.AddMinutes(32);
        }

        public static string IdempotencyKey(Guid reservaId, int attempt, long valorCentavos, DateTime expiresAtUtc) =>
            string.Format(CultureInfo.InvariantCulture, "reserva-{0:N}-{1}-{2}-{3:yyyyMMddHHmm}", reservaId, attempt, valorCentavos, expiresAtUtc);

        // Não envia payment_method_types: o Stripe recusa e os meios vêm do painel.
        public static List<KeyValuePair<string, string>> BuildSessionForm(QrChargeSessionRequest request)
        {
            var form = new List<KeyValuePair<string, string>>();
            void Add(string key, string value) => form.Add(new KeyValuePair<string, string>(key, value));
            Add("mode", "payment");
            Add("line_items[0][price_data][currency]", "brl");
            Add("line_items[0][price_data][unit_amount]", request.ValorCentavos.ToString(CultureInfo.InvariantCulture));
            Add("line_items[0][price_data][product_data][name]", ("Serviço " + (request.ServiceCode ?? "")).Trim());
            Add("line_items[0][quantity]", "1");
            Add("expires_at", ToUnix(request.ExpiresAtUtc).ToString(CultureInfo.InvariantCulture));
            Add("locale", StripeLocale(request.Idioma));
            Add("client_reference_id", request.ReservaId.ToString("D"));
            Add("metadata[reserva_id]", request.ReservaId.ToString("D"));
            Add("metadata[motorista_id]", request.MotoristaId.ToString("D"));
            Add("metadata[pagante_nome]", Truncate(request.PaganteNome, 500));
            if (!string.IsNullOrWhiteSpace(request.PaganteEmail)) Add("customer_email", request.PaganteEmail.Trim());
            Add("success_url", string.IsNullOrWhiteSpace(request.SuccessUrl) ? QrChargeConfig.DefaultSuccessUrl : request.SuccessUrl);
            return form;
        }

        public static string EncodeForm(IEnumerable<KeyValuePair<string, string>> form) =>
            string.Join("&", form.Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value ?? "")));

        // Pago nunca volta atrás; cancelado pelo motorista só muda se o Stripe disser que pagou.
        public static string NextStatus(StripeSession session, string localStatus)
        {
            if (session.IsPaid || localStatus == Pago) return Pago;
            if (localStatus == Cancelado) return Cancelado;
            if (session.Status == "expired") return Expirado;
            return Aguardando;
        }

        public static StripeSession ParseSession(Dictionary<string, object> json)
        {
            var session = new StripeSession
            {
                Id = Str(json, "id"),
                Url = Str(json, "url"),
                Status = Str(json, "status"),
                PaymentStatus = Str(json, "payment_status"),
                AmountTotal = Long(json, "amount_total") ?? 0,
                ExpiresAt = FromUnix(Long(json, "expires_at"))
            };
            var intent = Dict(json, "payment_intent");
            session.PaymentIntentId = intent != null ? Str(intent, "id") : Str(json, "payment_intent");
            session.Refusal = Str(Dict(intent, "last_payment_error"), "message");
            var charge = Dict(intent, "latest_charge");
            var card = Dict(Dict(charge, "payment_method_details"), "card");
            var balance = Dict(charge, "balance_transaction");
            session.FeeCents = Long(balance, "fee");
            session.NetCents = Long(balance, "net");
            session.CardCountry = Str(card, "country");
            session.CardBrand = Str(card, "brand");
            session.Wallet = Str(Dict(card, "wallet"), "type");
            session.PaidAt = FromUnix(Long(charge, "created"));
            return session;
        }

        // Contrato lido por parseQrChargeResponse (src/lib/qrCharge.ts).
        public static string ContractJson(string sessionId, string url, string status, long valorCentavos, DateTime? expiresAtUtc, string refusal) =>
            Serialize(Contract(sessionId, url, status, valorCentavos, expiresAtUtc, refusal));

        public static Dictionary<string, object> Contract(string sessionId, string url, string status, long valorCentavos, DateTime? expiresAtUtc, string refusal) =>
            new Dictionary<string, object>
            {
                ["sessionId"] = sessionId ?? "",
                ["url"] = url ?? "",
                ["status"] = status,
                ["valorCentavos"] = valorCentavos,
                ["expiraEm"] = IsoUtc(expiresAtUtc),
                ["recusa"] = status == Aguardando ? (refusal ?? "").Trim() : ""
            };

        public static string IsoUtc(DateTime? utc) =>
            utc.HasValue ? DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture) : "";

        public static string ErrorJson(string message) => Serialize(new Dictionary<string, object> { ["erro"] = message });

        public static string Serialize(object value) => new JavaScriptSerializer().Serialize(value);

        public static Dictionary<string, object> ParseJson(string json) =>
            new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();

        public static Dictionary<string, object> Dict(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) ? value as Dictionary<string, object> : null;

        public static string Str(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) && value != null && !(value is IDictionary) ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;

        public static long? Long(Dictionary<string, object> source, string key)
        {
            if (source == null || !source.TryGetValue(key, out var value) || value == null) return null;
            try { return Convert.ToInt64(value, CultureInfo.InvariantCulture); }
            catch (Exception) { return null; }
        }

        private static long ToUnix(DateTime utc) => (long)(DateTime.SpecifyKind(utc, DateTimeKind.Utc) - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;

        private static DateTime? FromUnix(long? seconds) => seconds.HasValue ? new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(seconds.Value) : (DateTime?)null;

        private static string Truncate(string value, int max)
        {
            var text = (value ?? "").Trim();
            return text.Length <= max ? text : text.Substring(0, max);
        }
    }
}
