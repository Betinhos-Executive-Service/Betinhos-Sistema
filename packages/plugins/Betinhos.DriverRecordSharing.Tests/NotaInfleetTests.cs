using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class NotaInfleetTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 11, 19, 15, 0, 0, DateTimeKind.Utc);

        private static Dictionary<string, object> Perfil(double km, double? geral, params (string chave, double? nota)[] notas)
        {
            var g = new Dictionary<string, object> { ["generalGrade"] = geral };
            foreach (var (chave, nota) in notas) g[chave] = nota;
            return new Dictionary<string, object> { ["distanceTraveled"] = km, ["currentDriverGrades"] = g };
        }

        private static List<Dictionary<string, object>> Lista(object o) => ((IEnumerable<object>)o).Cast<Dictionary<string, object>>().ToList();

        [Fact]
        public void Periodos_p90_e_seis_meses()
        {
            var p = NotaInfleet.Periodos(Agora);
            Assert.Equal(7, p.Count);
            Assert.Equal(new[] { "p90", "m0", "m1", "m2", "m3", "m4", "m5" }, p.Select(x => x.Alias).ToArray());
            Assert.Equal(Agora.AddDays(-90), p[0].InicioUtc);
            Assert.Equal(Agora, p[0].FimUtc);
            Assert.Equal(new DateTime(2026, 11, 1, 3, 0, 0, DateTimeKind.Utc), p[1].InicioUtc);
            Assert.Equal(Agora, p[1].FimUtc);
            Assert.Equal((2026, 11), (p[1].Ano, p[1].Mes));
            Assert.Equal(new DateTime(2026, 10, 1, 3, 0, 0, DateTimeKind.Utc), p[2].InicioUtc);
            Assert.Equal(new DateTime(2026, 11, 1, 3, 0, 0, DateTimeKind.Utc), p[2].FimUtc);
            Assert.Equal(6, p[6].Mes);
        }

        [Fact]
        public void Periodos_viram_o_ano()
        {
            var p = NotaInfleet.Periodos(new DateTime(2027, 1, 10, 12, 0, 0, DateTimeKind.Utc));
            Assert.Equal((2026, 12), (p[2].Ano, p[2].Mes));
            Assert.Equal((2026, 11), (p[3].Ano, p[3].Mes));
            Assert.Equal(new DateTime(2027, 1, 1, 3, 0, 0, DateTimeKind.Utc), p[2].FimUtc);
        }

        [Fact]
        public void Consulta_tem_aliases_e_datas()
        {
            var q = NotaInfleet.Consulta(NotaInfleet.Periodos(Agora));
            Assert.Contains("p90: driverProfile", q);
            Assert.Contains("m5: driverProfile", q);
            Assert.Contains("\"2026-11-01T03:00:00Z\"", q);
            Assert.Contains("generalGrade", q);
            Assert.Contains("vehicleTooClose", q);
            Assert.Contains("$d", q);
            Assert.Contains("$d: ID!", q);
        }

        [Fact]
        public void Montar_ok()
        {
            var p = NotaInfleet.Periodos(Agora);
            var data = new Dictionary<string, object>
            {
                ["p90"] = Perfil(5156.24, 82.88, ("hardBraking", 67), ("hardAcceleration", 90.5), ("usingPhone", null)),
                ["m0"] = Perfil(100, 99.8),
                ["m1"] = Perfil(0, null)
            };
            var r = NotaInfleet.Montar(data, p);
            Assert.Equal("ok", r["situacao"]);
            Assert.Equal(1, r["schema"]);
            Assert.Equal(82.9, r["nota"]);
            Assert.Equal(5156.2, r["km"]);
            var c = Lista(r["comportamentos"]);
            Assert.Equal(new[] { "hardBraking", "hardAcceleration" }, c.Select(x => (string)x["chave"]).ToArray());
            Assert.Equal("Frenagem brusca", c[0]["rotulo"]);
            Assert.Equal(67.0, c[0]["nota"]);
            Assert.Equal(90.5, c[1]["nota"]);
            var m = Assert.Single(Lista(r["meses"]));
            Assert.Equal(2026, m["ano"]);
            Assert.Equal(11, m["mes"]);
            Assert.Equal(99.8, m["nota"]);
            Assert.Equal(100.0, m["km"]);
            var per = (Dictionary<string, object>)r["periodo"];
            Assert.Equal("2026-08-21", per["inicio"]);
            Assert.Equal("2026-11-19", per["fim"]);
        }

        [Fact]
        public void Montar_em_formacao_por_km()
        {
            var r = NotaInfleet.Montar(new Dictionary<string, object> { ["p90"] = Perfil(30, 95) }, NotaInfleet.Periodos(Agora));
            Assert.Equal("em_formacao", r["situacao"]);
            Assert.False(r.ContainsKey("nota"));
        }

        [Fact]
        public void Montar_em_formacao_por_nota_nula()
        {
            var r = NotaInfleet.Montar(new Dictionary<string, object> { ["p90"] = Perfil(500, null) }, NotaInfleet.Periodos(Agora));
            Assert.Equal("em_formacao", r["situacao"]);
            Assert.False(r.ContainsKey("nota"));
        }

        [Fact]
        public void Montar_sem_alias()
        {
            var r = NotaInfleet.Montar(new Dictionary<string, object>(), NotaInfleet.Periodos(Agora));
            Assert.Equal("em_formacao", r["situacao"]);
            Assert.Equal(0.0, r["km"]);
            Assert.Empty(Lista(r["comportamentos"]));
            Assert.Empty(Lista(r["meses"]));
        }

        [Fact]
        public void Montar_meses_cronologicos()
        {
            var data = new Dictionary<string, object>
            {
                ["p90"] = Perfil(300, 80),
                ["m0"] = Perfil(10, 90), ["m1"] = Perfil(10, 80), ["m2"] = Perfil(10, 70)
            };
            var r = NotaInfleet.Montar(data, NotaInfleet.Periodos(Agora));
            Assert.Equal(new[] { 9, 10, 11 }, Lista(r["meses"]).Select(x => (int)x["mes"]).ToArray());
        }

        [Fact]
        public void Montar_aceita_decimal_e_int()
        {
            var g = new Dictionary<string, object> { ["generalGrade"] = 80m, ["hardBraking"] = 70 };
            var r = NotaInfleet.Montar(new Dictionary<string, object> { ["p90"] = new Dictionary<string, object> { ["distanceTraveled"] = 120, ["currentDriverGrades"] = g } }, NotaInfleet.Periodos(Agora));
            Assert.Equal("ok", r["situacao"]);
            Assert.Equal(80.0, r["nota"]);
        }

        [Fact]
        public void SemCadastro_formato()
        {
            var r = NotaInfleet.SemCadastro(Agora);
            Assert.Equal("sem_cadastro", r["situacao"]);
            Assert.Equal(1, r["schema"]);
            Assert.Empty(Lista(r["comportamentos"]));
            Assert.Empty(Lista(r["meses"]));
            Assert.Equal("2026-11-19", ((Dictionary<string, object>)r["periodo"])["fim"]);
        }
    }
}
