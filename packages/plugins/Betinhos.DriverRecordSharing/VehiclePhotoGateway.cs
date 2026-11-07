using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Foto principal do veículo pelos mesmos Flows HTTP do SharePoint usados na Frota (listar + consultar).
    // Qualquer falha ou estouro dos 10 s devolve null: o link é gerado sem foto. Nunca registra URL (assinada) nem conteúdo.
    public static class VehiclePhotoGateway
    {
        public const int TotalTimeoutMs = 10000;
        private const int MaxResponseBytes = 16 * 1024 * 1024;

        public static byte[] Load(IOrganizationService system, Guid vehicleId, bool isDev, string organizationName, ITracingService tracing)
        {
            var clock = Stopwatch.StartNew();
            try
            {
                var folder = VehiclePhotoRules.Folder(vehicleId, isDev);
                tracing?.Trace("Foto do veículo: início (org={0}, isDev={1}, pasta={2})", organizationName, isDev, folder);
                var listUrl = EnvironmentVariables.Read(system, PluginConfig.EnvSharePointList);
                var queryUrl = EnvironmentVariables.Read(system, PluginConfig.EnvSharePointQuery);
                if (!IsHttps(listUrl) || !IsHttps(queryUrl))
                {
                    tracing?.Trace("Foto do veículo: Flows do SharePoint não configurados.");
                    return null;
                }

                var found = VehiclePhotoRules.FindPrincipal(
                    vehicleId,
                    isDev,
                    candidate => List(listUrl, candidate, clock, tracing),
                    () => TotalTimeoutMs - clock.ElapsedMilliseconds >= 2000);
                if (found == null)
                {
                    tracing?.Trace("Foto do veículo: nenhuma imagem na pasta");
                    return null;
                }
                var principal = found.File;
                tracing?.Trace("Foto do veículo: imagem encontrada na pasta {0}", found.Folder);

                var fetched = Post(queryUrl, new Dictionary<string, object>
                {
                    ["id"] = string.IsNullOrEmpty(principal.Id) ? principal.Path : principal.Id,
                    ["fileLocator"] = principal.Id,
                    ["caminhoSharePoint"] = principal.Path,
                    ["nomeArquivo"] = principal.Name
                }, clock);
                var base64 = Text(fetched, "conteudoBase64");
                if (string.IsNullOrEmpty(base64))
                {
                    tracing?.Trace("Foto do veículo: consultar sem conteúdo");
                    return null;
                }
                tracing?.Trace("Foto do veículo: consultar conteudoBase64 com {0} caracteres", base64.Length);
                var photoBytes = Convert.FromBase64String(base64);
                Remaining(clock);
                var prepared = PhotoShrinker.Prepare(photoBytes, message => tracing?.Trace("Foto do veículo: {0}", message));
                tracing?.Trace("Foto do veículo: resultado {0}", prepared == null ? "sem foto" : prepared.Length + " bytes");
                return prepared;
            }
            catch (Exception error)
            {
                tracing?.Trace("Foto do veículo indisponível: {0}: {1}", error.GetType().Name, ShortMessage(error));
                return null;
            }
        }

        private static List<VehiclePhotoRules.SpFile> List(string listUrl, string folder, Stopwatch clock, ITracingService tracing)
        {
            var listed = Post(listUrl, new Dictionary<string, object> { ["caminhoCompleto"] = folder }, clock);
            var files = new List<VehiclePhotoRules.SpFile>();
            var items = listed.ContainsKey("arquivos") ? listed["arquivos"] as System.Collections.IEnumerable : null;
            if (items != null)
                foreach (var raw in items)
                {
                    var item = raw as Dictionary<string, object>;
                    if (item == null) continue;
                    files.Add(new VehiclePhotoRules.SpFile
                    {
                        Id = Text(item, "id") ?? Text(item, "identificador") ?? "",
                        Name = Text(item, "nomeArquivo") ?? "",
                        Path = Text(item, "caminhoSharePoint") ?? "",
                        ModifiedAt = Text(item, "modificadoEm") ?? ""
                    });
                }
            tracing?.Trace(
                "Foto do veículo: listar {0} HTTP ok, sucesso=true, itens={1}, imagens={2}",
                folder,
                files.Count,
                System.Linq.Enumerable.Count(files, f => VehiclePhotoRules.ChoosePrincipal(new[] { f }) != null));
            return files;
        }

        // Mensagem curta (até 150 caracteres), sem URLs.
        private static string ShortMessage(Exception error)
        {
            var text = System.Text.RegularExpressions.Regex.Replace(error.Message ?? "", @"https?://\S+", "[url]");
            text = text.Replace('\r', ' ').Replace('\n', ' ').Trim();
            return text.Length > 150 ? text.Substring(0, 150) : text;
        }

        private static int Remaining(Stopwatch clock)
        {
            var left = TotalTimeoutMs - (int)clock.ElapsedMilliseconds;
            if (left < 500) throw new TimeoutException();
            return left;
        }

        private static bool IsHttps(string url)
        {
            Uri parsed;
            return Uri.TryCreate(url, UriKind.Absolute, out parsed) && parsed.Scheme == Uri.UriSchemeHttps;
        }

        // Prazo rígido para a etapa inteira: Abort() no estouro, corpo lido em buffer limitado a 16 MB.
        private static Dictionary<string, object> Post(string url, Dictionary<string, object> body, Stopwatch clock)
        {
            var timeoutMs = Remaining(clock);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            var bytes = Encoding.UTF8.GetBytes(serializer.Serialize(body));
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = timeoutMs;
            request.ReadWriteTimeout = timeoutMs;
            using (new System.Threading.Timer(_ => request.Abort(), null, timeoutMs, System.Threading.Timeout.Infinite))
            {
                using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.ContentLength > MaxResponseBytes) throw new InvalidOperationException("Resposta grande demais.");
                    byte[] content;
                    using (var responseStream = response.GetResponseStream())
                        content = BoundedReader.ReadAll(responseStream, MaxResponseBytes, () => clock.ElapsedMilliseconds >= TotalTimeoutMs);
                    if (content == null) throw new TimeoutException();
                    return Parse(serializer, Encoding.UTF8.GetString(content));
                }
            }
        }

        private static Dictionary<string, object> Parse(JavaScriptSerializer serializer, string text)
        {
            {
                var parsed = serializer.Deserialize<Dictionary<string, object>>(text);
                if (parsed == null || !(parsed.ContainsKey("sucesso") && true.Equals(parsed["sucesso"])))
                    throw new InvalidOperationException("O fluxo do SharePoint não confirmou sucesso.");
                return parsed;
            }
        }

        private static string Text(Dictionary<string, object> map, string key)
        {
            object value;
            return map != null && map.TryGetValue(key, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;
        }
    }
}
