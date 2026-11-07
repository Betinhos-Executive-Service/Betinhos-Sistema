using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkStopsTests
    {
        private static TrackingLinkStops.Entry E(int? order, string address, string db = null) =>
            new TrackingLinkStops.Entry { Order = order, Address = address, DatabaseAddress = db };

        private static TrackingLinkStops.Result Plan(string custom = null, TrackingLinkStops.Entry[] passengers = null, string ret = null, string view = null, string current = "Atual") =>
            TrackingLinkStops.Plan(new TrackingLinkStops.Input { CustomAddress = custom, Passengers = passengers, ReturnAddress = ret, ViewText = view, CurrentDeparture = current });

        [Fact]
        public void CustomAddress_WinsAndHasNoStops()
        {
            var plan = Plan(custom: " Rua X, 1 ", passengers: new[] { E(1, "A"), E(2, "B") }, ret: "R");

            Assert.Equal("Rua X, 1", plan.Departure);
            Assert.Empty(plan.Stops);
        }

        [Fact]
        public void Passengers_OrderedAndDistinct_FirstIsDeparture()
        {
            var plan = Plan(passengers: new[] { E(3, "C"), E(1, "Rua São João, 10"), E(2, " rua  sao joao,10 "), E(4, "B") });

            Assert.Equal("Rua São João, 10", plan.Departure);
            Assert.Equal(new[] { "C", "B" }, plan.Stops);
        }

        [Fact]
        public void PassengerWithoutAddress_FallsBackToDatabaseAddress()
        {
            var plan = Plan(passengers: new[] { E(1, " ", "End BD 1"), E(2, null, null), E(3, "Outro", "ignorado") });

            Assert.Equal("End BD 1", plan.Departure);
            Assert.Equal(new[] { "Outro" }, plan.Stops);
        }

        [Fact]
        public void ReturnService_UsesFirstExitAddressOfReservation()
        {
            var plan = Plan(passengers: new[] { E(1, null, null) }, ret: " Saída 1 ", view: "1. Ana - Outra");

            Assert.Equal("Saída 1", plan.Departure);
            Assert.Empty(plan.Stops);
        }

        [Fact]
        public void View_ParsesLines_DiscardingIndeterminado()
        {
            var plan = Plan(view: "1. Ana - Rua A, 1 - Centro;\n2. Beto - indeterminado;\r\n3. Caio - Rua B, 2;4. Dani - rua a, 1 - centro");

            Assert.Equal("Rua A, 1 - Centro", plan.Departure);
            Assert.Equal(new[] { "Rua B, 2" }, plan.Stops);
        }

        [Fact]
        public void View_LineOutsideFormat_IsTakenWhole()
        {
            var plan = Plan(view: "Av. Paulista, 1000");

            Assert.Equal("Av. Paulista, 1000", plan.Departure);
        }

        [Fact]
        public void NothingFound_KeepsCurrentDeparture()
        {
            var plan = Plan(passengers: new TrackingLinkStops.Entry[0], view: "1. Ana - indeterminado");

            Assert.Equal("Atual", plan.Departure);
            Assert.Empty(plan.Stops);
        }

        [Fact]
        public void LimitsToEightStops_AndNullOrderGoesLast()
        {
            var entries = Enumerable.Range(1, 12).Select(i => E(i, "End " + i)).Concat(new[] { E(null, "Sem ordem") }).ToArray();

            var plan = Plan(passengers: entries);

            Assert.Equal("End 1", plan.Departure);
            Assert.Equal(8, plan.Stops.Length);
            Assert.Equal("End 9", plan.Stops[7]);
        }
    }
}
