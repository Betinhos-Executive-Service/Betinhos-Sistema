using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Postos com o R$/litro pago pela frota, agrupados pelo CNPJ lido do cupom. Distância e semáforo ficam no app,
    // que é quem conhece a posição do motorista. Os abastecimentos saem sem dados de motorista; as avaliações, assinadas, vêm de PostoAvaliacoes.
    public static class FuelRanking
    {
        public const int JanelaDias = 30;
        private const int MaxHistorico = 5;
        private const int DiasConvite = 7;

        // Defesa até o flow de IA parar de gravar o CNPJ do destinatário do cupom: a própria empresa não é posto.
        private static readonly string[] RaizesProprias = { "07108241", "24484228" };
        private static readonly int[] Pesos1 = { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
        private static readonly int[] Pesos2 = { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };

        public sealed class Abastecimento
        {
            public string Cnpj, Nome;
            public decimal Valor, Litros;
            public DateTime DataUtc;
            public Guid MotoristaId; // Só para achar o último abastecimento do próprio motorista; nunca vai na resposta.
        }

        public sealed class Local
        {
            public double Lat, Lon;
            public bool Aproximada;
            public string Endereco;
            public Guid PostoId;
        }

        private static string NormalizarCnpj(string bruto)
        {
            var d = FuelRepository.DigitsOnly(bruto);
            if (d.Length != 14 || d.All(c => c == d[0])) return null;
            return Digito(d, Pesos1) == d[12] - '0' && Digito(d, Pesos2) == d[13] - '0' ? d : null;
        }

        private static int Digito(string d, int[] pesos)
        {
            var resto = pesos.Select((p, i) => (d[i] - '0') * p).Sum() % 11;
            return resto < 2 ? 0 : 11 - resto;
        }

        private static bool Valido(Abastecimento a, string cnpj) =>
            cnpj != null && !RaizesProprias.Contains(cnpj.Substring(0, 8)) && FuelMath.PricePerLiter(a.Valor, a.Litros) != null;

        private static string NomeMaisFrequente(IEnumerable<string> nomes) =>
            nomes.Select(t => (t ?? "").Trim()).Where(t => t.Length > 0)
                .GroupBy(t => t).OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal)
                .Select(g => g.Key).FirstOrDefault() ?? "Posto sem nome";

        private static IEnumerable<IGrouping<string, Abastecimento>> PorPosto(IEnumerable<Abastecimento> abastecimentos) =>
            abastecimentos
                .Select(a => new { a, cnpj = NormalizarCnpj(a.Cnpj) })
                .Where(x => Valido(x.a, x.cnpj))
                .GroupBy(x => x.cnpj, x => x.a);

        public static IList<string> Cnpjs(IEnumerable<Abastecimento> abastecimentos) => PorPosto(abastecimentos).Select(g => g.Key).ToList();

        // Convida para avaliar o posto do abastecimento mais recente do motorista que ele ainda não avaliou.
        // O posto pode estar fora da lista por falta de coordenada: para avaliar, basta ele existir.
        public static Dictionary<string, object> Convite(IEnumerable<Abastecimento> abastecimentos, IDictionary<string, Guid> postos, ICollection<Guid> jaAvaliados, Guid motoristaId, DateTime nowUtc)
        {
            var desde = nowUtc.AddDays(-DiasConvite);
            var candidato = PorPosto(abastecimentos)
                .Where(g => postos.ContainsKey(g.Key) && !jaAvaliados.Contains(postos[g.Key]))
                .Select(g => new { g, Ultimo = g.Where(a => a.MotoristaId == motoristaId && a.DataUtc >= desde).Select(a => (DateTime?)a.DataUtc).Max() })
                .Where(x => x.Ultimo != null)
                .OrderByDescending(x => x.Ultimo)
                .FirstOrDefault();
            if (candidato == null) return null;
            return new Dictionary<string, object>
            {
                ["postoId"] = postos[candidato.g.Key].ToString(),
                ["nome"] = NomeMaisFrequente(candidato.g.Select(a => a.Nome)),
                ["data"] = FuelRepository.LocalDay(candidato.Ultimo.Value)
            };
        }

        // Posto sem local conhecido fica de fora: sem coordenada não há como dizer se está perto.
        public static IList<Dictionary<string, object>> Montar(IEnumerable<Abastecimento> abastecimentos, IDictionary<string, Local> locais, Func<Guid, Dictionary<string, object>> avaliacoesDe = null) =>
            PorPosto(abastecimentos)
                .Where(g => locais.ContainsKey(g.Key))
                .Select(g => new Dictionary<string, object>
                {
                    ["postoId"] = avaliacoesDe == null ? null : locais[g.Key].PostoId.ToString(),
                    ["nome"] = NomeMaisFrequente(g.Select(a => a.Nome)),
                    ["precoLitro"] = Math.Round(g.Sum(a => a.Valor) / g.Sum(a => a.Litros), 2, MidpointRounding.AwayFromZero),
                    ["abastecimentos"] = g.Count(),
                    ["ultimoAbastecimento"] = FuelRepository.LocalDay(g.Max(a => a.DataUtc)),
                    ["lat"] = locais[g.Key].Lat,
                    ["lon"] = locais[g.Key].Lon,
                    ["aproximada"] = locais[g.Key].Aproximada,
                    ["endereco"] = locais[g.Key].Endereco,
                    ["avaliacoes"] = avaliacoesDe?.Invoke(locais[g.Key].PostoId),
                    ["historico"] = g.OrderByDescending(a => a.DataUtc).Take(MaxHistorico).Select(a => new Dictionary<string, object>
                    {
                        ["data"] = FuelRepository.LocalDay(a.DataUtc),
                        ["precoLitro"] = Math.Round(a.Valor / a.Litros, 2, MidpointRounding.AwayFromZero)
                    }).ToList()
                }).ToList();
    }
}
