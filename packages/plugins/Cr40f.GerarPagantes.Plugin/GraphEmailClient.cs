using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class GraphEmailClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(25) };
    private readonly PluginSettings _settings;

    public GraphEmailClient(PluginSettings settings) => _settings = settings;

    public async Task SendAsync(string payerEmail, PaymentEmail email, IReadOnlyCollection<InlineEmailAsset> assets)
    {
        var token = await GetTokenAsync().ConfigureAwait(false);
        var recipients = _settings.InternalRecipients
            .Concat(new[] { payerEmail })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(Address)
            .ToArray();
        var message = new
        {
            message = new
            {
                subject = email.Subject,
                importance = "normal",
                body = new { contentType = "HTML", content = email.HtmlBody },
                toRecipients = recipients,
                replyTo = string.IsNullOrWhiteSpace(_settings.ReplyToEmail) ? Array.Empty<object>() : new[] { Address(_settings.ReplyToEmail) },
                attachments = assets.Select(asset => new Dictionary<string, object>
                {
                    ["@odata.type"] = "#microsoft.graph.fileAttachment",
                    ["name"] = asset.FileName,
                    ["contentType"] = asset.ContentType,
                    ["contentBytes"] = asset.ContentBytes,
                    ["contentId"] = asset.ContentId,
                    ["isInline"] = true
                }).ToArray()
            },
            saveToSentItems = true
        };
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(_settings.SenderEmail)}/sendMail")
        {
            Content = new StringContent(JsonConvert.SerializeObject(message), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await Http.SendAsync(request).ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.Accepted)
            throw new GraphEmailException($"Microsoft Graph recusou o e-mail ({(int)response.StatusCode}).", response.StatusCode,
                await response.Content.ReadAsStringAsync().ConfigureAwait(false));
    }

    private async Task<string> GetTokenAsync()
    {
        var body = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = _settings.GraphClientId,
            ["client_secret"] = _settings.GraphClientSecret,
            ["scope"] = "https://graph.microsoft.com/.default",
            ["grant_type"] = "client_credentials"
        });
        using var response = await Http.PostAsync(
            $"https://login.microsoftonline.com/{Uri.EscapeDataString(_settings.GraphTenantId)}/oauth2/v2.0/token", body)
            .ConfigureAwait(false);
        var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
            throw new GraphEmailException($"Microsoft Entra recusou a autenticação ({(int)response.StatusCode}).", response.StatusCode, responseBody);
        var token = JsonConvert.DeserializeObject<GraphToken>(responseBody);
        return token?.AccessToken ?? throw new InvalidOperationException("Token Microsoft Graph ausente.");
    }

    private static object Address(string address) => new { emailAddress = new { address = address.Trim() } };
}

public sealed class GraphToken
{
    [JsonProperty("access_token")]
    public string? AccessToken { get; set; }
}

public sealed class GraphEmailException : Exception
{
    public GraphEmailException(string message, HttpStatusCode statusCode, string responseBody) : base(message)
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
    }

    public HttpStatusCode StatusCode { get; }
    public string ResponseBody { get; }
}
