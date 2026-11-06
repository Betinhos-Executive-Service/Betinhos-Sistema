using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleHandoverTests
    {
        private static readonly DateTime T0 = new DateTime(2026, 10, 16, 12, 0, 0, DateTimeKind.Utc);
        private static DriverHistoryEntry E(string driver, int minutes) => new DriverHistoryEntry(driver, T0.AddMinutes(minutes));

        [Fact]
        public void AnteriorEhOPrimeiroOutroMotoristaDoMaisRecenteParaOMaisAntigo()
        {
            var result = VehicleHandover.PickPrevious(new[] { E("antigo", -300), E("recebe", 10), E("meio", -60), E("recebe", 0) }, "recebe");
            Assert.Equal(PreviousDriverKind.Found, result.Kind);
            Assert.Equal("meio", result.InfleetDriverId);
        }

        [Fact]
        public void HistoricoSoDoRecebedorEhMesmoMotorista()
        {
            Assert.Equal(PreviousDriverKind.SameDriver, VehicleHandover.PickPrevious(new[] { E("RECEBE", -10), E("recebe", 0) }, "recebe").Kind);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        public void SemRecebedorInfleetNaoIdentifica(string receiver)
        {
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new[] { E("outro", 0) }, receiver).Kind);
        }

        [Fact]
        public void SemEventosOuSemDriverIdNaoIdentifica()
        {
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new DriverHistoryEntry[0], "recebe").Kind);
            Assert.Equal(PreviousDriverKind.Unknown, VehicleHandover.PickPrevious(new[] { E(null, 0), E(" ", -5) }, "recebe").Kind);
        }

        [Fact]
        public void ChaveUnicaDaTrocaTemPrefixoPorVeiculoERecebedor()
        {
            var vehicle = Guid.Parse("11111111-1111-1111-1111-111111111111");
            var receiver = Guid.Parse("22222222-2222-2222-2222-222222222222");
            var key = VehicleHandover.UniqueKey(vehicle, receiver, T0);
            Assert.StartsWith(VehicleHandover.UniqueKeyPrefix(vehicle, receiver), key);
            Assert.Equal("11111111-1111-1111-1111-111111111111:T:22222222-2222-2222-2222-222222222222:202610161200", key);
            Assert.True(key.Length <= 120);
        }
    }
}
