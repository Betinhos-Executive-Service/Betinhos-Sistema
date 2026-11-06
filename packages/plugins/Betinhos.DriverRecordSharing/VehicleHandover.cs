using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    public sealed class DriverHistoryEntry
    {
        public DriverHistoryEntry(string driverId, DateTime occurredAtUtc) { DriverId = driverId; OccurredAtUtc = occurredAtUtc; }
        public string DriverId { get; }
        public DateTime OccurredAtUtc { get; }
    }

    public enum PreviousDriverKind { Found, SameDriver, Unknown }

    public sealed class PreviousDriverResult
    {
        private PreviousDriverResult(PreviousDriverKind kind, string infleetDriverId) { Kind = kind; InfleetDriverId = infleetDriverId; }
        public PreviousDriverKind Kind { get; }
        public string InfleetDriverId { get; }
        public static readonly PreviousDriverResult Unknown = new PreviousDriverResult(PreviousDriverKind.Unknown, null);
        public static readonly PreviousDriverResult SameDriver = new PreviousDriverResult(PreviousDriverKind.SameDriver, null);
        public static PreviousDriverResult Found(string infleetDriverId) => new PreviousDriverResult(PreviousDriverKind.Found, infleetDriverId);
    }

    // Troca de carro detectada pela Infleet: regras sem I/O usadas pelo HandoverChecklistPlugin.
    public static class VehicleHandover
    {
        public const int LookbackDays = 7;
        public const int DedupeHours = 2;
        public const string CancelReason = "Substituído pelo checklist da troca";

        // Quem estava com o carro antes do recebedor: o primeiro outro motorista, do evento mais recente para o mais antigo.
        public static PreviousDriverResult PickPrevious(IEnumerable<DriverHistoryEntry> entries, string receiverInfleetDriverId)
        {
            var receiver = (receiverInfleetDriverId ?? "").Trim();
            var known = (entries ?? Enumerable.Empty<DriverHistoryEntry>())
                .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.DriverId))
                .OrderByDescending(entry => entry.OccurredAtUtc)
                .ToList();
            if (receiver.Length == 0 || known.Count == 0) return PreviousDriverResult.Unknown;
            var other = known.FirstOrDefault(entry => !string.Equals(entry.DriverId.Trim(), receiver, StringComparison.OrdinalIgnoreCase));
            return other == null ? PreviousDriverResult.SameDriver : PreviousDriverResult.Found(other.DriverId.Trim());
        }

        public static string UniqueKeyPrefix(Guid vehicleId, Guid receiverId) => vehicleId.ToString("D") + ":T:" + receiverId.ToString("D") + ":";

        public static string UniqueKey(Guid vehicleId, Guid receiverId, DateTime nowUtc) =>
            UniqueKeyPrefix(vehicleId, receiverId) + nowUtc.ToString("yyyyMMddHHmm", CultureInfo.InvariantCulture);
    }
}
