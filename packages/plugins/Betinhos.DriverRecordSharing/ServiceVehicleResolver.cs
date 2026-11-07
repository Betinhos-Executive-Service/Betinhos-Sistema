using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;

namespace Betinhos.DriverRecordSharing
{
    // Monta a decisão do carro do serviço a partir da Infleet, sem gravar nada no Dataverse.
    public static class ServiceVehicleResolver
    {
        public const string DecisionAutomatic = "automatico";
        public const string DecisionAsk = "perguntar";
        public const string DecisionUnavailable = "indisponivel";
        public static readonly TimeSpan BipLookback = TimeSpan.FromHours(48);
        public static readonly TimeSpan TripLookback = TimeSpan.FromHours(6);

        public sealed class FleetVehicle
        {
            public FleetVehicle(Guid id, string model, string color)
            {
                Id = id;
                Model = model;
                Color = color;
            }

            public Guid Id { get; }
            public string Model { get; }
            public string Color { get; }
        }

        public sealed class Input
        {
            public string InfleetDriverId { get; set; }
            public DateTime DepartureUtc { get; set; }
            public DateTime FinalizedAtUtc { get; set; }
            public DateTime? NextDepartureUtc { get; set; }
            // Placa normalizada -> veículo do cr40f_veiculos.
            public IDictionary<string, FleetVehicle> Fleet { get; set; }
            // Placa normalizada -> carro cadastrado agora (ou null); chamado quando a placa não está na frota.
            public Func<string, FleetVehicle> RegisterMissing { get; set; }
        }

        public static Dictionary<string, object> Resolve(Input input, Func<IInfleetGateway> gatewayFactory)
        {
            var window = VehicleUsageCalculator.ComputeWindow(input.DepartureUtc, input.FinalizedAtUtc, input.NextDepartureUtc);
            var result = new Dictionary<string, object>
            {
                ["regra"] = VehicleUsageCalculator.RuleVersion,
                ["janela"] = new Dictionary<string, object> { ["inicio"] = Iso(window.StartUtc), ["fim"] = Iso(window.EndUtc) }
            };

            if (string.IsNullOrWhiteSpace(input.InfleetDriverId))
                return Unavailable(result, "motorista-sem-id-infleet");
            if (window.IsEmpty)
                return Unavailable(result, "janela-vazia");

            VehicleUsageCalculator.Result usage;
            try
            {
                var gateway = gatewayFactory();
                var vehicles = gateway.ListDriverVehicles(input.InfleetDriverId, window.StartUtc - BipLookback, window.EndUtc);
                var trips = gateway.ListTrips(vehicles, window.StartUtc - TripLookback, window.EndUtc);
                usage = VehicleUsageCalculator.Decide(window.StartUtc, window.EndUtc, input.InfleetDriverId, trips);
            }
            catch (InfleetUnavailableException error)
            {
                return Unavailable(result, "infleet-indisponivel: " + error.Message);
            }

            if (usage.TotalSeconds == 0)
                return Unavailable(result, "sem-viagens-do-motorista");
            if (usage.Decision == VehicleUsageCalculator.Decision.Ask)
                return Ask(result, "abaixo-do-limite", usage.Candidates, usage.TotalSeconds, input);

            var chosen = Find(input, usage.Chosen.Plate);
            if (chosen == null)
                return Ask(result, "veiculo-nao-cadastrado", usage.Candidates, usage.TotalSeconds, input);

            result["decisao"] = DecisionAutomatic;
            result["motivo"] = "acima-do-limite";
            result["totalSegundos"] = usage.TotalSeconds;
            result["candidatos"] = Candidates(usage.Candidates, input);
            result["escolhido"] = Candidate(usage.Chosen, chosen);
            return result;
        }

        public static string ToJson(Dictionary<string, object> result) => new JavaScriptSerializer().Serialize(result);

        public static string NormalizePlate(string plate) =>
            new string((plate ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();

        private static Dictionary<string, object> Unavailable(Dictionary<string, object> result, string reason)
        {
            result["decisao"] = DecisionUnavailable;
            result["motivo"] = reason;
            result["totalSegundos"] = 0;
            result["candidatos"] = new object[0];
            return result;
        }

        // O motorista escolhe entre carros usados na janela e cadastrados; sem nenhum, o app oferece a frota ativa.
        private static Dictionary<string, object> Ask(Dictionary<string, object> result, string reason, IEnumerable<VehicleUsageCalculator.Candidate> candidates, int totalSeconds, Input input)
        {
            var list = candidates.ToList();
            if (!list.Any(c => Find(input, c.Plate) != null))
            {
                Unavailable(result, reason == "abaixo-do-limite" ? "candidatos-nao-cadastrados" : reason);
                result["totalSegundos"] = totalSeconds;
                result["candidatos"] = Candidates(list, input);
                return result;
            }
            result["decisao"] = DecisionAsk;
            result["motivo"] = reason;
            result["totalSegundos"] = totalSeconds;
            result["candidatos"] = Candidates(candidates, input);
            return result;
        }

        private static object[] Candidates(IEnumerable<VehicleUsageCalculator.Candidate> candidates, Input input) =>
            candidates.Select(c => (object)Candidate(c, Find(input, c.Plate))).ToArray();

        private static Dictionary<string, object> Candidate(VehicleUsageCalculator.Candidate candidate, FleetVehicle vehicle) => new Dictionary<string, object>
        {
            ["veiculoId"] = vehicle?.Id.ToString("D"),
            ["placa"] = candidate.Plate,
            ["modelo"] = vehicle?.Model,
            ["cor"] = vehicle?.Color,
            ["segundos"] = candidate.Seconds,
            ["percentual"] = Math.Round(candidate.Share * 100m, 1),
            ["cadastrado"] = vehicle != null
        };

        private static FleetVehicle Find(Input input, string plate)
        {
            var found = Lookup(input.Fleet, plate);
            if (found != null || input.RegisterMissing == null) return found;
            var normalized = NormalizePlate(plate);
            var created = input.RegisterMissing(normalized);
            if (created != null && input.Fleet != null) input.Fleet[normalized] = created;
            return created;
        }

        private static FleetVehicle Lookup(IDictionary<string, FleetVehicle> fleet, string plate)
        {
            if (fleet == null) return null;
            return fleet.TryGetValue(NormalizePlate(plate), out var vehicle) ? vehicle : null;
        }

        private static string Iso(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }
}
