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
        public void Sem_id_nao_chama_infleet()
        {
            var json = NotaInfleetPlugin.Resultado("  ", Agora, (q, v) => { Assert.Fail("não deveria consultar"); return null; });
            Assert.Contains("\"situacao\":\"sem_cadastro\"", json);
        }

        [Fact]
        public void Com_id_passa_variavel_d_e_monta()
        {
            Dictionary<string, object> capturadas = null;
            var json = NotaInfleetPlugin.Resultado(" abc ", Agora, (q, v) =>
            {
                capturadas = v;
                return new Dictionary<string, object>
                {
                    ["p90"] = new Dictionary<string, object>
                    {
                        ["distanceTraveled"] = 200,
                        ["currentDriverGrades"] = new Dictionary<string, object> { ["generalGrade"] = 88 }
                    }
                };
            });
            Assert.Equal("abc", capturadas["d"]);
            Assert.Contains("\"situacao\":\"ok\"", json);
            Assert.Contains("\"nota\":88", json);
        }

        [Fact]
        public void Infleet_fora_vira_mensagem_curta()
        {
            var ex = Assert.Throws<InvalidPluginExecutionException>(() =>
                NotaInfleetPlugin.Resultado("abc", Agora, (q, v) => throw new InfleetUnavailableException("HTTP 401 token xyz")));
            Assert.Equal("Não foi possível consultar a Infleet agora.", ex.Message);
            Assert.DoesNotContain("xyz", ex.Message);
        }
    }
}
