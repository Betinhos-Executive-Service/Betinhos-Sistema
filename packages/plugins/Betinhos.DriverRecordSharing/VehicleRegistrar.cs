using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Cadastra em cr40f_veiculos um carro que a Infleet conhece e o Dataverse não.
    // A Infleet não tem cor; o chassi vem mascarado e o Renavam vazio, então não são gravados.
    public static class VehicleRegistrar
    {
        private static readonly TimeSpan Brt = TimeSpan.FromHours(-3);

        public static Entity BuildNewVehicle(InfleetVehicleInfo info, DateTime nowUtc)
        {
            var plate = ServiceVehicleResolver.NormalizePlate(info.Plate);
            var e = new Entity(PluginConfig.VehicleTable);
            e[PluginConfig.VehiclePlate] = plate;
            e[PluginConfig.VehicleNormalizedPlate] = plate;
            e[PluginConfig.VehicleCode] = plate;
            SetText(e, PluginConfig.VehicleBrand, info.Brand);
            SetText(e, PluginConfig.VehicleModel, info.Model);
            SetYear(e, PluginConfig.VehicleManufactureYear, info.Year);
            SetYear(e, PluginConfig.VehicleModelYear, info.ModelYear);
            if (string.Equals(info.OwnershipType, "OWNED", StringComparison.OrdinalIgnoreCase))
            {
                e[PluginConfig.VehicleOwnership] = new OptionSetValue(PluginConfig.VehicleOwnershipOwn);
                e[PluginConfig.VehicleCategory] = new OptionSetValue(PluginConfig.VehicleCategoryOwn);
            }
            else if (string.Equals(info.OwnershipType, "RENTED", StringComparison.OrdinalIgnoreCase))
            {
                e[PluginConfig.VehicleOwnership] = new OptionSetValue(PluginConfig.VehicleOwnershipRented);
                e[PluginConfig.VehicleCategory] = new OptionSetValue(PluginConfig.VehicleCategoryRental);
            }
            e[PluginConfig.VehicleStatus] = new OptionSetValue(PluginConfig.VehicleStatusActive);
            e[PluginConfig.VehicleInfleetId] = info.Id;
            e[PluginConfig.VehicleInfleetSyncedAt] = nowUtc;
            e[PluginConfig.VehicleNotes] = "Cadastrado pela Infleet em " + (nowUtc + Brt).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + "; falta cor";
            return e;
        }

        private static void SetText(Entity e, string field, string value)
        {
            if (!string.IsNullOrWhiteSpace(value)) e[field] = value.Trim();
        }

        private static void SetYear(Entity e, string field, string value)
        {
            if (int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var year) && year >= 1980 && year <= 2100) e[field] = year;
        }
    }
}
