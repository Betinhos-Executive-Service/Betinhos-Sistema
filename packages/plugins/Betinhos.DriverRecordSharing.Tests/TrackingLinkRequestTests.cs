using System;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TrackingLinkRequestTests
    {
        private static readonly DateTime Now = new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc);

        private static TrackingLinkRequest.Input Valid() => new TrackingLinkRequest.Input
        {
            ServiceCode = "OS-1909",
            DepartureAddress = "Av. Paulista, 1000 - São Paulo",
            DestinationAddress = "Aeroporto de Guarulhos",
            Route = "  Jacareí → Guarulhos  ",
            DepartureUtc = Now.AddHours(2),
            IsThirdParty = false,
            VehiclePlate = "RUH7G45",
            VehicleModel = "Corolla",
            VehicleBrand = "Toyota",
            VehicleColor = "Prata",
            VehicleHasInfleet = true
        };

        [Fact]
        public void ValidRequest_BuildsWorkerPayload()
        {
            var result = TrackingLinkRequest.Build(Valid(), Now);

            Assert.Null(result.Error);
            Assert.Equal("RUH7G45", result.Payload["placa"]);
            Assert.Equal("Av. Paulista, 1000 - São Paulo", result.Payload["embarque"]);
            Assert.Equal("Aeroporto de Guarulhos", result.Payload["destinoFinal"]);
            Assert.Equal("Jacareí → Guarulhos", result.Payload["trajeto"]);
            Assert.Equal("2026-10-13T14:00:00Z", result.Payload["horarioAgendado"]);
            Assert.Equal("Embarque OS-1909", result.Payload["titulo"]);
            Assert.Equal("Prata", result.Payload["corVeiculo"]);
            Assert.Equal("Corolla", result.Payload["modeloVeiculo"]);
            Assert.Equal("Toyota", result.Payload["marcaVeiculo"]);
            Assert.Equal(6.0, result.Payload["validadeHoras"]);
        }

        [Fact]
        public void Validity_IsClampedBetweenHalfHourAndOneDay()
        {
            var past = Valid(); past.DepartureUtc = Now.AddHours(-10);
            var far = Valid(); far.DepartureUtc = Now.AddDays(3);

            Assert.Equal(0.5, TrackingLinkRequest.Build(past, Now).Payload["validadeHoras"]);
            Assert.Equal(24.0, TrackingLinkRequest.Build(far, Now).Payload["validadeHoras"]);
        }

        [Theory]
        [InlineData("terceiro", "Motorista terceiro sem rastreador.")]
        [InlineData("semCarro", "Motorista sem carro atual.")]
        [InlineData("semInfleet", "Carro sem rastreador na Infleet.")]
        [InlineData("semEmbarque", "Serviço sem endereço de embarque.")]
        public void InvalidRequest_ReturnsReason(string caso, string erro)
        {
            var input = Valid();
            if (caso == "terceiro") input.IsThirdParty = true;
            if (caso == "semCarro") input.VehiclePlate = null;
            if (caso == "semInfleet") input.VehicleHasInfleet = false;
            if (caso == "semEmbarque") input.DepartureAddress = " ";

            var result = TrackingLinkRequest.Build(input, Now);

            Assert.Equal(erro, result.Error);
            Assert.Null(result.Payload);
        }
    }
}
