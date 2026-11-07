using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    // Acesso ao Stripe atrás de interface para os testes; devolve o JSON já desserializado.
    public interface IStripeGateway
    {
        Dictionary<string, object> Get(string pathAndQuery);

        Dictionary<string, object> Post(string path, IList<KeyValuePair<string, string>> form, string idempotencyKey);
    }

    // Falha do Stripe sem a chave na mensagem. Status 0 = sem resposta (rede ou tempo esgotado).
    public sealed class StripeException : Exception
    {
        public StripeException(int status, string code, string message, Exception inner = null) : base(message, inner)
        {
            Status = status;
            Code = code ?? "";
        }

        public int Status { get; }

        public string Code { get; }
    }

    // Cliente HTTP do Stripe. A chave vem da configuração segura do step e nunca é registrada.
    public sealed class StripeHttpGateway : IStripeGateway
    {
        private const string BaseUrl = "https://api.stripe.com";
        // Versão fixa: latest_charge e o formato do Checkout não mudam se a conta trocar a versão padrão.
        private const string ApiVersion = "2024-06-20";
        private const int TimeoutMs = 8000;
        private readonly string _key;

        public StripeHttpGateway(string key)
        {
            if (string.IsNullOrWhiteSpace(key)) throw new StripeException(0, "not_configured", "Chave do Stripe não configurada.");
            _key = key.Trim();
        }

        public Dictionary<string, object> Get(string pathAndQuery) => Send("GET", pathAndQuery, null, null);

        public Dictionary<string, object> Post(string path, IList<KeyValuePair<string, string>> form, string idempotencyKey) =>
            Send("POST", path, QrChargeRules.EncodeForm(form ?? new List<KeyValuePair<string, string>>()), idempotencyKey);

        private Dictionary<string, object> Send(string method, string pathAndQuery, string body, string idempotencyKey)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(BaseUrl + pathAndQuery);
            request.Method = method;
            request.Timeout = TimeoutMs;
            request.ReadWriteTimeout = TimeoutMs;
            request.Accept = "application/json";
            request.Headers[HttpRequestHeader.Authorization] = "Bearer " + _key;
            request.Headers["Stripe-Version"] = ApiVersion;
            if (!string.IsNullOrEmpty(idempotencyKey)) request.Headers["Idempotency-Key"] = idempotencyKey;
            if (body != null)
            {
                var bytes = Encoding.UTF8.GetBytes(body);
                request.ContentType = "application/x-www-form-urlencoded";
                request.ContentLength = bytes.Length;
                using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            }

            try
            {
                using (var response = (HttpWebResponse)request.GetResponse())
                    return QrChargeRules.ParseJson(Read(response));
            }
            catch (WebException error) when (error.Response is HttpWebResponse http)
            {
                string code = "";
                try
                {
                    var stripeError = QrChargeRules.ParseJson(Read(http));
                    var detail = stripeError.TryGetValue("error", out var value) ? value as Dictionary<string, object> : null;
                    code = detail != null && detail.TryGetValue("code", out var c) && c != null ? c.ToString()
                        : detail != null && detail.TryGetValue("type", out var t) && t != null ? t.ToString() : "";
                }
                catch (Exception) { /* Corpo sem JSON: fica só o status. */ }
                throw new StripeException((int)http.StatusCode, code, "Stripe respondeu HTTP " + (int)http.StatusCode + ".", error);
            }
            catch (WebException error)
            {
                throw new StripeException(0, error.Status.ToString(), "Stripe não respondeu a tempo.", error);
            }
        }

        private static string Read(WebResponse response)
        {
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) return reader.ReadToEnd();
        }
    }
}
