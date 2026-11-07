using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelInsightsPluginTests
    {
        private static string Tool(params string[] insights) =>
            "{\"content\":[{\"type\":\"tool_use\",\"name\":\"escrever_insights\",\"input\":{\"insights\":[" + string.Join(",", insights.Select(i => "\"" + i + "\"")) + "]}}],\"usage\":{\"input_tokens\":300,\"output_tokens\":90}}";

        private static readonly string Valid = Tool("Você gastou R$ 100,00 este mês.", "Sua nota foi 72 de 100.");

        private static string NoHttp(string body, string key, int ms) => throw new InvalidOperationException("não deveria chamar a IA");

        private static (int processados, int pendentes) Counts(string json)
        {
            var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            return ((int)root["processados"], (int)root["pendentes"]);
        }

        [Fact]
        public void Process_WithKey_WritesInsightsAndClearsFlag()
        {
            var svc = new FuelFakeService();
            var resumoId = svc.Resumo(svc.Driver(), "2026-11", 72);
            string sentBody = null;

            var json = FuelInsightsPlugin.Process(svc, "chave", (body, key, ms) => { sentBody = body; return Valid; }, null);

            Assert.Equal((1, 0), Counts(json));
            var resumo = svc.Get(FuelSchema.Resumo, resumoId);
            Assert.False(resumo.GetAttributeValue<bool>("new_precisainsight"));
            Assert.NotNull(resumo.GetAttributeValue<DateTime?>("new_insightsgeradoem"));
            var saved = new JavaScriptSerializer().Deserialize<string[]>(resumo.GetAttributeValue<string>("new_insightsjson"));
            Assert.Equal(2, saved.Length);
            Assert.Contains("Nota: 72 de 100", sentBody);
        }

        [Fact]
        public void Process_WithoutKey_KeepsFlagAndNeverCallsAi()
        {
            var svc = new FuelFakeService();
            var resumoId = svc.Resumo(svc.Driver(), "2026-11", 72);

            var json = FuelInsightsPlugin.Process(svc, null, NoHttp, null);

            Assert.Equal((0, 1), Counts(json));
            Assert.True(svc.Get(FuelSchema.Resumo, resumoId).GetAttributeValue<bool>("new_precisainsight"));
            Assert.Empty(svc.Updated);
        }

        [Fact]
        public void Process_AiFailure_KeepsFlagForNextNight()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var falha = svc.Resumo(motorista, "2026-10", 60);
            var ok = svc.Resumo(motorista, "2026-11", 72);
            var calls = 0;

            var json = FuelInsightsPlugin.Process(svc, "chave", (body, key, ms) =>
            {
                if (++calls == 1) throw new InvalidOperationException("timeout");
                return Valid;
            }, null);

            Assert.Equal((1, 1), Counts(json));
            Assert.True(svc.Get(FuelSchema.Resumo, falha).GetAttributeValue<bool>("new_precisainsight"));
            Assert.False(svc.Get(FuelSchema.Resumo, ok).GetAttributeValue<bool>("new_precisainsight"));
        }

        [Fact]
        public void Process_RepeatedAiFailures_DoNotBlockTheNextSummaries()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var ids = new List<Guid>();
            for (var i = 0; i < 9; i++) ids.Add(svc.Resumo(motorista, "2026-" + (i + 1).ToString("00"), 72));
            var calls = 0;
            Func<string, string, int, string> ai = (body, key, ms) => { if (++calls <= FuelInsightsPlugin.BatchSize) throw new InvalidOperationException("IA fora do ar"); return Valid; };

            var first = FuelInsightsPlugin.Process(svc, "chave", (b, k, ms) => ai(b, k, ms), null);

            Assert.Equal((0, 9), Counts(first));
            Assert.All(ids, id => Assert.True(svc.Get(FuelSchema.Resumo, id).GetAttributeValue<bool>("new_precisainsight")));

            var second = FuelInsightsPlugin.Process(svc, "chave", (b, k, ms) => ai(b, k, ms), null);

            // Os 8 que falharam foram para o fim da fila (modifiedon novo); o nono, nunca tentado, passa na frente.
            Assert.False(svc.Get(FuelSchema.Resumo, ids[8]).GetAttributeValue<bool>("new_precisainsight"));
            Assert.Equal((8, 1), Counts(second));
        }

        [Fact]
        public void Process_CountsPendingAcrossPages()
        {
            var svc = new FuelFakeService { PageSize = 2 };
            var motorista = svc.Driver();
            for (var i = 0; i < 5; i++) svc.Resumo(motorista, "2026-" + (i + 1).ToString("00"), 72);

            var json = FuelInsightsPlugin.Process(svc, null, NoHttp, null);

            Assert.Equal((0, 5), Counts(json));
            Assert.Equal(3, svc.Pages);
        }

        [Fact]
        public void Process_HandlesAtMostEightPerCall()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            for (var i = 0; i < 10; i++) svc.Resumo(motorista, "2026-" + (i + 1).ToString("00"), 72);
            svc.Resumo(motorista, "2025-12", 72, precisaInsight: false);
            var calls = 0;

            var json = FuelInsightsPlugin.Process(svc, "chave", (body, key, ms) => { calls++; return Valid; }, null);

            Assert.Equal(8, calls);
            Assert.Equal((8, 2), Counts(json));
        }

        [Fact]
        public void BuildFacts_UsesPreviousMonthAndWorstFueling()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var postoB = svc.Posto("11222333000181", "Posto B", -23.5, -46.6);
            var postoA = svc.Posto("07108241000106", "Posto A", -23.5, -46.6);
            svc.Resumo(motorista, "2026-10", 65);
            svc.Resumo(motorista, "2026-11", 72, gasto: 1590.4m, economiaPerdida: 18.4m);
            var leve = svc.FuelRaw(motorista, 268m, 40m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), "07108241000106");
            var pior = svc.FuelRaw(motorista, 270m, 40m, new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc), "07108241000106");
            foreach (var (id, perda) in new[] { (leve, 2.4m), (pior, 8.4m) })
            {
                var d = svc.Get(FuelSchema.Despesa, id);
                d["new_precolitro"] = d.GetAttributeValue<Money>("cr40f_valor").Value / 40m; d["new_posto"] = new EntityReference(FuelSchema.Posto, postoA);
                d["new_economiaperdida"] = new Money(perda); d["new_menorprecoproximo"] = 6.49m; d["new_distanciapostobarato"] = 1112;
                d["new_postomaisbarato"] = new EntityReference(FuelSchema.Posto, postoB);
            }
            var repo = new FuelRepository(svc);
            var resumo = svc.Rows(FuelSchema.Resumo).Single(r => r.GetAttributeValue<string>("new_mes") == "2026-11");

            var facts = FuelInsightsPlugin.BuildFacts(repo, resumo);

            Assert.Equal("2026-11", facts.Mes);
            Assert.Equal(72, facts.Nota);
            Assert.Equal(65, facts.MesAnteriorNota);
            Assert.Equal(1590.4m, facts.Gasto);
            Assert.Equal("Posto A: R$ 6,75/L; Posto B a 1,1 km: R$ 6,49/L", facts.PiorAbastecimento);
        }
    }
}
