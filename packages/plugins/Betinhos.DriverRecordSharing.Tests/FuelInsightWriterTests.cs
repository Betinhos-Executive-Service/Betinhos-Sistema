using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelInsightWriterTests
    {
        private static FuelInsightWriter.Facts Facts() => new FuelInsightWriter.Facts
        {
            Mes = "2026-11", Nota = 72, NotaPreco = 31.5m, NotaConsumo = 24m, NotaRegistro = 16.5m, Qtd = 6, Litros = 240m, Gasto = 1590.4m,
            EconomiaPerdida = 18.4m, Kml = 10.8m, KmlReferencia = 11.6m, PiorAbastecimento = "Posto A: R$ 6,70/L; Posto B a 1,1 km: R$ 6,49/L, 3 dias antes", MesAnteriorNota = 65
        };

        private static string Tool(params string[] insights) =>
            "{\"content\":[{\"type\":\"tool_use\",\"name\":\"escrever_insights\",\"input\":{\"insights\":[" + string.Join(",", insights.Select(i => "\"" + i + "\"")) + "]}}],\"usage\":{\"input_tokens\":300,\"output_tokens\":90}}";

        [Fact]
        public void Body_UsesHaikuToolAndFacts()
        {
            var body = FuelInsightWriter.BuildRequestBody(Facts());
            Assert.Contains("\"model\":\"claude-haiku-5-5\"", body);
            Assert.Contains("\"name\":\"escrever_insights\"", body);
            Assert.Contains("R$ 18,40", body);
            Assert.Contains("Nunca cite outros motoristas", body);
        }

        [Fact]
        public void Parse_KeepsInsightsWithKnownNumbers()
        {
            var r = FuelInsightWriter.ParseResponse(Tool(
                "Você deixou de economizar R$ 18,40 este mês.",
                "Sua nota subiu de 65 para 72.",
                "No Posto B, a 1,1 km, o litro saiu R$ 6,49."), Facts());
            Assert.True(r.Ok);
            Assert.Equal(3, r.Insights.Count);
        }

        [Fact]
        public void Parse_DropsInsightWithInventedNumber()
        {
            var r = FuelInsightWriter.ParseResponse(Tool(
                "Você deixou de economizar R$ 18,40 este mês.",
                "Abastecer às terças economiza R$ 50,00.",
                "Sua nota subiu de 65 para 72."), Facts());
            Assert.True(r.Ok);
            Assert.Equal(2, r.Insights.Count);
            Assert.DoesNotContain(r.Insights, i => i.Contains("50,00"));
        }

        [Fact]
        public void Parse_FailsWhenFewerThanTwoSurvive()
        {
            var r = FuelInsightWriter.ParseResponse(Tool("Economize R$ 99,00.", "Gaste 3,14 a menos."), Facts());
            Assert.False(r.Ok);
            Assert.Equal("insights_invalidos", r.Motivo);
        }

        [Fact]
        public void Write_WithoutKey_DoesNotCall()
        {
            var called = false;
            var r = FuelInsightWriter.Write(null, Facts(), (b, k, t) => { called = true; return ""; }, null);
            Assert.False(r.Ok);
            Assert.Equal("sem_chave", r.Motivo);
            Assert.False(called);
        }
    }
}
