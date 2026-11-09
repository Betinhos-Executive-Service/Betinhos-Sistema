using System;
using System.Globalization;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Reserva com link ativo editada (endereços, trajeto, horário, motorista) ou passageiro do serviço criado/alterado:
    // recalcula o mesmo link no Worker (PUT /api/links/<id>, mesmo corpo da criação). PostOperation assíncrono:
    // falha no Worker só vai para o trace e nunca bloqueia a gravação da reserva.
    public sealed class UpdateTrackingLinkPlugin : IPlugin
    {
        private const int TimeoutMs = 60000; // o Worker geocodifica com orçamento de até 45 s
        private readonly TrackingLinkWorkerConfig _config;

        public UpdateTrackingLinkPlugin(string unsecureConfig, string secureConfig)
        {
            _config = TrackingLinkWorkerConfig.Parse(secureConfig);
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!_config.IsConfigured)
            {
                tracing?.Trace("UpdateTrackingLink: Worker não configurado; atualização ignorada.");
                return;
            }

            Guid serviceId = Guid.Empty;
            try
            {
                var system = factory.CreateOrganizationService(null);
                serviceId = ResolveServiceId(context, system);
                if (serviceId == Guid.Empty) return;

                var service = system.Retrieve(PluginConfig.ServiceTable, serviceId, new ColumnSet(PluginConfig.ServiceTrackingLink, PluginConfig.ServiceStatus));
                var link = service.GetAttributeValue<string>(PluginConfig.ServiceTrackingLink);
                var status = service.GetAttributeValue<OptionSetValue>(PluginConfig.ServiceStatus);
                if (!TrackingLinkRevocation.ShouldRefresh(status?.Value, link)) return;

                var url = TrackingLinkRevocation.BuildLinkUrl(_config.Url, TrackingLinkRevocation.ExtractId(link));
                if (url == null)
                {
                    tracing?.Trace("UpdateTrackingLink: URL da API inválida; atualização ignorada.");
                    return;
                }

                var built = GenerateTrackingLinkPlugin.LoadPayload(system, system, serviceId, context.OrganizationName, tracing);
                if (built.Error != null)
                {
                    // Motorista sem rastreio (terceiro, sem carro, removido): revoga para o cliente não ver o motorista anterior.
                    tracing?.Trace("UpdateTrackingLink: revogando link serviceId={0}: {1}", serviceId, built.Error);
                    if (!Send("DELETE", url, null, tracing)) return;
                    var update = new Entity(PluginConfig.ServiceTable, serviceId);
                    update[PluginConfig.ServiceTrackingLink] = null;
                    update[PluginConfig.ServiceTrackingLinkExpiresAt] = null;
                    system.Update(update);
                    return;
                }
                Send("PUT", url, Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(built.Payload)), tracing);
            }
            catch (Exception error)
            {
                tracing?.Trace("UpdateTrackingLink falhou serviceId={0}: {1}", serviceId, error.GetType().Name);
            }
        }

        // Reserva: o próprio registro. Passageiro do serviço: o lookup cr40f_geral (do Target ou lido do vínculo).
        private static Guid ResolveServiceId(IPluginExecutionContext context, IOrganizationService system)
        {
            if (context.PrimaryEntityName == PluginConfig.ServiceTable) return context.MessageName == "Update" ? context.PrimaryEntityId : Guid.Empty;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            var reference = target?.GetAttributeValue<EntityReference>(PluginConfig.ServicePassengerServiceLookup);
            if (reference == null)
            {
                var child = system.Retrieve(PluginConfig.ServicePassengerTable, context.PrimaryEntityId, new ColumnSet(PluginConfig.ServicePassengerServiceLookup));
                reference = child.GetAttributeValue<EntityReference>(PluginConfig.ServicePassengerServiceLookup);
            }
            return reference?.Id ?? Guid.Empty;
        }

        // Uma chamada, sem retry; nunca registra o segredo. DELETE aceita 404 (link já expirado ou revogado).
        // PUT: 404 (expirado/revogado) e 409 (concluído) só vão para o trace.
        private bool Send(string method, string url, byte[] body, ITracingService tracing)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = method;
                request.Timeout = TimeoutMs;
                request.ReadWriteTimeout = TimeoutMs;
                request.Headers[HttpRequestHeader.Authorization] = "Bearer " + _config.Secret;
                if (body != null)
                {
                    request.ContentType = "application/json";
                    using (var stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
                }
                using (var response = (HttpWebResponse)request.GetResponse())
                    tracing?.Trace("UpdateTrackingLink: {0} status={1}.", method, (int)response.StatusCode);
                return true;
            }
            catch (WebException error)
            {
                var http = error.Response as HttpWebResponse;
                if (method == "DELETE" && http != null && http.StatusCode == HttpStatusCode.NotFound) return true;
                tracing?.Trace(
                    "UpdateTrackingLink: {0} falhou status={1} {2}.",
                    method,
                    http == null ? "sem resposta" : ((int)http.StatusCode).ToString(CultureInfo.InvariantCulture),
                    error.Status);
                return false;
            }
        }
    }
}
