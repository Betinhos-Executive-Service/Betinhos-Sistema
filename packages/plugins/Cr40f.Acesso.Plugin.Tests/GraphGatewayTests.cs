using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class GraphGatewayTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public readonly List<HttpRequestMessage> Pedidos = new();
        public Func<HttpRequestMessage, HttpResponseMessage> Responder = _ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") };
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        { Pedidos.Add(request); return Task.FromResult(Responder(request)); }
    }

    private static AcessoConfig Cfg() => AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\"}", "{\"clientSecret\":\"s\"}");

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body) };

    [Fact]
    public void UsuarioPorUpn_devolve_null_em_404_e_usuario_em_200()
    {
        var h = new Handler();
        h.Responder = r => r.RequestUri!.AbsolutePath.Contains("/token") ? Json("{\"access_token\":\"tok\"}")
            : r.RequestUri.AbsolutePath.EndsWith("/users/x%40b.com") ? Json("", HttpStatusCode.NotFound)
            : Json("{\"id\":\"1\",\"userPrincipalName\":\"y@b.com\",\"displayName\":\"Y Z\",\"accountEnabled\":true,\"assignedLicenses\":[{\"skuId\":\"sku\"}]}");
        var g = new GraphGateway(Cfg(), () => new HttpClient(h));
        Assert.Null(g.UsuarioPorUpn("x@b.com"));
        var u = g.UsuarioPorUpn("y@b.com")!;
        Assert.Equal("1", u.Id); Assert.True(u.Ativo); Assert.Contains("sku", u.SkuIds);
        Assert.Equal("Y Z", u.DisplayName);
        Assert.Equal("Bearer tok", h.Pedidos[1].Headers.Authorization!.ToString());
    }

    [Fact]
    public void CriarUsuario_envia_senha_com_troca_obrigatoria_e_nunca_a_expoe_no_erro()
    {
        var h = new Handler();
        string? corpo = null;
        h.Responder = r =>
        {
            if (r.RequestUri!.AbsolutePath.Contains("/token")) return Json("{\"access_token\":\"tok\"}");
            corpo = r.Content!.ReadAsStringAsync().Result;
            return Json("", HttpStatusCode.ServiceUnavailable);
        };
        var g = new GraphGateway(Cfg(), () => new HttpClient(h));
        var erro = Assert.Throws<AcessoException>(() => g.CriarUsuario("x@b.com", "X Y", "Senha#123456", "+5512999999999"));
        Assert.Contains("\"forceChangePasswordNextSignIn\":true", corpo);
        Assert.Contains("\"password\":\"Senha#123456\"", corpo);
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        Assert.DoesNotContain("Senha#123456", erro.Message);
    }

    [Fact]
    public void LicencasLivres_subtrai_consumidas()
    {
        var h = new Handler();
        h.Responder = r => r.RequestUri!.AbsolutePath.Contains("/token") ? Json("{\"access_token\":\"tok\"}")
            : Json("{\"value\":[{\"skuId\":\"sku\",\"consumedUnits\":3,\"prepaidUnits\":{\"enabled\":10}}]}");
        Assert.Equal(7, new GraphGateway(Cfg(), () => new HttpClient(h)).LicencasLivres("sku"));
    }
}
