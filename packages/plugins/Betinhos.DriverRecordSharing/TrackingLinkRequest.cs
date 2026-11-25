using System;
using System.Collections.Generic;
using System.Globalization;

namespace Betinhos.DriverRecordSharing
{
    // Monta o corpo enviado ao Worker de links de acompanhamento (contrato do Worker).
    public static class TrackingLinkRequest
    {
        public sealed class Input
        {
            public string ServiceCode { get; set; }
            public string DepartureAddress { get; set; }
            public string DestinationAddress { get; set; }
            public string Route { get; set; }
            public DateTime? DepartureUtc { get; set; }
            public bool IsThirdParty { get; set; }
            public string VehiclePlate { get; set; }
            public string VehicleModel { get; set; }
            public string VehicleBrand { get; set; }
            public string VehicleColor { get; set; }
            public bool VehicleHasInfleet { get; set; }
            public int? Status { get; set; }
        }

        public sealed class Result
        {
            public Result(string error, Dictionary<string, object> payload) { Error = error; Payload = payload; }
            public string Error { get; }
            public Dictionary<string, object> Payload { get; }
            public int? Status { get; set; }
        }

        public static Result Build(Input input, DateTime nowUtc)
        {
            if (!StatusAllowsLink(input.Status)) return Fail("Serviço solicitado ou cancelado não tem link de acompanhamento.");
            if (string.IsNullOrWhiteSpace(input.DepartureAddress)) return Fail("Serviço sem endereço de embarque.");

            // Sem motorista, sem carro, terceiro ou carro fora da Infleet: o link sai igual, sem mapa (o Worker não consulta a Infleet).
            var plate = string.IsNullOrWhiteSpace(input.VehiclePlate) ? null : ServiceVehicleResolver.NormalizePlate(input.VehiclePlate);
            var tracked = plate != null && !input.IsThirdParty && input.VehicleHasInfleet;

            var departure = input.DepartureUtc ?? nowUtc;
            var hours = Math.Max(0.5, Math.Min(336.0, Math.Round((departure.AddHours(4) - nowUtc).TotalHours, 1)));
            var payload = new Dictionary<string, object>
            {
                ["placa"] = plate,
                ["rastreio"] = tracked,
                ["embarque"] = input.DepartureAddress.Trim(),
                ["destinoFinal"] = string.IsNullOrWhiteSpace(input.DestinationAddress) ? null : input.DestinationAddress.Trim(),
                ["trajeto"] = string.IsNullOrWhiteSpace(input.Route) ? null : input.Route.Trim(),
                ["horarioAgendado"] = input.DepartureUtc?.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                ["titulo"] = string.IsNullOrWhiteSpace(input.ServiceCode) ? "Embarque" : "Embarque " + input.ServiceCode,
                ["corVeiculo"] = input.VehicleColor,
                ["modeloVeiculo"] = input.VehicleModel,
                ["marcaVeiculo"] = input.VehicleBrand,
                ["validadeHoras"] = hours
            };
            return new Result(null, payload);
        }

        // Solicitado ainda não é serviço da Betinhos; Cancelado e Cancelado com Ressalvas revogam o link (RevokeTrackingLinkPlugin).
        public static bool StatusAllowsLink(int? status)
        {
            return status != PluginConfig.ServiceStatusRequested
                && status != PluginConfig.ServiceStatusCanceled
                && status != PluginConfig.ServiceStatusCanceledWithReservations;
        }

        private static Result Fail(string error) => new Result(error, null);
    }
}
