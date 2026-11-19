# Nota do motorista em tabela — plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** gravar diariamente no Dataverse (`new_notamotorista`) a nota de condução da Infleet de cada motorista: 90 dias, por mês e por dia. O App Motoristas passa a ler dessa tabela.

**Arquitetura:**
- A Custom API `new_SincronizarNotasInfleet`, no assembly `Betinhos.DriverRecordSharing`, consulta a Infleet em lotes de 15 períodos e faz upsert pela chave alternativa `new_chave`.
- Um flow diário às 05:00 chama essa Custom API. Um script faz a carga retroativa.
- A `new_NotaInfleet` deixa de chamar a Infleet e monta o mesmo contrato JSON (schema 1) a partir da tabela, com `sincronizadoEm`.

**Stack:** C# net462 (plugin, xUnit), PowerShell 5.1/pwsh (migration, registro, carga, flow), React/TS (App, vitest).

**Spec:** `docs/superpowers/specs/2026-11-19-nota-motorista-tabela-design.md`

## Restrições globais
- **Ambientes:** DEV é `https://org23b93544.crm2.dynamics.com`. O PROD é somente leitura e recebe pelas soluções. A carga no PROD só roda com pedido explícito do Renan.
- **Schema:** só por migration em `packages/deploy/migrations/`. O arquivo tem BOM UTF-8 e comentários em ASCII. É idempotente, sem `-Apply` faz dry-run, e não se edita depois de publicado.
- **Token:** `infleet.token` da `cr40f_segredo`, via `InfleetGraphQlGateway.ReadToken`. Nunca aparece em log, trace ou resposta.
- **Limites da Infleet** (medidos em 19/11/2026):
  - complexidade máxima de 300 por chamada; cada período com os 16 campos custa 19, então cabem **15 períodos por chamada**;
  - cada chamada leva ~3,3 s;
  - o plugin para antes de 100 s.
- **Chaves e choices:**
  - chave `<cr40f_funcionariosid>|90d`, `|AAAA-MM` ou `|AAAA-MM-DD`;
  - choice `new_periodo`: 100000000 = 90 dias, 100000001 = Mês, 100000002 = Dia;
  - choice `new_situacao`: 100000000 = Ok, 100000001 = Em formação;
  - situação Ok só quando km ≥ 50 e a nota não é nula; em formação, `new_nota` fica vazia.
- **Contrato do App:** `schema` 1, com o campo opcional novo `sincronizadoEm` (ISO UTC). Os 5 comportamentos de condução aparecem sempre; os outros, só abaixo de 100.
- **Mensagens:**
  - commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - o PR vai para a `develop` e o corpo termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Repositório público:** sem e-mail, segredo nem dado de motorista no código. Destinatários entram por parâmetro.
- **Rodar só do checkout principal na `develop`:** o registro da Custom API, a carga e o flow novo. Nunca de worktree.

## Mapa de arquivos
| Arquivo | Papel |
|---|---|
| `packages/plugins/Betinhos.DriverRecordSharing/NotaSync.cs` (novo) | Lógica pura: janelas, itens, lotes, consulta GraphQL e entidade de upsert |
| `.../SincronizarNotasInfleetPlugin.cs` (novo) | Custom API `new_SincronizarNotasInfleet` |
| `.../NotaInfleet.cs` | Remove a consulta à Infleet e ganha `MontarDaTabela` |
| `.../NotaInfleetPlugin.cs` | Lê a tabela |
| `.../README.md` | Linha da Custom API nova |
| `packages/plugins/Betinhos.DriverRecordSharing.Tests/NotaSyncTests.cs` (novo), `SincronizarNotasInfleetPluginTests.cs` (novo), `NotaInfleetTests.cs`, `NotaInfleetPluginTests.cs` | Testes |
| `packages/deploy/migrations/20261119-2000-tabela-nota-motorista.ps1` (novo) | Tabela, colunas, lookup, chave e leitura |
| `packages/plugins/scripts/register-sincronizarnotas-customapi.ps1` (novo) | Plugin type, Custom API e 3 parâmetros |
| `packages/deploy/carga-notas-infleet.ps1` (novo) | Carga retroativa |
| `packages/deploy/flows/nota-motorista-diario.json` (novo), `provision-flow-nota-motorista.ps1` (novo), `flows-dev.mjs`, `flows-dev.test.mjs` | Flow das 05:00 |
| `apps/motoristas/src/features/minha-nota/notaInfleet.ts`, `notaCache.ts`, `MinhaNotaScreen.tsx`, `minhaNota.css`, `apps/motoristas/tests/notaInfleet.test.ts` | App |
| `.claude/skills/verificar-minha-nota/SKILL.md`, `.claude/skills/verificar-nota-motorista-sync/SKILL.md` (nova) | Verificação |

Testes do plugin: `dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --filter <Classe>`. No desktop Linux, antes, rode `export DOTNET_ROOT=$HOME/.dotnet PATH=$HOME/.dotnet:$PATH`. Se o net462 não rodar no Linux, use o job `plugins` do CI, que roda no PR.

---

### Tarefa 1: `NotaSync` (lógica pura)

**Arquivos:** criar `NotaSync.cs` e `NotaSyncTests.cs`.

**Interfaces produzidas:**
- `enum NotaTipo { Dias90 = 100000000, Mes = 100000001, Dia = 100000002 }`
- `class NotaJanela { NotaTipo Tipo; DateTime InicioUtc; DateTime FimUtc; DateTime DataLocal; string Sufixo }`
- `class NotaMotorista { Guid Id; string Nome; string InfleetId }`
- `class NotaItem { string Alias; NotaMotorista Motorista; NotaJanela Janela }`
- `static class NotaSync`, com:
  - `Tabela`, `PeriodosPorChamada = 15`, `SituacaoOk`, `SituacaoEmFormacao`, `Conducao`, `ColunasConducao`;
  - `Janelas(DateTime agoraUtc, DateTime? ateLocal, int meses, int dias)`;
  - `Itens(IEnumerable<NotaMotorista>, IReadOnlyList<NotaJanela>)`;
  - `Lotes(IReadOnlyList<NotaItem>)`;
  - `Consulta(IEnumerable<NotaItem>)`;
  - `Entidade(NotaItem, Dictionary<string, object> perfil, DateTime agoraUtc)`, que devolve `Entity` ou `null`.

- [ ] **Passo 1: testes que falham** (`NotaSyncTests.cs`)

