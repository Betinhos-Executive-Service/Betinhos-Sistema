using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Acrescenta ao corpo básico do Worker os dados do cartão: paradas, motorista e fotos.
    // Pura (sem Dataverse nem rede): sem dados novos, devolve exatamente o payload antigo.
    public static class TrackingLinkPayload
    {
        public const int MaxPhotoBytes = 400 * 1024;
        public const int MaxStops = 8;

        public sealed class Extras
        {
            public IEnumerable<string> Stops { get; set; }
            public string DriverName { get; set; }
            public string DriverPhone { get; set; }
            public byte[] DriverPhoto { get; set; }
            public byte[] VehiclePhoto { get; set; }
        }

        public sealed class Result
        {
            public Result(Dictionary<string, object> payload, List<string> warnings) { Payload = payload; Warnings = warnings; }
            public Dictionary<string, object> Payload { get; }
            public List<string> Warnings { get; }
        }

        public static Result Build(Dictionary<string, object> basic, Extras extras)
        {
            var payload = new Dictionary<string, object>(basic);
            var warnings = new List<string>();
            if (extras == null) return new Result(payload, warnings);

            var stops = (extras.Stops ?? Enumerable.Empty<string>())
                .Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).Take(MaxStops).ToArray();
            if (stops.Length > 0) payload["paradas"] = stops;

            var driver = new Dictionary<string, object>();
            AddText(driver, "nome", extras.DriverName);
            AddText(driver, "telefone", extras.DriverPhone);
            var driverPhoto = DataUri(extras.DriverPhoto, "motorista", warnings);
            if (driverPhoto != null) driver["fotoBase64"] = driverPhoto;
            if (driver.Count > 0) payload["motorista"] = driver;

            var vehiclePhoto = DataUri(extras.VehiclePhoto, "veículo", warnings);
            if (vehiclePhoto != null) payload["veiculo"] = new Dictionary<string, object> { ["fotoBase64"] = vehiclePhoto };

            return new Result(payload, warnings);
        }

        private static void AddText(Dictionary<string, object> map, string key, string value)
        {
            if (!string.IsNullOrWhiteSpace(value)) map[key] = value.Trim();
        }

        private static string DataUri(byte[] bytes, string label, List<string> warnings)
        {
            if (bytes == null || bytes.Length == 0) return null;
            if (bytes.Length > MaxPhotoBytes)
            {
                warnings.Add("foto do " + label + " acima do limite");
                return null;
            }
            var mime = Mime(bytes);
            if (mime == null)
            {
                warnings.Add("foto do " + label + " em formato não suportado");
                return null;
            }
            return "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
        }

        private static string Mime(byte[] b)
        {
            if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
            if (b.Length >= 4 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "image/png";
            if (b.Length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
                && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50) return "image/webp";
            return null;
        }
    }
}
