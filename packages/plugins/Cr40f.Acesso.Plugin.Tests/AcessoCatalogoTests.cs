using System;
using Cr40f.Acesso.Plugin;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AcessoCatalogoTests
{
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    [Fact]
    public void Nome_do_papel_segue_o_padrao()
    {
        Assert.Equal("Perfil - Financeiro - Operador", AcessoCatalogo.NomeDoPapel("financeiro", "operador"));
        Assert.Equal("Perfil - RH - Gestor", AcessoCatalogo.NomeDoPapel("rh", "gestor"));
        Assert.Equal("Perfil - Base", AcessoCatalogo.Base);
        Assert.Equal("Perfil - Administrador de acessos", AcessoCatalogo.AdminAcessos);
    }

    [Fact]
    public void Dos_papeis_ignora_o_que_nao_e_do_catalogo_e_gestor_vence()
    {
        var perfis = AcessoCatalogo.DosPapeis(new[] { "Acesso-Betinhos-MDA", "Perfil - Base", "Perfil - Frota - Operador", "Perfil - Frota - Gestor", "Perfil - Administrador de acessos" });
        Assert.Single(perfis.Areas);
        Assert.Equal("gestor", perfis.Areas["frota"]);
        Assert.True(perfis.Acessos);
    }

    [Fact]
    public void Administrador_do_sistema_vale_em_portugues_e_em_ingles()
    {
        Assert.True(AcessoCatalogo.EhAdminDoSistema(new[] { "Administrador do Sistema" }));
        Assert.True(AcessoCatalogo.EhAdminDoSistema(new[] { "Basic User", "System Administrator" }));
        Assert.False(AcessoCatalogo.EhAdminDoSistema(new[] { "Perfil - Administrador de acessos" }));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[]")]
    public void Pedido_vazio_nao_tem_perfil(string? json)
    {
        var perfis = AcessoCatalogo.LerPedido(json);
        Assert.Empty(perfis.Areas);
        Assert.False(perfis.Acessos);
    }

    [Fact]
    public void Pedido_valido_vira_areas_e_acessos()
    {
        var perfis = AcessoCatalogo.LerPedido("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"},{\"perfil\":\"acessos\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"}]");
        Assert.Equal("operador", perfis.Areas["financeiro"]);
        Assert.Equal("gestor", perfis.Areas["rh"]);
        Assert.Equal(2, perfis.Areas.Count);
        Assert.True(perfis.Acessos);
        Assert.Equal(new[] { "Perfil - Financeiro - Operador", "Perfil - RH - Gestor" }, AcessoCatalogo.PerfisDeColuna(perfis));
        Assert.Equal(new[] { "Perfil - Financeiro - Operador", "Perfil - RH - Gestor", "Perfil - Administrador de acessos" }, AcessoCatalogo.Papeis(perfis));
    }

    [Theory]
    [InlineData("{nao e json")]
    [InlineData("{\"perfil\":\"rh\",\"nivel\":\"gestor\"}")]
    [InlineData("[\"rh\"]")]
    [InlineData("[{\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"diretoria\",\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"rh\"}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":\"chefe\"}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":2}]")]
    [InlineData("[{\"perfil\":\"rh\",\"nivel\":\"operador\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"}]")]
    [InlineData("[{\"perfil\":\"Perfil - RH - Gestor\",\"nivel\":\"gestor\"}]")]
    public void Pedido_invalido_e_recusado(string json)
    {
        Assert.Equal("PERFIL_INVALIDO", Codigo(() => AcessoCatalogo.LerPedido(json)));
    }

    [Fact]
    public void Json_sai_em_ordem_alfabetica_com_acessos_por_ultimo_e_volta_igual()
    {
        var perfis = AcessoCatalogo.LerPedido("[{\"perfil\":\"acessos\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]");
        var json = AcessoCatalogo.Json(perfis);
        Assert.Equal("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"},{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"acessos\"}]", json);
        Assert.Equal(json, AcessoCatalogo.Json(AcessoCatalogo.LerPedido(json)));
        Assert.Equal("[]", AcessoCatalogo.Json(new PerfisDoUsuario()));
    }
}
