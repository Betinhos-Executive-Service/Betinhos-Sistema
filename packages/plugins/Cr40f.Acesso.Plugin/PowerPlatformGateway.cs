using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;

namespace Cr40f.Acesso.Plugin;

public interface IPowerPlatformGateway
{
    /// <summary>addUser do Power Platform admin: sincroniza a conta do Entra como systemuser licenciado do ambiente.</summary>
    void SincronizarUsuario(Guid objectId);
}

/// <summary>Power Platform admin API (BAP) com client credentials. O app precisa estar registrado como app de gerenciamento.</summary>
public sealed class PowerPlatformGateway : IPowerPlatformGateway
{
    private const string Base = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/";
    public const int MaxConsultas = 5;
    internal static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(2);   // acompanha o 202 por até ~10 s; a consulta ao systemuser cobre o resto
    private readonly AcessoConfig _cfg;
    private readonly HttpClient _http;
    private readonly Action<TimeSpan> _esperar;

    public PowerPlatformGateway(AcessoConfig cfg, HttpClient http, Action<TimeSpan>? esperar = null) { _cfg = cfg; _http = http; _esperar = esperar ?? Thread.Sleep; }

    public void SincronizarUsuario(Guid objectId)
    {
        var token = Token();
        var (status, location) = Enviar(HttpMethod.Post, Base + _cfg.EnvironmentId + "/addUser?api-version=2020-10-01", token, "{\"ObjectId\":\"" + objectId.ToString("D") + "\"}");
        for (var i = 0; status == HttpStatusCode.Accepted && location is not null && i < MaxConsultas; i++)
        {
            _esperar(Intervalo);
            (status, location) = Enviar(HttpMethod.Get, location, token, null);
        }
    }

    /// <summary>200/202 são aceitos; qualquer outro vira GRAPH_INDISPONIVEL só com o status (sem corpo nem segredo).</summary>
    private (HttpStatusCode, string?) Enviar(HttpMethod metodo, string url, string token, string? corpoJson)
    {
        using var req = new HttpRequestMessage(metodo, url);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        if (corpoJson is not null) req.Content = new StringContent(corpoJson, Encoding.UTF8, "application/json");
        using var resp = _http.SendAsync(req).GetAwaiter().GetResult();
        if (resp.StatusCode != HttpStatusCode.OK && resp.StatusCode != HttpStatusCode.Accepted)
            throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " no addUser do Power Platform");
        return (resp.StatusCode, resp.Headers.Location?.ToString());
    }

    private string Token()
    {
        var corpo = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials", ["client_id"] = _cfg.ClientId, ["client_secret"] = _cfg.ClientSecret, ["scope"] = "https://api.bap.microsoft.com/.default",
        });
        using var resp = _http.PostAsync("https://login.microsoftonline.com/" + _cfg.TenantId + "/oauth2/v2.0/token", corpo).GetAwaiter().GetResult();
        if (!resp.IsSuccessStatusCode) throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " ao obter token do Power Platform");
        return (string)JsonLeve.Ler(resp.Content.ReadAsStringAsync().GetAwaiter().GetResult())["access_token"]!;
    }
}
