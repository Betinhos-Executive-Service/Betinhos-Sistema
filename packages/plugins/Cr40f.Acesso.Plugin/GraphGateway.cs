using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;

namespace Cr40f.Acesso.Plugin;

/// <summary>Microsoft Graph com client credentials. Senha e segredo nunca entram em mensagens de erro.</summary>
public sealed class GraphGateway : IGraphGateway
{
    private const string Base = "https://graph.microsoft.com/v1.0";
    private readonly AcessoConfig _cfg;
    /// <summary>Um cliente por processo do sandbox: evita handshake TLS e esgotar sockets a cada execução.</summary>
    internal static readonly HttpClient Compartilhado = new();
    private readonly HttpClient _http;
    private string? _token;

    public GraphGateway(AcessoConfig cfg, HttpClient http) { _cfg = cfg; _http = http; }

    public GraphUsuario? UsuarioPorUpn(string upn)
    {
        var resp = Enviar(HttpMethod.Get, "/users/" + Uri.EscapeDataString(upn) + "?$select=id,userPrincipalName,displayName,accountEnabled,assignedLicenses", null, aceitar404: true);
        return resp is null ? null : LerUsuario(JsonLeve.Ler(resp));
    }

    public GraphUsuario CriarUsuario(string upn, string nome, string senhaTemporaria, string? celular, string? emailPessoal = null)
    {
        var mailNickname = upn.Split('@')[0];
        var corpo = "{\"accountEnabled\":true,\"displayName\":" + JsonLeve.Texto(nome) + ",\"mailNickname\":" + JsonLeve.Texto(mailNickname)
            + ",\"userPrincipalName\":" + JsonLeve.Texto(upn) + ",\"usageLocation\":\"BR\",\"preferredLanguage\":\"pt-BR\""
            + (celular is null ? "" : ",\"mobilePhone\":" + JsonLeve.Texto(celular))
            + (emailPessoal is null ? "" : ",\"otherMails\":[" + JsonLeve.Texto(emailPessoal) + "]")
            + ",\"passwordProfile\":{\"forceChangePasswordNextSignIn\":false,\"password\":" + JsonLeve.Texto(senhaTemporaria) + "}}";
        return LerUsuario(JsonLeve.Ler(Enviar(HttpMethod.Post, "/users", corpo)!));
    }

    public void DefinirAtivo(string usuarioId, bool ativo)
        => Enviar(new HttpMethod("PATCH"), "/users/" + usuarioId, "{\"accountEnabled\":" + (ativo ? "true" : "false") + "}");

    public void AtribuirLicenca(string usuarioId, string skuId)
        => Enviar(HttpMethod.Post, "/users/" + usuarioId + "/assignLicense", "{\"addLicenses\":[{\"skuId\":" + JsonLeve.Texto(skuId) + ",\"disabledPlans\":[]}],\"removeLicenses\":[]}");

    public void RemoverLicenca(string usuarioId, string skuId)
        => Enviar(HttpMethod.Post, "/users/" + usuarioId + "/assignLicense", "{\"addLicenses\":[],\"removeLicenses\":[" + JsonLeve.Texto(skuId) + "]}");

    public bool EhMembro(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Get, "/groups/" + grupoId + "/members/" + usuarioId + "?$select=id", null, aceitar404: true) is not null;

    public void AdicionarAoGrupo(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Post, "/groups/" + grupoId + "/members/$ref", "{\"@odata.id\":\"" + Base + "/directoryObjects/" + usuarioId + "\"}");

    public void RemoverDoGrupo(string grupoId, string usuarioId)
        => Enviar(HttpMethod.Delete, "/groups/" + grupoId + "/members/" + usuarioId + "/$ref", null, aceitar404: true);

    public int LicencasLivres(string skuId)
    {
        var lista = (List<object?>)JsonLeve.Ler(Enviar(HttpMethod.Get, "/subscribedSkus", null)!)["value"]!;
        foreach (var sku in lista.Cast<Dictionary<string, object?>>())
        {
            if (!string.Equals((string?)sku["skuId"], skuId, StringComparison.OrdinalIgnoreCase)) continue;
            var habilitadas = Convert.ToInt32(((Dictionary<string, object?>)sku["prepaidUnits"]!)["enabled"], CultureInfo.InvariantCulture);
            return habilitadas - Convert.ToInt32(sku["consumedUnits"], CultureInfo.InvariantCulture);
        }
        throw new AcessoException("CONFIG_AUSENTE", "SKU de licença não existe no tenant: " + skuId + ".");
    }

    private static GraphUsuario LerUsuario(Dictionary<string, object?> j)
    {
        var u = new GraphUsuario
        {
            Id = (string)j["id"]!,
            Upn = (string)j["userPrincipalName"]!,
            DisplayName = j.TryGetValue("displayName", out var d) && d is string nome ? nome : "",
            Ativo = j.TryGetValue("accountEnabled", out var a) && a is bool b && b,
        };
        if (j.TryGetValue("assignedLicenses", out var l) && l is List<object?> lics)
            foreach (var lic in lics.Cast<Dictionary<string, object?>>()) u.SkuIds.Add((string)lic["skuId"]!);
        return u;
    }

    private string Token()
    {
        if (_token is not null) return _token;
        var corpo = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials", ["client_id"] = _cfg.ClientId, ["client_secret"] = _cfg.ClientSecret, ["scope"] = "https://graph.microsoft.com/.default",
        });
        var resp = _http.PostAsync("https://login.microsoftonline.com/" + _cfg.TenantId + "/oauth2/v2.0/token", corpo).GetAwaiter().GetResult();
        if (!resp.IsSuccessStatusCode) throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " ao obter token do Graph");
        _token = (string)JsonLeve.Ler(resp.Content.ReadAsStringAsync().GetAwaiter().GetResult())["access_token"]!;
        return _token;
    }

    /// <summary>Devolve o corpo da resposta; null em 404 quando aceitar404. Nunca inclui o corpo enviado na exceção.</summary>
    private string? Enviar(HttpMethod metodo, string rota, string? corpoJson, bool aceitar404 = false)
    {
        using var req = new HttpRequestMessage(metodo, Base + rota);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", Token());
        if (corpoJson is not null) req.Content = new StringContent(corpoJson, Encoding.UTF8, "application/json");
        using var resp = _http.SendAsync(req).GetAwaiter().GetResult();
        if (aceitar404 && resp.StatusCode == HttpStatusCode.NotFound) return null;
        if (!resp.IsSuccessStatusCode) throw new AcessoException("GRAPH_INDISPONIVEL", ((int)resp.StatusCode) + " em " + metodo.Method + " " + rota.Split('?')[0]);
        return resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
    }
}
