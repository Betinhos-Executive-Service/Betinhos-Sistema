using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class CieloClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly string _clientId;
    private readonly string _clientSecret;

    public CieloClient(string clientId, string clientSecret)
    {
        _clientId = !string.IsNullOrWhiteSpace(clientId) ? clientId.Trim() : throw new ArgumentException("Client ID Cielo ausente.", nameof(clientId));
        _clientSecret = !string.IsNullOrWhiteSpace(clientSecret) ? clientSecret.Trim() : throw new ArgumentException("Client Secret Cielo ausente.", nameof(clientSecret));
    }

    public async Task<CieloLink> CreateLinkAsync(string orderNumber, string name, string description, int amountCents)
    {
        var token = await GetTokenAsync().ConfigureAwait(false);
        var content = JsonConvert.SerializeObject(new
        {
            shipping = new { type = "WithoutShipping" },
            type = "Service",
            name,
            description,
            showDescription = true,
            price = amountCents,
            maxNumberOfInstallments = 1,
            softDescriptor = "Betinhos",
            OrderNumber = orderNumber
        });
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://cieloecommerce.cielo.com.br/api/public/v1/products/")
        {
            Content = new StringContent(content, Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await Http.SendAsync(request).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.OK && response.StatusCode != HttpStatusCode.Created)
            throw new CieloException($"Cielo respondeu {(int)response.StatusCode}.", response.StatusCode, body);
        var link = JsonConvert.DeserializeObject<CieloLink>(body);
        if (link == null || string.IsNullOrWhiteSpace(link.Id) || string.IsNullOrWhiteSpace(link.ShortUrl))
            throw new CieloException("Cielo não retornou id e shortUrl do link.", response.StatusCode, body);
        return link;
    }

    public async Task DeleteLinkAsync(string cieloLinkId)
    {
        var token = await GetTokenAsync().ConfigureAwait(false);
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"https://cieloecommerce.cielo.com.br/api/public/v1/products/{Uri.EscapeDataString(cieloLinkId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await Http.SendAsync(request).ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.NoContent && !response.IsSuccessStatusCode)
            throw new CieloException($"Cielo recusou exclusão do link {(int)response.StatusCode}.", response.StatusCode, await response.Content.ReadAsStringAsync().ConfigureAwait(false));
    }

    private async Task<string> GetTokenAsync()
    {
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_clientId}:{_clientSecret}"));
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://cieloecommerce.cielo.com.br/api/public/v2/token")
        {
            Content = new StringContent("grant_type=client_credentials", Encoding.UTF8, "application/x-www-form-urlencoded")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        using var response = await Http.SendAsync(request).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
            throw new CieloException($"Cielo recusou a autenticação {(int)response.StatusCode}.", response.StatusCode, body);
        var token = JsonConvert.DeserializeObject<CieloToken>(body);
        return token?.AccessToken ?? throw new InvalidOperationException("Token Cielo ausente.");
    }
}

public sealed class CieloToken { [JsonProperty("access_token")] public string? AccessToken { get; set; } }
public sealed class CieloLink { [JsonProperty("id")] public string? Id { get; set; } [JsonProperty("shortUrl")] public string? ShortUrl { get; set; } }
public sealed class CieloException : Exception { public CieloException(string message, HttpStatusCode statusCode, string responseBody) : base(message) { StatusCode = statusCode; ResponseBody = responseBody; } public HttpStatusCode StatusCode { get; } public string ResponseBody { get; } }
