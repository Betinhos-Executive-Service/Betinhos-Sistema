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
        }

        public sealed class Result
        {
            public Result(string error, Dictionary<string, object> payload) { Error = error; Payload = payload; }
            public string Error { get; }
            public Dictionary<string, object> Payload { get; }
        }

        public static Result Build(Input input, DateTime nowUtc)
        {
            if (input.IsThirdParty) return Fail("Motorista terceiro sem rastreador.");
            if (string.IsNullOrWhiteSpace(input.VehiclePlate)) return Fail("Motorista sem carro atual.");
            if (!input.VehicleHasInfleet) return Fail("Carro sem rastreador na Infleet.");
            if (string.IsNullOrWhiteSpace(input.DepartureAddress)) return Fail("Serviço sem endereço de embarque.");

            var departure = input.DepartureUtc ?? nowUtc;
            var hours = Math.Max(0.5, Math.Min(24.0, Math.Round((departure.AddHours(4) - nowUtc).TotalHours, 1)));
            var payload = new Dictionary<string, object>
            {
                ["placa"] = ServiceVehicleResolver.NormalizePlate(input.VehiclePlate),
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

        private static Result Fail(string error) => new Result(error, null);
    }
}
