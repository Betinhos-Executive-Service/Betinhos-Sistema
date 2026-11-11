using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Custom API new_GerarLinkAcompanhamento: pede ao Worker um link de acompanhamento do embarque
    // e grava o link na reserva. Worker: segredo link-acompanhamento.worker (TrackingLinkWorkerConfig.Load).
    public sealed class GenerateTrackingLinkPlugin : IPlugin
    {
        public const string MessageName = "new_GerarLinkAcompanhamento";
        public const string ServiceIdParameter = "new_ReservaId";
        public const string ResultParameter = "new_LinkJson";
        private const int TimeoutMs = 15000;
        private const string GenericError = "Não foi possível gerar o link agora.";
        private const string IsoFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'";
        private readonly string _secureConfig;

        public GenerateTrackingLinkPlugin(string unsecureConfig, string secureConfig)
        {
            _secureConfig = secureConfig;
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);

            if (context.MessageName != MessageName)
                throw new InvalidPluginExecutionException("Mensagem não suportada pelo gerador de link.");
            if (!context.InputParameters.Contains(ServiceIdParameter) || !(context.InputParameters[ServiceIdParameter] is Guid serviceId) || serviceId == Guid.Empty)
                throw new InvalidPluginExecutionException("Serviço inválido.");

            var config = TrackingLinkWorkerConfig.Load(system, _secureConfig, tracing);
            if (!config.IsConfigured)
            {
                context.OutputParameters[ResultParameter] = Fail("Link de acompanhamento não configurado.");
                return;
            }

            try
            {
                // Lido com o usuário chamador: só gera link de serviço que ele já pode ver.
                var built = LoadPayload(caller, system, serviceId, context.OrganizationName, tracing);
                if (built.Error != null)
                {
                    context.OutputParameters[ResultParameter] = Fail(built.Error);
                    return;
                }

                var link = RequestLink(config, built.Payload, tracing);
                if (link == null)
                {
                    context.OutputParameters[ResultParameter] = Fail(GenericError);
                    return;
                }

                var update = new Entity(PluginConfig.ServiceTable, serviceId);
                update[PluginConfig.ServiceTrackingLink] = link.Item1;
                if (link.Item2.HasValue) update[PluginConfig.ServiceTrackingLinkExpiresAt] = link.Item2.Value;
                system.Update(update);

                var ok = new Dictionary<string, object>
                {
                    ["ok"] = true,
                    ["link"] = link.Item1,
                    ["expiraEm"] = link.Item2.HasValue ? link.Item2.Value.ToString(IsoFormat, CultureInfo.InvariantCulture) : null
                };
                context.OutputParameters[ResultParameter] = ServiceVehicleResolver.ToJson(ok);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                tracing?.Trace("GenerateTrackingLink falhou serviceId={0}: {1}", serviceId, error.GetType().Name);
                context.OutputParameters[ResultParameter] = Fail(GenericError);
            }
        }

        // Corpo do pedido ao Worker (POST de criação e PUT de atualização): reserva, motorista, carro, saída e cartões.
        // `reader` lê a reserva (chamador na criação; sistema na atualização); o resto é lido como sistema.
        internal static TrackingLinkRequest.Result LoadPayload(IOrganizationService reader, IOrganizationService system, Guid serviceId, string organizationName, ITracingService tracing)
        {
            var service = reader.Retrieve(
                PluginConfig.ServiceTable,
                serviceId,
                new ColumnSet(
                    PluginConfig.ServiceCode,
                    PluginConfig.ServiceDepartureAddress,
                    PluginConfig.ServiceDestinationAddress,
                    PluginConfig.ServiceRoute,
                    PluginConfig.ServiceStartDate,
                    PluginConfig.ServiceDriverLookup,
                    PluginConfig.ServiceCustomDeparture,
                    PluginConfig.ServiceReturnDeparture));
            var input = new TrackingLinkRequest.Input
            {
                ServiceCode = service.GetAttributeValue<string>(PluginConfig.ServiceCode),
                DepartureAddress = service.GetAttributeValue<string>(PluginConfig.ServiceDepartureAddress),
                DestinationAddress = service.GetAttributeValue<string>(PluginConfig.ServiceDestinationAddress),
                Route = service.GetAttributeValue<string>(PluginConfig.ServiceRoute),
                DepartureUtc = service.GetAttributeValue<DateTime?>(PluginConfig.ServiceStartDate)
            };

            var driver = service.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup);
            if (driver == null) return new TrackingLinkRequest.Result("Serviço sem motorista.", null);

            var vehicleId = LoadDriverAndVehicle(system, driver.Id, input);
            var stops = TrackingLinkStops.Plan(new TrackingLinkStops.Input
            {
                CustomAddress = service.GetAttributeValue<string>(PluginConfig.ServiceCustomDeparture),
                Passengers = LoadPassengerAddresses(system, serviceId, tracing),
                ReturnAddress = service.GetAttributeValue<string>(PluginConfig.ServiceReturnDeparture),
                ViewText = input.DepartureAddress,
                CurrentDeparture = input.DepartureAddress
            });
            input.DepartureAddress = stops.Departure;

            var built = TrackingLinkRequest.Build(input, DateTime.UtcNow);
            if (built.Error != null) return built;

            var extras = LoadExtras(system, driver.Id, vehicleId, stops.Stops, organizationName, tracing);
            var enriched = TrackingLinkPayload.Build(built.Payload, extras);
            foreach (var warning in enriched.Warnings) tracing?.Trace("GenerateTrackingLink: {0}.", warning);
            return new TrackingLinkRequest.Result(null, enriched.Payload);
        }

        // Falha aqui não derruba o link: devolve lista vazia e a saída cai nos demais critérios.
        private static List<TrackingLinkStops.Entry> LoadPassengerAddresses(IOrganizationService system, Guid serviceId, ITracingService tracing)
        {
            try
            {
                return ReadPassengerAddresses(system, serviceId);
            }
            catch (Exception error)
            {
                tracing?.Trace("GenerateTrackingLink: endereços dos passageiros indisponíveis: {0}", error.GetType().Name);
                return new List<TrackingLinkStops.Entry>();
            }
        }

        private static List<TrackingLinkStops.Entry> ReadPassengerAddresses(IOrganizationService system, Guid serviceId)
        {
            var query = new QueryExpression(PluginConfig.ServicePassengerTable)
            {
                ColumnSet = new ColumnSet(PluginConfig.ServicePassengerOrder, PluginConfig.ServicePassengerDepartureAddress, PluginConfig.ServicePassengerPassengerLookup)
            };
            query.Criteria.AddCondition(PluginConfig.ServicePassengerServiceLookup, ConditionOperator.Equal, serviceId);
            query.Orders.Add(new OrderExpression(PluginConfig.ServicePassengerOrder, OrderType.Ascending));
            var entries = new List<TrackingLinkStops.Entry>();
            var missing = new List<Tuple<TrackingLinkStops.Entry, Guid>>();
            foreach (var child in system.RetrieveMultiple(query).Entities)
            {
                var entry = new TrackingLinkStops.Entry
                {
                    Order = child.GetAttributeValue<int?>(PluginConfig.ServicePassengerOrder),
                    Address = child.GetAttributeValue<string>(PluginConfig.ServicePassengerDepartureAddress)
                };
                var passenger = child.GetAttributeValue<EntityReference>(PluginConfig.ServicePassengerPassengerLookup);
                if (string.IsNullOrWhiteSpace(entry.Address) && passenger != null) missing.Add(Tuple.Create(entry, passenger.Id));
                entries.Add(entry);
            }
            if (missing.Count > 0)
            {
                // Sem endereço no vínculo: um único RetrieveMultiple no cadastro do passageiro (Banco de Dados).
                var database = new QueryExpression(PluginConfig.PassengerTable) { ColumnSet = new ColumnSet(PluginConfig.PassengerDatabaseDeparture) };
                database.Criteria.AddCondition(PluginConfig.PassengerPrimaryId, ConditionOperator.In, missing.Select(m => (object)m.Item2).Distinct().ToArray());
                var addresses = system.RetrieveMultiple(database).Entities
                    .ToDictionary(e => e.Id, e => e.GetAttributeValue<string>(PluginConfig.PassengerDatabaseDeparture));
                foreach (var item in missing)
                {
                    string address;
                    if (addresses.TryGetValue(item.Item2, out address)) item.Item1.DatabaseAddress = address;
                }
            }
            return entries;
        }

        // Dados do cartão (paradas, telefone corporativo, fotos). Qualquer falha aqui só tira o dado: o link sai igual.
        private static TrackingLinkPayload.Extras LoadExtras(IOrganizationService system, Guid driverId, Guid? vehicleId, string[] stops, string organizationName, ITracingService tracing)
        {
            var extras = new TrackingLinkPayload.Extras
            {
                Stops = stops
            };
            try
            {
                var employee = system.Retrieve(
                    PluginConfig.EmployeeTable,
                    driverId,
                    new ColumnSet(PluginConfig.EmployeeFullName, PluginConfig.EmployeeCorporatePhone));
                extras.DriverName = employee.GetAttributeValue<string>(PluginConfig.EmployeeFullName);
                extras.DriverPhone = employee.GetAttributeValue<string>(PluginConfig.EmployeeCorporatePhone);
            }
            catch (Exception error)
            {
                tracing?.Trace("GenerateTrackingLink: dados do motorista indisponíveis: {0}", error.GetType().Name);
            }
            try
            {
                // Coluna de imagem lida à parte: falha na foto não pode perder o telefone.
                var withPhoto = system.Retrieve(PluginConfig.EmployeeTable, driverId, new ColumnSet(PluginConfig.EmployeePhoto));
                var photo = withPhoto.GetAttributeValue<byte[]>(PluginConfig.EmployeePhoto);
                extras.DriverPhoto = PhotoShrinker.Prepare(photo, message => tracing?.Trace("GenerateTrackingLink: foto do motorista: {0}", message));
            }
            catch (Exception error)
            {
                tracing?.Trace("GenerateTrackingLink: foto do motorista indisponível: {0}", error.GetType().Name);
            }
            if (!vehicleId.HasValue) tracing?.Trace("Foto do veículo: motorista sem veículo atual");
            else
            {
                var isDev = string.Equals(organizationName, PluginConfig.DevOrganizationName, StringComparison.OrdinalIgnoreCase);
                extras.VehiclePhoto = VehiclePhotoGateway.Load(system, vehicleId.Value, isDev, organizationName, tracing);
                tracing?.Trace("GenerateTrackingLink: foto do veículo {0}", extras.VehiclePhoto == null ? "ausente" : extras.VehiclePhoto.Length + " bytes");
            }
            return extras;
        }

        private static Guid? LoadDriverAndVehicle(IOrganizationService system, Guid driverId, TrackingLinkRequest.Input input)
        {
            var employee = system.Retrieve(
                PluginConfig.EmployeeTable,
                driverId,
                new ColumnSet(PluginConfig.EmployeeLinkType, PluginConfig.EmployeeCurrentVehicle));
            var linkType = employee.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeLinkType);
            input.IsThirdParty = linkType != null && linkType.Value == PluginConfig.EmployeeLinkTypeThirdParty;

            var vehicleRef = employee.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle);
            if (vehicleRef == null) return null;
            var vehicle = system.Retrieve(
                PluginConfig.VehicleTable,
                vehicleRef.Id,
                new ColumnSet(PluginConfig.VehiclePlate, PluginConfig.VehicleModel, PluginConfig.VehicleBrand, PluginConfig.VehicleColor, PluginConfig.VehicleInfleetId));
            input.VehiclePlate = vehicle.GetAttributeValue<string>(PluginConfig.VehiclePlate);
            input.VehicleModel = vehicle.GetAttributeValue<string>(PluginConfig.VehicleModel);
            input.VehicleBrand = vehicle.GetAttributeValue<string>(PluginConfig.VehicleBrand);
            input.VehicleColor = vehicle.GetAttributeValue<string>(PluginConfig.VehicleColor);
            input.VehicleHasInfleet = !string.IsNullOrWhiteSpace(vehicle.GetAttributeValue<string>(PluginConfig.VehicleInfleetId));
            return vehicleRef.Id;
        }

        // Um POST, sem retry. Devolve (link, expiraEm UTC) ou null em falha; nunca registra o segredo.
        private static Tuple<string, DateTime?> RequestLink(TrackingLinkWorkerConfig config, Dictionary<string, object> payload, ITracingService tracing)
        {
            var serializer = new JavaScriptSerializer();
            var body = Encoding.UTF8.GetBytes(serializer.Serialize(payload));
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(config.Url);
                request.Method = "POST";
                request.ContentType = "application/json";
                request.Timeout = TimeoutMs;
                request.ReadWriteTimeout = TimeoutMs;
                request.Headers[HttpRequestHeader.Authorization] = "Bearer " + config.Secret;
                using (var stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    var parsed = serializer.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                    var link = Text(parsed, "link");
                    if (string.IsNullOrWhiteSpace(link))
                    {
                        tracing?.Trace("GenerateTrackingLink: Worker respondeu sem link (status {0}).", (int)response.StatusCode);
                        return null;
                    }
                    DateTime expires;
                    DateTime? expiresUtc = null;
                    if (DateTime.TryParse(Text(parsed, "expiraEm"), CultureInfo.InvariantCulture,
                        DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out expires))
                        expiresUtc = expires;
                    return Tuple.Create(link, expiresUtc);
                }
            }
            catch (WebException error)
            {
                var http = error.Response as HttpWebResponse;
                tracing?.Trace(
                    "GenerateTrackingLink: falha HTTP status={0} {1}.",
                    http == null ? "sem resposta" : ((int)http.StatusCode).ToString(CultureInfo.InvariantCulture),
                    error.Status);
                return null;
            }
            catch (Exception error)
            {
                tracing?.Trace("GenerateTrackingLink: falha ao chamar o Worker: {0}", error.GetType().Name);
                return null;
            }
        }

        private static string Fail(string message)
        {
            return ServiceVehicleResolver.ToJson(new Dictionary<string, object> { ["ok"] = false, ["erro"] = message });
        }

        private static string Text(Dictionary<string, object> map, string key)
        {
            object value;
            return map != null && map.TryGetValue(key, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;
        }
    }
}
