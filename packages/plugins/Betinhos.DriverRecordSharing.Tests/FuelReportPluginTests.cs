using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelReportPluginTests
    {
        // JavaScriptSerializer devolve ArrayList (net462), não object[].
        private static object[] Arr(object list) => ((System.Collections.IEnumerable)list).Cast<object>().ToArray();

        private static Dictionary<string, object> Parse(string json) => new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);

        [Fact]
        public void BuildJson_MapsMonthsFuelingsAndInsights()
        {
            var resumo = new Entity("new_resumocombustivelmensal", Guid.NewGuid());
            resumo["new_mes"] = "2026-11"; resumo["new_qtdabastecimentos"] = 6; resumo["new_litros"] = 240m;
            resumo["new_gastototal"] = new Money(1590.4m); resumo["new_economiaperdida"] = new Money(18.4m); resumo["new_nota"] = 72;
            resumo["new_insightsjson"] = "[\"Você deixou de economizar R$ 18,40.\",\"Sua nota subiu de 65 para 72.\"]";
            resumo["new_insightsgeradoem"] = new DateTime(2026, 11, 3, 5, 0, 0, DateTimeKind.Utc);

            var postoB = Guid.NewGuid();
            var despesa = new Entity("cr40f_despesaoperacional", Guid.NewGuid());
            despesa["cr40f_datagasto"] = new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc);
            despesa["new_precolitro"] = 6.7m; despesa["cr40f_litros"] = 40m; despesa["cr40f_valor"] = new Money(268m);
            despesa["new_statuscomparacao"] = new OptionSetValue(FuelSchema.ComparacaoComparado);
            despesa["new_menorprecoproximo"] = 6.49m; despesa["new_medianaregiao"] = 6.54m; despesa["new_distanciapostobarato"] = 1112;
            despesa["new_economiaperdida"] = new Money(8.4m); despesa["new_cnpjposto"] = "07108241000106";
            despesa["new_postomaisbarato"] = new EntityReference("new_postocombustivel", postoB);

            var json = FuelReportPlugin.BuildJson(new[] { resumo }, new[] { despesa }, new Dictionary<Guid, string> { [postoB] = "Posto B" });
            var root = Parse(json);

            Assert.True((bool)root["ok"]);
            var mes = (Dictionary<string, object>)Arr(root["meses"])[0];
            Assert.Equal("2026-11", mes["mes"]);
            Assert.Equal(72, mes["nota"]);
            var a = (Dictionary<string, object>)Arr(root["abastecimentos"])[0];
            Assert.Equal("2026-11-03", a["data"]);
            Assert.Equal("comparado", a["status"]);
            Assert.Equal("Posto B", a["postoMaisBarato"]);
            Assert.False((bool)a["temKm"]);
            Assert.True((bool)a["temCnpj"]);
            Assert.Equal(2, Arr(root["insights"]).Length);
            Assert.Equal("2026-11-03T05:00:00Z", root["insightsGeradoEm"]);
        }

        [Fact]
        public void BuildJson_WithoutDataReturnsEmptyListsAndNullInsightDate()
        {
            var root = Parse(FuelReportPlugin.BuildJson(new List<Entity>(), new List<Entity>(), new Dictionary<Guid, string>()));

            Assert.True((bool)root["ok"]);
            Assert.Empty(Arr(root["meses"]));
            Assert.Empty(Arr(root["abastecimentos"]));
            Assert.Empty(Arr(root["insights"]));
            Assert.Null(root["insightsGeradoEm"]);
        }

        [Fact]
        public void BuildJson_MapsEachStatusAndOrdersFuelingsNewestFirst()
        {
            Entity Fuel(int day, int? status, string cnpj, int? km)
            {
                var e = new Entity("cr40f_despesaoperacional", Guid.NewGuid());
                e["cr40f_datagasto"] = new DateTime(2026, 11, day, 12, 0, 0, DateTimeKind.Utc);
                if (status != null) e["new_statuscomparacao"] = new OptionSetValue(status.Value);
                if (cnpj != null) e["new_cnpjposto"] = cnpj;
                if (km != null) e["cr40f_kminformado"] = km.Value;
                return e;
            }

            var root = Parse(FuelReportPlugin.BuildJson(new List<Entity>(), new[]
            {
                Fuel(1, FuelSchema.ComparacaoSemCnpj, null, null),
                Fuel(2, FuelSchema.ComparacaoPostoPendente, "07108241000106", 120000),
                Fuel(3, FuelSchema.ComparacaoSemReferencia, "07108241000106", null),
                Fuel(4, null, "07108241000106", null),
                Fuel(5, null, null, null)
            }, new Dictionary<Guid, string>()));

            var list = Arr(root["abastecimentos"]).Cast<Dictionary<string, object>>().ToList();
            Assert.Equal(new[] { "2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02", "2026-11-01" }, list.Select(a => (string)a["data"]));
            Assert.Equal(new[] { "sem_cnpj", "posto_pendente", "sem_referencia", "posto_pendente", "sem_cnpj" }, list.Select(a => (string)a["status"]));
            Assert.True((bool)list[3]["temKm"]);
        }

        [Fact]
        public void BuildJson_DataUsesBrasiliaDay()
        {
            var e = new Entity("cr40f_despesaoperacional", Guid.NewGuid());
            e["cr40f_datagasto"] = new DateTime(2026, 11, 4, 1, 30, 0, DateTimeKind.Utc);

            var root = Parse(FuelReportPlugin.BuildJson(new List<Entity>(), new[] { e }, new Dictionary<Guid, string>()));

            Assert.Equal("2026-11-03", (string)((Dictionary<string, object>)Arr(root["abastecimentos"])[0])["data"]);
        }

        [Fact]
        public void SemMotorista_ReturnsMotivo()
        {
            var root = Parse(FuelReportPlugin.SemMotoristaJson());

            Assert.False((bool)root["ok"]);
            Assert.Equal("sem_motorista", root["motivo"]);
        }

        [Fact]
        public void Repository_LoadsOnlyTheDriversSixLatestMonthsAndRecentFuelings()
        {
            var svc = new FuelFakeService();
            var eu = svc.Driver();
            var colega = svc.Driver();
            for (var m = 1; m <= 8; m++) svc.Resumo(eu, "2026-" + m.ToString("00"), 70);
            svc.Resumo(colega, "2026-08", 90);
            var recente = svc.FuelRaw(eu, 100m, 15m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), null);
            svc.FuelRaw(eu, 100m, 15m, new DateTime(2026, 8, 2, 12, 0, 0, DateTimeKind.Utc), null);
            svc.FuelRaw(colega, 100m, 15m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), null);
            svc.FuelRaw(eu, 50m, 1m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), null, categoria: "Pedágio");

            var repo = new FuelRepository(svc);
            var months = repo.LoadMonthSummaries(eu, 6);
            var fuelings = repo.LoadFuelings(eu, new DateTime(2026, 10, 1, 3, 0, 0, DateTimeKind.Utc));

            Assert.Equal(new[] { "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03" }, months.Select(r => r.GetAttributeValue<string>("new_mes")));
            Assert.Equal(recente, Assert.Single(fuelings).Id);
        }

        [Fact]
        public void Repository_LoadsPostoNamesById()
        {
            var svc = new FuelFakeService();
            var a = svc.Posto("07108241000106", "Posto A", -23.5, -46.6);
            var b = svc.Posto("11222333000181", "Posto B", -23.5, -46.6);
            svc.Posto("11444777000161", "Posto C", -23.5, -46.6);

            var names = new FuelRepository(svc).LoadPostoNames(new[] { a, b, a });

            Assert.Equal(2, names.Count);
            Assert.Equal("Posto A", names[a]);
            Assert.Equal("Posto B", names[b]);
        }
    }
}
