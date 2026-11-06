using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Busca de veículo por placa em qualquer estado (ativo ou inativo), pela placa normalizada
    // ou pela placa digitada, para nunca duplicar um carro já cadastrado.
    internal static class FleetLookup
    {
        public static Entity FindByPlate(IOrganizationService service, string normalizedPlate)
        {
            var plate = ServiceVehicleResolver.NormalizePlate(normalizedPlate);
            if (plate.Length == 0) return null;
            var query = new QueryExpression(PluginConfig.VehicleTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.VehiclePlate, PluginConfig.VehicleNormalizedPlate, PluginConfig.VehicleModel, PluginConfig.VehicleColor),
                NoLock = true
            };
            var any = new FilterExpression(LogicalOperator.Or);
            any.AddCondition(PluginConfig.VehicleNormalizedPlate, ConditionOperator.Equal, plate);
            any.AddCondition(PluginConfig.VehiclePlate, ConditionOperator.Equal, plate);
            query.Criteria.AddFilter(any);
            foreach (var candidate in service.RetrieveMultiple(query).Entities)
            {
                if (ServiceVehicleResolver.NormalizePlate(candidate.GetAttributeValue<string>(PluginConfig.VehicleNormalizedPlate)) == plate
                    || ServiceVehicleResolver.NormalizePlate(candidate.GetAttributeValue<string>(PluginConfig.VehiclePlate)) == plate)
                    return candidate;
            }
            return null;
        }
    }
}
