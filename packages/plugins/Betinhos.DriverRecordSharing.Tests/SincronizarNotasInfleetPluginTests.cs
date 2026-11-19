using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public class SincronizarNotasInfleetPluginTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);

        // Guarda os upserts por chave (o segundo com a mesma chave substitui o primeiro, como no Dataverse).
        private sealed class UpsertFake : IOrganizationService
        {
            public readonly Dictionary<string, Entity> Linhas = new Dictionary<string, Entity>();
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                var alvo = ((UpsertRequest)request).Target;
                Linhas[(string)alvo.KeyAttributes["new_chave"]] = alvo;
                return new UpsertResponse();
            }
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
        }

        private static List<NotaMotorista> Motoristas(int n) =>
            Enumerable.Range(0, n).Select(i => new NotaMotorista { Id = Guid.NewGuid(), Nome = "M" + i, InfleetId = "d" + i }).ToList();

        // Responde a cada alias da consulta com 100 km e nota 90.
        private static Dictionary<string, object> Tudo(string query) =>
            System.Text.RegularExpressions.Regex.Matches(query, @"(a\d+): driverProfile").Cast<System.Text.RegularExpressions.Match>()
                .ToDictionary(m => m.Groups[1].Value, m => (object)new Dictionary<string, object>
                {
                    ["distanceTraveled"] = 100.0,
                    ["currentDriverGrades"] = new Dictionary<string, object> { ["generalGrade"] = 90.0 }
                });

        [Fact]
        public void Ate_omitido_chega_como_ano_1_e_vale_como_ausente()
        {
            var p = new ParameterCollection { ["Ate"] = DateTime.MinValue };
            Assert.Null(SincronizarNotasInfleetPlugin.Data(p, "Ate"));
            Assert.Null(SincronizarNotasInfleetPlugin.Data(new ParameterCollection(), "Ate"));
            p["Ate"] = new DateTime(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);
            Assert.Equal(new DateTime(2026, 11, 18), SincronizarNotasInfleetPlugin.Data(p, "Ate"));
        }

        [Fact]
        public void Grava_todas_as_janelas_e_e_idempotente()
        {
            var fake = new UpsertFake();
            var ms = Motoristas(3);
            var chamadas = 0;
            Func<string, Dictionary<string, object>> consultar = q => { chamadas++; return Tudo(q); };
            var r1 = SincronizarNotasInfleetPlugin.Rodar(fake, ms, Agora, null, 2, 3, consultar, () => TimeSpan.Zero);
            var r2 = SincronizarNotasInfleetPlugin.Rodar(fake, ms, Agora, null, 2, 3, consultar, () => TimeSpan.Zero);
            Assert.Equal(18, r1["gravadas"]);
            Assert.Equal(18, fake.Linhas.Count); // segunda rodada não duplica
            Assert.Equal(4, chamadas); // 18 períodos = 2 lotes por rodada
            Assert.Equal(false, r2["incompleto"]);
        }

        [Fact]
        public void Lote_que_falha_e_refeito_item_a_item()
        {
            var fake = new UpsertFake();
            var n = 0;
            var r = SincronizarNotasInfleetPlugin.Rodar(fake, Motoristas(5), Agora, null, 2, 3,
                q => { if (n++ == 0) throw new InfleetUnavailableException("x"); return Tudo(q); }, () => TimeSpan.Zero);
            Assert.Equal(30, r["gravadas"]);
            Assert.Empty((List<string>)r["falhas"]);
        }

        [Fact]
        public void Id_invalido_so_derruba_o_proprio_motorista()
        {
            var fake = new UpsertFake();
            var ms = Motoristas(5);
            var r = SincronizarNotasInfleetPlugin.Rodar(fake, ms, Agora, null, 2, 3,
                q => { if (q.Contains("\"d2\"")) throw new InfleetUnavailableException("x"); return Tudo(q); }, () => TimeSpan.Zero);
            Assert.Equal(24, r["gravadas"]);
            Assert.Equal(new List<string> { ms[2].Id.ToString() }, (List<string>)r["falhas"]);
        }

        [Fact]
        public void Noventa_dias_de_todos_saem_no_primeiro_lote()
        {
            var itens = NotaSync.Itens(Motoristas(5), NotaSync.Janelas(Agora, null, 2, 3));
            Assert.All(itens.Take(5), i => Assert.Equal(NotaTipo.Dias90, i.Janela.Tipo));
        }

        [Fact]
        public void Para_antes_do_limite_e_marca_incompleto()
        {
            var fake = new UpsertFake();
            var r = SincronizarNotasInfleetPlugin.Rodar(fake, Motoristas(5), Agora, null, 2, 3, Tudo, () => TimeSpan.FromSeconds(101));
            Assert.Equal(0, r["gravadas"]);
            Assert.Equal(true, r["incompleto"]);
        }
    }
}
