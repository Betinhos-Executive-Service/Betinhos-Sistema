using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;
using FakeService = Betinhos.DriverRecordSharing.Tests.ChecklistFakeService;

namespace Betinhos.DriverRecordSharing.Tests
{
    // Só chaves e CNPJs gerados aqui (o repositório é público). O DV é calculado à parte, com os pesos por extenso.
    public sealed class NotaFiscalAnexoTests
    {
        internal static int Dv(string texto, int[] pesos)
        {
            var soma = texto.Select((c, i) => (c - 48) * pesos[i]).Sum();
            var resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        }

        internal static string Cnpj(string base12)
        {
            var d1 = Dv(base12, new[] { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 });
            var d2 = Dv(base12 + d1, new[] { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 });
            return base12 + d1 + d2;
        }

        internal static string Chave(string aamm = "2611", string modelo = "65", string uf = "33", string cnpj = null)
        {
            var meio = modelo == "59" ? "900012345" + "004321" + "123456" : "001" + "000004321" + "1" + "12345678";
            var chave43 = uf + aamm + (cnpj ?? Cnpj("123456780001")) + modelo + meio;
            var pesos = Enumerable.Range(0, 43).Select(i => 2 + ((42 - i) % 8)).ToArray();
            return chave43 + Dv(chave43, pesos).ToString(CultureInfo.InvariantCulture);
        }

        private static string TrocarUm(string chave, int i) => chave.Substring(0, i) + ((chave[i] - 48 + 1) % 10) + chave.Substring(i + 1);

        [Theory]
        [InlineData("55", "35", "SP", "001", 4321)]
        [InlineData("65", "33", "RJ", "001", 4321)]
        [InlineData("59", "35", "SP", "900012345", 4321)]
        public void ChaveValidaDecompoeOsCampos(string modelo, string uf, string sigla, string serie, int numero)
        {
            var nota = ChaveNotaFiscal.Validar(Chave(modelo: modelo, uf: uf), out var erro);
            Assert.Null(erro);
            Assert.Equal(sigla, nota.Uf);
            Assert.Equal(modelo, nota.Modelo);
            Assert.Equal(serie, nota.Serie);
            Assert.Equal(numero, nota.Numero);
            Assert.Equal("2611", nota.Aamm);
        }

        [Fact]
        public void CnpjAlfanumericoEhAceitoESoNumericoSegueIgual()
        {
            var cnpj = Cnpj("12ABC34501DE");
            Assert.True(ChaveNotaFiscal.CnpjValido(cnpj));
            Assert.NotNull(ChaveNotaFiscal.Validar(Chave(cnpj: cnpj), out _));
            Assert.True(ChaveNotaFiscal.CnpjValido(Cnpj("112223330001")));
            Assert.False(ChaveNotaFiscal.CnpjValido("11222333000100"));
        }

        [Fact]
        public void AceitaEspacosERecusaDvUfMesModeloECnpj()
        {
            var chave = Chave();
            Assert.NotNull(ChaveNotaFiscal.Validar(string.Join(" ", Enumerable.Range(0, 11).Select(i => chave.Substring(i * 4, 4))), out _));
            Assert.Null(ChaveNotaFiscal.Validar(TrocarUm(chave, 30), out var erroDv));
            Assert.Contains("dígito verificador", erroDv);
            Assert.Null(ChaveNotaFiscal.Validar(Chave(uf: "34"), out var erroUf));
            Assert.Contains("estado", erroUf);
            Assert.Null(ChaveNotaFiscal.Validar(Chave(aamm: "2613"), out var erroMes));
            Assert.Contains("mês", erroMes);
            Assert.Null(ChaveNotaFiscal.Validar(Chave(modelo: "57"), out var erroModelo));
            Assert.Contains("não é de nota", erroModelo);
            Assert.Null(ChaveNotaFiscal.Validar(Chave(cnpj: "12345678000100"), out var erroCnpj));
            Assert.Contains("CNPJ", erroCnpj);
        }

