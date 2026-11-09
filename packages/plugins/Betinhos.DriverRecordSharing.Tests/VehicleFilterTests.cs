using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleFilterTests
    {
        private const int Ativo = 202410001;
        private const int Vendido = 202410000;
        private const int Proprio = 100000000;
        private const int Terceiro = 100000001;
        private const int Aluguel = 100000002;

        private static string F(string campo, string operador, string valorJson) =>
            "{\"condicoes\":[{\"campo\":\"" + campo + "\",\"operador\":\"" + operador + "\",\"valor\":" + valorJson + "}]}";

        private static Entity V(params (string Key, object Value)[] fields)
        {
            var vehicle = new Entity("cr40f_veiculos", Guid.NewGuid())
            {
                ["statecode"] = new OptionSetValue(0),
                ["cr40f_statusdoveiculo"] = new OptionSetValue(Ativo),
                ["new_categoriadoveiculo"] = new OptionSetValue(Proprio)
            };
            foreach (var field in fields) vehicle[field.Key] = field.Value;
            return vehicle;
        }

        // ---------- Avaliador ----------

        [Theory]
        [InlineData("cr40f_marca", "igual", "\"mercedes-benz\"", "Mercedes-Benz", true)]
        [InlineData("cr40f_marca", "igual", "\"  Citroen \"", "Citroën", true)]
        [InlineData("cr40f_marca", "igual", "\"Volvo\"", "Mercedes", false)]
        [InlineData("cr40f_modelo", "contem", "\"SPRINTER\"", "Sprinter 416", true)]
        [InlineData("cr40f_modelo", "contem", "\"van\"", "Sprinter", false)]
        [InlineData("cr40f_cor", "diferente", "\"preto\"", "Prata", true)]
        [InlineData("cr40f_cor", "diferente", "\"PRETO\"", "Preto", false)]
        [InlineData("cr40f_placa", "igual", "\"abc1d23\"", "ABC1D23", true)]
        [InlineData("cr40f_placa", "maior", "\"ABC\"", "ABC1D23", false)]
        [InlineData("cr40f_placa", "igual", "123", "123", false)]
        public void Texto(string campo, string operador, string valor, string atual, bool esperado) =>
            Assert.Equal(esperado, VehicleFilter.Matches(F(campo, operador, valor), V((campo, atual))));

        [Theory]
        [InlineData("igual", false)]
        [InlineData("contem", false)]
        [InlineData("diferente", true)]
        public void TextoVazio(string operador, bool esperado)
        {
            Assert.Equal(esperado, VehicleFilter.Matches(F("cr40f_cor", operador, "\"preto\""), V()));
            Assert.Equal(esperado, VehicleFilter.Matches(F("cr40f_cor", operador, "\"preto\""), V(("cr40f_cor", "   "))));
        }

        [Theory]
        [InlineData("cr40f_anodemodelo", "igual", "2022", 2022, true)]
        [InlineData("cr40f_anodemodelo", "igual", "2021", 2022, false)]
        [InlineData("cr40f_anodefabricacao", "diferente", "2021", 2022, true)]
        [InlineData("cr40f_anodefabricacao", "diferente", "2022", 2022, false)]
        [InlineData("cr40f_hodometro", "maior", "100000", 100001, true)]
        [InlineData("cr40f_hodometro", "maior", "100000", 100000, false)]
        [InlineData("cr40f_hodometro", "menor", "100000", 99999, true)]
        [InlineData("cr40f_hodometro", "menor", "100000", 100000, false)]
        [InlineData("cr40f_anodemodelo", "entre", "[2020,2022]", 2020, true)]
        [InlineData("cr40f_anodemodelo", "entre", "[2020,2022]", 2022, true)]
        [InlineData("cr40f_anodemodelo", "entre", "[2020,2022]", 2023, false)]
        [InlineData("cr40f_anodemodelo", "entre", "[2020]", 2020, false)]
        [InlineData("cr40f_anodemodelo", "igual", "\"2022\"", 2022, false)]
        [InlineData("cr40f_anodemodelo", "igual", "2022.5", 2022, false)]
        [InlineData("cr40f_anodemodelo", "contem", "2022", 2022, false)]
        public void Inteiro(string campo, string operador, string valor, int atual, bool esperado) =>
            Assert.Equal(esperado, VehicleFilter.Matches(F(campo, operador, valor), V((campo, atual))));

        [Theory]
        [InlineData("igual", "2022")]
        [InlineData("diferente", "2022")]
        [InlineData("maior", "0")]
        [InlineData("menor", "99999")]
        [InlineData("entre", "[0,99999]")]
        public void InteiroVazioFalhaEmQualquerOperador(string operador, string valor) =>
            Assert.False(VehicleFilter.Matches(F("cr40f_anodemodelo", operador, valor), V()));

        [Fact]
        public void Booleano()
        {
            Assert.True(VehicleFilter.Matches(F("cr40f_blindado", "igual", "true"), V(("cr40f_blindado", true))));
            Assert.False(VehicleFilter.Matches(F("cr40f_blindado", "igual", "true"), V(("cr40f_blindado", false))));
            Assert.True(VehicleFilter.Matches(F("cr40f_blindado", "igual", "false"), V(("cr40f_blindado", false))));
            // Vazio conta como false.
            Assert.True(VehicleFilter.Matches(F("cr40f_blindado", "igual", "false"), V()));
            Assert.False(VehicleFilter.Matches(F("cr40f_blindado", "igual", "true"), V()));
            Assert.False(VehicleFilter.Matches(F("cr40f_blindado", "diferente", "true"), V(("cr40f_blindado", false))));
            Assert.False(VehicleFilter.Matches(F("cr40f_blindado", "igual", "\"true\""), V(("cr40f_blindado", true))));
        }

        [Fact]
        public void Choice()
        {
            var terceiro = V(("new_categoriadoveiculo", new OptionSetValue(Terceiro)));
            Assert.True(VehicleFilter.Matches(F("new_categoriadoveiculo", "em", "[100000001,100000002]"), terceiro));
            Assert.False(VehicleFilter.Matches(F("new_categoriadoveiculo", "fora", "[100000001,100000002]"), terceiro));
            Assert.True(VehicleFilter.Matches(F("new_propriedade", "fora", "[100000001]"), V(("new_propriedade", new OptionSetValue(Proprio)))));
            Assert.False(VehicleFilter.Matches(F("new_propriedade", "em", "[100000001]"), V(("new_propriedade", new OptionSetValue(Proprio)))));
            // Vazio: em falha, fora passa.
            Assert.False(VehicleFilter.Matches(F("new_propriedade", "em", "[100000000]"), V()));
            Assert.True(VehicleFilter.Matches(F("new_propriedade", "fora", "[100000000]"), V()));
            // Valor do tipo errado ou operador inválido.
            Assert.False(VehicleFilter.Matches(F("new_categoriadoveiculo", "em", "100000001"), terceiro));
            Assert.False(VehicleFilter.Matches(F("new_categoriadoveiculo", "em", "[\"100000001\"]"), terceiro));
            Assert.False(VehicleFilter.Matches(F("new_categoriadoveiculo", "igual", "[100000001]"), terceiro));
        }

        [Fact]
        public void TodasAsCondicoesPrecisamBater()
        {
            var json = "{\"condicoes\":[{\"campo\":\"cr40f_blindado\",\"operador\":\"igual\",\"valor\":true},{\"campo\":\"cr40f_marca\",\"operador\":\"igual\",\"valor\":\"Volvo\"}]}";
            Assert.True(VehicleFilter.Matches(json, V(("cr40f_blindado", true), ("cr40f_marca", "VOLVO"))));
            Assert.False(VehicleFilter.Matches(json, V(("cr40f_blindado", true), ("cr40f_marca", "Mercedes"))));
        }

        [Theory]
        [InlineData("cr40f_renavam", "igual", "\"123\"")]
        [InlineData("statecode", "em", "[0]")]
        [InlineData("cr40f_blindado", "nao-existe", "true")]
        public void CampoForaDaAllowlistOuOperadorInvalidoNaoCasa(string campo, string operador, string valor) =>
            Assert.False(VehicleFilter.Matches(F(campo, operador, valor), V(("cr40f_renavam", "123"), ("cr40f_blindado", true))));

        [Fact]
        public void JsonInvalidoNaoCasa()
        {
            Assert.False(VehicleFilter.Matches("{nao eh json", V()));
            Assert.False(VehicleFilter.Matches("[1,2]", V()));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("  ")]
        [InlineData("{\"condicoes\":[]}")]
        [InlineData("{}")]
        public void FiltroVazioNaoCasa(string json) => Assert.False(VehicleFilter.Matches(json, V()));

        // ---------- Escolha do modelo ----------

        private static Entity T(string name, bool padrao = false, string filtro = null, int? prioridade = null) =>
            new Entity("new_checklistmodelo", Guid.NewGuid())
            {
                ["new_name"] = name,
                ["new_ativo"] = true,
                ["new_padraoquinzenal"] = padrao,
                ["new_filtrojson"] = filtro,
                ["new_prioridade"] = prioridade,
                ["statecode"] = new OptionSetValue(0)
            };

        private static readonly string Blindado = F("cr40f_blindado", "igual", "true");

        [Fact]
        public void MenorPrioridadeVenceNuloPorUltimoEDesempatePorNome()
        {
            var vehicle = V(("cr40f_blindado", true));
            var semPrioridade = T("A sem prioridade", filtro: Blindado);
            var vinte = T("Vinte", filtro: Blindado, prioridade: 20);
            var dez = T("Dez", filtro: Blindado, prioridade: 10);
            var padrao = T("Padrão", padrao: true);
            Assert.Same(dez, ChecklistFactory.ResolveTemplate(new[] { semPrioridade, vinte, padrao, dez }, vehicle));
            Assert.Same(vinte, ChecklistFactory.ResolveTemplate(new[] { semPrioridade, vinte, padrao }, vehicle));
            Assert.Same(semPrioridade, ChecklistFactory.ResolveTemplate(new[] { padrao, semPrioridade }, vehicle));

            var beta = T("beta", filtro: Blindado, prioridade: 10);
            var alfa = T("ALFA", filtro: Blindado, prioridade: 10);
            Assert.Same(alfa, ChecklistFactory.ResolveTemplate(new[] { beta, alfa, padrao }, vehicle));
        }

        [Fact]
        public void MesmaPrioridadeENomeDesempataPeloIdEmTextoMinusculoOrdinal()
        {
            var vehicle = V(("cr40f_blindado", true));
            var nove = T("Blindados", filtro: Blindado, prioridade: 10);
            nove.Id = new Guid("00000009-0000-0000-0000-000000000000");
            var letra = T("blindados", filtro: Blindado, prioridade: 10);
            letra.Id = new Guid("0000000A-0000-0000-0000-000000000000");
            // "00000009-..." < "0000000a-..." comparando o texto "D" (minúsculo) ordinalmente, como a Gestão.
            Assert.Same(nove, ChecklistFactory.ResolveTemplate(new[] { letra, nove }, vehicle));
            Assert.Same(nove, ChecklistFactory.ResolveTemplate(new[] { nove, letra }, vehicle));
        }

        [Fact]
        public void ModeloQueNaoCasaEhPuladoParaOProximo()
        {
            var vehicle = V(("cr40f_blindado", true));
            var volvo = T("Volvo", filtro: F("cr40f_marca", "igual", "\"Volvo\""), prioridade: 1);
            var blindados = T("Blindados", filtro: Blindado, prioridade: 2);
            Assert.Same(blindados, ChecklistFactory.ResolveTemplate(new[] { volvo, blindados, T("Padrão", padrao: true) }, vehicle));
        }

        [Fact]
        public void ModeloNaoPadraoSemFiltroNuncaEhEscolhido()
        {
            var padrao = T("Padrão", padrao: true);
            var semFiltro = T("Avulso", prioridade: 1);
            var listaVazia = T("Lista vazia", filtro: "{\"condicoes\":[]}", prioridade: 1);
            Assert.Same(padrao, ChecklistFactory.ResolveTemplate(new[] { semFiltro, listaVazia, padrao }, V()));
            Assert.Null(ChecklistFactory.ResolveTemplate(new[] { semFiltro, listaVazia, padrao }, V(("new_categoriadoveiculo", new OptionSetValue(Terceiro)))));
        }

        [Fact]
        public void PadraoSoParaProprioAtivoEIgnoraFiltroDoPadrao()
        {
            var padrao = T("Padrão", padrao: true, filtro: F("cr40f_marca", "igual", "\"Volvo\""));
            Assert.Same(padrao, ChecklistFactory.ResolveTemplate(new[] { padrao }, V(("cr40f_marca", "Mercedes"))));
            Assert.Null(ChecklistFactory.ResolveTemplate(new[] { padrao }, V(("new_categoriadoveiculo", new OptionSetValue(Aluguel)))));
            Assert.Null(ChecklistFactory.ResolveTemplate(new[] { padrao }, V(("cr40f_statusdoveiculo", new OptionSetValue(202410002)))));
        }

        [Fact]
        public void FiltroAlcancaTerceiroEAluguel()
        {
            var terceiros = T("Terceiros", filtro: F("new_categoriadoveiculo", "em", "[100000001,100000002]"), prioridade: 5);
            var vehicle = V(("new_categoriadoveiculo", new OptionSetValue(Aluguel)));
            Assert.Same(terceiros, ChecklistFactory.ResolveTemplate(new[] { terceiros, T("Padrão", padrao: true) }, vehicle));
        }

        [Fact]
        public void VendidoEInativoFicamForaDoUniverso()
        {
            var tudo = T("Tudo", filtro: F("cr40f_blindado", "igual", "false"), prioridade: 1);
            var templates = new[] { tudo, T("Padrão", padrao: true) };
            Assert.Null(ChecklistFactory.ResolveTemplate(templates, V(("cr40f_statusdoveiculo", new OptionSetValue(Vendido)))));
            Assert.Null(ChecklistFactory.ResolveTemplate(templates, V(("statecode", new OptionSetValue(1)))));
            // Status vazio não é Vendido.
            Assert.Same(tudo, ChecklistFactory.ResolveTemplate(templates, V(("cr40f_statusdoveiculo", null))));
        }
    }
}
