using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Nota mensal 0–100: preço 50, consumo 30, registro 20. Componente sem dado fica fora e a nota é normalizada.
    public static class FuelScore
    {
        public const int MinAbastecimentos = 4;
        public const decimal PesoPreco = 50m, PesoConsumo = 30m, PesoRegistro = 20m;

        public sealed class Entry
        {
            public Entry(decimal precoLitro, decimal litros, decimal? mediana, bool temCnpj, int? km, Guid? veiculoId, DateTime dataGastoUtc, DateTime criadoEmUtc)
            {
                PrecoLitro = precoLitro; Litros = litros; Mediana = mediana; TemCnpj = temCnpj; Km = km; VeiculoId = veiculoId; DataGastoUtc = dataGastoUtc; CriadoEmUtc = criadoEmUtc;
            }
            public decimal PrecoLitro { get; }
            public decimal Litros { get; }
            public decimal? Mediana { get; }
            public bool TemCnpj { get; }
            public int? Km { get; }
            public Guid? VeiculoId { get; }
            public DateTime DataGastoUtc { get; }
            public DateTime CriadoEmUtc { get; }
        }

        public sealed class VehicleKml
        {
            public VehicleKml(Guid veiculoId, decimal kml) { VeiculoId = veiculoId; Kml = kml; }
            public Guid VeiculoId { get; }
            public decimal Kml { get; }
        }

        public sealed class Result
        {
            public int Qtd;
            public decimal? NotaPreco, NotaConsumo, NotaRegistro, Kml, KmlReferencia;
            public int? Nota, KmRodados;
        }

        // km/l de um veículo no mês: (kmMax − kmMin) / litros dos abastecimentos depois do primeiro (precisa de ≥ 2 com km).
        public static (decimal? kml, int? km) KmlOf(IEnumerable<Entry> entriesOfOneVehicle)
        {
            var withKm = entriesOfOneVehicle.Where(e => e.Km != null).OrderBy(e => e.Km).ToList();
            if (withKm.Count < 2) return (null, null);
            var km = withKm.Last().Km.Value - withKm.First().Km.Value;
            var litros = withKm.Skip(1).Sum(e => e.Litros);
            if (km <= 0 || litros <= 0m) return (null, null);
            return (Math.Round(km / litros, 2, MidpointRounding.AwayFromZero), km);
        }

        public static Result Month(IReadOnlyList<Entry> mine, string modelo, IReadOnlyList<VehicleKml> sameModelOthers)
        {
            var result = new Result { Qtd = mine.Count };
            if (mine.Count == 0) return result;

            var priced = mine.Where(e => e.Mediana != null && e.Mediana > 0m && e.Litros > 0m).ToList();
            if (priced.Count > 0)
            {
                var weighted = priced.Sum(e => FuelMath.Lerp((e.PrecoLitro - e.Mediana.Value) / e.Mediana.Value, -0.02m, 0.05m, PesoPreco) * e.Litros);
                result.NotaPreco = Math.Round(weighted / priced.Sum(e => e.Litros), 2, MidpointRounding.AwayFromZero);
            }

            var mainVehicle = mine.Where(e => e.VeiculoId != null).GroupBy(e => e.VeiculoId).OrderByDescending(g => g.Count()).FirstOrDefault();
            if (mainVehicle != null)
            {
                var (kml, km) = KmlOf(mainVehicle);
                result.Kml = kml;
                result.KmRodados = km;
                var refs = sameModelOthers.Where(v => v.VeiculoId != mainVehicle.Key).Select(v => v.Kml).ToList();
                if (kml != null && refs.Count >= 2)
                {
                    result.KmlReferencia = FuelMath.Median(refs);
                    result.NotaConsumo = Math.Round(FuelMath.Lerp(-(kml.Value / result.KmlReferencia.Value), -1.05m, -0.85m, PesoConsumo), 2, MidpointRounding.AwayFromZero);
                }
            }

            result.NotaRegistro = Math.Round(mine.Average(e =>
                (e.TemCnpj ? 8m : 0m) + (e.Km != null ? 8m : 0m) + ((e.CriadoEmUtc - e.DataGastoUtc).TotalDays <= 2 ? 4m : 0m)), 2, MidpointRounding.AwayFromZero);

            if (mine.Count < MinAbastecimentos) return result;
            var obtained = (result.NotaPreco ?? 0m) + (result.NotaConsumo ?? 0m) + (result.NotaRegistro ?? 0m);
            var available = (result.NotaPreco != null ? PesoPreco : 0m) + (result.NotaConsumo != null ? PesoConsumo : 0m) + (result.NotaRegistro != null ? PesoRegistro : 0m);
            result.Nota = (int)Math.Round(obtained * 100m / available, MidpointRounding.AwayFromZero);
            return result;
        }
    }
}
