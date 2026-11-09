using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Regras puras da janela da troca (modo Horário marcado × Entre serviços).
    /// No modo Entre serviços cada motorista tem posição "depois da OS-A / antes da OS-B" no mesmo dia (Brasília).
    /// A janela técnica gravada serve só ao validador de conflito; não é exibida como horário.
    /// </summary>
    public static class ExchangeWindowPolicy
    {
        public const int ModeFixed = 100000000;
        public const int ModeBetweenServices = 100000001;

        // America/Sao_Paulo sem horário de verão.
        private static readonly TimeSpan BrasiliaOffset = TimeSpan.FromHours(-3);

        public sealed class Anchor
        {
            public Anchor(Guid serviceId, Guid? driverId, DateTime departureUtc, bool canceled)
            {
                ServiceId = serviceId;
                DriverId = driverId;
                DepartureUtc = departureUtc;
                Canceled = canceled;
            }

            public Guid ServiceId { get; }
            public Guid? DriverId { get; }
            public DateTime DepartureUtc { get; }
            public bool Canceled { get; }
        }

        public sealed class DriverAnchors
        {
            public DriverAnchors(Guid driverId, Anchor after, Anchor before)
            {
                DriverId = driverId;
                After = after;
                Before = before;
            }

            public Guid DriverId { get; }
            public Anchor After { get; }
            public Anchor Before { get; }
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
        }

        public static bool IsBetweenServices(int? mode) => mode == ModeBetweenServices;

        public static Window ComputeTechnicalWindow(DateTime referenceUtc, IEnumerable<DriverAnchors> drivers)
        {
            var list = (drivers ?? Enumerable.Empty<DriverAnchors>()).Where(d => d != null).ToList();
            var dayStart = DayStartUtc(referenceUtc);
            var afters = list.Where(d => d.After != null).Select(d => d.After.DepartureUtc).ToList();
            var befores = list.Where(d => d.Before != null).Select(d => d.Before.DepartureUtc).ToList();
            var start = afters.Count > 0 ? afters.Min() : dayStart;
            var end = befores.Count > 0 ? befores.Max() : dayStart.AddDays(1).AddSeconds(-1);
            return new Window(start, end);
        }

        /// <summary>
        /// Retorna a descrição do problema das âncoras ou null quando válidas.
        /// nowUtc informado valida também que nenhuma OS "antes de" já saiu (usado no registro/atualização).
        /// </summary>
        public static string FindAnchorProblem(DateTime referenceUtc, IEnumerable<DriverAnchors> drivers, DateTime? nowUtc)
        {
            var list = (drivers ?? Enumerable.Empty<DriverAnchors>()).Where(d => d != null).ToList();
            var day = LocalDate(referenceUtc);
            foreach (var driver in list)
            {
                foreach (var anchor in new[] { driver.After, driver.Before }.Where(a => a != null))
                {
                    if (anchor.Canceled) return "Serviço de referência foi cancelado.";
                    if (anchor.DriverId != driver.DriverId) return "Serviço de referência não pertence ao motorista da troca.";
                    if (LocalDate(anchor.DepartureUtc) != day) return "Serviços de referência devem ser do mesmo dia da troca.";
                }

                if (driver.After != null && driver.Before != null && driver.After.DepartureUtc >= driver.Before.DepartureUtc)
                    return "O serviço \"depois de\" deve sair antes do serviço \"antes de\".";

                if (nowUtc.HasValue && driver.Before != null && driver.Before.DepartureUtc <= nowUtc.Value)
                    return "O serviço \"antes de\" já saiu.";
            }

            var latestAfter = list.Where(d => d.After != null).Select(d => (DateTime?)d.After.DepartureUtc).Max();
            var earliestBefore = list.Where(d => d.Before != null).Select(d => (DateTime?)d.Before.DepartureUtc).Min();
            if (latestAfter.HasValue && earliestBefore.HasValue && latestAfter.Value >= earliestBefore.Value)
                return "Posições incompatíveis: os motoristas não ficam livres ao mesmo tempo.";

            return null;
        }

        public static bool IsOutsideWindow(int? mode, DateTime nowUtc, DateTime startUtc, DateTime endUtc, DateTime? ownBeforeDepartureUtc)
        {
            if (IsBetweenServices(mode))
                return ownBeforeDepartureUtc.HasValue && nowUtc > ownBeforeDepartureUtc.Value;
            return nowUtc < startUtc || nowUtc > endUtc;
        }

        private static DateTime LocalDate(DateTime utc) => ToUtc(utc).Add(BrasiliaOffset).Date;

        private static DateTime DayStartUtc(DateTime referenceUtc) =>
            DateTime.SpecifyKind(LocalDate(referenceUtc) - BrasiliaOffset, DateTimeKind.Utc);

        private static DateTime ToUtc(DateTime value) =>
            value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }
}
