using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class NotaInfleetPluginTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 11, 19, 15, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void Sem_id_devolve_sem_cadastro()
        {
            var json = NotaInfleetPlugin.Resultado("  ", null, new Entity[0], Agora);
            Assert.Contains("\"situacao\":\"sem_cadastro\"", json);
        }

        [Fact]
        public void Com_id_e_linha_90d_devolve_ok()
        {
            var p90 = new Entity(NotaSync.Tabela);
            p90["new_situacao"] = new OptionSetValue(NotaSync.SituacaoOk);
            p90["new_nota"] = 88m;
            p90["new_km"] = 200m;
            p90["new_inicio"] = new DateTime(2026, 8, 21, 8, 0, 0, DateTimeKind.Utc);
            p90["new_fim"] = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
            var json = NotaInfleetPlugin.Resultado(" abc ", p90, new Entity[0], Agora);
            Assert.Contains("\"situacao\":\"ok\"", json);
            Assert.Contains("\"nota\":88", json);
        }
    }
}
