using System;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelComparisonTests
    {
        private static readonly DateTime Dia = new DateTime(2026, 11, 3, 15, 0, 0, DateTimeKind.Utc);
        private static readonly Guid PostoA = Guid.NewGuid();
        private static readonly Guid PostoB = Guid.NewGuid();
        private static readonly Guid PostoC = Guid.NewGuid();

        // Av. Paulista ~(-23.5614, -46.6559); 0,01° de latitude ≈ 1.112 m.
        private static FuelComparison.Fueling F(decimal preco, int diasAntes, Guid posto, string nome, double dLat, decimal litros = 40m) =>
            new FuelComparison.Fueling(Guid.NewGuid(), Dia.AddDays(-diasAntes), preco, litros, posto, nome, -23.5614 + dLat, -46.6559);

        [Fact]
        public void PricePerLiter_RejectsOutOfRange()
        {
            Assert.Equal(6.700m, FuelMath.PricePerLiter(268m, 40m));
            Assert.Null(FuelMath.PricePerLiter(40m, 40m));
            Assert.Null(FuelMath.PricePerLiter(100m, 0m));
        }

        [Fact]
        public void Median_EvenAndOdd()
        {
            Assert.Equal(6.5m, FuelMath.Median(new[] { 6.4m, 6.6m }));
            Assert.Equal(6.49m, FuelMath.Median(new[] { 6.70m, 6.49m, 6.30m }));
        }

        [Fact]
        public void Compare_UserExample_QuantifiesLoss()
        {
            var target = F(6.70m, 0, PostoA, "Posto A", 0);
            var others = new[] { F(6.49m, 3, PostoB, "Posto B", 0.01), F(6.59m, 1, PostoC, "Posto C", 0.005) };

            var r = FuelComparison.Compare(target, others);

            Assert.Equal("comparado", r.Status);
            Assert.Equal(2, r.Referencias);
            Assert.Equal(6.49m, r.MenorPreco);
            Assert.Equal(6.54m, r.Mediana);
            Assert.Equal(PostoB, r.PostoMaisBaratoId);
            Assert.InRange(r.DistanciaMetros.Value, 1100, 1125);
            Assert.Equal(8.40m, r.EconomiaPerdida); // 40 L × (6,70 − 6,49)
        }

        [Fact]
        public void Compare_IgnoresFarOldFutureAndSelf()
        {
            var target = F(6.70m, 0, PostoA, "Posto A", 0);
            var others = new[]
            {
                F(6.10m, 0, PostoB, "Longe", 0.05),      // ~5,5 km
                F(6.10m, 8, PostoB, "Antigo", 0.001),    // 8 dias antes
                F(6.10m, -1, PostoB, "Futuro", 0.001),   // depois
                target,
                F(6.60m, 2, PostoC, "Perto", 0.001)
            };

            var r = FuelComparison.Compare(target, others);

            Assert.Equal("sem_referencia", r.Status);
            Assert.Equal(1, r.Referencias);
            Assert.Null(r.EconomiaPerdida);
        }

        [Fact]
        public void Compare_ExcludesSamePostoAndSameDriver()
        {
            var motorista = Guid.NewGuid();
            FuelComparison.Fueling M(decimal preco, Guid posto, double dLat, Guid? quem) =>
                new FuelComparison.Fueling(Guid.NewGuid(), Dia.AddDays(-1), preco, 40m, posto, "x", -23.5614 + dLat, -46.6559, quem);
            var target = new FuelComparison.Fueling(Guid.NewGuid(), Dia, 6.70m, 40m, PostoA, "Posto A", -23.5614, -46.6559, motorista);
            var others = new[]
            {
                M(6.10m, PostoA, 0.001, Guid.NewGuid()),  // mesmo posto
                M(6.20m, PostoB, 0.001, motorista),       // mesmo motorista
                M(6.30m, PostoB, 0.001, motorista),       // mesmo motorista
                M(6.49m, PostoB, 0.002, Guid.NewGuid()),
                M(6.59m, PostoC, 0.003, Guid.NewGuid())
            };

            var r = FuelComparison.Compare(target, others);

            Assert.Equal("comparado", r.Status);
            Assert.Equal(2, r.Referencias);
            Assert.Equal(6.49m, r.MenorPreco);
        }

        [Fact]
        public void Compare_CheapestPaid_HasZeroLoss()
        {
            var target = F(6.30m, 0, PostoA, "Posto A", 0);
            var r = FuelComparison.Compare(target, new[] { F(6.49m, 3, PostoB, "B", 0.001), F(6.59m, 1, PostoC, "C", 0.001) });
            Assert.Equal(0m, r.EconomiaPerdida);
        }

        [Fact]
        public void Compare_StatusWithoutPostoOrGeo()
        {
            var semCnpj = new FuelComparison.Fueling(Guid.NewGuid(), Dia, 6.7m, 40m, null, null, null, null);
            var pendente = new FuelComparison.Fueling(Guid.NewGuid(), Dia, 6.7m, 40m, PostoA, "A", null, null);
            Assert.Equal("sem_cnpj", FuelComparison.Compare(semCnpj, Enumerable.Empty<FuelComparison.Fueling>()).Status);
            Assert.Equal("posto_pendente", FuelComparison.Compare(pendente, Enumerable.Empty<FuelComparison.Fueling>()).Status);
        }
    }
}
