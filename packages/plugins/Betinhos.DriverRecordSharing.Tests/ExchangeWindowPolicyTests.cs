using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ExchangeWindowPolicyTests
    {
        private static readonly Guid Driver1 = Guid.NewGuid();
        private static readonly Guid Driver2 = Guid.NewGuid();

        // 05/10/2026 em Brasília (UTC-3).
        private static DateTime Brt(int hour, int minute = 0) => new DateTime(2026, 10, 5, 3, 0, 0, DateTimeKind.Utc).AddHours(hour).AddMinutes(minute);

        private static ExchangeWindowPolicy.Anchor Service(Guid driver, DateTime departureUtc, bool canceled = false) =>
            new ExchangeWindowPolicy.Anchor(Guid.NewGuid(), driver, departureUtc, canceled);

        [Fact]
        public void TechnicalWindow_UsesEarliestAfterAndLatestBefore()
        {
            var drivers = new[]
            {
                new ExchangeWindowPolicy.DriverAnchors(Driver1, Service(Driver1, Brt(8)), Service(Driver1, Brt(14))),
                new ExchangeWindowPolicy.DriverAnchors(Driver2, Service(Driver2, Brt(9)), null)
            };

            var window = ExchangeWindowPolicy.ComputeTechnicalWindow(Brt(7), drivers);

            Assert.Equal(Brt(8), window.StartUtc);
            Assert.Equal(Brt(14), window.EndUtc);
        }

        [Fact]
        public void TechnicalWindow_WithoutAnchorsCoversWholeDayInBrasilia()
        {
            var drivers = new[]
            {
                new ExchangeWindowPolicy.DriverAnchors(Driver1, null, null),
                new ExchangeWindowPolicy.DriverAnchors(Driver2, null, null)
            };

            var window = ExchangeWindowPolicy.ComputeTechnicalWindow(Brt(22), drivers);

            Assert.Equal(new DateTime(2026, 10, 5, 3, 0, 0, DateTimeKind.Utc), window.StartUtc);
            Assert.Equal(new DateTime(2026, 10, 6, 2, 59, 59, DateTimeKind.Utc), window.EndUtc);
        }

        [Fact]
        public void TechnicalWindow_OnlyBeforeAnchorsUsesLatestBefore()
        {
            var drivers = new[]
            {
                new ExchangeWindowPolicy.DriverAnchors(Driver1, null, Service(Driver1, Brt(14))),
                new ExchangeWindowPolicy.DriverAnchors(Driver2, null, Service(Driver2, Brt(16)))
            };

            var window = ExchangeWindowPolicy.ComputeTechnicalWindow(Brt(7), drivers);

            Assert.Equal(new DateTime(2026, 10, 5, 3, 0, 0, DateTimeKind.Utc), window.StartUtc);
            Assert.Equal(Brt(16), window.EndUtc);
        }

        [Fact]
        public void Validate_AcceptsValidAnchors()
        {
            var drivers = new[]
            {
                new ExchangeWindowPolicy.DriverAnchors(Driver1, Service(Driver1, Brt(8)), Service(Driver1, Brt(14))),
                new ExchangeWindowPolicy.DriverAnchors(Driver2, null, null)
            };

            Assert.Null(ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(9)));
        }

        [Fact]
        public void Validate_RejectsAnchorFromAnotherDriver()
        {
            var drivers = new[] { new ExchangeWindowPolicy.DriverAnchors(Driver1, Service(Driver2, Brt(8)), null) };

            Assert.Contains("motorista", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(7)));
        }

        [Fact]
        public void Validate_RejectsCanceledAnchor()
        {
            var drivers = new[] { new ExchangeWindowPolicy.DriverAnchors(Driver1, null, Service(Driver1, Brt(14), canceled: true)) };

            Assert.Contains("cancelad", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(7)));
        }

        [Fact]
        public void Validate_RejectsAnchorOnAnotherDay()
        {
            var drivers = new[] { new ExchangeWindowPolicy.DriverAnchors(Driver1, null, Service(Driver1, Brt(14).AddDays(1))) };

            Assert.Contains("dia", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(7)));
        }

        [Fact]
        public void Validate_RejectsInvertedOrder()
        {
            var drivers = new[] { new ExchangeWindowPolicy.DriverAnchors(Driver1, Service(Driver1, Brt(14)), Service(Driver1, Brt(8))) };

            Assert.Contains("antes", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(7)));
        }

        [Fact]
        public void Validate_RejectsBeforeAnchorAlreadyDeparted_OnlyWhenNowIsInformed()
        {
            var drivers = new[] { new ExchangeWindowPolicy.DriverAnchors(Driver1, null, Service(Driver1, Brt(8))) };

            Assert.Contains("já saiu", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(9)));
            Assert.Null(ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, null));
        }

        [Fact]
        public void Validate_RejectsPositionsThatCannotMeet()
        {
            var drivers = new[]
            {
                new ExchangeWindowPolicy.DriverAnchors(Driver1, Service(Driver1, Brt(15)), null),
                new ExchangeWindowPolicy.DriverAnchors(Driver2, null, Service(Driver2, Brt(10)))
            };

            Assert.Contains("incompatíveis", ExchangeWindowPolicy.FindAnchorProblem(Brt(7), drivers, Brt(7)));
        }

        [Fact]
        public void OutsideWindow_FixedModeUsesStartAndEnd()
        {
            Assert.True(ExchangeWindowPolicy.IsOutsideWindow(null, Brt(13), Brt(14), Brt(15), null));
            Assert.False(ExchangeWindowPolicy.IsOutsideWindow(ExchangeWindowPolicy.ModeFixed, Brt(14, 30), Brt(14), Brt(15), null));
            Assert.True(ExchangeWindowPolicy.IsOutsideWindow(ExchangeWindowPolicy.ModeFixed, Brt(15, 1), Brt(14), Brt(15), null));
        }

        [Fact]
        public void OutsideWindow_BetweenServicesOnlyAfterOwnBeforeAnchorDeparture()
        {
            Assert.False(ExchangeWindowPolicy.IsOutsideWindow(ExchangeWindowPolicy.ModeBetweenServices, Brt(6), Brt(8), Brt(16), Brt(14)));
            Assert.True(ExchangeWindowPolicy.IsOutsideWindow(ExchangeWindowPolicy.ModeBetweenServices, Brt(14, 1), Brt(8), Brt(16), Brt(14)));
            Assert.False(ExchangeWindowPolicy.IsOutsideWindow(ExchangeWindowPolicy.ModeBetweenServices, Brt(23), Brt(8), Brt(16), null));
        }
    }
}
