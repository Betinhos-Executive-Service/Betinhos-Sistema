using System;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleUsageCalculatorTests
    {
        private const string Driver = "driver-1";
        private const string OtherDriver = "driver-2";

        // 12/10/2026 em Brasília (UTC-3).
        private static DateTime Brt(int hour, int minute = 0) => new DateTime(2026, 10, 12, 3, 0, 0, DateTimeKind.Utc).AddHours(hour).AddMinutes(minute);

        private static VehicleUsageCalculator.Trip Trip(string vehicle, DateTime start, DateTime end, string driver = Driver) =>
            new VehicleUsageCalculator.Trip(vehicle, "PLACA-" + vehicle, start, end, driver);

        [Fact]
        public void SingleVehicle_IsAutomaticWithFullShare()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(12), Driver, new[]
            {
                Trip("A", Brt(8, 10), Brt(9)),
                Trip("A", Brt(10), Brt(11, 30))
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Automatic, result.Decision);
            Assert.Equal("A", result.Chosen.InfleetVehicleId);
            Assert.Equal(1m, result.Chosen.Share);
            Assert.Equal(140 * 60, result.TotalSeconds);
        }

        [Fact]
        public void DominantVehicleAboveThreshold_IsAutomatic()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(18), Driver, new[]
            {
                Trip("A", Brt(8), Brt(17)),
                Trip("B", Brt(17), Brt(18))
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Automatic, result.Decision);
            Assert.Equal("A", result.Chosen.InfleetVehicleId);
            Assert.Equal(0.9m, result.Chosen.Share);
            Assert.Equal(new[] { "A", "B" }, result.Candidates.Select(c => c.InfleetVehicleId));
        }

        [Fact]
        public void ShareExactlyAtThreshold_IsAutomatic()
        {
            var result = VehicleUsageCalculator.Decide(Brt(0), Brt(23), Driver, new[]
            {
                Trip("A", Brt(0), Brt(17)),
                Trip("B", Brt(17), Brt(20))
            });

            Assert.Equal(0.85m, result.Chosen.Share);
            Assert.Equal(VehicleUsageCalculator.Decision.Automatic, result.Decision);
        }

        [Fact]
        public void SplitBelowThreshold_AsksDriverWithCandidatesOrdered()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(18), Driver, new[]
            {
                Trip("A", Brt(8), Brt(12)),
                Trip("B", Brt(12), Brt(18))
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Ask, result.Decision);
            Assert.Null(result.Chosen);
            Assert.Equal(new[] { "B", "A" }, result.Candidates.Select(c => c.InfleetVehicleId));
            Assert.Equal(0.6m, result.Candidates[0].Share);
            Assert.Equal(0.4m, result.Candidates[1].Share);
        }

        [Fact]
        public void TripsAreClippedToWindow()
        {
            var result = VehicleUsageCalculator.Decide(Brt(10), Brt(12), Driver, new[]
            {
                Trip("A", Brt(9), Brt(11)),
                Trip("B", Brt(11, 30), Brt(13)),
                Trip("C", Brt(6), Brt(7))
            });

            Assert.Equal(90 * 60, result.TotalSeconds);
            Assert.Equal(60 * 60, result.Candidates.Single(c => c.InfleetVehicleId == "A").Seconds);
            Assert.Equal(30 * 60, result.Candidates.Single(c => c.InfleetVehicleId == "B").Seconds);
            Assert.DoesNotContain(result.Candidates, c => c.InfleetVehicleId == "C");
        }

        [Fact]
        public void TripsOfOtherDriversAreIgnored()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(12), Driver, new[]
            {
                Trip("A", Brt(8), Brt(9)),
                Trip("B", Brt(9), Brt(12), OtherDriver),
                Trip("B", Brt(10), Brt(11), null)
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Automatic, result.Decision);
            Assert.Equal("A", result.Chosen.InfleetVehicleId);
            Assert.Single(result.Candidates);
        }

        [Fact]
        public void NoAttributedTrips_AsksDriver()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(12), Driver, new[]
            {
                Trip("A", Brt(8), Brt(9), OtherDriver)
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Ask, result.Decision);
            Assert.Equal(0, result.TotalSeconds);
            Assert.Empty(result.Candidates);
        }

        [Fact]
        public void DuplicatedTripsAreCountedOnce()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(12), Driver, new[]
            {
                Trip("A", Brt(8), Brt(9)),
                Trip("A", Brt(8), Brt(9)),
                Trip("B", Brt(9), Brt(10))
            });

            Assert.Equal(VehicleUsageCalculator.Decision.Ask, result.Decision);
            Assert.Equal(0.5m, result.Candidates[0].Share);
        }

        [Fact]
        public void OverlappingTripsOfSameVehicleAreMerged()
        {
            var result = VehicleUsageCalculator.Decide(Brt(8), Brt(12), Driver, new[]
            {
                Trip("A", Brt(8), Brt(10)),
                Trip("A", Brt(9), Brt(11))
            });

            Assert.Equal(180 * 60, result.TotalSeconds);
        }

        [Fact]
        public void Window_StartsSixtyMinutesBeforeDepartureAndEndsAtFinalization()
        {
            var window = VehicleUsageCalculator.ComputeWindow(Brt(8), Brt(12), null);

            Assert.Equal(Brt(7), window.StartUtc);
            Assert.Equal(Brt(12), window.EndUtc);
        }

        [Fact]
        public void Window_IsCutAtNextServiceDeparture()
        {
            var window = VehicleUsageCalculator.ComputeWindow(Brt(8), Brt(20), Brt(14));

            Assert.Equal(Brt(14), window.EndUtc);
        }

        [Fact]
        public void Window_IsLimitedToTwentyFourHours()
        {
            var window = VehicleUsageCalculator.ComputeWindow(Brt(8), Brt(8).AddDays(3), null);

            Assert.Equal(Brt(7).AddHours(24), window.EndUtc);
        }

        [Fact]
        public void Window_FinalizedBeforeStart_IsEmpty()
        {
            var window = VehicleUsageCalculator.ComputeWindow(Brt(8), Brt(6), null);

            Assert.True(window.IsEmpty);
            var result = VehicleUsageCalculator.Decide(window.StartUtc, window.EndUtc, Driver, new[] { Trip("A", Brt(5), Brt(9)) });
            Assert.Equal(VehicleUsageCalculator.Decision.Ask, result.Decision);
            Assert.Empty(result.Candidates);
        }
    }
}
