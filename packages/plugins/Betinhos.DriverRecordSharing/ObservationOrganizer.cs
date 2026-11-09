using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Organiza a observação do motorista em tópicos curtos com o Claude Haiku.
    // Só reescreve o que está no texto; qualquer falha devolve ok=false e o app grava o original.
    // Nunca registra a chave nem o texto: o trace leva só tamanho, ms, tokens e motivo.
    public static class ObservationOrganizer
    {
        public const string Model = "claude-haiku-5-5";
        public const string ToolName = "organizar_observacao";
        public const string Endpoint = "https://api.anthropic.com/v1/messages";
        public const int TimeoutMs = 8000;
        public const int MaxTokens = 600;
        public const int MaxTopics = 8;
        public const int MaxTopicLength = 140;
        public const int MaxInputLength = 4000;

        private const string SystemPrompt =
            "Você organiza a observação que um motorista executivo ditou ou digitou ao finalizar um serviço. " +
            "Deixe o texto mais entendível: corrija pontuação, tire repetições e hesitações e separe em tópicos curtos " +
            "(ex.: atraso, espera, pedágio/estacionamento, ocorrência, combustível, comentário do passageiro, outros). " +
            "Proibido inventar fato, valor, horário ou nome que não esteja no texto. Não acrescente conclusões. " +
            "Use português do Brasil. De 1 a 8 tópicos, cada um com no máximo 140 caracteres.";

        public sealed class Result
        {
            public bool Ok;
            public List<string> Topicos = new List<string>();
            public string Motivo;
            public long Ms;
            public int InputTokens;
            public int OutputTokens;
        }

        // post(body, chave, timeoutMs) devolve o corpo da resposta ou lança.
        public delegate string Post(string body, string apiKey, int timeoutMs);

        public static string BuildRequestBody(string texto)
        {
            var schema = new Dictionary<string, object>
            {
                ["type"] = "object",
                ["properties"] = new Dictionary<string, object>
                {
                    ["topicos"] = new Dictionary<string, object>
                    {
                        ["type"] = "array",
                        ["minItems"] = 1,
                        ["maxItems"] = MaxTopics,
                        ["items"] = new Dictionary<string, object> { ["type"] = "string", ["maxLength"] = MaxTopicLength }
                    }
                },
                ["required"] = new[] { "topicos" }
            };
            var body = new Dictionary<string, object>
            {
                ["model"] = Model,
                ["max_tokens"] = MaxTokens,
                ["system"] = SystemPrompt,
                ["output_config"] = new Dictionary<string, object> { ["effort"] = "low" },
                ["tools"] = new object[]
                {
                    new Dictionary<string, object>
                    {
                        ["name"] = ToolName,
                        ["description"] = "Devolve a observação do motorista organizada em tópicos curtos, sem inventar nada.",
                        ["input_schema"] = schema
                    }
                },
                ["tool_choice"] = new Dictionary<string, object> { ["type"] = "tool", ["name"] = ToolName },
                ["messages"] = new object[]
                {
                    new Dictionary<string, object> { ["role"] = "user", ["content"] = "Observação do motorista:\n" + texto }
                }
            };
            return new JavaScriptSerializer().Serialize(body);
        }

        public static Result ParseResponse(string responseBody)
        {
            var result = new Result { Motivo = "resposta_invalida" };
            try
            {
                var parsed = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(responseBody);
                if (parsed == null) return result;
                if (parsed.TryGetValue("usage", out var usageValue) && usageValue is Dictionary<string, object> usage)
                {
                    result.InputTokens = Int(usage, "input_tokens");
                    result.OutputTokens = Int(usage, "output_tokens");
                }
                if (!parsed.TryGetValue("content", out var contentValue) || !(contentValue is ArrayList content)) return result;
                foreach (var block in content)
                {
                    if (!(block is Dictionary<string, object> item)) continue;
                    if (!(item.TryGetValue("type", out var type) && "tool_use".Equals(type))) continue;
                    if (!(item.TryGetValue("input", out var inputValue) && inputValue is Dictionary<string, object> input)) continue;
                    if (!(input.TryGetValue("topicos", out var topicsValue) && topicsValue is ArrayList topics)) continue;
                    foreach (var topic in topics)
                    {
                        var text = Convert.ToString(topic)?.Trim();
                        if (string.IsNullOrEmpty(text)) continue;
                        result.Topicos.Add(text.Length > MaxTopicLength ? text.Substring(0, MaxTopicLength) : text);
                        if (result.Topicos.Count == MaxTopics) break;
                    }
                    break;
                }
            }
            catch (ArgumentException) { return result; }
            catch (InvalidOperationException) { return result; }

            if (result.Topicos.Count == 0) return result;
            result.Ok = true;
            result.Motivo = null;
            return result;
        }

        public static Result Organize(string apiKey, string texto, Post post, ITracingService tracing)
        {
            var clock = Stopwatch.StartNew();
            Result result;
            var clean = (texto ?? "").Trim();
            if (string.IsNullOrWhiteSpace(apiKey)) result = new Result { Motivo = "sem_chave" };
            else if (clean.Length == 0) result = new Result { Motivo = "sem_texto" };
            else if (clean.Length > MaxInputLength) result = new Result { Motivo = "texto_longo" };
            else
            {
                try { result = ParseResponse(post(BuildRequestBody(clean), apiKey.Trim(), TimeoutMs)); }
                catch (WebException error) { result = new Result { Motivo = error.Status == WebExceptionStatus.Timeout ? "timeout" : "falha_http" }; }
                catch (Exception error) { result = new Result { Motivo = "erro_" + error.GetType().Name }; }
            }
            result.Ms = clock.ElapsedMilliseconds;
            tracing?.Trace("OrganizarObservacao tamanho={0} ok={1} motivo={2} ms={3} in={4} out={5} topicos={6}",
                clean.Length, result.Ok, result.Motivo ?? "-", result.Ms, result.InputTokens, result.OutputTokens, result.Topicos.Count);
            return result;
        }

        public static string ToJson(Result result)
        {
            return new JavaScriptSerializer().Serialize(new Dictionary<string, object>
            {
                ["ok"] = result.Ok,
                ["topicos"] = result.Topicos,
                ["motivo"] = result.Motivo,
                ["ms"] = result.Ms,
                ["input_tokens"] = result.InputTokens,
                ["output_tokens"] = result.OutputTokens
            });
        }

        // HTTP real: TLS 1.2, x-api-key e anthropic-version. Status de erro vira WebException (falha_http).
        public static string HttpPost(string body, string apiKey, int timeoutMs)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(Endpoint);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            request.Headers["x-api-key"] = apiKey;
            request.Headers["anthropic-version"] = "2023-06-01";
            var bytes = Encoding.UTF8.GetBytes(body);
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                return reader.ReadToEnd();
        }

        private static int Int(Dictionary<string, object> map, string key)
        {
            return map.TryGetValue(key, out var value) && value != null ? Convert.ToInt32(value) : 0;
        }
    }
}
