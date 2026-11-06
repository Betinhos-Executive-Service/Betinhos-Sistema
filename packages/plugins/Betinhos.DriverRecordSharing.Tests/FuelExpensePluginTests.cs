using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelExpensePluginTests
    {
        private const string Brasil = "{\"nome_fantasia\":\"Posto A\",\"descricao_tipo_de_logradouro\":\"AVENIDA\",\"logradouro\":\"PAULISTA\",\"numero\":\"1000\",\"bairro\":\"BELA VISTA\",\"municipio\":\"SAO PAULO\",\"uf\":\"SP\",\"cep\":\"01310100\"}";
        private const string Geo = "[{\"lat\":\"-23.5614\",\"lon\":\"-46.6559\",\"place_rank\":30}]";
        private static readonly DateTime Dia3 = new DateTime(2026, 11, 3, 12, 0, 0, DateTimeKind.Utc);

        private static string NoHttp(string url, int ms) => throw new InvalidOperationException("não deveria chamar HTTP");

        [Fact]
        public void Process_CreatesPostoComparesAndRecomputesMonth()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var colega = svc.Driver();
            var postoB = svc.Posto("11222333000181", "Posto B", -23.5514, -46.6559);
            var postoC = svc.Posto("11444777000161", "Posto C", -23.5564, -46.6559);
            svc.Fuel(colega, 6.49m, 40m, new DateTime(2026, 10, 31, 12, 0, 0, DateTimeKind.Utc), postoB);
            svc.Fuel(colega, 6.59m, 40m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), postoC);
            var alvo = svc.FuelRaw(motorista, 268m, 40m, Dia3, "07108241000106");

            FuelExpensePlugin.Process(svc, alvo, (url, ms) => url.Contains("brasilapi") ? Brasil : Geo, null);

            var despesa = svc.Get(FuelSchema.Despesa, alvo);
            Assert.Equal(6.700m, despesa.GetAttributeValue<decimal>("new_precolitro"));
            Assert.Equal(FuelSchema.ComparacaoComparado, despesa.GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
            Assert.Equal(8.40m, despesa.GetAttributeValue<Money>("new_economiaperdida").Value);
            Assert.Equal(postoB, despesa.GetAttributeValue<EntityReference>("new_postomaisbarato").Id);
            Assert.Single(svc.Rows(FuelSchema.Posto).Where(p => p.GetAttributeValue<string>("new_cnpj") == "07108241000106"));
            var resumo = svc.Rows(FuelSchema.Resumo).Single(r => r.GetAttributeValue<EntityReference>("new_motorista").Id == motorista);
            Assert.Equal("2026-11", resumo.GetAttributeValue<string>("new_mes"));
            Assert.Equal(1, resumo.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(8.40m, resumo.GetAttributeValue<Money>("new_economiaperdida").Value);
            Assert.True(resumo.GetAttributeValue<bool>("new_precisainsight"));
        }

        [Fact]
        public void Process_ReusesExistingPosto_WithoutHttp()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            svc.Posto("07108241000106", "Posto A", -23.5614, -46.6559);
            var alvo = svc.FuelRaw(motorista, 268m, 40m, Dia3, "07.108.241/0001-06");

            FuelExpensePlugin.Process(svc, alvo, NoHttp, null);

            Assert.Equal(FuelSchema.ComparacaoSemReferencia, svc.Get(FuelSchema.Despesa, alvo).GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
            Assert.Single(svc.Rows(FuelSchema.Posto));
        }

        [Fact]
        public void Process_PendingPosto_MarksPostoPendente()
        {
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 268m, 40m, Dia3, "07108241000106");

            FuelExpensePlugin.Process(svc, alvo, (url, ms) => url.Contains("brasilapi") ? Brasil : "[]", null);

            Assert.Equal(FuelSchema.ComparacaoPostoPendente, svc.Get(FuelSchema.Despesa, alvo).GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
            Assert.Equal(FuelSchema.StatusGeoPendente, svc.Rows(FuelSchema.Posto).Single().GetAttributeValue<OptionSetValue>("new_statusgeo").Value);
        }

        [Fact]
        public void Process_IgnoresNonFuelCategory()
        {
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 50m, 0m, Dia3, null, categoria: "Estacionamento");
            FuelExpensePlugin.Process(svc, alvo, NoHttp, null);
            Assert.Empty(svc.Updated);
            Assert.Empty(svc.Rows(FuelSchema.Resumo));
        }

        [Fact]
        public void Process_WithoutCnpj_MarksSemCnpj()
        {
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 268m, 40m, Dia3, null);
            FuelExpensePlugin.Process(svc, alvo, NoHttp, null);
            Assert.Equal(FuelSchema.ComparacaoSemCnpj, svc.Get(FuelSchema.Despesa, alvo).GetAttributeValue<OptionSetValue>("new_statuscomparacao").Value);
        }

        [Fact]
        public void Process_MonthUsesBrasiliaTime()
        {
            // 01/11 01:00 UTC ainda é 31/10 22:00 em Brasília: pertence ao resumo de outubro.
            var svc = new FuelFakeService();
            var alvo = svc.FuelRaw(svc.Driver(), 268m, 40m, new DateTime(2026, 11, 1, 1, 0, 0, DateTimeKind.Utc), null);
            FuelExpensePlugin.Process(svc, alvo, NoHttp, null);
            Assert.Equal("2026-10", svc.Rows(FuelSchema.Resumo).Single().GetAttributeValue<string>("new_mes"));
        }

        [Fact]
        public void Process_MonthSummary_SumsAndComputesConsumption()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var carro = svc.Vehicle("Corolla");
            svc.FuelRaw(motorista, 240m, 40m, new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc), null, veiculo: carro, km: 1000);
            var alvo = svc.FuelRaw(motorista, 240m, 40m, Dia3, null, veiculo: carro, km: 1400);

            FuelExpensePlugin.Process(svc, alvo, NoHttp, null);

            var resumo = svc.Rows(FuelSchema.Resumo).Single(r => r.GetAttributeValue<EntityReference>("new_motorista").Id == motorista);
            Assert.Equal(2, resumo.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(80m, resumo.GetAttributeValue<decimal>("new_litros"));
            Assert.Equal(480m, resumo.GetAttributeValue<Money>("new_gastototal").Value);
            Assert.Equal(400, resumo.GetAttributeValue<int>("new_kmrodados"));
            Assert.Equal(10m, resumo.GetAttributeValue<decimal>("new_kml"));
        }

        // --- Resumo antigo: mudança de mês, motorista, categoria ou exclusão ---

        private static readonly DateTime Out10 = new DateTime(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);
        private static readonly DateTime Out20 = new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);
        private static readonly DateTime Nov5 = new DateTime(2026, 11, 5, 12, 0, 0, DateTimeKind.Utc);

        private static Entity Summary(FuelFakeService svc, Guid motorista, string mes) =>
            svc.Rows(FuelSchema.Resumo).Single(r => r.GetAttributeValue<EntityReference>("new_motorista").Id == motorista && r.GetAttributeValue<string>("new_mes") == mes);

        // Dois abastecimentos de outubro já processados (resumo de outubro com 2).
        private static (Guid a, Guid b) TwoInOctober(FuelFakeService svc, Guid motorista)
        {
            var a = svc.FuelRaw(motorista, 240m, 40m, Out10, null);
            var b = svc.FuelRaw(motorista, 120m, 20m, Out20, null);
            FuelExpensePlugin.Process(svc, a, NoHttp, null);
            FuelExpensePlugin.Process(svc, b, NoHttp, null);
            Assert.Equal(2, Summary(svc, motorista, "2026-10").GetAttributeValue<int>("new_qtdabastecimentos"));
            return (a, b);
        }

        private static Entity Snapshot(FuelFakeService svc, Guid expenseId) => svc.Retrieve(FuelSchema.Despesa, expenseId, null);

        [Fact]
        public void Process_MonthChange_RecomputesOldAndNewMonth()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var (a, b) = TwoInOctober(svc, motorista);
            var pre = Snapshot(svc, b);

            svc.Get(FuelSchema.Despesa, b)["cr40f_datagasto"] = Nov5;
            FuelExpensePlugin.Process(svc, b, NoHttp, null, pre);

            var outubro = Summary(svc, motorista, "2026-10");
            Assert.Equal(1, outubro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(240m, outubro.GetAttributeValue<Money>("new_gastototal").Value);
            var novembro = Summary(svc, motorista, "2026-11");
            Assert.Equal(1, novembro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(120m, novembro.GetAttributeValue<Money>("new_gastototal").Value);
        }

        [Fact]
        public void Process_CategoryChangedAway_RecomputesOldMonth()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var (a, b) = TwoInOctober(svc, motorista);
            var outra = svc.Get(FuelSchema.Despesa, svc.FuelRaw(motorista, 10m, 0m, Out20, null, categoria: "Estacionamento"))[FuelSchema.DespesaCategoria];
            var pre = Snapshot(svc, b);

            svc.Get(FuelSchema.Despesa, b)[FuelSchema.DespesaCategoria] = outra;
            FuelExpensePlugin.Process(svc, b, NoHttp, null, pre);

            var outubro = Summary(svc, motorista, "2026-10");
            Assert.Equal(1, outubro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(240m, outubro.GetAttributeValue<Money>("new_gastototal").Value);
            Assert.Single(svc.Rows(FuelSchema.Resumo));
        }

        [Fact]
        public void Process_DriverChange_RecomputesOldAndNewDriver()
        {
            var svc = new FuelFakeService();
            var antigo = svc.Driver();
            var novo = svc.Driver();
            var (a, b) = TwoInOctober(svc, antigo);
            var pre = Snapshot(svc, b);

            svc.Get(FuelSchema.Despesa, b)[FuelSchema.DespesaMotorista] = new EntityReference(FuelSchema.Funcionario, novo);
            FuelExpensePlugin.Process(svc, b, NoHttp, null, pre);

            Assert.Equal(1, Summary(svc, antigo, "2026-10").GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(120m, Summary(svc, novo, "2026-10").GetAttributeValue<Money>("new_gastototal").Value);
        }

        [Fact]
        public void Process_LastExpenseLeavesMonth_ZeroesOldSummary()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var a = svc.FuelRaw(motorista, 240m, 40m, Out10, null);
            FuelExpensePlugin.Process(svc, a, NoHttp, null);
            var pre = Snapshot(svc, a);

            svc.Get(FuelSchema.Despesa, a)["cr40f_datagasto"] = Nov5;
            FuelExpensePlugin.Process(svc, a, NoHttp, null, pre);

            var outubro = Summary(svc, motorista, "2026-10");
            Assert.Equal(0, outubro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(0m, outubro.GetAttributeValue<decimal>("new_litros"));
            Assert.Equal(0m, outubro.GetAttributeValue<Money>("new_gastototal").Value);
            Assert.False(outubro.GetAttributeValue<bool>("new_precisainsight"));
            Assert.Equal(1, Summary(svc, motorista, "2026-11").GetAttributeValue<int>("new_qtdabastecimentos"));
        }

        [Fact]
        public void Process_SameMonthWithPreImage_DoesNotTouchOtherSummaries()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var (a, b) = TwoInOctober(svc, motorista);
            var pre = Snapshot(svc, b);

            svc.Get(FuelSchema.Despesa, b)["cr40f_litros"] = 25m;
            FuelExpensePlugin.Process(svc, b, NoHttp, null, pre);

            Assert.Single(svc.Rows(FuelSchema.Resumo));
            Assert.Equal(65m, Summary(svc, motorista, "2026-10").GetAttributeValue<decimal>("new_litros"));
        }

        [Fact]
        public void Process_PreImageWasNotFuel_DoesNotCreateOldSummary()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var antiga = svc.FuelRaw(motorista, 50m, 0m, Out10, null, categoria: "Estacionamento");
            var pre = Snapshot(svc, antiga);
            var combustivel = svc.Get(FuelSchema.Despesa, svc.FuelRaw(motorista, 1m, 1m, Out20, null))[FuelSchema.DespesaCategoria];

            svc.Get(FuelSchema.Despesa, antiga)[FuelSchema.DespesaCategoria] = combustivel;
            svc.Get(FuelSchema.Despesa, antiga)["cr40f_datagasto"] = Nov5;
            FuelExpensePlugin.Process(svc, antiga, NoHttp, null, pre);

            Assert.Equal("2026-11", svc.Rows(FuelSchema.Resumo).Single().GetAttributeValue<string>("new_mes"));
        }

        [Fact]
        public void Process_UpdateWithoutPreImage_KeepsCurrentBehavior()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var (a, b) = TwoInOctober(svc, motorista);

            svc.Get(FuelSchema.Despesa, b)["cr40f_datagasto"] = Nov5;
            FuelExpensePlugin.Process(svc, b, NoHttp, null);

            Assert.Equal(2, Summary(svc, motorista, "2026-10").GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(1, Summary(svc, motorista, "2026-11").GetAttributeValue<int>("new_qtdabastecimentos"));
        }

        [Fact]
        public void ProcessDelete_RecomputesDeletedExpenseMonth()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var (a, b) = TwoInOctober(svc, motorista);
            var pre = Snapshot(svc, b);

            svc.Delete(FuelSchema.Despesa, b);
            FuelExpensePlugin.ProcessDelete(svc, pre, null);

            var outubro = Summary(svc, motorista, "2026-10");
            Assert.Equal(1, outubro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(240m, outubro.GetAttributeValue<Money>("new_gastototal").Value);
        }

        [Fact]
        public void ProcessDelete_LastExpense_ZeroesSummaryAndKeepsRecord()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var a = svc.FuelRaw(motorista, 240m, 40m, Out10, null);
            FuelExpensePlugin.Process(svc, a, NoHttp, null);
            var pre = Snapshot(svc, a);

            svc.Delete(FuelSchema.Despesa, a);
            FuelExpensePlugin.ProcessDelete(svc, pre, null);

            var outubro = Summary(svc, motorista, "2026-10");
            Assert.Equal(0, outubro.GetAttributeValue<int>("new_qtdabastecimentos"));
            Assert.Equal(0m, outubro.GetAttributeValue<Money>("new_gastototal").Value);
            Assert.Equal(0m, outubro.GetAttributeValue<Money>("new_economiaperdida").Value);
            Assert.False(outubro.GetAttributeValue<bool>("new_precisainsight"));
        }

        [Fact]
        public void ProcessDelete_NonFuelOrWithoutPreImage_DoesNothing()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            var outra = svc.FuelRaw(motorista, 50m, 0m, Out10, null, categoria: "Estacionamento");
            var pre = Snapshot(svc, outra);
            svc.Delete(FuelSchema.Despesa, outra);

            FuelExpensePlugin.ProcessDelete(svc, pre, null);
            FuelExpensePlugin.ProcessDelete(svc, null, null);

            Assert.Empty(svc.Rows(FuelSchema.Resumo));
        }
    }
}
