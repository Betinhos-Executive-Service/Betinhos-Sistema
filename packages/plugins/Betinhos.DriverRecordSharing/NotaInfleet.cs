using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    public sealed class NotaPeriodo
    {
        public string Alias;
        public DateTime InicioUtc;
        public DateTime FimUtc;
        public int Ano;
        public int Mes; // 0 no p90
    }

    // Lógica pura da Custom API new_NotaInfleet: períodos, consulta GraphQL e montagem da resposta. Sem rede.
    public static class NotaInfleet
    {
        public const int Schema = 1;
        public const int Dias = 90;
        public const int Meses = 6;
        public const double KmMinimo = 50;
        private const int OffsetSaoPauloHoras = -3; // sem horário de verão

        public static readonly IReadOnlyList<KeyValuePair<string, string>> Comportamentos = new List<KeyValuePair<string, string>>
        {
            new KeyValuePair<string, string>("hardAcceleration", "Aceleração brusca"),
            new KeyValuePair<string, string>("hardBraking", "Frenagem brusca"),
            new KeyValuePair<string, string>("hardCornering", "Curva brusca"),
            new KeyValuePair<string, string>("deviceOverspeed", "Excesso de velocidade"),
            new KeyValuePair<string, string>("deviceIdle", "Motor ocioso"),
            new KeyValuePair<string, string>("usingPhone", "Uso do celular"),
            new KeyValuePair<string, string>("fatigue", "Fadiga"),
            new KeyValuePair<string, string>("distraction", "Distração"),
            new KeyValuePair<string, string>("seatbeltUnbuckled", "Cinto desafivelado"),
            new KeyValuePair<string, string>("smoking", "Cigarro"),
            new KeyValuePair<string, string>("eyesClosed", "Olhos fechados"),
            new KeyValuePair<string, string>("yawning", "Bocejo"),
            new KeyValuePair<string, string>("forwardCollision", "Risco de colisão frontal"),
            new KeyValuePair<string, string>("laneDeparture", "Saída de faixa"),
            new KeyValuePair<string, string>("vehicleTooClose", "Distância do veículo à frente")
        };

        public static IReadOnlyList<NotaPeriodo> Periodos(DateTime agoraUtc)
        {
            var lista = new List<NotaPeriodo>
            {
                new NotaPeriodo { Alias = "p90", InicioUtc = agoraUtc.AddDays(-Dias), FimUtc = agoraUtc }
            };
            var local = agoraUtc.AddHours(OffsetSaoPauloHoras);
            var primeiro = new DateTime(local.Year, local.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            for (var k = 0; k < Meses; k++)
            {
                var inicioLocal = primeiro.AddMonths(-k);
                lista.Add(new NotaPeriodo
                {
                    Alias = "m" + k.ToString(CultureInfo.InvariantCulture),
                    InicioUtc = inicioLocal.AddHours(-OffsetSaoPauloHoras),
                    FimUtc = k == 0 ? agoraUtc : primeiro.AddMonths(-(k - 1)).AddHours(-OffsetSaoPauloHoras),
                    Ano = inicioLocal.Year,
                    Mes = inicioLocal.Month
                });
            }
            return lista;
        }

        public static string Consulta(IReadOnlyList<NotaPeriodo> periodos)
        {
            var campos = string.Join(" ", Comportamentos.Select(c => c.Key));
            var sb = new StringBuilder("query($d: ID!) { ");
            foreach (var p in periodos)
                sb.Append(p.Alias).Append(": driverProfile(filters:{driverId:$d, period:{startAt:\"").Append(Iso(p.InicioUtc))
                  .Append("\", endAt:\"").Append(Iso(p.FimUtc)).Append("\"}}) { distanceTraveled currentDriverGrades { generalGrade ")
                  .Append(campos).Append(" } } ");
            return sb.Append("}").ToString();
        }

        public static Dictionary<string, object> Montar(Dictionary<string, object> data, IReadOnlyList<NotaPeriodo> periodos)
        {
            var p90 = periodos.First(p => p.Alias == "p90");
            var perfil = Perfil(data, "p90");
            var km = Km(perfil);
            var grades = Grades(perfil);
            var geral = Nota(grades, "generalGrade");
            var resultado = Base("ok", p90.InicioUtc, p90.FimUtc);
            resultado["km"] = Math.Round(km, 1);

            if (km < KmMinimo || geral == null) resultado["situacao"] = "em_formacao";
            else resultado["nota"] = Math.Round(geral.Value, 1);

            var comps = new List<Dictionary<string, object>>();
            foreach (var c in Comportamentos)
            {
                var n = Nota(grades, c.Key);
                if (n == null) continue;
                comps.Add(new Dictionary<string, object> { ["chave"] = c.Key, ["rotulo"] = c.Value, ["nota"] = Math.Round(n.Value, 1) });
            }
            resultado["comportamentos"] = comps.Select((c, i) => new { c, i }).OrderBy(x => (double)x.c["nota"]).ThenBy(x => x.i).Select(x => x.c).ToList();

            var meses = new List<Dictionary<string, object>>();
            foreach (var p in periodos.Where(x => x.Alias != "p90").OrderBy(x => x.InicioUtc))
            {
                var mp = Perfil(data, p.Alias);
                var mk = Km(mp);
                var mn = Nota(Grades(mp), "generalGrade");
                if (mk <= 0 || mn == null) continue;
                meses.Add(new Dictionary<string, object> { ["ano"] = p.Ano, ["mes"] = p.Mes, ["nota"] = Math.Round(mn.Value, 1), ["km"] = Math.Round(mk, 1) });
            }
            resultado["meses"] = meses;
            return resultado;
        }

        public static Dictionary<string, object> SemCadastro(DateTime agoraUtc)
            => Base("sem_cadastro", agoraUtc.AddDays(-Dias), agoraUtc);

        private static Dictionary<string, object> Base(string situacao, DateTime inicioUtc, DateTime fimUtc) => new Dictionary<string, object>
        {
            ["schema"] = Schema,
            ["situacao"] = situacao,
            ["periodo"] = new Dictionary<string, object> { ["inicio"] = DiaSp(inicioUtc), ["fim"] = DiaSp(fimUtc) },
            ["comportamentos"] = new List<Dictionary<string, object>>(),
            ["meses"] = new List<Dictionary<string, object>>()
        };

        private static string DiaSp(DateTime utc) => utc.AddHours(OffsetSaoPauloHoras).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

        private static Dictionary<string, object> Perfil(Dictionary<string, object> data, string alias) =>
            data != null && data.TryGetValue(alias, out var v) ? v as Dictionary<string, object> : null;

        private static Dictionary<string, object> Grades(Dictionary<string, object> perfil) =>
            perfil != null && perfil.TryGetValue("currentDriverGrades", out var v) ? v as Dictionary<string, object> : null;

        private static double Km(Dictionary<string, object> perfil) =>
            perfil != null && perfil.TryGetValue("distanceTraveled", out var v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : 0;

        private static double? Nota(Dictionary<string, object> grades, string chave) =>
            grades != null && grades.TryGetValue(chave, out var v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : (double?)null;
    }
}
