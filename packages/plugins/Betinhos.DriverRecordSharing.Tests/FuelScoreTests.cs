using System;
using System.Collections.Generic;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class FuelScoreTests
    {
        private static readonly Guid Carro = Guid.NewGuid();
        private static readonly DateTime D = new DateTime(2026, 11, 2, 15, 0, 0, DateTimeKind.Utc);

        private static FuelScore.Entry E(decimal preco, decimal? mediana, int? km, int dia, bool cnpj = true, int atrasoDias = 0, decimal litros = 40m) =>
            new FuelScore.Entry(preco, litros, mediana, cnpj, km, Carro, D.AddDays(dia), D.AddDays(dia + atrasoDias));

        [Fact]
        public void Lerp_PriceAnchors()
        {
            Assert.Equal(50m, FuelMath.Lerp(-0.03m, -0.02m, 0.05m, 50m));
            Assert.Equal(0m, FuelMath.Lerp(0.06m, -0.02m, 0.05m, 50m));
            Assert.Equal(25m, FuelMath.Lerp(0.015m, -0.02m, 0.05m, 50m));
        }

        [Fact]
        public void Month_BelowMinimum_HasNoNota()
        {
            var r = FuelScore.Month(new[] { E(6.5m, 6.5m, 1000, 0), E(6.5m, 6.5m, 1400, 3), E(6.5m, 6.5m, 1800, 6) }, "Corolla", new FuelScore.VehicleKml[0]);
            Assert.Equal(3, r.Qtd);
            Assert.Null(r.Nota);
        }

        [Fact]
        public void Month_FullScore_WhenCheapEfficientAndComplete()
        {
            var mine = new[] { E(6.30m, 6.50m, 10000, 0), E(6.30m, 6.50m, 10500, 5), E(6.30m, 6.50m, 11000, 10), E(6.30m, 6.50m, 11500, 15) };
            // 1.500 km / 120 L (3 abastecimentos depois do primeiro) = 12,5 km/l; referência 11 → r = 1,136 → 30.
            var others = new[] { new FuelScore.VehicleKml(Guid.NewGuid(), 11m), new FuelScore.VehicleKml(Guid.NewGuid(), 11m) };

            var r = FuelScore.Month(mine, "Corolla", others);

            Assert.Equal(12.5m, r.Kml);
            Assert.Equal(11m, r.KmlReferencia);
            Assert.Equal(1500, r.KmRodados);
            Assert.Equal(50m, r.NotaPreco);
            Assert.Equal(30m, r.NotaConsumo);
            Assert.Equal(20m, r.NotaRegistro);
            Assert.Equal(100, r.Nota);
        }

        [Fact]
        public void Month_NormalizesWhenConsumptionMissing()
        {
            // Sem km: consumo fica fora; registro perde 8 por abastecimento (sem km) → 12.
            var mine = new[] { E(6.50m, 6.50m, null, 0), E(6.50m, 6.50m, null, 5), E(6.50m, 6.50m, null, 10), E(6.50m, 6.50m, null, 15) };

            var r = FuelScore.Month(mine, "Corolla", new FuelScore.VehicleKml[0]);

            // d = 0 → preço = 50 × (1 − 0,02/0,07) = 35,71
            Assert.Equal(35.71m, r.NotaPreco);
            Assert.Null(r.NotaConsumo);
            Assert.Equal(12m, r.NotaRegistro);
            Assert.Equal(68, r.Nota); // round((35,71 + 12) × 100 / 70)
        }

        [Fact]
        public void Registro_PenalizesLateAndNoCnpj()
        {
            var mine = new[] { E(6.5m, null, 1000, 0, cnpj: false), E(6.5m, null, 1400, 3, atrasoDias: 3), E(6.5m, null, 1800, 6), E(6.5m, null, 2200, 9) };
            var r = FuelScore.Month(mine, "Corolla", new FuelScore.VehicleKml[0]);
            Assert.Equal(17m, r.NotaRegistro); // (12 + 16 + 20 + 20) / 4
            Assert.Null(r.NotaPreco);
        }
    }
}
