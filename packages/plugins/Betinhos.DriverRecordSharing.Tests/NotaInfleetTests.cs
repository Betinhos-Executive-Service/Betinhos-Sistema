using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class NotaInfleetTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 11, 19, 15, 0, 0, DateTimeKind.Utc);

        private static Entity Linha(int situacao, decimal? nota, decimal km, DateTime? data = null)
        {
            var e = new Entity(NotaSync.Tabela);
            e["new_situacao"] = new OptionSetValue(situacao);
            e["new_nota"] = nota; e["new_km"] = km; e["new_data"] = data;
            e["new_inicio"] = new DateTime(2026, 8, 21, 8, 0, 0, DateTimeKind.Utc);
            e["new_fim"] = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
            e["new_sincronizadoem"] = new DateTime(2026, 11, 19, 8, 0, 5, DateTimeKind.Utc);
            e["new_frenagem"] = 67.0m; e["new_curva"] = null; e["new_aceleracao"] = 90.5m; e["new_velocidade"] = 96m; e["new_motorocioso"] = 100m;
            e["new_outroscomportamentos"] = "[{\"chave\":\"usingPhone\",\"nota\":100},{\"chave\":\"fatigue\",\"nota\":80}]";
            return e;
        }

        [Fact]
        public void Monta_ok_com_comportamentos_ordenados_e_sincronizado_em()
        {
            var r = NotaInfleet.MontarDaTabela(Linha(NotaSync.SituacaoOk, 82.9m, 5156.2m), new Entity[0], Agora);
            Assert.Equal("ok", r["situacao"]);
            Assert.Equal(82.9, r["nota"]);
            Assert.Equal("2026-11-19T08:00:05Z", r["sincronizadoEm"]);
            Assert.Equal("2026-08-21", ((Dictionary<string, object>)r["periodo"])["inicio"]);
            var comps = (List<Dictionary<string, object>>)r["comportamentos"];
            Assert.Equal(new[] { "hardBraking", "fatigue", "hardAcceleration", "deviceOverspeed", "deviceIdle", "usingPhone" }, comps.Select(c => (string)c["chave"]));
            Assert.Equal("Fadiga", comps[1]["rotulo"]);
        }

        [Fact]
        public void Meses_so_ok_em_ordem_crescente()
        {
            var meses = new[]
            {
                Linha(NotaSync.SituacaoOk, 92.4m, 1220m, new DateTime(2026, 11, 1)),
                Linha(NotaSync.SituacaoEmFormacao, null, 20m, new DateTime(2026, 9, 1)),
                Linha(NotaSync.SituacaoOk, 88.7m, 3402m, new DateTime(2026, 10, 1))
            };
            var r = NotaInfleet.MontarDaTabela(Linha(NotaSync.SituacaoOk, 90m, 100m), meses, Agora);
            var lista = (List<Dictionary<string, object>>)r["meses"];
            Assert.Equal(new[] { 10, 11 }, lista.Select(m => (int)m["mes"]));
            Assert.Equal(88.7, lista[0]["nota"]);
        }

        [Fact]
        public void Sem_linha_90d_fica_em_formacao_com_zero_km()
        {
            var r = NotaInfleet.MontarDaTabela(null, new Entity[0], Agora);
            Assert.Equal("em_formacao", r["situacao"]);
            Assert.Equal(0.0, r["km"]);
            Assert.False(r.ContainsKey("sincronizadoEm"));
        }

        [Fact]
        public void Em_formacao_nao_tem_nota()
        {
            var r = NotaInfleet.MontarDaTabela(Linha(NotaSync.SituacaoEmFormacao, null, 32.4m), new Entity[0], Agora);
            Assert.Equal("em_formacao", r["situacao"]);
            Assert.False(r.ContainsKey("nota"));
        }
    }
}
