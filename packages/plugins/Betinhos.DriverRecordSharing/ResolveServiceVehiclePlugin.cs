using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_ResolverVeiculoDoServico: diz qual carro o motorista usou no serviço, pela Infleet.
    // Não grava nada; o App Motoristas aplica a decisão ao finalizar.
    public sealed class ResolveServiceVehiclePlugin : IPlugin
    {
        public const string MessageName = "new_ResolverVeiculoDoServico";
        public const string ServiceIdParameter = "new_ReservaId";
        public const string ResultParameter = "new_ResultadoJson";
        private readonly string _infleetToken;

        public ResolveServiceVehiclePlugin(string unsecureConfig, string secureConfig)
        {
            _infleetToken = secureConfig;
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);

            if (context.MessageName != MessageName)
                throw new InvalidPluginExecutionException("Mensagem não suportada pelo resolvedor de veículo.");
            if (!context.InputParameters.Contains(ServiceIdParameter) || !(context.InputParameters[ServiceIdParameter] is Guid serviceId) || serviceId == Guid.Empty)
                throw new InvalidPluginExecutionException("Serviço inválido.");

            try
            {
                // Lido com o usuário chamador: só resolve serviço que ele já pode ver.
                var serviceRecord = caller.Retrieve(
                    PluginConfig.ServiceTable,
                    serviceId,
                    new ColumnSet(PluginConfig.ServiceDriverLookup, PluginConfig.ServiceStartDate));
                var driver = serviceRecord.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup);
                var departure = serviceRecord.GetAttributeValue<DateTime?>(PluginConfig.ServiceStartDate);
                if (driver == null || !departure.HasValue)
                    throw new InvalidPluginExecutionException("Serviço sem motorista ou sem horário de saída.");

                var input = new ServiceVehicleResolver.Input
                {
                    InfleetDriverId = LoadInfleetDriverId(system, driver.Id),
                    DepartureUtc = departure.Value,
                    FinalizedAtUtc = DateTime.UtcNow,
                    NextDepartureUtc = LoadNextDeparture(system, driver.Id, serviceId, departure.Value),
                    Fleet = LoadFleet(system)
                };

                var gatewayLazy = new Lazy<InfleetGraphQlGateway>(() => new InfleetGraphQlGateway(_infleetToken));
                input.RegisterMissing = plate => RegisterMissing(system, gatewayLazy, plate, tracing);

                var result = ServiceVehicleResolver.Resolve(input, () => gatewayLazy.Value);
                tracing?.Trace(
                    "ResolveServiceVehicle serviceId={0} decisao={1} motivo={2}.",
                    serviceId,
                    result["decisao"],
                    result["motivo"]);
                context.OutputParameters[ResultParameter] = ServiceVehicleResolver.ToJson(result);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("ResolveServiceVehicle falhou serviceId={0}: {1}", serviceId, error.GetType().Name);
                throw new InvalidPluginExecutionException("Não foi possível conferir o carro do serviço.", error);
            }
        }

        // Cadastra pela Infleet o carro que o motorista usou e ainda não existe no Dataverse; falha vira null.
        private static ServiceVehicleResolver.FleetVehicle RegisterMissing(IOrganizationService system, Lazy<InfleetGraphQlGateway> gateway, string plate, ITracingService tracing)
        {
            try
            {
                // Já existe (ativo ou inativo)? Reaproveita em vez de duplicar.
                var existing = FleetLookup.FindByPlate(system, plate);
                if (existing != null)
                    return new ServiceVehicleResolver.FleetVehicle(existing.Id, existing.GetAttributeValue<string>(PluginConfig.VehicleModel), existing.GetAttributeValue<string>(PluginConfig.VehicleColor));
                var info = gateway.Value.FindVehicleByPlate(plate);
                if (info == null) return null;
                var id = system.Create(VehicleRegistrar.BuildNewVehicle(info, DateTime.UtcNow));
                return new ServiceVehicleResolver.FleetVehicle(id, info.Model, null);
            }
            catch (InfleetUnavailableException error)
            {
                tracing?.Trace("ResolveServiceVehicle: Infleet indisponível ao cadastrar placa: {0}", error.Message);
                return null;
            }
            catch (Exception error)
            {
                tracing?.Trace("ResolveServiceVehicle: falha ao cadastrar veículo: {0}", error.GetType().Name);
                return null;
            }
        }

        private static string LoadInfleetDriverId(IOrganizationService service, Guid driverId)
        {
            var employee = service.Retrieve(PluginConfig.EmployeeTable, driverId, new ColumnSet(PluginConfig.EmployeeInfleetDriverId));
            return employee.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId);
        }

        private static DateTime? LoadNextDeparture(IOrganizationService service, Guid driverId, Guid serviceId, DateTime departureUtc)
        {
            var query = new QueryExpression(PluginConfig.ServiceTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.ServiceStartDate),
                TopCount = 1,
                NoLock = true
            };
            query.Criteria.AddCondition(PluginConfig.ServiceDriverLookup, ConditionOperator.Equal, driverId);
            query.Criteria.AddCondition(PluginConfig.ServicePrimaryId, ConditionOperator.NotEqual, serviceId);
            query.Criteria.AddCondition(PluginConfig.ServiceStartDate, ConditionOperator.GreaterThan, departureUtc);
            query.Criteria.AddCondition(PluginConfig.ServiceStatus, ConditionOperator.NotEqual, PluginConfig.ServiceStatusCanceled);
            query.Orders.Add(new OrderExpression(PluginConfig.ServiceStartDate, OrderType.Ascending));
            var next = service.RetrieveMultiple(query).Entities;
            return next.Count == 0 ? null : next[0].GetAttributeValue<DateTime?>(PluginConfig.ServiceStartDate);
        }

        private static IDictionary<string, ServiceVehicleResolver.FleetVehicle> LoadFleet(IOrganizationService service)
        {
            var query = new QueryExpression(PluginConfig.VehicleTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.VehiclePlate, PluginConfig.VehicleModel, PluginConfig.VehicleColor),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var fleet = new Dictionary<string, ServiceVehicleResolver.FleetVehicle>(StringComparer.OrdinalIgnoreCase);
            foreach (var vehicle in service.RetrieveMultiple(query).Entities)
            {
                var plate = ServiceVehicleResolver.NormalizePlate(vehicle.GetAttributeValue<string>(PluginConfig.VehiclePlate));
                if (plate.Length > 0 && !fleet.ContainsKey(plate))
                {
                    fleet[plate] = new ServiceVehicleResolver.FleetVehicle(
                        vehicle.Id,
                        vehicle.GetAttributeValue<string>(PluginConfig.VehicleModel),
                        vehicle.GetAttributeValue<string>(PluginConfig.VehicleColor));
                }
            }
            return fleet;
        }
    }
}
