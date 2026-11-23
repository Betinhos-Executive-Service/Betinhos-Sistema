using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class NotaSyncTests
    {
        // 19/11/2026 08:00 UTC = 05:00 em São Paulo.
        private static readonly DateTime Agora = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
        private static readonly NotaMotorista M = new NotaMotorista { Id = new Guid("11111111-1111-1111-1111-111111111111"), Nome = "Fulano", InfleetId = " drv1 " };

        [Fact]
        public void Rodada_diaria_tem_90d_dois_meses_e_tres_dias_ate_ontem()
        {
            var j = NotaSync.Janelas(Agora, null, 2, 3);
            Assert.Equal(new[] { "90d", "2026-11", "2026-10", "2026-11-18", "2026-11-17", "2026-11-16" }, j.Select(x => x.Sufixo));
            var ontem = j.Single(x => x.Sufixo == "2026-11-18");
            Assert.Equal(new DateTime(2026, 11, 18, 3, 0, 0, DateTimeKind.Utc), ontem.InicioUtc);
            Assert.Equal(new DateTime(2026, 11, 19, 3, 0, 0, DateTimeKind.Utc), ontem.FimUtc);
            // Mês corrente fecha no fim de ontem, não agora.
            Assert.Equal(new DateTime(2026, 11, 19, 3, 0, 0, DateTimeKind.Utc), j.Single(x => x.Sufixo == "2026-11").FimUtc);
            Assert.Equal(new DateTime(2026, 11, 1, 3, 0, 0, DateTimeKind.Utc), j.Single(x => x.Sufixo == "2026-10").FimUtc);
        }

        [Fact]
        public void Dia_1_nao_cria_o_mes_que_comecou_agora()
        {
            var j = NotaSync.Janelas(new DateTime(2026, 12, 1, 8, 0, 0, DateTimeKind.Utc), null, 2, 1);
            Assert.Equal(new[] { "90d", "2026-11", "2026-10", "2026-11-30" }, j.Select(x => x.Sufixo));
        }

        [Fact]
        public void Com_ate_nao_grava_90d()
        {
            var j = NotaSync.Janelas(Agora, new DateTime(2025, 3, 31), 1, 2);
            Assert.Equal(new[] { "2025-03", "2025-03-31", "2025-03-30" }, j.Select(x => x.Sufixo));
        }

        [Fact]
        public void Lotes_de_15_e_consulta_com_id_entre_aspas()
        {
            var ms = Enumerable.Range(0, 4).Select(i => new NotaMotorista { Id = Guid.NewGuid(), Nome = "M" + i, InfleetId = "d\"" + i }).ToList();
            var itens = NotaSync.Itens(ms, NotaSync.Janelas(Agora, null, 2, 3));
            var lotes = NotaSync.Lotes(itens);
            Assert.Equal(new[] { 15, 9 }, lotes.Select(l => l.Count));
            var q = NotaSync.Consulta(lotes[0]);
            Assert.StartsWith("query { a0: driverProfile(filters:{driverId:\"d\\\"0\"", q);
            Assert.Contains("generalGrade hardAcceleration", q);
        }

        private static NotaItem Item(string sufixo) =>
            NotaSync.Itens(new[] { M }, NotaSync.Janelas(Agora, null, 2, 3)).Single(i => i.Janela.Sufixo == sufixo);

        private static Dictionary<string, object> Perfil(double km, double? geral) => new Dictionary<string, object>
        {
            ["distanceTraveled"] = km,
            ["currentDriverGrades"] = new Dictionary<string, object> { ["generalGrade"] = geral, ["hardBraking"] = 70.04, ["usingPhone"] = 100, ["fatigue"] = null }
        };

        [Fact]
        public void Dia_ok_preenche_colunas_e_json()
        {
            var e = NotaSync.Entidade(Item("2026-11-18"), Perfil(259.33, 19.79), Agora);
            Assert.Equal("11111111-1111-1111-1111-111111111111|2026-11-18", e.KeyAttributes["new_chave"]);
            Assert.Equal("Fulano · 2026-11-18", e["new_name"]);
            Assert.Equal(100000002, ((OptionSetValue)e["new_periodo"]).Value);
            Assert.Equal(new DateTime(2026, 11, 18), e["new_data"]);
            Assert.Equal(NotaSync.SituacaoOk, ((OptionSetValue)e["new_situacao"]).Value);
            Assert.Equal(19.8m, e["new_nota"]);
            Assert.Equal(259.3m, e["new_km"]);
            Assert.Equal(70.0m, e["new_frenagem"]);
            Assert.Null(e["new_curva"]);
            Assert.Equal("[{\"chave\":\"usingPhone\",\"nota\":100}]", e["new_outroscomportamentos"]);
            Assert.Equal(Agora, e["new_sincronizadoem"]);
        }

        [Fact]
        public void Dia_sem_km_nao_grava_e_com_km_sem_nota_fica_em_formacao()
        {
            Assert.Null(NotaSync.Entidade(Item("2026-11-17"), Perfil(0, null), Agora));
            Assert.Null(NotaSync.Entidade(Item("2026-11-17"), null, Agora));
            var e = NotaSync.Entidade(Item("2026-11-17"), Perfil(42.1, null), Agora);
            Assert.Equal(NotaSync.SituacaoEmFormacao, ((OptionSetValue)e["new_situacao"]).Value);
            Assert.Null(e["new_nota"]);
        }

        [Fact]
        public void Noventa_dias_grava_mesmo_sem_km()
        {
            var e = NotaSync.Entidade(Item("90d"), null, Agora);
            Assert.Equal("Fulano · 90 dias", e["new_name"]);
            Assert.Null(e["new_data"]);
            Assert.Equal(0m, e["new_km"]);
            Assert.Equal(NotaSync.SituacaoEmFormacao, ((OptionSetValue)e["new_situacao"]).Value);
        }
    }
}
