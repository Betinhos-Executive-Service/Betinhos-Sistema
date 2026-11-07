using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Escreve 2–4 insights a partir de números já calculados. Insight com número fora dos fatos é descartado.
    // Trace só com motivo, ms e tokens; nunca o texto nem a chave.
    public static class FuelInsightWriter
    {
        public const string Model = "claude-haiku-5-5";
        public const string ToolName = "escrever_insights";
        public const int MaxTokens = 500;
        private static readonly CultureInfo Br = new CultureInfo("pt-BR");
        private static readonly Regex NumberToken = new Regex(@"\d+(?:[.,]\d+)?", RegexOptions.Compiled);

        private const string SystemPrompt =
            "Você é um consultor de custos de uma empresa de transporte executivo e fala com um motorista sobre os abastecimentos dele. " +
            "Escreva de 2 a 4 frases curtas (até 160 caracteres cada), em português do Brasil, tom respeitoso e prático. " +
            "Use SOMENTE os números dos fatos, copiados exatamente como estão. Não calcule números novos. " +
            "Nunca cite outros motoristas; pode citar postos. Termine com uma sugestão concreta.";

        public sealed class Facts
        {
            public string Mes, PiorAbastecimento;
            public int? Nota, MesAnteriorNota;
            public int Qtd;
            public decimal? NotaPreco, NotaConsumo, NotaRegistro, Kml, KmlReferencia;
            public decimal Litros, Gasto, EconomiaPerdida;
        }

        public sealed class Result
        {
            public bool Ok;
            public List<string> Insights = new List<string>();
            public string Motivo;
            public long Ms;
            public int InputTokens, OutputTokens;
        }

        private static string Money(decimal v) => "R$ " + v.ToString("N2", Br);
        private static string Num(decimal v) => v.ToString("0.##", Br);

        public static List<string> FactLines(Facts f)
        {
            var lines = new List<string>
            {
                "Mês: " + f.Mes,
                "Abastecimentos: " + f.Qtd,
                "Litros: " + Num(f.Litros),
                "Gasto: " + Money(f.Gasto),
                "Economia perdida contra o posto mais barato próximo: " + Money(f.EconomiaPerdida)
            };
            lines.Add(f.Nota != null ? "Nota: " + f.Nota + " de 100" : "Nota: em formação (menos de 4 abastecimentos)");
            if (f.MesAnteriorNota != null) lines.Add("Nota do mês anterior: " + f.MesAnteriorNota);
            if (f.NotaPreco != null) lines.Add("Pontos de preço: " + Num(f.NotaPreco.Value) + " de 50");
            if (f.NotaConsumo != null) lines.Add("Pontos de consumo: " + Num(f.NotaConsumo.Value) + " de 30");
            if (f.NotaRegistro != null) lines.Add("Pontos de registro: " + Num(f.NotaRegistro.Value) + " de 20");
            if (f.Kml != null) lines.Add("Consumo: " + Num(f.Kml.Value) + " km/l");
            if (f.KmlReferencia != null) lines.Add("Consumo de referência do mesmo modelo: " + Num(f.KmlReferencia.Value) + " km/l");
            if (!string.IsNullOrWhiteSpace(f.PiorAbastecimento)) lines.Add("Abastecimento mais caro do mês: " + f.PiorAbastecimento);
            return lines;
        }

        public static HashSet<string> AllowedNumbers(Facts f) =>
            new HashSet<string>(FactLines(f).SelectMany(l => NumberToken.Matches(l).Cast<Match>().Select(m => m.Value)));

        public static string BuildRequestBody(Facts f)
        {
            var schema = new Dictionary<string, object>
            {
                ["type"] = "object",
                ["properties"] = new Dictionary<string, object>
                {
                    ["insights"] = new Dictionary<string, object>
                    {
                        ["type"] = "array", ["minItems"] = 2, ["maxItems"] = 4,
                        ["items"] = new Dictionary<string, object> { ["type"] = "string", ["maxLength"] = 160 }
                    }
                },
                ["required"] = new[] { "insights" }
            };
            var body = new Dictionary<string, object>
            {
                ["model"] = Model,
                ["max_tokens"] = MaxTokens,
                ["system"] = SystemPrompt,
                ["tools"] = new[] { new Dictionary<string, object> { ["name"] = ToolName, ["description"] = "Insights do mês para o motorista.", ["input_schema"] = schema } },
                ["tool_choice"] = new Dictionary<string, object> { ["type"] = "tool", ["name"] = ToolName },
                ["messages"] = new[] { new Dictionary<string, object> { ["role"] = "user", ["content"] = "Fatos:\n- " + string.Join("\n- ", FactLines(f)) } }
            };
            return new JavaScriptSerializer().Serialize(body);
        }

        public static Result ParseResponse(string responseBody, Facts f)
        {
            var result = new Result();
            try
            {
                var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(responseBody);
                if (root.TryGetValue("usage", out var u) && u is Dictionary<string, object> usage)
                {
                    result.InputTokens = Convert.ToInt32(usage["input_tokens"], CultureInfo.InvariantCulture);
                    result.OutputTokens = Convert.ToInt32(usage["output_tokens"], CultureInfo.InvariantCulture);
                }
                var tool = ((IEnumerable)root["content"]).OfType<Dictionary<string, object>>()
                    .FirstOrDefault(c => (c["type"] as string) == "tool_use" && (c["name"] as string) == ToolName);
                var raw = tool != null ? ((IEnumerable)((Dictionary<string, object>)tool["input"])["insights"]).OfType<string>() : Enumerable.Empty<string>();
                var allowed = AllowedNumbers(f);
                result.Insights = raw.Select(s => s.Trim()).Where(s => s.Length > 0 && s.Length <= 160)
                    .Where(s => NumberToken.Matches(s).Cast<Match>().All(m => allowed.Contains(m.Value))).Take(4).ToList();
            }
            catch (Exception) { result.Motivo = "resposta_invalida"; return result; }
            result.Ok = result.Insights.Count >= 2;
            if (!result.Ok) result.Motivo = "insights_invalidos";
            return result;
        }

        public static Result Write(string apiKey, Facts f, ObservationOrganizer.Post post, ITracingService tracing)
        {
            if (string.IsNullOrWhiteSpace(apiKey)) return new Result { Motivo = "sem_chave" };
            var watch = Stopwatch.StartNew();
            Result result;
            try { result = ParseResponse(post(BuildRequestBody(f), apiKey, ObservationOrganizer.TimeoutMs), f); }
            catch (Exception error) { result = new Result { Motivo = "falha_http:" + error.GetType().Name }; }
            result.Ms = watch.ElapsedMilliseconds;
            tracing?.Trace("InsightsCombustivel: ok={0} motivo={1} ms={2} in={3} out={4}", result.Ok, result.Motivo, result.Ms, result.InputTokens, result.OutputTokens);
            return result;
        }
    }
}
