using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace Betinhos.DriverRecordSharing
{
    // Endereço do posto pela BrasilAPI; coordenadas do cadastro da ANP e, sem elas, do Nominatim. Nunca lança: falha vira "pendente".
    public static class PostoGeocoder
    {
        public const string UserAgent = "BetinhosAppMotoristas/1.0 (+https://betinhos.com.br)";
        public const int TimeoutMs = 6000;
        public const string PrecisaoAnp = "anp";

        public delegate string Get(string url, int timeoutMs);

        public sealed class Posto
        {
            public string Nome, Logradouro, Numero, Bairro, Municipio, Uf, Cep, Precisao, Status = "pendente";
            public double? Lat, Lon;
            public bool FalhaTemporaria;
        }

        // adiarSeFalhar: o chamador descarta o resultado quando alguma chamada falha, então não gasta o Nominatim à toa.
        public static Posto Resolve(string cnpj, Get get, bool adiarSeFalhar = false)
        {
            var posto = new Posto();
            Dictionary<string, object> b;
            try { b = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(get("https://brasilapi.com.br/api/cnpj/v1/" + cnpj, TimeoutMs)); }
            catch (Exception) { posto.FalhaTemporaria = true; return posto; }

            string T(string key) => b != null && b.TryGetValue(key, out var v) && v != null ? Convert.ToString(v, CultureInfo.InvariantCulture).Trim() : "";
            if (T("logradouro") == "" || T("municipio") == "") return posto;
            posto.Nome = T("nome_fantasia") != "" ? T("nome_fantasia") : T("razao_social");
            posto.Logradouro = (T("descricao_tipo_de_logradouro") + " " + T("logradouro")).Trim();
            posto.Numero = T("numero");
            posto.Bairro = T("bairro");
            posto.Municipio = T("municipio");
            posto.Uf = T("uf");
            posto.Cep = T("cep").Replace("-", "").Replace(".", "");
            if (CoordenadasAnp(cnpj, posto, get) || (adiarSeFalhar && posto.FalhaTemporaria)) return posto;

            var url = "https://nominatim.openstreetmap.org/search?street=" + Uri.EscapeDataString((posto.Numero + " " + posto.Logradouro).Trim())
                + "&city=" + Uri.EscapeDataString(posto.Municipio) + "&state=" + Uri.EscapeDataString(posto.Uf)
                + "&postalcode=" + Uri.EscapeDataString(posto.Cep) + "&countrycodes=br&format=jsonv2&limit=1";
            try
            {
                var list = new JavaScriptSerializer().DeserializeObject(get(url, TimeoutMs)) as object[];
                if (list == null || list.Length == 0 || !(list[0] is Dictionary<string, object> first)) return posto;
                posto.Lat = double.Parse(Convert.ToString(first["lat"], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                posto.Lon = double.Parse(Convert.ToString(first["lon"], CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                var rank = first.TryGetValue("place_rank", out var r) ? Convert.ToInt32(r, CultureInfo.InvariantCulture) : 0;
                posto.Precisao = rank >= 26 ? "rua" : rank >= 16 ? "bairro" : "cidade";
                posto.Status = posto.Precisao == "rua" ? "geocodificado" : "pendente";
            }
            catch (Exception) { posto.FalhaTemporaria = true; /* sem coordenadas: fica pendente com o endereço */ }
            return posto;
        }

        private static bool CoordenadasAnp(string cnpj, Posto posto, Get get)
        {
            try
            {
                var body = new JavaScriptSerializer().DeserializeObject(get("https://revendedoresapi.anp.gov.br/v1/combustivel?cnpj=" + cnpj, TimeoutMs)) as Dictionary<string, object>;
                var item = body?["data"] is object[] data && data.Length > 0 ? data[0] as Dictionary<string, object> : null;
                if (item == null) return false;
                if (!Coordenada(item, "latitude", out var lat) || !Coordenada(item, "longitude", out var lon)) return false;
                if (lat < -34 || lat > 6 || lon < -74 || lon > -28) return false; // Fora do Brasil: dado errado no cadastro.
                posto.Lat = lat;
                posto.Lon = lon;
                posto.Precisao = PrecisaoAnp;
                posto.Status = "geocodificado";
                return true;
            }
            catch (Exception)
            {
                posto.FalhaTemporaria = true;
                return false;
            }
        }

        private static bool Coordenada(Dictionary<string, object> item, string campo, out double valor) =>
            double.TryParse(item.TryGetValue(campo, out var bruto) ? Convert.ToString(bruto, CultureInfo.InvariantCulture) : "", NumberStyles.Float, CultureInfo.InvariantCulture, out valor) && valor != 0;

        private const int MaxResponseBytes = 1024 * 1024;

        public static string HttpGet(string url, int timeoutMs)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = timeoutMs;
            request.UserAgent = UserAgent;
            request.Headers["Accept-Language"] = "pt-BR";
            var clock = Stopwatch.StartNew();
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                var bytes = BoundedReader.ReadAll(response.GetResponseStream(), MaxResponseBytes, () => clock.ElapsedMilliseconds > timeoutMs);
                if (bytes == null) throw new WebException("Resposta acima do limite ou fora do prazo.");
                return Encoding.UTF8.GetString(bytes);
            }
        }
    }
}
