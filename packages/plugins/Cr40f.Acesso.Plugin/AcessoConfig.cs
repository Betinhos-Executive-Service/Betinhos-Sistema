using System.Collections.Generic;

namespace Cr40f.Acesso.Plugin;

/// <summary>Configuração do step: não segura (ids e URLs) e segura (clientSecret).</summary>
public sealed class AcessoConfig
{
    public string TenantId { get; private set; } = "";
    public string ClientId { get; private set; } = "";
    public string ClientSecret { get; private set; } = "";
    public string LicenseSkuId { get; private set; } = "";
    public string GroupId { get; private set; } = "";
    public string AppUrl { get; private set; } = "";
    public string Dominio { get; private set; } = "betinhos.com.br";

    public static AcessoConfig Parse(string? unsecure, string? secure)
    {
        if (string.IsNullOrWhiteSpace(unsecure)) throw new AcessoException("CONFIG_AUSENTE", "O step do plugin está sem a configuração não segura.");
        if (string.IsNullOrWhiteSpace(secure)) throw new AcessoException("CONFIG_AUSENTE", "O step do plugin está sem a configuração segura (clientSecret). Rode provision-acesso.ps1.");
        var u = JsonLeve.Ler(unsecure!);
        var s = JsonLeve.Ler(secure!);
        var cfg = new AcessoConfig
        {
            TenantId = Obrigatorio(u, "tenantId"),
            ClientId = Obrigatorio(u, "clientId"),
            LicenseSkuId = Obrigatorio(u, "licenseSkuId"),
            GroupId = Obrigatorio(u, "groupId"),
            AppUrl = Obrigatorio(u, "appUrl"),
            ClientSecret = Obrigatorio(s, "clientSecret"),
        };
        if (u.TryGetValue("dominio", out var dominio) && dominio is string d && d.Length > 0) cfg.Dominio = d;
        return cfg;
    }

    private static string Obrigatorio(Dictionary<string, object?> dic, string chave)
        => dic.TryGetValue(chave, out var v) && v is string texto && texto.Length > 0 ? texto : throw new AcessoException("CONFIG_AUSENTE", "Falta '" + chave + "' na configuração do step.");
}
