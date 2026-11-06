using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Compara o preço por litro de um abastecimento com outros a até 3 km nos 7 dias anteriores.
    public static class FuelComparison
    {
        public const double RaioMetros = 3000;
        public const int JanelaDias = 7;
        public const int MinReferencias = 2;

        public sealed class Fueling
        {
            public Fueling(Guid id, DateTime dataGastoUtc, decimal precoLitro, decimal litros, Guid? postoId, string postoNome, double? lat, double? lon, Guid? motoristaId = null)
            {
                Id = id; DataGastoUtc = dataGastoUtc; PrecoLitro = precoLitro; Litros = litros; PostoId = postoId; PostoNome = postoNome; Lat = lat; Lon = lon; MotoristaId = motoristaId;
            }
            public Guid Id { get; }
            public DateTime DataGastoUtc { get; }
            public decimal PrecoLitro { get; }
            public decimal Litros { get; }
            public Guid? PostoId { get; }
            public string PostoNome { get; }
            public double? Lat { get; }
            public double? Lon { get; }
            public Guid? MotoristaId { get; }
        }

        public sealed class Result
        {
            public string Status;
            public int Referencias;
            public decimal? Mediana;
            public decimal? MenorPreco;
            public Guid? PostoMaisBaratoId;
            public string PostoMaisBaratoNome;
            public int? DistanciaMetros;
            public decimal? EconomiaPerdida;
        }

        public static Result Compare(Fueling target, IEnumerable<Fueling> others)
        {
            if (target.PostoId == null) return new Result { Status = "sem_cnpj" };
            if (target.Lat == null || target.Lon == null) return new Result { Status = "posto_pendente" };

            var from = target.DataGastoUtc.Date.AddDays(-JanelaDias);
            var until = target.DataGastoUtc.Date.AddDays(1);
            var refs = others
                .Where(o => o.Id != target.Id && o.Lat != null && o.Lon != null)
                // Referência é o preço de outros: nunca o mesmo posto nem o mesmo motorista.
                .Where(o => o.PostoId != target.PostoId && (target.MotoristaId == null || o.MotoristaId != target.MotoristaId))
                .Where(o => o.DataGastoUtc >= from && o.DataGastoUtc < until)
                .Select(o => new { o, d = FuelMath.HaversineMeters(target.Lat.Value, target.Lon.Value, o.Lat.Value, o.Lon.Value) })
                .Where(x => x.d <= RaioMetros)
                .ToList();

            if (refs.Count < MinReferencias) return new Result { Status = "sem_referencia", Referencias = refs.Count };

            var cheapest = refs.OrderBy(x => x.o.PrecoLitro).ThenBy(x => x.d).First();
            var loss = Math.Max(0m, target.PrecoLitro - cheapest.o.PrecoLitro) * target.Litros;
            return new Result
            {
                Status = "comparado",
                Referencias = refs.Count,
                Mediana = FuelMath.Median(refs.Select(x => x.o.PrecoLitro).ToList()),
                MenorPreco = cheapest.o.PrecoLitro,
                PostoMaisBaratoId = cheapest.o.PostoId,
                PostoMaisBaratoNome = cheapest.o.PostoNome,
                DistanciaMetros = (int)Math.Round(cheapest.d),
                EconomiaPerdida = Math.Round(loss, 2, MidpointRounding.AwayFromZero)
            };
        }
    }
}
