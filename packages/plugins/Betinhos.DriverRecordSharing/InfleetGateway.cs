using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace Betinhos.DriverRecordSharing
{
    public sealed class InfleetVehicle
    {
        public InfleetVehicle(string id, string plate)
        {
            Id = id;
            Plate = plate;
        }

        public string Id { get; }
        public string Plate { get; }
    }

    public interface IInfleetGateway
    {
        // Carros que o motorista bipou no período mais o carro vinculado a ele agora.
        IReadOnlyList<InfleetVehicle> ListDriverVehicles(string infleetDriverId, DateTime fromUtc, DateTime toUtc);

        IReadOnlyList<VehicleUsageCalculator.Trip> ListTrips(IEnumerable<InfleetVehicle> vehicles, DateTime fromUtc, DateTime toUtc);

        // Carro que a Infleet vincula agora a cada motorista.
        IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> ListDriverCurrentVehicles();

        // Dados cadastrais do veículo pela placa; null se não achar.
        InfleetVehicleInfo FindVehicleByPlate(string plate);
    }

    // Histórico de motorista do veículo (identificações no rastreador), para saber quem entregou o carro.
    public interface IVehicleHistoryGateway
    {
        PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc);
    }

    public sealed class InfleetUnavailableException : Exception
    {
        public InfleetUnavailableException(string message, Exception inner = null) : base(message, inner) { }
    }

    // Cliente GraphQL somente leitura. O token vem da configuração segura do step e nunca é registrado.
    public sealed class InfleetGraphQlGateway : IInfleetGateway, IVehicleHistoryGateway
    {
        private const string Endpoint = "https://api.infleet.com.br/v1/graphql";
        private const int TimeoutMs = 10000;
        private const int Attempts = 2;
        private const string IdentificationCategories = "[VEHICLE_TOKEN_USED, VEHICLE_DRIVER_RECOGNIZED, FACE_ID_DETECTED, BLUETOOTH_VEHICLE_DRIVER_ADDED, MANUAL_VEHICLE_DRIVER_ADDED]";
        private readonly string _token;

        public InfleetGraphQlGateway(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) throw new InfleetUnavailableException("Token da Infleet não configurado.");
            _token = token.Trim();
        }

        public IReadOnlyList<InfleetVehicle> ListDriverVehicles(string infleetDriverId, DateTime fromUtc, DateTime toUtc)
        {
            var first = Execute(
                "query($d:ID!,$dd:ID){ tokens: listDriverTokens(filter:{driverId:$dd, isDeleted:false}, limit:20){ id } driver: getDriver(id:$d){ vehicle{ id plate } } }",
                new Dictionary<string, object> { ["d"] = infleetDriverId, ["dd"] = infleetDriverId });

            var vehicles = new Dictionary<string, InfleetVehicle>(StringComparer.OrdinalIgnoreCase);
            var current = Dict(Dict(first, "driver"), "vehicle");
            AddVehicle(vehicles, Str(current, "id"), Str(current, "plate"));

            var tokenIds = List(first, "tokens").Select(t => Str(t as Dictionary<string, object>, "id")).Where(id => !string.IsNullOrEmpty(id)).ToList();
            if (tokenIds.Count == 0) return vehicles.Values.ToList();

            var query = new StringBuilder("query{");
            for (var i = 0; i < tokenIds.Count; i++)
            {
                query.AppendFormat(
                    CultureInfo.InvariantCulture,
                    " t{0}: listVehicleDriverHistories(filter:{{tokenId:{1}, startedAt:{2}, endedAt:{3}, categories:[VEHICLE_TOKEN_USED]}}, limit:200){{ vehicleDriverHistories{{ vehicleId vehicle{{ plate }} }} }}",
                    i, Quote(tokenIds[i]), Quote(Iso(fromUtc)), Quote(Iso(toUtc)));
            }
            query.Append(" }");
            var histories = Execute(query.ToString(), null);
            foreach (var alias in histories.Values.OfType<Dictionary<string, object>>())
            {
                foreach (var item in List(alias, "vehicleDriverHistories").OfType<Dictionary<string, object>>())
                {
                    AddVehicle(vehicles, Str(item, "vehicleId"), Str(Dict(item, "vehicle"), "plate"));
                }
            }
            return vehicles.Values.ToList();
        }

        public IReadOnlyList<VehicleUsageCalculator.Trip> ListTrips(IEnumerable<InfleetVehicle> vehicles, DateTime fromUtc, DateTime toUtc)
        {
            var list = (vehicles ?? Enumerable.Empty<InfleetVehicle>()).ToList();
            if (list.Count == 0) return new VehicleUsageCalculator.Trip[0];

            var query = new StringBuilder("query{");
            for (var i = 0; i < list.Count; i++)
            {
                query.AppendFormat(
                    CultureInfo.InvariantCulture,
                    " v{0}: trips(filter:{{vehicleId:{1}, fixTime:{{startAt:{2}, endAt:{3}}}}}){{ startedAt finishedAt driver{{ id }} }}",
                    i, Quote(list[i].Id), Quote(Iso(fromUtc)), Quote(Iso(toUtc)));
            }
            query.Append(" }");
            var data = Execute(query.ToString(), null);

            var trips = new List<VehicleUsageCalculator.Trip>();
            for (var i = 0; i < list.Count; i++)
            {
                foreach (var item in List(data, "v" + i.ToString(CultureInfo.InvariantCulture)).OfType<Dictionary<string, object>>())
                {
                    var start = Date(Str(item, "startedAt"));
                    if (!start.HasValue) continue;
                    // Viagem em andamento (motorista finalizou com o carro ligado) conta até o fim da consulta.
                    var end = Date(Str(item, "finishedAt")) ?? toUtc;
                    trips.Add(new VehicleUsageCalculator.Trip(list[i].Id, list[i].Plate, start.Value, end, Str(Dict(item, "driver"), "id")));
                }
            }
            return trips;
        }

        public PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc)
        {
            if (string.IsNullOrWhiteSpace(infleetVehicleId)) return PreviousDriverResult.Unknown;
            var data = Execute(
                "query($v:ID,$s:DateTime,$e:DateTime){ h: listVehicleDriverHistories(filter:{vehicleId:$v, startedAt:$s, endedAt:$e, categories:" + IdentificationCategories + "}, limit:200){ vehicleDriverHistories{ driverId occurredAt createdAt } } }",
                new Dictionary<string, object> { ["v"] = infleetVehicleId.Trim(), ["s"] = Iso(atUtc.AddDays(-VehicleHandover.LookbackDays)), ["e"] = Iso(atUtc) });
            var entries = List(Dict(data, "h"), "vehicleDriverHistories").OfType<Dictionary<string, object>>()
                .Select(item => new DriverHistoryEntry(Str(item, "driverId"), Date(Str(item, "occurredAt")) ?? Date(Str(item, "createdAt")) ?? DateTime.MinValue));
            return VehicleHandover.PickPrevious(entries, receiverInfleetDriverId);
        }

        private Dictionary<string, object> Execute(string query, Dictionary<string, object> variables)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var body = Encoding.UTF8.GetBytes(serializer.Serialize(new Dictionary<string, object> { ["query"] = query, ["variables"] = variables }));
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;

            Exception last = null;
            for (var attempt = 1; attempt <= Attempts; attempt++)
            {
                try
                {
                    var request = (HttpWebRequest)WebRequest.Create(Endpoint);
                    request.Method = "POST";
                    request.ContentType = "application/json";
                    request.Timeout = TimeoutMs;
                    request.ReadWriteTimeout = TimeoutMs;
                    request.Headers[HttpRequestHeader.Authorization] = "Bearer " + _token;
                    using (var stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
                    using (var response = (HttpWebResponse)request.GetResponse())
                    using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        var parsed = serializer.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                        if (parsed != null && parsed.ContainsKey("errors") && parsed["errors"] != null)
                            throw new InfleetUnavailableException("Infleet respondeu com erro na consulta.");
                        var data = Dict(parsed, "data");
                        if (data == null) throw new InfleetUnavailableException("Infleet respondeu sem dados.");
                        return data;
                    }
                }
                catch (InfleetUnavailableException) { throw; }
                catch (WebException error) when (error.Response is HttpWebResponse http && (int)http.StatusCode < 500 && (int)http.StatusCode != 429)
                {
                    throw new InfleetUnavailableException("Infleet recusou a consulta (HTTP " + (int)http.StatusCode + ").", error);
                }
                catch (Exception error)
                {
                    last = error;
                }
            }
            throw new InfleetUnavailableException("Infleet não respondeu a tempo.", last);
        }

        private static void AddVehicle(Dictionary<string, InfleetVehicle> vehicles, string id, string plate)
        {
            if (!string.IsNullOrEmpty(id) && !vehicles.ContainsKey(id)) vehicles[id] = new InfleetVehicle(id, plate);
        }

        private static string Quote(string value) => new JavaScriptSerializer().Serialize(value ?? "");
        private static string Iso(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

        private static DateTime? Date(string value)
        {
            if (string.IsNullOrEmpty(value)) return null;
            return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)
                ? DateTime.SpecifyKind(parsed, DateTimeKind.Utc)
                : (DateTime?)null;
        }

        private const string VehicleInfoFields = "id plate brand model year modelYear ownershipType";

        public IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> ListDriverCurrentVehicles()
        {
            var data = Execute("query{ drivers: listDriversPaginated(limit:500){ id vehicle{ " + VehicleInfoFields + " } } }", null);
            // Veículo vinculado sem placa não é "sem veículo": fica de fora para não limpar o carro atual.
            return List(data, "drivers").OfType<Dictionary<string, object>>()
                .Where(d => Dict(d, "vehicle") == null || !string.IsNullOrEmpty(Str(Dict(d, "vehicle"), "plate")))
                .Select(d => new CurrentVehicleSyncPlanner.DriverVehicle(Str(d, "id"), ToVehicleInfo(Dict(d, "vehicle"))))
                .Where(d => !string.IsNullOrEmpty(d.InfleetDriverId))
                .ToList();
        }

        public InfleetVehicleInfo FindVehicleByPlate(string plate)
        {
            var data = Execute(
                "query($f: ListVehiclesFilterInput){ listVehicles(filter:$f, limit:5){ " + VehicleInfoFields + " } }",
                new Dictionary<string, object> { ["f"] = new Dictionary<string, object> { ["plateOrDisplayName"] = plate } });
            var normalized = ServiceVehicleResolver.NormalizePlate(plate);
            return List(data, "listVehicles").OfType<Dictionary<string, object>>()
                .Select(ToVehicleInfo)
                .FirstOrDefault(v => v != null && ServiceVehicleResolver.NormalizePlate(v.Plate) == normalized);
        }

        private static InfleetVehicleInfo ToVehicleInfo(Dictionary<string, object> v) =>
            v == null || string.IsNullOrEmpty(Str(v, "plate"))
                ? null
                : new InfleetVehicleInfo(Str(v, "id"), Str(v, "plate"), Str(v, "brand"), Str(v, "model"), Str(v, "year"), Str(v, "modelYear"), Str(v, "ownershipType"));

        private static Dictionary<string, object> Dict(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) ? value as Dictionary<string, object> : null;

        private static IEnumerable<object> List(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) && value is IEnumerable items && !(value is string) ? items.Cast<object>() : Enumerable.Empty<object>();

        private static string Str(Dictionary<string, object> source, string key) =>
            source != null && source.TryGetValue(key, out var value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;
    }
}
