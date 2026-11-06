using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Decide qual carro o motorista usou no serviço pelo tempo de ignição que a Infleet atribui a ele.
    public static class VehicleUsageCalculator
    {
        public const decimal AutomaticShareThreshold = 0.85m;
        public static readonly TimeSpan PickupMargin = TimeSpan.FromMinutes(60);
        public static readonly TimeSpan MaxWindow = TimeSpan.FromHours(24);
        public const string RuleVersion = "ignicao-85-v1";

        public enum Decision
        {
            Automatic,
            Ask
        }

        public sealed class Trip
        {
            public Trip(string infleetVehicleId, string plate, DateTime startUtc, DateTime endUtc, string infleetDriverId)
            {
                InfleetVehicleId = infleetVehicleId;
                Plate = plate;
                StartUtc = startUtc;
                EndUtc = endUtc;
                InfleetDriverId = infleetDriverId;
            }

            public string InfleetVehicleId { get; }
            public string Plate { get; }
            public DateTime StartUtc { get; }
            public DateTime EndUtc { get; }
            public string InfleetDriverId { get; }
        }

        public sealed class Candidate
        {
            public Candidate(string infleetVehicleId, string plate, int seconds, decimal share)
            {
                InfleetVehicleId = infleetVehicleId;
                Plate = plate;
                Seconds = seconds;
                Share = share;
            }

            public string InfleetVehicleId { get; }
            public string Plate { get; }
            public int Seconds { get; }
            public decimal Share { get; }
        }

        public sealed class Result
        {
            public Result(Decision decision, Candidate chosen, IReadOnlyList<Candidate> candidates, int totalSeconds)
            {
                Decision = decision;
                Chosen = chosen;
                Candidates = candidates;
                TotalSeconds = totalSeconds;
            }

            public Decision Decision { get; }
            public Candidate Chosen { get; }
            public IReadOnlyList<Candidate> Candidates { get; }
            public int TotalSeconds { get; }
        }

        public sealed class Window
        {
            public Window(DateTime startUtc, DateTime endUtc)
            {
                StartUtc = startUtc;
                EndUtc = endUtc;
            }

            public DateTime StartUtc { get; }
            public DateTime EndUtc { get; }
            public bool IsEmpty => EndUtc <= StartUtc;
        }

        public static Window ComputeWindow(DateTime departureUtc, DateTime finalizedAtUtc, DateTime? nextDepartureUtc)
        {
            var start = departureUtc - PickupMargin;
            var end = finalizedAtUtc;
            if (nextDepartureUtc.HasValue && nextDepartureUtc.Value > departureUtc && nextDepartureUtc.Value < end)
                end = nextDepartureUtc.Value;
            if (end - start > MaxWindow)
                end = start + MaxWindow;
            return new Window(start, end);
        }

        public static Result Decide(DateTime windowStartUtc, DateTime windowEndUtc, string infleetDriverId, IEnumerable<Trip> trips)
        {
            var empty = new Result(Decision.Ask, null, new Candidate[0], 0);
            if (windowEndUtc <= windowStartUtc || string.IsNullOrEmpty(infleetDriverId)) return empty;

            var usage = (trips ?? Enumerable.Empty<Trip>())
                .Where(t => t != null && !string.IsNullOrEmpty(t.InfleetVehicleId) && string.Equals(t.InfleetDriverId, infleetDriverId, StringComparison.OrdinalIgnoreCase))
                .Select(t => new { Trip = t, Start = Max(t.StartUtc, windowStartUtc), End = Min(t.EndUtc, windowEndUtc) })
                .Where(t => t.End > t.Start)
                .GroupBy(t => t.Trip.InfleetVehicleId, StringComparer.OrdinalIgnoreCase)
                .Select(g => new
                {
                    VehicleId = g.Key,
                    Plate = g.Select(t => t.Trip.Plate).FirstOrDefault(p => !string.IsNullOrEmpty(p)),
                    Seconds = MergedSeconds(g.Select(t => Tuple.Create(t.Start, t.End)))
                })
                .Where(v => v.Seconds > 0)
                .ToList();

            var total = usage.Sum(v => v.Seconds);
            if (total == 0) return empty;

            var candidates = usage
                .Select(v => new Candidate(v.VehicleId, v.Plate, v.Seconds, Math.Round((decimal)v.Seconds / total, 4)))
                .OrderByDescending(c => c.Seconds)
                .ThenBy(c => c.Plate, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var top = candidates[0];
            return top.Share >= AutomaticShareThreshold
                ? new Result(Decision.Automatic, top, candidates, total)
                : new Result(Decision.Ask, null, candidates, total);
        }

        // Une intervalos sobrepostos para não contar duas vezes viagens duplicadas.
        private static int MergedSeconds(IEnumerable<Tuple<DateTime, DateTime>> intervals)
        {
            double seconds = 0;
            DateTime? currentStart = null;
            DateTime currentEnd = DateTime.MinValue;
            foreach (var interval in intervals.OrderBy(i => i.Item1))
            {
                if (currentStart == null || interval.Item1 > currentEnd)
                {
                    if (currentStart != null) seconds += (currentEnd - currentStart.Value).TotalSeconds;
                    currentStart = interval.Item1;
                    currentEnd = interval.Item2;
                }
                else if (interval.Item2 > currentEnd)
                {
                    currentEnd = interval.Item2;
                }
            }
            if (currentStart != null) seconds += (currentEnd - currentStart.Value).TotalSeconds;
            return (int)Math.Round(seconds);
        }

        private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
        private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;
    }
}
