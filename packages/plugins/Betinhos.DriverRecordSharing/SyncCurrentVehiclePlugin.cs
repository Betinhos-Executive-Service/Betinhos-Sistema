using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_SincronizarVeiculoAtual: grava no funcionário o carro com que a Infleet o vê agora.
    public sealed class SyncCurrentVehiclePlugin : IPlugin
    {
        public const string MessageName = "new_SincronizarVeiculoAtual";
        public const string ResultParameter = "new_ResumoJson";
        private readonly string _infleetToken;

        public SyncCurrentVehiclePlugin(string unsecureConfig, string secureConfig) { _infleetToken = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var system = factory.CreateOrganizationService(null);
            if (context.MessageName != MessageName) throw new InvalidPluginExecutionException("Mensagem não suportada.");

            var now = DateTime.UtcNow;
            IReadOnlyList<CurrentVehicleSyncPlanner.DriverVehicle> infleet;
            try { infleet = new InfleetGraphQlGateway(_infleetToken).ListDriverCurrentVehicles(); }
            catch (InfleetUnavailableException error) { throw new InvalidPluginExecutionException("Infleet indisponível: " + error.Message); }

            var fleet = LoadFleet(system);
            var plan = CurrentVehicleSyncPlanner.Plan(infleet, LoadEmployees(system), fleet);

            // Tudo ou nada: o step roda na transação da Custom API, então uma falha derruba a execução inteira
            // e a próxima rodada do flow refaz o trabalho.
            var created = 0;
            foreach (var info in plan.ToRegister)
            {
                try
                {
                    fleet[ServiceVehicleResolver.NormalizePlate(info.Plate)] = system.Create(VehicleRegistrar.BuildNewVehicle(info, now));
                    created++;
                }
                catch (Exception error) { throw new InvalidPluginExecutionException("Falha ao cadastrar o veículo " + info.Plate + ": " + error.Message, error); }
            }

            var updated = 0;
            foreach (var change in plan.Changes)
            {
                if (!fleet.TryGetValue(change.Plate, out var vehicleId)) continue;
                var patch = new Entity(PluginConfig.EmployeeTable, change.EmployeeId);
                patch[PluginConfig.EmployeeCurrentVehicle] = new EntityReference(PluginConfig.VehicleTable, vehicleId);
                patch[PluginConfig.EmployeeCurrentVehicleSince] = now;
                patch[PluginConfig.EmployeeCurrentVehicleOrigin] = new OptionSetValue(PluginConfig.EmployeeCurrentVehicleOriginInfleet);
                try { system.Update(patch); updated++; }
                catch (Exception error) { throw new InvalidPluginExecutionException("Falha ao atualizar o funcionário " + change.EmployeeId + ": " + error.Message, error); }
            }

            var cleared = 0;
            foreach (var employeeId in plan.Clears)
            {
                var patch = new Entity(PluginConfig.EmployeeTable, employeeId);
                patch[PluginConfig.EmployeeCurrentVehicle] = null;
                patch[PluginConfig.EmployeeCurrentVehicleSince] = null;
                patch[PluginConfig.EmployeeCurrentVehicleOrigin] = null;
                try { system.Update(patch); cleared++; }
                catch (Exception error) { throw new InvalidPluginExecutionException("Falha ao limpar o carro atual do funcionário " + employeeId + ": " + error.Message, error); }
            }

            tracing?.Trace("SyncCurrentVehicle atualizados={0} cadastrados={1} limpos={2} erros=0.", updated, created, cleared);
            context.OutputParameters[ResultParameter] = ServiceVehicleResolver.ToJson(new Dictionary<string, object>
            {
                ["atualizados"] = updated,
                ["cadastrados"] = created,
                ["limpos"] = cleared,
                ["semMudanca"] = plan.Unchanged,
                ["terceirosIgnorados"] = plan.IgnoredThirdParty,
                ["erros"] = new string[0] // sempre vazio: mantido pela estabilidade do contrato
            });
        }

        private static IDictionary<string, Guid> LoadFleet(IOrganizationService service)
        {
            var query = new QueryExpression(PluginConfig.VehicleTable) { ColumnSet = new ColumnSet(PluginConfig.VehiclePlate, PluginConfig.VehicleNormalizedPlate), NoLock = true };
            var fleet = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            foreach (var v in service.RetrieveMultiple(query).Entities)
            {
                foreach (var raw in new[] { v.GetAttributeValue<string>(PluginConfig.VehicleNormalizedPlate), v.GetAttributeValue<string>(PluginConfig.VehiclePlate) })
                {
                    var plate = ServiceVehicleResolver.NormalizePlate(raw);
                    if (plate.Length > 0 && !fleet.ContainsKey(plate)) fleet[plate] = v.Id;
                }
            }
            return fleet;
        }

        private static IEnumerable<CurrentVehicleSyncPlanner.Employee> LoadEmployees(IOrganizationService service)
        {
            var query = new QueryExpression(PluginConfig.EmployeeTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.EmployeeInfleetDriverId, PluginConfig.EmployeeLinkType, PluginConfig.EmployeeCurrentVehicle, PluginConfig.EmployeeCurrentVehicleOrigin),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.NotNull);
            return service.RetrieveMultiple(query).Entities.Select(e => new CurrentVehicleSyncPlanner.Employee(
                e.Id,
                e.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId),
                e.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeLinkType)?.Value == PluginConfig.EmployeeLinkTypeThirdParty,
                e.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle)?.Id,
                e.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeCurrentVehicleOrigin)?.Value == PluginConfig.EmployeeCurrentVehicleOriginInfleet)).ToList();
        }
    }
}
