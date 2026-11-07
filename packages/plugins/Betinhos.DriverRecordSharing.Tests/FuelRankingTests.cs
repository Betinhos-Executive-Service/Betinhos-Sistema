using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelRankingTests
    {
        private const string PostoA = "11.222.333/0001-81";
        private const string PostoB = "11444777000161";

        private const string CnpjA = "11222333000181";
        private const string CnpjB = "11444777000161";

        private static readonly Dictionary<string, FuelRanking.Local> Locais = new Dictionary<string, FuelRanking.Local>
        {
            [CnpjA] = new FuelRanking.Local { Lat = -23.1, Lon = -45.1 },
            [CnpjB] = new FuelRanking.Local { Lat = -23.2, Lon = -45.2, Aproximada = true }
        };

        private static FuelRanking.Abastecimento Abast(string cnpj, decimal valor, decimal litros, string nome = "Posto", int dia = 1) =>
            new FuelRanking.Abastecimento { Cnpj = cnpj, Valor = valor, Litros = litros, Nome = nome, DataUtc = new DateTime(2026, 11, dia, 12, 0, 0, DateTimeKind.Utc) };

        private static Entity Posto(int status, decimal? lat, decimal? lon, string precisao)
        {
            var posto = new Entity(FuelSchema.Posto, Guid.NewGuid());
            posto["new_statusgeo"] = new OptionSetValue(status);
            posto["new_latitude"] = lat;
            posto["new_longitude"] = lon;
            posto["new_precisaogeo"] = precisao;
            return posto;
        }

        [Fact]
        public void Montar_UsaMediaPonderadaPorLitroECoordenadasDoPosto()
        {
            var postos = FuelRanking.Montar(new[] { Abast(PostoA, 70m, 10m, dia: 1), Abast(PostoA, 120m, 20m, dia: 3) }, Locais);

            var posto = postos.Single();
            Assert.Equal(6.33m, posto["precoLitro"]);
            Assert.Equal(2, posto["abastecimentos"]);
            Assert.Equal("2026-11-03", posto["ultimoAbastecimento"]);
            Assert.Equal(-23.1, posto["lat"]);
            Assert.Equal(false, posto["aproximada"]);
        }

        [Fact]
        public void Montar_JuntaCnpjEscritoDeFormasDiferentes()
        {
            var postos = FuelRanking.Montar(new[] { Abast("11.222.333/0001-81", 60m, 10m), Abast(CnpjA, 60m, 10m) }, Locais);
            Assert.Equal(2, postos.Single()["abastecimentos"]);
        }

        [Fact]
        public void Montar_DeixaForaPostoSemLocal() =>
            Assert.Equal("Com local", FuelRanking.Montar(new[] { Abast(PostoB, 60m, 10m, "Com local"), Abast("19131243000197", 60m, 10m, "Sem local") }, Locais).Single()["nome"]);

        [Fact]
        public void Cnpjs_DevolveSoPostosValidosSemRepetir() =>
            Assert.Equal(new[] { CnpjA, CnpjB }, FuelRanking.Cnpjs(new[] { Abast(PostoA, 60m, 10m), Abast(CnpjA, 60m, 10m), Abast(PostoB, 60m, 10m), Abast("07.108.241/0001-06", 60m, 10m) }));

        [Theory]
        [InlineData("11.222.333/0001-80")] // dígito verificador errado
        [InlineData("1122233300018")] // 13 dígitos
        [InlineData("07.108.241/0001-06")] // CNPJ da própria empresa
        [InlineData("24.484.228/0001-62")] // segundo CNPJ da empresa
        [InlineData(null)]
        public void Montar_IgnoraCnpjQueNaoIdentificaPosto(string cnpj) =>
            Assert.Empty(FuelRanking.Cnpjs(new[] { Abast(cnpj, 60m, 10m) }));

        [Fact]
        public void Montar_UltimoAbastecimentoUsaODiaDeBrasilia()
        {
            var a = Abast(PostoA, 60m, 10m, dia: 4);
            a.DataUtc = new DateTime(2026, 11, 4, 1, 0, 0, DateTimeKind.Utc);
            Assert.Equal("2026-11-03", FuelRanking.Montar(new[] { a }, Locais).Single()["ultimoAbastecimento"]);
        }

        [Theory]
        [InlineData(228.6, 3693)] // litros sem vírgula
        [InlineData(244.89, 1)] // litros = 1
        [InlineData(100, 0)]
        public void Montar_IgnoraPrecoAbsurdo(double valor, double litros) =>
            Assert.Empty(FuelRanking.Montar(new[] { Abast(PostoA, (decimal)valor, (decimal)litros) }, Locais));

        [Fact]
        public void Montar_HistoricoTrazOsCincoMaisRecentesSemIdentificarNinguem()
        {
            var abastecimentos = Enumerable.Range(1, 7).Select(dia => Abast(PostoA, 60m + dia, 10m, dia: dia));

            var historico = (List<Dictionary<string, object>>)FuelRanking.Montar(abastecimentos, Locais).Single()["historico"];

            Assert.Equal(5, historico.Count);
            Assert.Equal("2026-11-07", historico[0]["data"]);
            Assert.Equal(6.7m, historico[0]["precoLitro"]);
            Assert.Equal(new[] { "data", "precoLitro" }, historico[0].Keys.ToArray());
        }

        [Fact]
        public void LocalDe_MontaEnderecoIgnorandoPartesVazias()
        {
            var posto = Posto(FuelSchema.StatusGeoGeocodificado, -23m, -45m, PostoGeocoder.PrecisaoAnp);
            posto["new_logradouro"] = "RODOVIA PRESIDENTE DUTRA";
            posto["new_numero"] = " ";
            posto["new_municipio"] = "PINDAMONHANGABA";
            posto["new_uf"] = "SP";

            Assert.Equal("RODOVIA PRESIDENTE DUTRA - PINDAMONHANGABA/SP", FuelRankingPlugin.LocalDe(posto).Endereco);
        }

        [Fact]
        public void LocalDe_SoAnpEManualSaoPrecisos()
        {
            Assert.False(FuelRankingPlugin.LocalDe(Posto(FuelSchema.StatusGeoGeocodificado, -23m, -45m, PostoGeocoder.PrecisaoAnp)).Aproximada);
            Assert.False(FuelRankingPlugin.LocalDe(Posto(FuelSchema.StatusGeoManual, -23m, -45m, "rua")).Aproximada);
            Assert.True(FuelRankingPlugin.LocalDe(Posto(FuelSchema.StatusGeoGeocodificado, -23m, -45m, "rua")).Aproximada);
        }

        [Fact]
        public void LocalDe_PendenteOuSemCoordenadaFicaFora()
        {
            Assert.Null(FuelRankingPlugin.LocalDe(Posto(FuelSchema.StatusGeoPendente, -23m, -45m, "cidade")));
            Assert.Null(FuelRankingPlugin.LocalDe(Posto(FuelSchema.StatusGeoGeocodificado, null, null, null)));
        }

        [Fact]
        public void LoadFleetFuelings_AceitaACategoriaComONomeDoProd()
        {
            var svc = new FuelFakeService();
            var id = svc.FuelRaw(svc.Driver(), 60m, 10m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), null, categoria: "Combustível");
            var row = svc.Get(FuelSchema.Despesa, id);
            row[FuelSchema.DespesaCnpjLido] = PostoA;
            row[FuelSchema.DespesaStatus] = new OptionSetValue(FuelSchema.StatusDespesaValidado);
            row["statecode"] = new OptionSetValue(0);

            var ids = new FuelRepository(svc).LoadFleetFuelings(new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc)).Select(d => d.Id);

            Assert.Equal(new[] { id }, ids);
        }

        [Fact]
        public void LoadFleetFuelings_DeixaForaDespesaCanceladaERecusada()
        {
            var svc = new FuelFakeService();
            var motorista = svc.Driver();
            Guid Despesa(int status)
            {
                var id = svc.FuelRaw(motorista, 60m, 10m, new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc), null);
                var row = svc.Get(FuelSchema.Despesa, id);
                row[FuelSchema.DespesaCnpjLido] = PostoA;
                row[FuelSchema.DespesaStatus] = new OptionSetValue(status);
                row["statecode"] = new OptionSetValue(0);
                return id;
            }
            var enviada = Despesa(FuelSchema.StatusDespesaEnviado);
            var validada = Despesa(FuelSchema.StatusDespesaValidado);
            Despesa(100000003); // recusada
            Despesa(100000004); // cancelada

            var ids = new FuelRepository(svc).LoadFleetFuelings(new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc)).Select(d => d.Id);

            Assert.Equal(new[] { enviada, validada }.OrderBy(i => i), ids.OrderBy(i => i));
        }

        [Fact]
        public void EscolherNovo_SoDevolvePostoQueFaltaEVariaComORelogio()
        {
            var agora = new DateTime(2026, 11, 5);
            var cnpjs = new[] { CnpjA, CnpjB };
            var temA = new Dictionary<string, Entity> { [CnpjA] = Posto(FuelSchema.StatusGeoManual, -23m, -45m, null) };
            Assert.Equal(CnpjB, FuelRankingPlugin.EscolherNovo(cnpjs, temA, agora));
            Assert.Null(FuelRankingPlugin.EscolherNovo(new[] { CnpjA }, temA, agora));

            var nenhum = new Dictionary<string, Entity>();
            Assert.NotEqual(FuelRankingPlugin.EscolherNovo(cnpjs, nenhum, agora), FuelRankingPlugin.EscolherNovo(cnpjs, nenhum, agora.AddSeconds(1)));

            // Relógio de resolução grossa: Ticks sempre múltiplos de 156250 não podem fixar a escolha.
            var escolhidos = Enumerable.Range(0, 200).Select(i => FuelRankingPlugin.EscolherNovo(cnpjs, nenhum, agora.AddTicks(i * 156250L))).Distinct();
            Assert.Equal(2, escolhidos.Count());
        }

        [Fact]
        public void EnsurePosto_AdiandoNaoGravaQuandoChamadaFalha()
        {
            var fake = new FuelFakeService();
            var posto = new FuelRepository(fake).EnsurePosto(CnpjA, (url, ms) => throw new System.Net.WebException("429"), adiarSeFalhar: true);
            Assert.Null(posto);
            Assert.Empty(fake.Rows(FuelSchema.Posto));
        }

        [Fact]
        public void BuildJson_NaoExpoeCnpj()
        {
            var json = FuelRankingPlugin.BuildJson(new[] { Abast(PostoA, 62m, 10m, "Posto A") }, new Dictionary<string, Entity> { [CnpjA] = Posto(FuelSchema.StatusGeoGeocodificado, -23.1m, -45.1m, PostoGeocoder.PrecisaoAnp) });
            var root = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);

            Assert.True((bool)root["ok"]);
            Assert.Equal(30, root["dias"]);
            Assert.Contains("Posto A", json);
            Assert.DoesNotContain(CnpjA, json);
        }
    }
}
