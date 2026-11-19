using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Lógica pura da Custom API new_NotaInfleet: monta a resposta a partir de new_notamotorista. Sem rede.
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
    }
}
