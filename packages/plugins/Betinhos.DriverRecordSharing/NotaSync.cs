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
        public const int Dias = 90;
        public const double KmMinimo = 50;
        internal const int OffsetSaoPauloHoras = -3; // sem horário de verão
        // Instância nova por uso: o JavaScriptSerializer não garante thread-safety e o plugin é compartilhado entre execuções.
        internal static JavaScriptSerializer Json => new JavaScriptSerializer();

        private static DateTime Utc(DateTime diaLocal) => DateTime.SpecifyKind(diaLocal.AddHours(-OffsetSaoPauloHoras), DateTimeKind.Utc);

        // Sem ateLocal: rodada diária, até ontem (São Paulo), com a linha 90 dias. Com ateLocal: carga retroativa, sem 90 dias.
        public static List<NotaJanela> Janelas(DateTime agoraUtc, DateTime? ateLocal, int meses, int dias)
        {
            var ate = (ateLocal ?? agoraUtc.AddHours(OffsetSaoPauloHoras).Date.AddDays(-1)).Date;
            var limite = Utc(ate.AddDays(1));
            var lista = new List<NotaJanela>();
            if (ateLocal == null)
                lista.Add(new NotaJanela { Tipo = NotaTipo.Dias90, InicioUtc = agoraUtc.AddDays(-Dias), FimUtc = agoraUtc });
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

        public static List<NotaItem> Itens(IReadOnlyList<NotaMotorista> motoristas, IReadOnlyList<NotaJanela> janelas)
        {
            var itens = new List<NotaItem>();
            // Janela por fora: a 90 dias de todos sai antes dos dias, então rodada cortada pelo tempo não deixa sempre os mesmos motoristas sem nota atual.
            foreach (var j in janelas)
                foreach (var m in motoristas)
                    itens.Add(new NotaItem { Alias = "a" + itens.Count.ToString(CultureInfo.InvariantCulture), Motorista = m, Janela = j });
            return itens;
        }

        public static List<List<NotaItem>> Lotes(IReadOnlyList<NotaItem> itens) =>
            itens.Select((item, i) => new { item, i }).GroupBy(x => x.i / PeriodosPorChamada).Select(g => g.Select(x => x.item).ToList()).ToList();

        public static string Consulta(IEnumerable<NotaItem> lote)
        {
            var campos = string.Join(" ", NotaInfleet.Comportamentos.Select(c => c.Key));
            var json = Json;
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
            var ok = km >= KmMinimo && geral != null;

            var e = new Entity(Tabela, "new_chave", item.Motorista.Id.ToString() + "|" + item.Janela.Sufixo);
            var nome = item.Motorista.Nome + " · " + (item.Janela.Tipo == NotaTipo.Dias90 ? "90 dias" : item.Janela.Sufixo);
            e["new_name"] = nome.Length > 100 ? nome.Substring(0, 100) : nome; // new_name tem 100 caracteres; nome longo derrubaria o upsert
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
            e["new_outroscomportamentos"] = Json.Serialize(outros);
            e["new_sincronizadoem"] = agoraUtc;
            return e;
        }

        private static decimal? Dec(double? v) => v == null ? (decimal?)null : Math.Round((decimal)v.Value, 1);
        private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        private static double? Num(Dictionary<string, object> d, string k) =>
            d != null && d.TryGetValue(k, out var v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : (double?)null;
    }
}