```csharp
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
```

- [ ] **Passo 2:** `dotnet test ... --filter NotaSyncTests`. Esperado: não compila (`NotaSync` não existe).

- [ ] **Passo 3: implementação** (`NotaSync.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    public enum NotaTipo { Dias90 = 100000000, Mes = 100000001, Dia = 100000002 }

    public sealed class NotaJanela
    {
        public NotaTipo Tipo;
        public DateTime InicioUtc;
        public DateTime FimUtc;
        public DateTime DataLocal; // dia, ou 1º do mês; sem uso na 90 dias

        public string Sufixo =>
            Tipo == NotaTipo.Dias90 ? "90d" : DataLocal.ToString(Tipo == NotaTipo.Mes ? "yyyy-MM" : "yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    public sealed class NotaMotorista { public Guid Id; public string Nome; public string InfleetId; }

    public sealed class NotaItem { public string Alias; public NotaMotorista Motorista; public NotaJanela Janela; }

    // Lógica pura da sincronização da nota (Custom API new_SincronizarNotasInfleet). Sem rede nem Dataverse.
    public static class NotaSync
    {
        public const string Tabela = "new_notamotorista";
        public const int PeriodosPorChamada = 15; // complexidade 19 por período; a Infleet recusa acima de 300
        public const int SituacaoOk = 100000000;
        public const int SituacaoEmFormacao = 100000001;
        public static readonly string[] Conducao = { "hardBraking", "hardCornering", "hardAcceleration", "deviceOverspeed", "deviceIdle" };
        public static readonly string[] ColunasConducao = { "new_frenagem", "new_curva", "new_aceleracao", "new_velocidade", "new_motorocioso" };
        private const int OffsetSaoPauloHoras = -3; // sem horário de verão

        private static DateTime Utc(DateTime diaLocal) => DateTime.SpecifyKind(diaLocal.AddHours(-OffsetSaoPauloHoras), DateTimeKind.Utc);

        // Sem ateLocal: rodada diária, até ontem (São Paulo), com a linha 90 dias. Com ateLocal: carga retroativa, sem 90 dias.
        public static List<NotaJanela> Janelas(DateTime agoraUtc, DateTime? ateLocal, int meses, int dias)
        {
            var ate = (ateLocal ?? agoraUtc.AddHours(OffsetSaoPauloHoras).Date.AddDays(-1)).Date;
            var limite = Utc(ate.AddDays(1));
            var lista = new List<NotaJanela>();
            if (ateLocal == null)
                lista.Add(new NotaJanela { Tipo = NotaTipo.Dias90, InicioUtc = agoraUtc.AddDays(-NotaInfleet.Dias), FimUtc = agoraUtc });
            var primeiro = new DateTime(ate.Year, ate.Month, 1);
            for (var k = 0; k < meses; k++)
            {
                var inicio = primeiro.AddMonths(-k);
                var fim = Utc(inicio.AddMonths(1));
                lista.Add(new NotaJanela { Tipo = NotaTipo.Mes, DataLocal = inicio, InicioUtc = Utc(inicio), FimUtc = fim > limite ? limite : fim });
            }
            for (var k = 0; k < dias; k++)
            {
                var dia = ate.AddDays(-k);
                lista.Add(new NotaJanela { Tipo = NotaTipo.Dia, DataLocal = dia, InicioUtc = Utc(dia), FimUtc = Utc(dia.AddDays(1)) });
            }
            return lista;
        }

        public static List<NotaItem> Itens(IEnumerable<NotaMotorista> motoristas, IReadOnlyList<NotaJanela> janelas)
        {
            var itens = new List<NotaItem>();
            foreach (var m in motoristas)
                foreach (var j in janelas)
                    itens.Add(new NotaItem { Alias = "a" + itens.Count.ToString(CultureInfo.InvariantCulture), Motorista = m, Janela = j });
            return itens;
        }

        public static List<List<NotaItem>> Lotes(IReadOnlyList<NotaItem> itens) =>
            itens.Select((item, i) => new { item, i }).GroupBy(x => x.i / PeriodosPorChamada).Select(g => g.Select(x => x.item).ToList()).ToList();

        public static string Consulta(IEnumerable<NotaItem> lote)
        {
            var campos = string.Join(" ", NotaInfleet.Comportamentos.Select(c => c.Key));
            var json = new JavaScriptSerializer();
            var sb = new StringBuilder("query { ");
            foreach (var i in lote)
                sb.Append(i.Alias).Append(": driverProfile(filters:{driverId:").Append(json.Serialize(i.Motorista.InfleetId.Trim()))
                  .Append(", period:{startAt:\"").Append(Iso(i.Janela.InicioUtc)).Append("\", endAt:\"").Append(Iso(i.Janela.FimUtc))
                  .Append("\"}}) { distanceTraveled currentDriverGrades { generalGrade ").Append(campos).Append(" } } ");
            return sb.Append("}").ToString();
        }

        // null = não grava (dia ou mês sem km). A 90 dias sempre grava, para a linha nunca ficar velha.
        public static Entity Entidade(NotaItem item, Dictionary<string, object> perfil, DateTime agoraUtc)
        {
            var km = Num(perfil, "distanceTraveled") ?? 0;
            if (km <= 0 && item.Janela.Tipo != NotaTipo.Dias90) return null;
            var grades = perfil != null && perfil.TryGetValue("currentDriverGrades", out var g) ? g as Dictionary<string, object> : null;
            var geral = Num(grades, "generalGrade");
            var ok = km >= NotaInfleet.KmMinimo && geral != null;

            var e = new Entity(Tabela, "new_chave", item.Motorista.Id.ToString() + "|" + item.Janela.Sufixo);
            e["new_name"] = item.Motorista.Nome + " · " + (item.Janela.Tipo == NotaTipo.Dias90 ? "90 dias" : item.Janela.Sufixo);
            e["new_motorista"] = new EntityReference(PluginConfig.EmployeeTable, item.Motorista.Id);
            e["new_periodo"] = new OptionSetValue((int)item.Janela.Tipo);
            e["new_data"] = item.Janela.Tipo == NotaTipo.Dias90 ? (DateTime?)null : item.Janela.DataLocal;
            e["new_inicio"] = item.Janela.InicioUtc;
            e["new_fim"] = item.Janela.FimUtc;
            e["new_situacao"] = new OptionSetValue(ok ? SituacaoOk : SituacaoEmFormacao);
            e["new_nota"] = ok ? Dec(geral) : null;
            e["new_km"] = Dec(km);
            for (var k = 0; k < Conducao.Length; k++) e[ColunasConducao[k]] = Dec(Num(grades, Conducao[k]));
            var outros = NotaInfleet.Comportamentos.Where(c => !Conducao.Contains(c.Key))
                .Select(c => new { c.Key, Nota = Num(grades, c.Key) }).Where(x => x.Nota != null)
                .Select(x => new Dictionary<string, object> { ["chave"] = x.Key, ["nota"] = Math.Round(x.Nota.Value, 1) }).ToList();
            e["new_outroscomportamentos"] = new JavaScriptSerializer().Serialize(outros);
            e["new_sincronizadoem"] = agoraUtc;
            return e;
        }

        private static decimal? Dec(double? v) => v == null ? (decimal?)null : Math.Round((decimal)v.Value, 1);
        private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        private static double? Num(Dictionary<string, object> d, string k) =>
            d != null && d.TryGetValue(k, out var v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : (double?)null;
    }
}
```

- [ ] **Passo 4:** testes passam (`--filter NotaSyncTests`).
- [ ] **Passo 5:** commit: `feat(plugins): lógica da sincronização da nota da Infleet em tabela`.

### Tarefa 2: Custom API `new_SincronizarNotasInfleet`

**Arquivos:** criar `SincronizarNotasInfleetPlugin.cs` e `SincronizarNotasInfleetPluginTests.cs`.

**Interfaces:**
- **Consome** da Tarefa 1: `NotaSync.*`.
- **Produz:**
  - `SincronizarNotasInfleetPlugin.ApiName = "new_SincronizarNotasInfleet"`;
  - as entradas `Meses` (int, padrão 2), `Dias` (int, padrão 3) e `Ate` (DateTime, opcional), e a saída `new_Result` (JSON `{motoristas, periodos, gravadas, falhas:[funcionarioid], incompleto}`);
  - `static Dictionary<string, object> Rodar(IOrganizationService system, IReadOnlyList<NotaMotorista> motoristas, DateTime agoraUtc, DateTime? ate, int meses, int dias, Func<string, Dictionary<string, object>> consultar, Func<TimeSpan> decorrido, ITracingService tracing = null)`.

- [ ] **Passo 1: testes que falham**

```csharp
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
        public void Falha_de_um_lote_nao_para_os_outros()
        {
            var fake = new UpsertFake();
            var ms = Motoristas(5); // 30 períodos = 2 lotes
            var n = 0;
            var r = SincronizarNotasInfleetPlugin.Rodar(fake, ms, Agora, null, 2, 3,
                q => { if (n++ == 0) throw new InfleetUnavailableException("x"); return Tudo(q); }, () => TimeSpan.Zero);
            Assert.Equal(15, r["gravadas"]);
            Assert.Equal(3, ((List<string>)r["falhas"]).Count); // motoristas 0, 1 e 2 caíram no lote que falhou
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
```

O motorista 2 tem períodos nos dois lotes (os itens 12 a 17), então entra nas falhas. Isso é esperado: a próxima rodada regrava os períodos dele.

- [ ] **Passo 2:** os testes falham (a classe não existe).
- [ ] **Passo 3: implementação**

```csharp
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_SincronizarNotasInfleet: grava em new_notamotorista a nota da Infleet (90 dias, meses e dias) de cada motorista com id da Infleet.
    public sealed class SincronizarNotasInfleetPlugin : IPlugin
    {
        public const string ApiName = "new_SincronizarNotasInfleet";
        public const string ResultParameter = "new_Result";
        public const int MesesPadrao = 2;
        public const int DiasPadrao = 3;
        public static readonly TimeSpan LimiteExecucao = TimeSpan.FromSeconds(100); // o sandbox derruba em 120 s

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != ApiName) throw new InvalidPluginExecutionException("Mensagem não suportada pela sincronização da nota.");
            var relogio = Stopwatch.StartNew();
            var system = factory.CreateOrganizationService(null);

            InfleetGraphQlGateway gateway;
            try { gateway = new InfleetGraphQlGateway(InfleetGraphQlGateway.ReadToken(system, null, tracing)); }
            catch (InfleetUnavailableException error) { throw new InvalidPluginExecutionException(error.Message); }

            var resumo = Rodar(system, LerMotoristas(system), DateTime.UtcNow, Data(context, "Ate"),
                Inteiro(context, "Meses", MesesPadrao), Inteiro(context, "Dias", DiasPadrao),
                q => gateway.Query(q, null), () => relogio.Elapsed, tracing);
            context.OutputParameters[ResultParameter] = new JavaScriptSerializer().Serialize(resumo);
            tracing?.Trace("nota-sync: gravadas={0} falhas={1} incompleto={2}", resumo["gravadas"], ((List<string>)resumo["falhas"]).Count, resumo["incompleto"]);
        }

        public static Dictionary<string, object> Rodar(IOrganizationService system, IReadOnlyList<NotaMotorista> motoristas, DateTime agoraUtc, DateTime? ate,
            int meses, int dias, Func<string, Dictionary<string, object>> consultar, Func<TimeSpan> decorrido, ITracingService tracing = null)
        {
            var janelas = NotaSync.Janelas(agoraUtc, ate, meses, dias);
            var gravadas = 0;
            var falhas = new List<string>();
            var incompleto = false;
            foreach (var lote in NotaSync.Lotes(NotaSync.Itens(motoristas, janelas)))
            {
                if (decorrido() > LimiteExecucao) { incompleto = true; break; }
                Dictionary<string, object> data;
                try { data = consultar(NotaSync.Consulta(lote)); }
                catch (InfleetUnavailableException error)
                {
                    tracing?.Trace("nota-sync: lote falhou: " + error.Message);
                    falhas.AddRange(lote.Select(i => i.Motorista.Id.ToString()).Where(id => !falhas.Contains(id)));
                    continue;
                }
                foreach (var item in lote)
                {
                    var perfil = data != null && data.TryGetValue(item.Alias, out var v) ? v as Dictionary<string, object> : null;
                    var linha = NotaSync.Entidade(item, perfil, agoraUtc);
                    if (linha == null) continue;
                    system.Execute(new UpsertRequest { Target = linha });
                    gravadas++;
                }
            }
            return new Dictionary<string, object>
            {
                ["motoristas"] = motoristas.Count, ["periodos"] = janelas.Count, ["gravadas"] = gravadas, ["falhas"] = falhas, ["incompleto"] = incompleto
            };
        }

        private static IReadOnlyList<NotaMotorista> LerMotoristas(IOrganizationService system)
        {
            var q = new QueryExpression(PluginConfig.EmployeeTable) { ColumnSet = new ColumnSet(PluginConfig.EmployeeName, PluginConfig.EmployeeInfleetDriverId) };
            q.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.NotNull);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            return system.RetrieveMultiple(q).Entities
                .Select(e => new NotaMotorista { Id = e.Id, Nome = e.GetAttributeValue<string>(PluginConfig.EmployeeName) ?? "", InfleetId = e.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId) })
                .Where(m => !string.IsNullOrWhiteSpace(m.InfleetId)).ToList();
        }

        private static int Inteiro(IPluginExecutionContext c, string nome, int padrao) =>
            c.InputParameters.Contains(nome) && c.InputParameters[nome] is int v && v >= 0 ? v : padrao;

        private static DateTime? Data(IPluginExecutionContext c, string nome) =>
            c.InputParameters.Contains(nome) && c.InputParameters[nome] is DateTime v ? v.Date : (DateTime?)null;
    }
}
```

- [ ] **Passo 4:** testes passam.
- [ ] **Passo 5:** commit: `feat(plugins): Custom API new_SincronizarNotasInfleet`.

### Tarefa 3: `new_NotaInfleet` lê a tabela

**Arquivos:**
- modificar `NotaInfleet.cs`: remover `NotaPeriodo`, `Periodos`, `Consulta` e `Montar`; criar `MontarDaTabela`;
- modificar `NotaInfleetPlugin.cs`;
- reescrever `NotaInfleetTests.cs` e `NotaInfleetPluginTests.cs`, cujos testes de consulta saem.

**Interfaces:**
- `NotaInfleet.MontarDaTabela(Entity p90, IEnumerable<Entity> meses, DateTime agoraUtc)` devolve o contrato schema 1 com `sincronizadoEm`;
- `NotaInfleetPlugin.Resultado(string infleetDriverId, Entity p90, IEnumerable<Entity> meses, DateTime agoraUtc)` devolve uma string.

- [ ] **Passo 1: testes que falham** (`NotaInfleetTests.cs`, substitui o conteúdo)

```csharp
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
```

Em `NotaInfleetPluginTests.cs`, mantenha `Sem_id_nao_chama_infleet` adaptado: `Resultado("  ", null, new Entity[0], Agora)` devolve `sem_cadastro`. Acrescente um teste com id e linha 90d que devolve `"situacao":"ok"`. Os demais testes dependiam de `consultar` e saem.

- [ ] **Passo 2:** os testes falham.
- [ ] **Passo 3: implementação.** Em `NotaInfleet.cs`, remova `NotaPeriodo`, `Periodos`, `Consulta`, `Montar`, `Perfil`, `Grades`, `Km`, `Nota` e `Iso`, e acrescente:

```csharp
        // Contrato do App (schema 1) a partir das linhas de new_notamotorista: a 90 dias e as de Mês mais recentes.
        public static Dictionary<string, object> MontarDaTabela(Entity p90, IEnumerable<Entity> meses, DateTime agoraUtc)
        {
            if (p90 == null)
            {
                var vazio = Base("em_formacao", agoraUtc.AddDays(-Dias), agoraUtc);
                vazio["km"] = 0.0;
                return vazio;
            }
            var ok = p90.GetAttributeValue<OptionSetValue>("new_situacao")?.Value == NotaSync.SituacaoOk && p90.GetAttributeValue<decimal?>("new_nota") != null;
            var r = Base(ok ? "ok" : "em_formacao", p90.GetAttributeValue<DateTime>("new_inicio"), p90.GetAttributeValue<DateTime>("new_fim"));
            r["km"] = (double)(p90.GetAttributeValue<decimal?>("new_km") ?? 0);
            if (ok) r["nota"] = (double)p90.GetAttributeValue<decimal?>("new_nota").Value;
            var sinc = p90.GetAttributeValue<DateTime?>("new_sincronizadoem");
            if (sinc != null) r["sincronizadoEm"] = DateTime.SpecifyKind(sinc.Value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

            var notas = new Dictionary<string, double>();
            for (var k = 0; k < NotaSync.Conducao.Length; k++)
            {
                var n = p90.GetAttributeValue<decimal?>(NotaSync.ColunasConducao[k]);
                if (n != null) notas[NotaSync.Conducao[k]] = (double)n.Value;
            }
            var outros = p90.GetAttributeValue<string>("new_outroscomportamentos");
            if (!string.IsNullOrEmpty(outros))
                foreach (var o in new JavaScriptSerializer().Deserialize<List<Dictionary<string, object>>>(outros))
                    notas[(string)o["chave"]] = Convert.ToDouble(o["nota"], CultureInfo.InvariantCulture);
            r["comportamentos"] = Comportamentos.Select((c, i) => new { c, i }).Where(x => notas.ContainsKey(x.c.Key))
                .OrderBy(x => notas[x.c.Key]).ThenBy(x => x.i)
                .Select(x => new Dictionary<string, object> { ["chave"] = x.c.Key, ["rotulo"] = x.c.Value, ["nota"] = Math.Round(notas[x.c.Key], 1) }).ToList();

            r["meses"] = meses
                .Where(m => m.GetAttributeValue<OptionSetValue>("new_situacao")?.Value == NotaSync.SituacaoOk && m.GetAttributeValue<decimal?>("new_nota") != null)
                .OrderByDescending(m => m.GetAttributeValue<DateTime>("new_data")).Take(Meses).Reverse()
                .Select(m =>
                {
                    var d = m.GetAttributeValue<DateTime>("new_data");
                    return new Dictionary<string, object> { ["ano"] = d.Year, ["mes"] = d.Month, ["nota"] = (double)m.GetAttributeValue<decimal?>("new_nota").Value, ["km"] = (double)(m.GetAttributeValue<decimal?>("new_km") ?? 0) };
                }).ToList();
            return r;
        }
```

Acrescente `using Microsoft.Xrm.Sdk;` e `using System.Web.Script.Serialization;`. Em `NotaInfleetPlugin.cs`, troque o gateway por leitura:

```csharp
            var funcionario = system.Retrieve(driver.EmployeeReference.LogicalName, driver.EmployeeReference.Id, new ColumnSet(PluginConfig.EmployeeInfleetDriverId));
            var infleetId = funcionario.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId);
            var agora = DateTime.UtcNow;
            var linhas = string.IsNullOrWhiteSpace(infleetId) ? new List<Entity>() : Linhas(system, driver.EmployeeReference.Id, agora);
            context.OutputParameters[ResultParameter] = Resultado(infleetId,
                linhas.FirstOrDefault(l => l.GetAttributeValue<OptionSetValue>("new_periodo")?.Value == (int)NotaTipo.Dias90),
                linhas.Where(l => l.GetAttributeValue<OptionSetValue>("new_periodo")?.Value == (int)NotaTipo.Mes), agora);
```

```csharp
        public static string Resultado(string infleetDriverId, Entity p90, IEnumerable<Entity> meses, DateTime agoraUtc)
        {
            var serializer = new JavaScriptSerializer();
            return serializer.Serialize(string.IsNullOrWhiteSpace(infleetDriverId) ? NotaInfleet.SemCadastro(agoraUtc) : NotaInfleet.MontarDaTabela(p90, meses, agoraUtc));
        }

        private static List<Entity> Linhas(IOrganizationService system, Guid funcionarioId, DateTime agoraUtc)
        {
            var q = new QueryExpression(NotaSync.Tabela) { ColumnSet = new ColumnSet(true), TopCount = 50 };
            q.Criteria.AddCondition("new_motorista", ConditionOperator.Equal, funcionarioId);
            q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var periodo = q.Criteria.AddFilter(LogicalOperator.Or);
            periodo.AddCondition("new_periodo", ConditionOperator.Equal, (int)NotaTipo.Dias90);
            var mes = periodo.AddFilter(LogicalOperator.And);
            mes.AddCondition("new_periodo", ConditionOperator.Equal, (int)NotaTipo.Mes);
            mes.AddCondition("new_data", ConditionOperator.OnOrAfter, agoraUtc.AddMonths(-(NotaInfleet.Meses + 1)).Date);
            return system.RetrieveMultiple(q).Entities.ToList();
        }
```

Mantenha `NotaInfleetPluginTests`.

- [ ] **Passo 4:** todos os testes do projeto passam (`dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false`).
- [ ] **Passo 5:** atualize o `README.md` do plugin: na linha da `new_NotaInfleet`, "lê `new_notamotorista`"; acrescente a linha da `new_SincronizarNotasInfleet`. Commit: `feat(plugins): new_NotaInfleet lê a nota da tabela new_notamotorista`.

### Tarefa 4: migration da tabela

**Arquivo:** criar `packages/deploy/migrations/20261119-2000-tabela-nota-motorista.ps1`. Copie a estrutura de `20261116-1400-prova-midia.ps1`, que tem os mesmos helpers `Base`, `Texto`, `Decimal`, `DataHora` e `Escolha`. Escreva com BOM UTF-8.

- [ ] **Passo 1: conteúdo.** As diferenças em relação ao modelo:
  - `$table = "new_notamotorista"`, `SchemaName = "new_NotaMotorista"`, exibição "Nota do motorista" / "Notas dos motoristas", primária `new_Name` (100), `OrganizationOwned`;
  - leitores: `"Acesso-Betinhos-MDA"` e `"DEV - Usu$([char]0xE1)rio"`; o motorista fica sem privilégio;
  - a função de data só (comportamento DateOnly):

```powershell
function Data([string] $Schema, [string] $Nome, [string] $Desc) {
  $c = Base "DateTimeAttributeMetadata" $Schema $Nome $Desc; $c.Format = "DateOnly"; $c.DateTimeBehavior = @{ Value = "DateOnly" }; return $c
}
function TextoLongo([string] $Schema, [string] $Nome, [string] $Desc, [int] $Max) {
  $c = Base "MemoAttributeMetadata" $Schema $Nome $Desc; $c.MaxLength = $Max; $c.Format = "Text"; return $c
}
$colunas = @(
  (Texto "new_Chave" "Chave" "<funcionarioid>|90d, |AAAA-MM ou |AAAA-MM-DD. Chave alternativa do upsert." 100),
  (Escolha "PicklistAttributeMetadata" "new_Periodo" "Per$([char]0xED)odo" "" @("90 dias", "M$([char]0xEA)s", "Dia")),
  (Data "new_Data" "Data" "Dia (linhas Dia) ou 1o dia do m$([char]0xEA)s (linhas M$([char]0xEA)s)."),
  (DataHora "new_Inicio" "In$([char]0xED)cio" "In$([char]0xED)cio da janela consultada na Infleet."),
  (DataHora "new_Fim" "Fim" "Fim da janela consultada na Infleet."),
  (Escolha "PicklistAttributeMetadata" "new_Situacao" "Situa$([char]0xE7)$([char]0xE3)o" "Em forma$([char]0xE7)$([char]0xE3)o: menos de 50 km ou nota vazia na Infleet." @("Ok", "Em forma$([char]0xE7)$([char]0xE3)o")),
  (Decimal "new_Nota" "Nota" "Nota geral da Infleet (generalGrade)." 1 0 100),
  (Decimal "new_Km" "Km" "Km rodados no per$([char]0xED)odo." 1 0 10000000),
  (Decimal "new_Frenagem" "Frenagem brusca" "" 1 0 100),
  (Decimal "new_Curva" "Curva brusca" "" 1 0 100),
  (Decimal "new_Aceleracao" "Acelera$([char]0xE7)$([char]0xE3)o brusca" "" 1 0 100),
  (Decimal "new_Velocidade" "Excesso de velocidade" "" 1 0 100),
  (Decimal "new_MotorOcioso" "Motor ocioso" "" 1 0 100),
  (TextoLongo "new_OutrosComportamentos" "Outros comportamentos" "JSON [{chave, nota}] dos comportamentos de c$([char]0xE2)mera." 4000),
  (DataHora "new_SincronizadoEm" "Sincronizado em" "$([char]0xDA)ltima grava$([char]0xE7)$([char]0xE3)o pela sincroniza$([char]0xE7)$([char]0xE3)o.")
)
```

  - lookup: relação `cr40f_funcionarios_new_notamotorista_motorista`, `SchemaName = "new_Motorista"`, `Delete = "Cascade"` (a linha só existe para o motorista);
  - a chave alternativa, depois das colunas e antes de `Add-ComponenteNaSolucao`:

```powershell
$chaves = @(Get-Rows "EntityDefinitions(LogicalName='$table')/Keys" "MetadataId,LogicalName,EntityKeyIndexStatus" "LogicalName eq 'new_chave_unica'")
if ($chaves.Count -eq 0) {
  Invoke-Dv "POST" "EntityDefinitions(LogicalName='$table')/Keys" @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"; SchemaName = "new_chave_unica"; DisplayName = (Label "Chave"); KeyAttributes = @("new_chave")
  } | Out-Null
  Write-Step "criada a chave alternativa new_chave_unica (o indice fica Active em alguns minutos)"
}
```

O nome `new_chave_unica` precisa caber nas regras de SchemaName; confira na resposta. Se o `Get-Rows` não aceitar o caminho `/Keys` com filtro, use `Invoke-Dv GET` e filtre em PowerShell.
  - no fim: `Add-ComponenteNaSolucao $entidade[0].MetadataId 1`, `Publish-Tabela $table` e a leitura (Organização) para os leitores, como no modelo.

- [ ] **Passo 2:** dry-run local (só leitura) do checkout desta branch: `pwsh -NoProfile -File packages/deploy/migrations/20261119-2000-tabela-nota-motorista.ps1`. Esperado: "DRY RUN criaria a tabela new_notamotorista...". O `-Apply` fica com o Deploy.
- [ ] **Passo 3:** `node packages/deploy/migrations-ci.mjs` (ou o teste do CI que valida as migrations) passa.
- [ ] **Passo 4:** commit: `feat(schema): migration da tabela new_notamotorista`.

### Tarefa 5: registrar a Custom API

**Arquivo:** criar `packages/plugins/scripts/register-sincronizarnotas-customapi.ps1`. Copie `register-notainfleet-customapi.ps1` e troque:
- `TypeName` para `Betinhos.DriverRecordSharing.SincronizarNotasInfleetPlugin`;
- a API para `new_SincronizarNotasInfleet`, com um id fixo novo gerado com `[guid]::NewGuid()` e escrito no arquivo;
- `displayname` "Sincronizar notas dos motoristas (Infleet)" e a descrição.

Acrescente os 3 parâmetros de entrada, cada um com id fixo, `isoptional = $true` e `Add-ComponenteNaSolucao` com o ObjectTypeCode de `customapirequestparameter`:

```powershell
$Params = @(
  [pscustomobject]@{ Id = "<guid fixo 1>"; Name = "Meses"; Type = 7; Desc = "Meses fechados a regravar (padrao 2)." },
  [pscustomobject]@{ Id = "<guid fixo 2>"; Name = "Dias"; Type = 7; Desc = "Dias a regravar ate Ate (padrao 3)." },
  [pscustomobject]@{ Id = "<guid fixo 3>"; Name = "Ate"; Type = 1; Desc = "Ultimo dia (Sao Paulo); vazio = ontem, com a linha 90 dias." }
)
foreach ($p in $Params) {
  if (@(Get-Rows "customapirequestparameters" "customapirequestparameterid" "_customapiid_value eq $($Api.Id) and uniquename eq '$($p.Name)'").Count -eq 0) {
    Invoke-Dv "POST" "customapirequestparameters" @{
      customapirequestparameterid = $p.Id; uniquename = $p.Name; name = "$($Api.Name).$($p.Name)"; displayname = $p.Name
      description = $p.Desc; type = $p.Type; isoptional = $true; "CustomAPIId@odata.bind" = "/customapis($($Api.Id))"
    } | Out-Null
    Write-Step "criado o parametro $($p.Name)"
  }
}
```

Os GUIDs fixos são gerados na implementação e escritos literais no arquivo; o plano não os inventa.

- [ ] **Passo 1:** escreva o script. Rodar sem `-Apply` só é possível depois que o Deploy publicar o assembly; isso fica na Tarefa 10.
- [ ] **Passo 2:** commit: `feat(plugins): registro da Custom API new_SincronizarNotasInfleet`.

### Tarefa 6: carga retroativa

**Arquivo:** criar `packages/deploy/carga-notas-infleet.ps1`, com BOM UTF-8.

```powershell
param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $De = "",            # AAAA-MM-DD: ultimo dia da carga; vazio = anteontem (ontem vem da rodada diaria)
  [int] $MaxMeses = 36,
  [switch] $Prod                # obrigatorio para o PROD; so com pedido explicito do Renan
)
# Carga retroativa de new_notamotorista: chama new_SincronizarNotasInfleet para tras, mes a mes.
# Para cada mes: uma chamada com Meses=1, Dias=0 (linha do mes) e chamadas de ate 15 dias com Meses=0 (linhas Dia).
# Para depois de 2 meses seguidos sem linha gravada ou em MaxMeses. Idempotente (upsert pela chave).
# Uso: pwsh -NoProfile -File packages/deploy/carga-notas-infleet.ps1 [-De 2026-11-17] [-EnvironmentUrl <prod> -Prod]
$ErrorActionPreference = "Stop"
$hostAlvo = ([Uri]$EnvironmentUrl).Host
if ($hostAlvo -ne "org23b93544.crm2.dynamics.com" -and -not ($Prod -and $hostAlvo -eq "orgf261ae8e.crm2.dynamics.com")) { throw "Ambiente recusado: $hostAlvo (PROD exige -Prod)." }
$token = & az account get-access-token --resource "https://$hostAlvo/" --query accessToken -o tsv
if (-not $token) { throw "Sem token do Dataverse (az login)." }
$api = "https://$hostAlvo/api/data/v9.2/new_SincronizarNotasInfleet"

function Chamar([int] $Meses, [int] $Dias, [datetime] $Ate) {
  $corpo = @{ Meses = $Meses; Dias = $Dias; Ate = $Ate.ToString("yyyy-MM-dd") } | ConvertTo-Json -Compress
  for ($t = 1; $t -le 3; $t++) {
    try {
      $r = Invoke-RestMethod -Method Post -Uri $api -Headers @{ Authorization = "Bearer $token"; "OData-Version" = "4.0" } -ContentType "application/json" -Body $corpo -TimeoutSec 180
      $res = $r.new_Result | ConvertFrom-Json
      if ($res.incompleto) { throw "incompleto em Ate=$($Ate.ToString('yyyy-MM-dd')) Dias=$Dias; reduza a janela." }
      if ($res.falhas.Count) { Write-Host "  aviso: $($res.falhas.Count) motorista(s) com falha neste trecho" }
      return [int]$res.gravadas
    } catch { if ($t -eq 3) { throw }; Start-Sleep -Seconds (10 * $t) }
  }
}

$fim = if ($De) { [datetime]::ParseExact($De, "yyyy-MM-dd", $null) } else { (Get-Date).Date.AddDays(-2) }
$vazios = 0
for ($k = 0; $k -lt $MaxMeses -and $vazios -lt 2; $k++) {
  $inicioMes = (Get-Date -Year $fim.Year -Month $fim.Month -Day 1).Date.AddMonths(-$k)
  $ultimo = if ($k -eq 0) { $fim } else { $inicioMes.AddMonths(1).AddDays(-1) }
  $gravadas = Chamar 1 0 $ultimo
  $dia = $ultimo
  while ($dia -ge $inicioMes) {
    $n = [Math]::Min(15, ($dia - $inicioMes).Days + 1)
    $gravadas += Chamar 0 $n $dia
    $dia = $dia.AddDays(-$n)
  }
  Write-Host ("{0:yyyy-MM}: {1} linhas" -f $inicioMes, $gravadas)
  $vazios = if ($gravadas -eq 0) { $vazios + 1 } else { 0 }
}
```

Pode chamar com a data só (`yyyy-MM-dd`) porque o parâmetro `Ate` é DateTime: o Dataverse aceita, e o plugin usa `.Date`. Na Tarefa 10, confira que o dia não muda por fuso: com `Ate=2025-03-31`, as linhas Dia gravadas precisam ser 31, 30, 29... Se vier deslocado, mande `yyyy-MM-ddT12:00:00Z`.

- [ ] **Passo 1:** escreva o script.
- [ ] **Passo 2:** commit: `feat(deploy): carga retroativa das notas da Infleet`.

### Tarefa 7: flow das 05:00

**Arquivos:**
- criar `packages/deploy/flows/nota-motorista-diario.json`, a definição do Logic App, no mesmo formato de `flows/carro-atual.json`;
- criar `packages/deploy/provision-flow-nota-motorista.ps1`, copiado de `provision-flow-aniversariantes.ps1`, que cria ou atualiza, inclui na AppBetinhos e ativa;
- registrar o novo flow em `flows-dev.mjs` e `flows-dev.test.mjs`.

- [ ] **Passo 1: definição.** Gatilho e ações:
  - **Gatilho:** `Todo_dia_05h`, `{ "type": "Recurrence", "recurrence": { "frequency": "Day", "interval": 1, "timeZone": "E. South America Standard Time", "schedule": { "hours": ["5"], "minutes": [0] } } }`.
  - **`Sincronizar_notas`:** `PerformUnboundAction`, `actionName: "new_SincronizarNotasInfleet"`, sem parâmetros. Copie `host` e `authentication` de `Sincronizar_veiculo_atual`.
  - **`Resumo`:** `Compose` com `@json(outputs('Sincronizar_notas')?['body/new_Result'])`.
  - **`Alertar`:** `If`, depois de `Sincronizar_notas` (Succeeded, Failed, TimedOut). A condição é OR:
    - `@not(equals(outputs('Sincronizar_notas')?['statusCode'], 200))`;
    - `@greater(length(coalesce(outputs('Resumo')?['falhas'], json('[]'))), 0)`;
    - `@equals(outputs('Resumo')?['incompleto'], true)`.
  - **Dentro de `Alertar`:** `SendEmailV2` com `To = "__DESTINATARIOS__"`, assunto `[Infleet] Notas dos motoristas não sincronizaram por completo` e corpo com `@{outputs('Resumo')}` mais a mensagem de erro (`coalesce(outputs('Sincronizar_notas')?['body']?['error']?['message'], 'sem mensagem')`).
  - **`Manter_falha`:** `Terminate` Failed, quando a ação falhou, igual ao carro-atual, para o histórico ficar vermelho.
- [ ] **Passo 2: script.**
  - Parâmetros: `-Destinatarios` (obrigatório, mesmo `ValidatePattern` do aniversariantes), `-ReferenciaDataverse` e `-ReferenciaOutlook`.
  - Sem variável de ambiente nem `__SET_FUNCIONARIOS__`.
  - `$flowName = 'Infleet - Sincronizar notas dos motoristas'`. A descrição diz: "Todo dia às 05:00 grava em new_notamotorista a nota da Infleet (90 dias, meses e dias) e avisa por e-mail se algo falhar."
  - Mantém a trava de organização DEV (`OrganizationId`).
- [ ] **Passo 3: `flows-dev.mjs`.** Siga o padrão das entradas que criam e atualizam (como `aniversariantes`; confira se elas usam `apply: false` e argumentos `FLOW_*`):
  - `{ nome: 'nota-motorista', script: 'provision-flow-nota-motorista.ps1', flows: ['Infleet - Sincronizar notas dos motoristas'], arquivos: [script('nota-motorista'), flowsDir('nota-motorista-diario\\.json')] }`;
  - os destinatários entram pela variável `FLOW_NOTA_MOTORISTA_DESTINATARIOS` do environment `dev`, documentada na skill `verificar-deploy-dev`;
  - atualize as listas em `flows-dev.test.mjs`.
- [ ] **Passo 4:** `node --test packages/deploy/flows-dev.test.mjs` passa.
- [ ] **Passo 5:** commit: `feat(flows): flow diário das notas dos motoristas`.

### Tarefa 8: App lê `sincronizadoEm` e filtra a câmera

**Arquivos:** `notaInfleet.ts`, `notaCache.ts`, `MinhaNotaScreen.tsx`, `minhaNota.css` e `tests/notaInfleet.test.ts`.

**Interfaces produzidas:**
- `NotaInfleet` com `sincronizadoEm?: string` nos casos ok e em_formacao;
- `atualizadaEm(iso: string): string`, que devolve "Atualizada em 19/11 às 05:00".

- [ ] **Passo 1: testes que falham** (acrescente em `tests/notaInfleet.test.ts`)

```ts
import { atualizadaEm, lerNotaInfleet } from "../src/features/minha-nota/notaInfleet.ts";

describe("nota da tabela", () => {
  const base = { schema: 1, situacao: "ok", nota: 80, km: 100, periodo: { inicio: "2026-08-21", fim: "2026-11-19" }, meses: [] };

  it("lê sincronizadoEm e mostra em São Paulo", () => {
    const nota = lerNotaInfleet(JSON.stringify({ ...base, sincronizadoEm: "2026-11-19T08:00:05Z", comportamentos: [] }));
    expect(nota.situacao === "ok" && nota.sincronizadoEm).toBe("2026-11-19T08:00:05Z");
    expect(atualizadaEm("2026-11-19T08:00:05Z")).toBe("Atualizada em 19/11 às 05:00");
  });

  it("esconde comportamento de câmera com 100 e mantém os de condução", () => {
    const comportamentos = [
      { chave: "deviceIdle", rotulo: "Motor ocioso", nota: 100 },
      { chave: "usingPhone", rotulo: "Uso do celular", nota: 100 },
      { chave: "fatigue", rotulo: "Fadiga", nota: 80 }
    ];
    const nota = lerNotaInfleet(JSON.stringify({ ...base, comportamentos }));
    expect(nota.situacao === "ok" && nota.comportamentos.map((c) => c.chave)).toEqual(["deviceIdle", "fatigue"]);
  });
});
```

- [ ] **Passo 2:** `pnpm --filter motoristas exec vitest run tests/notaInfleet.test.ts` falha. Se o nome do filtro do pacote for outro, confira o `name` no `apps/motoristas/package.json`.
- [ ] **Passo 3: implementação**

Em `notaInfleet.ts`:
1. Acrescente `sincronizadoEm?: string` aos dois tipos.
2. Em `lerNotaInfleet`, monte a base assim:

```ts
  const sincronizadoEm = texto(bruto.sincronizadoEm) || undefined;
  const base = { inicio: texto(periodo.inicio), fim: texto(periodo.fim), km: num(bruto.km), comportamentos: comportamentos.filter((c) => c.chave in DICAS || c.nota < 100), meses, sincronizadoEm };
```

3. `DICAS` é `const` declarada abaixo, mas é lida em tempo de chamada, então o hoisting não quebra.
4. Acrescente a função:

```ts
const FMT_ATUALIZADA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function atualizadaEm(iso: string): string {
  const p = Object.fromEntries(FMT_ATUALIZADA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `Atualizada em ${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}
```

5. No `MOCK`, acrescente `sincronizadoEm: "2026-11-19T08:00:05Z"`.

Nos outros arquivos:
- `notaCache.ts`: `NOTA_CACHE_VALIDADE_MS = 60 * 60 * 1000`.
- `MinhaNotaScreen.tsx`: logo abaixo de cada `<span className="nota-periodo">` (linhas 54 e 59), acrescente `{nota.sincronizadoEm && <span className="nota-atualizada">{atualizadaEm(nota.sincronizadoEm)}</span>}`, com a variável do caso (`ok` ou `nota`) que o trecho já usa.
- `minhaNota.css`: `.nota-atualizada { display: block; font-size: var(--text-xs, 12px); color: var(--color-text-muted); }`. Confira os tokens que o arquivo já usa e repita os mesmos.

- [ ] **Passo 4:** os testes do arquivo e `pnpm --filter motoristas typecheck` passam.
- [ ] **Passo 5:** tire o print de `#/minha-nota` em mock, pela skill `print-ui` se o worktree não tiver `node_modules`, e mostre no chat.
- [ ] **Passo 6:** commit: `feat(motoristas): nota lida da tabela, com hora da atualização`.

### Tarefa 9: skills de verificação

- [ ] Em `.claude/skills/verificar-minha-nota/SKILL.md`:
  - a nota vem de `new_notamotorista`;
  - mostra "Atualizada em";
  - os comportamentos de câmera só aparecem abaixo de 100;
  - a prova no DEV: POST em `new_NotaInfleet` com `MSCRMCallerID` responde em < 1 s.
- [ ] Crie `.claude/skills/verificar-nota-motorista-sync/SKILL.md` (frontmatter `name` e `description` com gatilhos: mudança em `NotaSync.cs`, `SincronizarNotasInfleetPlugin.cs`, a migration, o flow ou a carga). Roteiro:
  1. Testes `NotaSyncTests` e `SincronizarNotasInfleetPluginTests`.
  2. No DEV, POST em `new_SincronizarNotasInfleet` com `{}`: o `new_Result` deve ter `gravadas > 0`, `falhas` vazio e `incompleto` false, em < 60 s.
  3. Conferir, para um motorista, as linhas `|90d`, `|AAAA-MM` e as de ontem contra uma consulta avulsa na Infleet do mesmo dia (Python, token lido da `cr40f_segredo` sem imprimir; header `User-Agent` obrigatório, senão dá 403).
  4. Histórico do flow verde às 05:00.
  5. Armadilhas:
     - complexidade 300 (15 períodos);
     - `Ate` com fuso;
     - chave alternativa que ainda não está Active faz o upsert falhar.
- [ ] Commit: `docs(skills): verificação da sincronização da nota`.

### Tarefa 10: qualidade, PR e prova no DEV

- [ ] Rode a `qualidade-antes-do-pr` (simplify + karpathy, pelo menos 2 passadas; `vercel-react-best-practices` no diff do App; `/code-review high --fix`) e depois a `verificacao-manter`.
- [ ] Abra o PR para a `develop` com a seção "Qualidade" e faça merge depois do CI verde. O Deploy aplica a migration e publica o assembly. No mesmo Deploy, a `new_NotaInfleet` passa a ler a tabela vazia: até a carga, o App mostra "em formação". Isso é aceitável no DEV e dura poucos minutos.
- [ ] No checkout principal, na `develop` atualizada:
  1. Confira a chave Active: `EntityDefinitions(LogicalName='new_notamotorista')/Keys`, com `EntityKeyIndexStatus` igual a `Active`.
  2. Rode `register-sincronizarnotas-customapi.ps1`, primeiro sem e depois com `-Apply`.
  3. Faça um POST em `new_SincronizarNotasInfleet` com `{}` e confira o resumo.
  4. Rode a carga: `carga-notas-infleet.ps1` (~1 h).
  5. Rode `provision-flow-nota-motorista.ps1 -Destinatarios <o do Renan>`.
  6. Prove o App: POST em `new_NotaInfleet` com `MSCRMCallerID` de um motorista real, em < 1 s e com `sincronizadoEm`.
- [ ] Registre na memória `score-motorista-infleet.md` e na wiki (`/wiki`). O PROD fica pendente: chega pelas soluções no próximo develop→main, e depois disso vêm a carga e o flow lá, com o pedido do Renan.
