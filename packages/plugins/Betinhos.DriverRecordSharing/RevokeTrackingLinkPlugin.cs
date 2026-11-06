using System;
using System.Globalization;
using System.Net;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Update de cr40f_status em cr40f_reservadeveculos (PostOperation, assíncrono): quando a reserva sai de
    // Concluído, encerra o link no Worker (POST /concluir, mantém os campos); Cancelado revoga (DELETE) e limpa os campos.
    // Falha no Worker mantém os campos para nova tentativa e nunca bloqueia a mudança de status.
    public sealed class RevokeTrackingLinkPlugin : IPlugin
    {
        private const int TimeoutMs = 15000;
        private readonly TrackingLinkWorkerConfig _config;

        public RevokeTrackingLinkPlugin(string unsecureConfig, string secureConfig)
        {
            _config = TrackingLinkWorkerConfig.Parse(secureConfig);
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (context.MessageName != "Update" || context.PrimaryEntityName != PluginConfig.ServiceTable) return;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (target == null || !target.Contains(PluginConfig.ServiceStatus)) return;
            var status = target.GetAttributeValue<OptionSetValue>(PluginConfig.ServiceStatus);
            if (status == null) return;
            if (TrackingLinkRevocation.Decide(status.Value, "x") == TrackingLinkRevocation.LinkAction.None) return;

            if (!_config.IsConfigured)
            {
                tracing?.Trace("RevokeTrackingLink: Worker não configurado; revogação ignorada.");
                return;
            }

            try
            {
                var system = factory.CreateOrganizationService(null);
                var service = system.Retrieve(context.PrimaryEntityName, context.PrimaryEntityId, new ColumnSet(PluginConfig.ServiceTrackingLink));
                var link = service.GetAttributeValue<string>(PluginConfig.ServiceTrackingLink);
                var action = TrackingLinkRevocation.Decide(status.Value, link);
                if (action == TrackingLinkRevocation.LinkAction.None) return;

                var id = TrackingLinkRevocation.ExtractId(link);
                var url = action == TrackingLinkRevocation.LinkAction.Conclude
                    ? TrackingLinkRevocation.BuildConcludeUrl(_config.Url, id)
                    : TrackingLinkRevocation.BuildLinkUrl(_config.Url, id);
                if (url == null)
                {
                    tracing?.Trace("RevokeTrackingLink: link fora do formato esperado; campos mantidos. serviceId={0}", context.PrimaryEntityId);
                    return;
                }
                if (action == TrackingLinkRevocation.LinkAction.Conclude)
                {
                    // Concluir não limpa os campos: o cliente ainda vê "Serviço concluído" até o link expirar.
                    Send("POST", url, true, tracing);
                    return;
                }
                if (!Send("DELETE", url, false, tracing)) return;

                var update = new Entity(PluginConfig.ServiceTable, context.PrimaryEntityId);
                update[PluginConfig.ServiceTrackingLink] = null;
                update[PluginConfig.ServiceTrackingLinkExpiresAt] = null;
                system.Update(update);
            }
            catch (Exception error)
            {
                tracing?.Trace("RevokeTrackingLink falhou serviceId={0}: {1}", context.PrimaryEntityId, error.GetType().Name);
            }
        }

        // Uma chamada, sem retry. True em 2xx (ou 404 quando notFoundIsOk); nunca registra o segredo.
        private bool Send(string method, string url, bool notFoundIsOk, ITracingService tracing)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = method;
                if (method == "POST") request.ContentLength = 0;
                request.Timeout = TimeoutMs;
                request.ReadWriteTimeout = TimeoutMs;
                request.Headers[HttpRequestHeader.Authorization] = "Bearer " + _config.Secret;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    var code = (int)response.StatusCode;
                    if (code >= 200 && code < 300) return true;
                    tracing?.Trace("RevokeTrackingLink: Worker respondeu status={0}.", code);
                    return false;
                }
            }
            catch (WebException error)
            {
                var http = error.Response as HttpWebResponse;
                if (notFoundIsOk && http != null && http.StatusCode == HttpStatusCode.NotFound) return true;
                tracing?.Trace(
                    "RevokeTrackingLink: falha HTTP status={0} {1}.",
                    http == null ? "sem resposta" : ((int)http.StatusCode).ToString(CultureInfo.InvariantCulture),
                    error.Status);
                return false;
            }
            catch (Exception error)
            {
                tracing?.Trace("RevokeTrackingLink: falha ao chamar o Worker: {0}", error.GetType().Name);
                return false;
            }
        }
    }
}
