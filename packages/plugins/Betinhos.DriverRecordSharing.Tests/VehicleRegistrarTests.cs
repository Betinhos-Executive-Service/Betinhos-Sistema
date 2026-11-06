using System;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class VehicleRegistrarTests
    {
        private static readonly DateTime Now = new DateTime(2026, 10, 13, 15, 0, 0, DateTimeKind.Utc);

        [Fact]
        public void OwnedVehicle_MapsAllInfleetFields()
        {
            var info = new InfleetVehicleInfo("v1", "rti-7g00", "CHEV", "CRUZE LT NB AT", "2022", "2023", "OWNED");

            var e = VehicleRegistrar.BuildNewVehicle(info, Now);

            Assert.Equal("cr40f_veiculos", e.LogicalName);
            Assert.Equal("RTI7G00", e["cr40f_placa"]);
            Assert.Equal("RTI7G00", e["new_placanormalizada"]);
            Assert.Equal("RTI7G00", e["cr40f_id"]);
            Assert.Equal("CHEV", e["cr40f_marca"]);
            Assert.Equal("CRUZE LT NB AT", e["cr40f_modelo"]);
            Assert.Equal(2022, e["cr40f_anodefabricacao"]);
            Assert.Equal(2023, e["cr40f_anodemodelo"]);
            Assert.Equal(100000000, ((OptionSetValue)e["new_propriedade"]).Value);
            Assert.Equal(100000000, ((OptionSetValue)e["new_categoriadoveiculo"]).Value);
            Assert.Equal(202410001, ((OptionSetValue)e["cr40f_statusdoveiculo"]).Value);
            Assert.Equal("v1", e["new_infleetvehicleid"]);
            Assert.Equal(Now, e["new_ultimasincronizacaoinfleet"]);
            Assert.Equal("Cadastrado pela Infleet em 13/10/2026; falta cor", e["cr40f_comentariosextras"]);
            Assert.False(e.Contains("cr40f_cor"));
            Assert.False(e.Contains("cr40f_chassi"));
            Assert.False(e.Contains("cr40f_renavam"));
        }

        [Fact]
        public void RentedVehicle_IsAluguel()
        {
            var e = VehicleRegistrar.BuildNewVehicle(new InfleetVehicleInfo("v2", "ABC1D23", null, null, null, null, "RENTED"), Now);

            Assert.Equal(100000001, ((OptionSetValue)e["new_propriedade"]).Value);
            Assert.Equal(100000002, ((OptionSetValue)e["new_categoriadoveiculo"]).Value);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("20x2")]
        [InlineData("1890")]
        public void InvalidYearOrOwnership_IsNotWritten(string year)
        {
            var e = VehicleRegistrar.BuildNewVehicle(new InfleetVehicleInfo("v3", "ABC1D23", "", "", year, year, null), Now);

            Assert.False(e.Contains("cr40f_anodefabricacao"));
            Assert.False(e.Contains("cr40f_anodemodelo"));
            Assert.False(e.Contains("new_propriedade"));
            Assert.False(e.Contains("new_categoriadoveiculo"));
            Assert.False(e.Contains("cr40f_marca"));
        }
    }
}