        [Fact]
        public void MesComToleranciaNoPrimeiroENoUltimoDia()
        {
            Assert.True(ChaveNotaFiscal.MesConfere("2611", new DateTime(2026, 11, 15)));
            Assert.False(ChaveNotaFiscal.MesConfere("2610", new DateTime(2026, 11, 15)));
            Assert.True(ChaveNotaFiscal.MesConfere("2610", new DateTime(2026, 11, 1)));
            Assert.True(ChaveNotaFiscal.MesConfere("2612", new DateTime(2026, 11, 30)));
            Assert.True(ChaveNotaFiscal.MesConfere("2612", new DateTime(2027, 1, 1)));
            Assert.False(ChaveNotaFiscal.MesConfere("2612", new DateTime(2026, 11, 1)));
        }

        // ---------- plugin ----------

        private sealed class World
        {
            public readonly FakeService Service = new FakeService();
            public readonly NotaFiscalAnexo Rules;
            public World() { Rules = new NotaFiscalAnexo(Service, null); }

            /// <summary>Despesa com a data do gasto como o app grava (12:00 UTC do dia).</summary>
            public Entity Despesa(DateTime dia, int status = 100000000, DateTime? criadaEm = null)
            {
                var row = new Entity(NotaFiscalAnexo.Despesa, Guid.NewGuid())
                {
                    ["cr40f_datagasto"] = DateTime.SpecifyKind(dia.Date.AddHours(12), DateTimeKind.Utc),
                    ["cr40f_statusoperacional"] = new OptionSetValue(status),
                    ["createdon"] = criadaEm ?? new DateTime(2026, 11, 10, 15, 0, 0, DateTimeKind.Utc)
                };
                Service.Rows(NotaFiscalAnexo.Despesa).Add(row);
                return row;
            }

            public Entity Anexo(Entity despesa, string chave)
            {
                var row = new Entity(NotaFiscalAnexo.Tabela, Guid.NewGuid()) { [NotaFiscalAnexo.ColunaDespesa] = despesa.ToEntityReference(), [NotaFiscalAnexo.ColunaChave] = chave };
                Service.Rows(NotaFiscalAnexo.Tabela).Add(row);
                return row;
            }

            public Entity NovoAnexo(Entity despesa, string chave) =>
                new Entity(NotaFiscalAnexo.Tabela) { [NotaFiscalAnexo.ColunaDespesa] = despesa.ToEntityReference(), [NotaFiscalAnexo.ColunaChave] = chave };
        }

        [Fact]
        public void ChaveValidaGravaComDecomposicaoESituacaoConferida()
        {
            var world = new World();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            var chave = Chave();
            var target = world.NovoAnexo(despesa, string.Join(" ", Enumerable.Range(0, 11).Select(i => chave.Substring(i * 4, 4))));

            world.Rules.AoGravar(target, update: false);

            Assert.Equal(chave, target[NotaFiscalAnexo.ColunaChave]);
            Assert.Equal("RJ", target["cr40f_notauf"]);
            Assert.Equal("2611", target["cr40f_notaaamm"]);
            Assert.Equal(Cnpj("123456780001"), target["cr40f_notacnpjemitente"]);
            Assert.Equal("65", target["cr40f_notamodelo"]);
            Assert.Equal(4321, target["cr40f_notanumero"]);
            Assert.Equal(NotaFiscalAnexo.SituacaoVerificada, target.GetAttributeValue<OptionSetValue>(NotaFiscalAnexo.ColunaSituacao).Value);
        }

        [Fact]
        public void DvInvalidoRecusa()
        {
            var world = new World();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            var error = Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(world.NovoAnexo(despesa, TrocarUm(Chave(), 30)), false));
            Assert.Contains("dígito verificador", error.Message);
        }

