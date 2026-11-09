using System;
using System.Text.RegularExpressions;

namespace Betinhos.DriverRecordSharing
{
    // Lógica pura da revogação do link de acompanhamento (sem Dataverse nem HTTP).
    public static class TrackingLinkRevocation
    {
        private static readonly Regex LongIdPattern = new Regex("^[0-9a-fA-F]{64}$", RegexOptions.Compiled);
        // Id curto do Worker: 12 caracteres base62, diferencia maiúsculas e minúsculas.
        private static readonly Regex ShortIdPattern = new Regex("^[0-9A-Za-z]{12}$", RegexOptions.Compiled);

        // Aceita o id antigo (64 hex, caixa baixa) e o curto (base62, exatamente como veio). Outro formato: null.
        private static string NormalizeId(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            if (LongIdPattern.IsMatch(id)) return id.ToLowerInvariant();
            return ShortIdPattern.IsMatch(id) ? id : null;
        }

        public enum LinkAction { None, Conclude, Revoke }

        // Concluído encerra o link no Worker (o cliente ainda vê "Serviço concluído"); Cancelado e Cancelado com
        // Ressalvas revogam. Qualquer outro status (inclusive Em Execução) mantém o link.
        public static LinkAction Decide(int? newStatus, string currentLink)
        {
            if (!newStatus.HasValue || string.IsNullOrWhiteSpace(currentLink)) return LinkAction.None;
            if (newStatus.Value == PluginConfig.ServiceStatusCompleted) return LinkAction.Conclude;
            if (newStatus.Value == PluginConfig.ServiceStatusCanceled
                || newStatus.Value == PluginConfig.ServiceStatusCanceledWithReservations) return LinkAction.Revoke;
            return LinkAction.None;
        }

        // Reserva editada (endereço, trajeto, horário, motorista): recalcula o link no Worker enquanto ele vale.
        // Concluído e cancelados já encerram ou revogam o link; sem link ou link fora do formato não há o que atualizar.
        public static bool ShouldRefresh(int? status, string currentLink)
        {
            return ExtractId(currentLink) != null && Decide(status, currentLink) == LinkAction.None;
        }

        // Extrai o id (64 hex) do último segmento "/r/<id>" da URL do link. Devolve null se inválido.
        public static string ExtractId(string link)
        {
            Uri uri;
            if (string.IsNullOrWhiteSpace(link) || !Uri.TryCreate(link.Trim(), UriKind.Absolute, out uri)) return null;
            var segments = uri.AbsolutePath.Trim('/').Split('/');
            if (segments.Length < 2 || segments[segments.Length - 2] != "r") return null;
            var id = segments[segments.Length - 1];
            return NormalizeId(id);
        }

        // URL de conclusão: <url da API>/<id>/concluir. Só https.
        public static string BuildConcludeUrl(string apiUrl, string id)
        {
            var url = BuildLinkUrl(apiUrl, id);
            return url == null ? null : url + "/concluir";
        }

        // URL do link: <url da API>/<id> (DELETE revoga, PUT atualiza). Só https.
        public static string BuildLinkUrl(string apiUrl, string id)
        {
            Uri uri;
            id = NormalizeId(id);
            if (id == null) return null;
            if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps) return null;
            return apiUrl.TrimEnd('/') + "/" + id;
        }
    }
}
