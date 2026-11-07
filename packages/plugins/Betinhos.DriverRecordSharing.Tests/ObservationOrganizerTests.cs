using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Web.Script.Serialization;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ObservationOrganizerTests
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        private static string ToolUse(params string[] topicos)
        {
            return Json.Serialize(new Dictionary<string, object>
            {
                ["content"] = new object[] { new Dictionary<string, object> { ["type"] = "tool_use", ["name"] = "organizar_observacao", ["input"] = new Dictionary<string, object> { ["topicos"] = topicos } } },
                ["usage"] = new Dictionary<string, object> { ["input_tokens"] = 210, ["output_tokens"] = 42 }
            });
        }

        private static Dictionary<string, object> Parse(string json) => Json.Deserialize<Dictionary<string, object>>(json);

        [Fact]
        public void RequestUsaHaikuToolObrigatoriaEsforcoBaixo()
        {
            var body = Parse(ObservationOrganizer.BuildRequestBody("passageiro atrasou uns 20 minutos"));
            Assert.Equal("claude-haiku-5-5", body["model"]);
            Assert.Equal(600, body["max_tokens"]);
            Assert.Equal("low", ((Dictionary<string, object>)body["output_config"])["effort"]);
            var choice = (Dictionary<string, object>)body["tool_choice"];
            Assert.Equal("tool", choice["type"]);
            Assert.Equal("organizar_observacao", choice["name"]);
            var tool = (Dictionary<string, object>)((ArrayList)body["tools"])[0];
            Assert.Equal("organizar_observacao", tool["name"]);
            var schema = (Dictionary<string, object>)tool["input_schema"];
            var topicos = (Dictionary<string, object>)((Dictionary<string, object>)schema["properties"])["topicos"];
            Assert.Equal(1, topicos["minItems"]);
            Assert.Equal(8, topicos["maxItems"]);
            Assert.Contains("inventar", (string)body["system"]);
            var message = (Dictionary<string, object>)((ArrayList)body["messages"])[0];
            Assert.Contains("passageiro atrasou uns 20 minutos", (string)message["content"]);
        }

        [Fact]
        public void ParseLeTopicosEUsage()
        {
            var result = ObservationOrganizer.ParseResponse(ToolUse("Atraso: passageiro atrasou 20 min.", "Pedágio pago."));
            Assert.True(result.Ok);
            Assert.Equal(new[] { "Atraso: passageiro atrasou 20 min.", "Pedágio pago." }, result.Topicos);
            Assert.Equal(210, result.InputTokens);
            Assert.Equal(42, result.OutputTokens);
        }

        [Fact]
        public void ParseAplicaLimites()
        {
            var longo = new string('a', 200);
            var many = Enumerable.Range(1, 10).Select(i => "t" + i).ToList();
            many.Insert(0, "  ");
            many.Insert(1, longo);
            var result = ObservationOrganizer.ParseResponse(ToolUse(many.ToArray()));
            Assert.True(result.Ok);
            Assert.Equal(8, result.Topicos.Count);
            Assert.Equal(140, result.Topicos[0].Length);
            Assert.DoesNotContain(result.Topicos, t => t.Trim() == "");
        }

        [Fact]
        public void ParseSemToolUseFalha()
        {
            var result = ObservationOrganizer.ParseResponse("{\"content\":[{\"type\":\"text\",\"text\":\"oi\"}]}");
            Assert.False(result.Ok);
            Assert.Equal("resposta_invalida", result.Motivo);
            Assert.False(ObservationOrganizer.ParseResponse(ToolUse()).Ok);
            Assert.False(ObservationOrganizer.ParseResponse("nao e json").Ok);
        }

        [Fact]
        public void SemChaveNaoChamaApi()
        {
            var called = false;
            var result = ObservationOrganizer.Organize(" ", "texto", (b, k, t) => { called = true; return ""; }, null);
            Assert.False(called);
            Assert.False(result.Ok);
            Assert.Equal("sem_chave", result.Motivo);
        }

        [Fact]
        public void SemTextoNaoChamaApi()
        {
            var result = ObservationOrganizer.Organize("k", "  ", (b, k, t) => throw new Exception(), null);
            Assert.Equal("sem_texto", result.Motivo);
        }

        [Fact]
        public void FalhaHttpOuTimeoutViraOkFalse()
        {
            var http = ObservationOrganizer.Organize("k", "texto", (b, k, t) => throw new WebException("500", WebExceptionStatus.ProtocolError), null);
            Assert.False(http.Ok);
            Assert.Equal("falha_http", http.Motivo);
            var timeout = ObservationOrganizer.Organize("k", "texto", (b, k, t) => throw new WebException("t", WebExceptionStatus.Timeout), null);
            Assert.False(timeout.Ok);
            Assert.Equal("timeout", timeout.Motivo);
        }

        [Fact]
        public void OrganizePassaChaveETimeoutEDevolveJson()
        {
            string usedKey = null; int usedTimeout = 0;
            var result = ObservationOrganizer.Organize("chave", "texto", (b, k, t) => { usedKey = k; usedTimeout = t; return ToolUse("Um."); }, null);
            Assert.Equal("chave", usedKey);
            Assert.Equal(8000, usedTimeout);
            var json = Parse(ObservationOrganizer.ToJson(result));
            Assert.Equal(true, json["ok"]);
            Assert.Equal("Um.", ((ArrayList)json["topicos"])[0]);
            Assert.True(json.ContainsKey("ms"));
            Assert.Equal(210, json["input_tokens"]);
        }
    }
}
