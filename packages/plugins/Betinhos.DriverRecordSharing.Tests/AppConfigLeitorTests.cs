using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    /// <summary>
    /// Leitor da configuração do App no DriverRecordSharing: lê os mesmos casos compartilhados (packages/app-config/casos.json)
    /// que o TypeScript e o Cr40f.Acesso.Plugin, e prova o legado (colunas da ficha) e a cópia idêntica do resolvedor.
    /// </summary>
    public sealed class AppConfigLeitorTests
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static Dictionary<string, object> Arquivo() => (Dictionary<string, object>)Json.DeserializeObject(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "casos.json")));
        private static object[] Casos() => (object[])Arquivo()["casos"];
        private static Dictionary<string, object> Obj(object o) => (Dictionary<string, object>)o;
        public static IEnumerable<object[]> Indices() => Enumerable.Range(0, Casos().Length).Select(i => new object[] { i });

        private static DateTime Agora(string hoje) => DateTime.SpecifyKind(DateTime.Parse(hoje + "T15:00:00"), DateTimeKind.Utc);

        private sealed class Mundo
        {
            public readonly ChecklistFakeService Service = new ChecklistFakeService();
            public Entity Ficha;
            private int ordem;

            public Mundo(int? vinculo = 0, bool colunaQr = false, bool colunaRecibo = false)
            {
                Ficha = Service.Driver("Motorista", "m@exemplo.test", null, null);
                if (vinculo.HasValue) Ficha["cr40f_tipodevinculo"] = new OptionSetValue(vinculo.Value);
                Ficha["cr40f_podecobrarqrcode"] = colunaQr;
                Ficha["cr40f_gerarrecibopersonalizado"] = colunaRecibo;
            }

            public void Publicar(string conteudo, int numero = 1) => Service.Rows("cr40f_appconfigversao").Add(new Entity("cr40f_appconfigversao", Guid.NewGuid())
            {
                ["cr40f_numero"] = numero, ["cr40f_estado"] = new OptionSetValue(100000001), ["cr40f_conteudo"] = conteudo
            });

            public void Linha(int tipo, string chave = null, bool ligado = false, string validade = null, bool encerrada = false)
            {
                var linha = new Entity("cr40f_appconfigpessoa", Guid.NewGuid())
                {
                    ["cr40f_funcionario"] = Ficha.ToEntityReference(), ["cr40f_tipo"] = new OptionSetValue(tipo),
                    ["cr40f_chave"] = chave, ["cr40f_ligado"] = ligado, ["createdon"] = new DateTime(2026, 11, 1).AddMinutes(ordem++)
                };
                if (validade != null) linha["cr40f_validade"] = DateTime.Parse(validade);
                if (encerrada) linha["cr40f_encerradoem"] = new DateTime(2026, 11, 2);
                Service.Rows("cr40f_appconfigpessoa").Add(linha);
            }

            public bool Ligado(string chave, string hoje = "2026-11-23") => new AppConfigLeitor(Service, () => Agora(hoje)).Ligado(Ficha.Id, chave);
        }

        private static string ParaJson(object matriz) => matriz == null ? null : Json.Serialize(matriz);

        [Theory]
        [MemberData(nameof(Indices))]
        public void Casos_compartilhados(int indice)
        {
            var caso = Obj(Casos()[indice]);
            var pessoa = Obj(caso["pessoa"]);
            var mundo = new Mundo(pessoa.ContainsKey("vinculo") ? (int?)Convert.ToInt32(pessoa["vinculo"]) : null);
            if (caso["matriz"] != null) mundo.Publicar(ParaJson(caso["matriz"]));
            if (pessoa.ContainsKey("piloto") && pessoa["piloto"] is bool piloto && piloto) mundo.Linha(100000001);
            if (pessoa.ContainsKey("excecoes"))
                foreach (var item in ((object[])pessoa["excecoes"]).Select(Obj))
                    mundo.Linha(100000000, (string)item["chave"], (bool)item["ligado"], item.ContainsKey("validade") ? item["validade"] as string : null, item.ContainsKey("encerrada") && item["encerrada"] is bool enc && enc);
            foreach (var par in Obj(caso["esperado"]))
                Assert.True((bool)par.Value == mundo.Ligado(par.Key, (string)caso["hoje"]), (string)caso["nome"] + " / " + par.Key);
        }

        // ---- legado: a coluna da ficha vale exceção "ligado" só sem linha da chave ----

        [Fact]
        public void Legado_coluna_sim_sem_linha_liga()
        {
            var mundo = new Mundo(colunaQr: true, colunaRecibo: true);
            Assert.True(mundo.Ligado("services.qrCharge"));
            Assert.True(mundo.Ligado("services.personalReceipt"));
        }

        [Fact]
        public void Legado_coluna_sim_com_excecao_desligando_fica_desligado()
        {
            var mundo = new Mundo(colunaQr: true);
            mundo.Linha(100000000, "services.qrCharge", ligado: false);
            Assert.False(mundo.Ligado("services.qrCharge"));
        }

        [Fact]
        public void Legado_coluna_sim_com_excecao_encerrada_segue_a_matriz()
        {
            var mundo = new Mundo(colunaQr: true);
            mundo.Linha(100000000, "services.qrCharge", ligado: false, encerrada: true);
            Assert.False(mundo.Ligado("services.qrCharge"));
            mundo.Publicar("{\"proprio\":{\"services.qrCharge\":true},\"terceiro\":{}}");
            Assert.True(mundo.Ligado("services.qrCharge"));
        }

        [Fact]
        public void Legado_coluna_nao_segue_a_matriz()
        {
            var mundo = new Mundo(colunaQr: false);
            Assert.False(mundo.Ligado("services.qrCharge"));
            mundo.Publicar("{\"proprio\":{\"services.qrCharge\":true},\"terceiro\":{}}");
            Assert.True(mundo.Ligado("services.qrCharge"));
        }

        [Fact]
        public void Versao_publicada_mais_recente_vale()
        {
            var mundo = new Mundo();
            mundo.Publicar("{\"proprio\":{\"multas\":true},\"terceiro\":{}}", 1);
            mundo.Publicar("{\"proprio\":{\"multas\":false},\"terceiro\":{}}", 2);
            Assert.False(mundo.Ligado("multas"));
        }

        // ---- cópias do resolvedor ----

        [Fact]
        public void Resolvedor_e_identico_nos_dois_assemblies()
        {
            var acesso = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "copias", "acesso", "AppConfigResolver.cs"));
            var driver = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "copias", "driver", "AppConfigResolver.cs"));
            Assert.True(acesso.SequenceEqual(driver), "Cr40f.Acesso.Plugin/AppConfigResolver.cs e Betinhos.DriverRecordSharing/AppConfigResolver.cs precisam ser idênticos.");
        }
    }
}
