using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class PowerPlatformGatewayTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public readonly List<(HttpRequestMessage Pedido, string? Corpo)> Pedidos = new();
        public Func<HttpRequestMessage, HttpResponseMessage> Responder = _ => new HttpResponseMessage(HttpStatusCode.OK);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Pedidos.Add((request, request.Content is null ? null : await request.Content.ReadAsStringAsync()));
            return request.RequestUri!.AbsolutePath.Contains("/oauth2/") ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"access_token\":\"tok\"}") } : Responder(request);
        }
    }

    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\",\"environmentId\":\"env-1\"}", "{\"clientSecret\":\"s3gr3d0\"}");
    private static readonly Guid ObjectId = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private readonly List<TimeSpan> _esperas = new();
    private PowerPlatformGateway Gateway(Handler h) => new(Cfg, new HttpClient(h), _esperas.Add);

    [Fact]
    public void AddUser_200_envia_object_id_com_token_do_escopo_BAP()
    {
        var h = new Handler();
        Gateway(h).SincronizarUsuario(ObjectId);
        Assert.Equal(2, h.Pedidos.Count);
        Assert.Equal("https://login.microsoftonline.com/t/oauth2/v2.0/token", h.Pedidos[0].Pedido.RequestUri!.ToString());
        Assert.Contains("scope=https%3A%2F%2Fapi.bap.microsoft.com%2F.default", h.Pedidos[0].Corpo);
        var add = h.Pedidos[1];
        Assert.Equal(HttpMethod.Post, add.Pedido.Method);
        Assert.Equal("https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/env-1/addUser?api-version=2020-10-01", add.Pedido.RequestUri!.ToString());
        Assert.Equal("{\"ObjectId\":\"11111111-2222-3333-4444-555555555555\"}", add.Corpo);
        Assert.Equal("Bearer tok", add.Pedido.Headers.Authorization!.ToString());
        Assert.Empty(_esperas);
    }

    [Fact]
    public void AddUser_202_com_Location_consulta_ate_concluir()
    {
        var consultas = 0;
        var h = new Handler { Responder = r => r.Method == HttpMethod.Post || ++consultas < 3 ? Aceito() : new HttpResponseMessage(HttpStatusCode.OK) };
        Gateway(h).SincronizarUsuario(ObjectId);
        Assert.Equal(3, consultas);
        Assert.Equal(3, _esperas.Count);
        Assert.All(h.Pedidos.Skip(2), p => { Assert.Equal(HttpMethod.Get, p.Pedido.Method); Assert.Equal("https://bap/op/1", p.Pedido.RequestUri!.ToString()); Assert.Equal("Bearer tok", p.Pedido.Headers.Authorization!.ToString()); });
    }

    [Fact]
    public void AddUser_202_sem_fim_para_no_limite_de_tempo()
    {
        var h = new Handler { Responder = _ => Aceito() };
        Gateway(h).SincronizarUsuario(ObjectId);
        Assert.Equal(PowerPlatformGateway.MaxConsultas, _esperas.Count);
        Assert.True(_esperas.Aggregate(TimeSpan.Zero, (a, b) => a + b) <= TimeSpan.FromSeconds(40));
    }

    [Fact]
    public void AddUser_403_vira_GRAPH_INDISPONIVEL_sem_vazar_corpo_nem_segredo()
    {
        var h = new Handler { Responder = _ => new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("{\"error\":\"app nao registrado tok s3gr3d0\"}") } };
        var erro = Assert.Throws<AcessoException>(() => Gateway(h).SincronizarUsuario(ObjectId));
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        Assert.Equal("GRAPH_INDISPONIVEL: 403 no addUser do Power Platform", erro.Message);
    }

    private static HttpResponseMessage Aceito()
    {
        var r = new HttpResponseMessage(HttpStatusCode.Accepted);
        r.Headers.Location = new Uri("https://bap/op/1");
        return r;
    }
}
