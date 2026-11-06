using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    public static class FuelMath
    {
        public const decimal MinPrice = 3m;
        public const decimal MaxPrice = 12m;

        public static decimal? PricePerLiter(decimal valor, decimal litros)
        {
            if (litros <= 0m) return null;
            var price = Math.Round(valor / litros, 3, MidpointRounding.AwayFromZero);
            return price < MinPrice || price > MaxPrice ? (decimal?)null : price;
        }

        public static double HaversineMeters(double lat1, double lon1, double lat2, double lon2)
        {
            double Rad(double deg) => deg * Math.PI / 180.0;
            var dLat = Rad(lat2 - lat1);
            var dLon = Rad(lon2 - lon1);
            var h = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Pow(Math.Sin(dLon / 2), 2);
            return 2 * 6371000.0 * Math.Asin(Math.Sqrt(h));
        }

        public static decimal Median(IReadOnlyList<decimal> values)
        {
            if (values.Count == 0) throw new ArgumentException("Lista vazia.", nameof(values));
            var sorted = values.OrderBy(v => v).ToList();
            var mid = sorted.Count / 2;
            return sorted.Count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2m;
        }

        // x <= xAtMax → max; x >= xAtZero → 0; linear entre os dois. Funciona com xAtMax < xAtZero ou o contrário.
        public static decimal Lerp(decimal x, decimal xAtMax, decimal xAtZero, decimal max)
        {
            var t = (x - xAtMax) / (xAtZero - xAtMax);
            if (t <= 0m) return max;
            if (t >= 1m) return 0m;
            return max * (1m - t);
        }
    }
}