        [Fact]
        public void MesDiferenteDaDespesaRecusa()
        {
            var world = new World();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            var error = Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(world.NovoAnexo(despesa, Chave(aamm: "2610")), false));
            Assert.Contains("outubro de 2026", error.Message);
        }

        [Fact]
        public void DataDoGastoEhLidaNoFusoDaOperacao()
        {
            var world = new World();
            // 01/12 às 01:00 UTC = 30/11 às 22:00 em Brasília: a nota de novembro vale; a de outubro não.
            var despesa = new Entity(NotaFiscalAnexo.Despesa, Guid.NewGuid()) { ["cr40f_datagasto"] = new DateTime(2026, 12, 1, 1, 0, 0, DateTimeKind.Utc) };
            world.Service.Rows(NotaFiscalAnexo.Despesa).Add(despesa);
            Assert.Equal(new DateTime(2026, 11, 30), world.Rules.DataDaDespesa(despesa.Id));
            world.Rules.AoGravar(world.NovoAnexo(despesa, Chave(aamm: "2611")), false);
            Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(world.NovoAnexo(despesa, Chave(aamm: "2610")), false));
        }

        [Fact]
        public void RepetidaNoutraDespesaRecusaComADataDoLancamento()
        {
            var world = new World();
            var chave = Chave();
            world.Anexo(world.Despesa(new DateTime(2026, 11, 10), criadaEm: new DateTime(2026, 11, 10, 15, 0, 0, DateTimeKind.Utc)), chave);
            var nova = world.Despesa(new DateTime(2026, 11, 16));

            var error = Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(world.NovoAnexo(nova, chave), false));

            Assert.Equal("Esta nota já foi usada em outra despesa, lançada em 10/11/2026.", error.Message);
        }

        [Theory]
        [InlineData(NotaFiscalAnexo.StatusCancelado)]
        [InlineData(NotaFiscalAnexo.StatusRecusado)]
        public void RepetidaNoutraDespesaCanceladaOuRecusadaGrava(int status)
        {
            var world = new World();
            var chave = Chave();
            world.Anexo(world.Despesa(new DateTime(2026, 11, 10), status), chave);
            var target = world.NovoAnexo(world.Despesa(new DateTime(2026, 11, 16)), chave);

            world.Rules.AoGravar(target, false);

            Assert.Equal(NotaFiscalAnexo.SituacaoVerificada, target.GetAttributeValue<OptionSetValue>(NotaFiscalAnexo.ColunaSituacao).Value);
        }

        [Fact]
        public void MesmaChaveEmOutroComprovanteDaMesmaDespesaGrava()
        {
            var world = new World();
            var chave = Chave();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            world.Anexo(despesa, chave);
            world.Rules.AoGravar(world.NovoAnexo(despesa, chave), false);
        }

        [Fact]
        public void UpdateSemMudarAChaveNaoRevalidaContraOProprioAnexo()
        {
            var world = new World();
            var chave = Chave();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            var anexo = world.Anexo(despesa, chave);

            world.Rules.AoGravar(new Entity(NotaFiscalAnexo.Tabela, anexo.Id) { [NotaFiscalAnexo.ColunaChave] = chave }, update: true);
        }

        [Fact]
        public void UpdateQueTrocaAChaveRevalidaARepetidaNoutraDespesa()
        {
            var world = new World();
            var chave = Chave();
            world.Anexo(world.Despesa(new DateTime(2026, 11, 2)), chave);
            var anexo = world.Anexo(world.Despesa(new DateTime(2026, 11, 16)), Chave(modelo: "55"));

            Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(new Entity(NotaFiscalAnexo.Tabela, anexo.Id) { [NotaFiscalAnexo.ColunaChave] = chave }, update: true));
        }

        [Fact]
        public void SemChaveSoAceitaNaoVerificadaOuSemNota()
        {
            var world = new World();
            var despesa = world.Despesa(new DateTime(2026, 11, 16));
            var semNota = new Entity(NotaFiscalAnexo.Tabela) { [NotaFiscalAnexo.ColunaDespesa] = despesa.ToEntityReference(), [NotaFiscalAnexo.ColunaSituacao] = new OptionSetValue(NotaFiscalAnexo.SituacaoSemNota) };
            world.Rules.AoGravar(semNota, false);
            var conferidaSemChave = new Entity(NotaFiscalAnexo.Tabela) { [NotaFiscalAnexo.ColunaDespesa] = despesa.ToEntityReference(), [NotaFiscalAnexo.ColunaSituacao] = new OptionSetValue(NotaFiscalAnexo.SituacaoVerificada) };
            Assert.Throws<InvalidPluginExecutionException>(() => world.Rules.AoGravar(conferidaSemChave, false));
        }

        [Fact]
        public void UpdateSemChaveNemSituacaoNaoFazNada()
        {
            var world = new World();
            world.Rules.AoGravar(new Entity(NotaFiscalAnexo.Tabela, Guid.NewGuid()) { ["cr40f_status"] = new OptionSetValue(100000001) }, update: true);
        }
    }
}
