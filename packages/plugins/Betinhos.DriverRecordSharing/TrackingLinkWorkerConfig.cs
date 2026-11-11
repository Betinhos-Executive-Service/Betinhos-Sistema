using System;
using System.Collections.Generic;
using System.Globalization;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Configuração dos steps de link: {"url":"https://<worker>/api/links","segredo":"..."}, na tabela cr40f_segredo
    // (mesmo JSON) ou, sem linha, na configuração segura do step.
    public sealed class TrackingLinkWorkerConfig
    {
        public const string SecretName = "link-acompanhamento.worker";

        public string Url { get; private set; }
        public string Secret { get; private set; }
        public bool IsConfigured { get { return !string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(Secret); } }

        public static TrackingLinkWorkerConfig Load(IOrganizationService system, string secureConfig, ITracingService tracing) =>
            Parse(SecretReader.ReadTableOrSecureConfig(system, SecretName, secureConfig, tracing));

        public static TrackingLinkWorkerConfig Parse(string secureConfig)
        {
            var result = new TrackingLinkWorkerConfig();
            try
            {
                if (string.IsNullOrWhiteSpace(secureConfig)) return result;
                var config = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(secureConfig);
                var url = Text(config, "url");
                var secret = Text(config, "segredo");
                // Segredo só viaja por https; qualquer outro esquema equivale a não configurado.
                Uri parsed;
                if (!Uri.TryCreate(url, UriKind.Absolute, out parsed) || parsed.Scheme != Uri.UriSchemeHttps) return result;
                result.Url = url;
                result.Secret = secret;
            }
            catch (Exception)
            {
                result.Url = null;
                result.Secret = null;
            }
            return result;
        }

        private static string Text(Dictionary<string, object> map, string key)
        {
            object value;
            return map != null && map.TryGetValue(key, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;
        }
    }
}
