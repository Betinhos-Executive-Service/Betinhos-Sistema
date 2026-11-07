using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ServiceVehicleResolverTests
    {
        private const string Driver = "f2190136-39df-4874-9459-f7286dc51910";
        private static readonly Guid Rti = Guid.NewGuid();
        private static readonly Guid Gez = Guid.NewGuid();

        private static DateTime Brt(int hour, int minute = 0) => new DateTime(2026, 10, 12, 3, 0, 0, DateTimeKind.Utc).AddHours(hour).AddMinutes(minute);

        private static ServiceVehicleResolver.Input Input(string driver = Driver) => new ServiceVehicleResolver.Input
        {
            InfleetDriverId = driver,
            DepartureUtc = Brt(13),
            FinalizedAtUtc = Brt(19, 30),
            Fleet = new Dictionary<string, ServiceVehicleResolver.FleetVehicle>
            {
                ["RTI7G00"] = new ServiceVehicleResolver.FleetVehicle(Rti, "Corolla", "Prata"),
                ["GEZ6D67"] = new ServiceVehicleResolver.FleetVehicle(Gez, "Corolla", "Preto")
            }
        };

        [Fact]
        public void DominantRegisteredVehicle_IsAutomatic()
        {
            var gateway = new FakeGateway(
                new VehicleUsageCalculator.Trip("v1", "RTI-7G00", Brt(13, 28), Brt(14, 59), Driver),
                new VehicleUsageCalculator.Trip("v1", "RTI-7G00", Brt(15, 11), Brt(15, 42), Driver));

            var result = ServiceVehicleResolver.Resolve(Input(), () => gateway);

            Assert.Equal("automatico", result["decisao"]);
            var chosen = (Dictionary<string, object>)result["escolhido"];
            Assert.Equal(Rti.ToString("D"), chosen["veiculoId"]);
            Assert.Equal(100m, chosen["percentual"]);
            Assert.Equal(Brt(12), gateway.TripsFrom.AddHours(6));
        }

        [Fact]
        public void UnknownDominantVehicle_IsRegisteredAndChosenAutomatically()
        {
            var created = Guid.NewGuid();
            var gateway = new FakeGateway(new VehicleUsageCalculator.Trip("v9", "ABC1D23", Brt(14), Brt(16), Driver));
            var input = Input();
            input.RegisterMissing = plate => plate == "ABC1D23" ? new ServiceVehicleResolver.FleetVehicle(created, "VERSA", null) : null;

            var result = ServiceVehicleResolver.Resolve(input, () => gateway);

            Assert.Equal("automatico", result["decisao"]);
            Assert.Equal(created.ToString("D"), ((Dictionary<string, object>)result["escolhido"])["veiculoId"]);
        }

        [Fact]
        public void OnlyUnregisteredVehicle_FallsBackToPossession()
        {
            var gateway = new FakeGateway(new VehicleUsageCalculator.Trip("v9", "ABC1D23", Brt(14), Brt(16), Driver));

            var result = ServiceVehicleResolver.Resolve(Input(), () => gateway);

            Assert.Equal("indisponivel", result["decisao"]);
            Assert.Equal("veiculo-nao-cadastrado", result["motivo"]);
            var candidate = (Dictionary<string, object>)((object[])result["candidatos"]).Single();
            Assert.Equal(false, candidate["cadastrado"]);
        }

        [Fact]
        public void DominantUnregisteredWithRegisteredMinority_AsksAmongUsedVehicles()
        {
            var gateway = new FakeGateway(
                new VehicleUsageCalculator.Trip("v9", "ABC1D23", Brt(13), Brt(17, 30), Driver),
                new VehicleUsageCalculator.Trip("v1", "RTI7G00", Brt(17, 30), Brt(18), Driver));

            var result = ServiceVehicleResolver.Resolve(Input(), () => gateway);

            Assert.Equal("perguntar", result["decisao"]);
            Assert.Equal("veiculo-nao-cadastrado", result["motivo"]);
        }

        [Fact]
        public void SplitUsage_AsksWithModelAndColor()
        {
            var gateway = new FakeGateway(
                new VehicleUsageCalculator.Trip("v1", "RTI7G00", Brt(13), Brt(15), Driver),
                new VehicleUsageCalculator.Trip("v2", "GEZ6D67", Brt(16), Brt(17), Driver));

            var result = ServiceVehicleResolver.Resolve(Input(), () => gateway);

            Assert.Equal("perguntar", result["decisao"]);
            Assert.Equal("abaixo-do-limite", result["motivo"]);
            var candidates = ((object[])result["candidatos"]).Cast<Dictionary<string, object>>().ToList();
            Assert.Equal(2, candidates.Count);
            Assert.Equal("Corolla", candidates[0]["modelo"]);
            Assert.Equal("Prata", candidates[0]["cor"]);
        }

        [Fact]
        public void NoTripsOfDriver_FallsBackToPossession()
        {
            var gateway = new FakeGateway(new VehicleUsageCalculator.Trip("v1", "RTI7G00", Brt(14), Brt(16), "outro"));

            var result = ServiceVehicleResolver.Resolve(Input(), () => gateway);

            Assert.Equal("indisponivel", result["decisao"]);
            Assert.Equal("sem-viagens-do-motorista", result["motivo"]);
        }

        [Fact]
        public void MissingInfleetDriverId_IsUnavailableWithoutCallingInfleet()
        {
            var result = ServiceVehicleResolver.Resolve(Input(driver: null), () => throw new InvalidOperationException("não deveria chamar"));

            Assert.Equal("indisponivel", result["decisao"]);
            Assert.Equal("motorista-sem-id-infleet", result["motivo"]);
        }

        [Fact]
        public void InfleetFailure_IsUnavailable()
        {
            var result = ServiceVehicleResolver.Resolve(Input(), () => throw new InfleetUnavailableException("Infleet não respondeu a tempo."));

            Assert.Equal("indisponivel", result["decisao"]);
            Assert.StartsWith("infleet-indisponivel", (string)result["motivo"]);
        }

        [Fact]
        public void Json_RoundTripsDecision()
        {
            var json = ServiceVehicleResolver.ToJson(ServiceVehicleResolver.Resolve(Input(driver: ""), () => null));

            Assert.Contains("\"decisao\":\"indisponivel\"", json);
            Assert.Contains("\"regra\":\"ignicao-85-v1\"", json);
        }

        [Theory]
        [InlineData("rti-7g00", "RTI7G00")]
        [InlineData(" RTI 7G00 ", "RTI7G00")]
        public void NormalizePlate_RemovesSeparators(string plate, string expected)
        {
            Assert.Equal(expected, ServiceVehicleResolver.NormalizePlate(plate));
        }

        private sealed class FakeGateway : IInfleetGateway
        {
            private readonly VehicleUsageCalculator.Trip[] _trips;

            public FakeGateway(params VehicleUsageCalculator.Trip[] trips) => _trips = trips;

            public DateTime TripsFrom { get; private set; }

            public IReadOnlyList<InfleetVehicle> ListDriverVehicles(string infleetDriverId, DateTime fromUtc, DateTime toUtc) =>
                _trips.Select(t => new InfleetVehicle(t.InfleetVehicleId, t.Plate)).GroupBy(v => v.Id).Select(g => g.First()).ToList();

            public IReadOnlyList<VehicleUsageCalculator.Trip> ListTrips(IEnumerable<InfleetVehicle> vehicles, DateTime fromUtc, DateTime toUtc)
            {
                TripsFrom = fromUtc;
                return _trips;
            }

            public IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> ListDriverCurrentVehicles() => new CurrentVehicleSyncPlanner.DriverVehicle[0];

            public InfleetVehicleInfo FindVehicleByPlate(string plate) => null;
        }
    }
}
