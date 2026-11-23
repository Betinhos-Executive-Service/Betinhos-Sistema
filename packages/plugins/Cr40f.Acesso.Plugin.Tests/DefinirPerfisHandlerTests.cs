using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class DefinirPerfisHandlerTests
{
    private const string Antigo = "Acesso-Betinhos-MDA";
    private const string Admin = "Administrador do Sistema";
    private const string FinanceiroOperador = "[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]";
    private const string FinanceiroGestor = "[{\"perfil\":\"financeiro\",\"nivel\":\"gestor\"}]";

    private readonly FakeService _svc = new();
    private readonly Guid _bu = Guid.NewGuid();
    private readonly Dictionary<string, Guid> _papeis = new();
    private readonly Dictionary<string, Guid> _colunas = new();

    public DefinirPerfisHandlerTests()
    {
        foreach (var nome in new[] { Admin, Antigo, AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos }) Papel(nome);
        foreach (var area in new[] { "operacional", "financeiro", "frota", "rh" })
            foreach (var nivel in new[] { "operador", "gestor" })
            {
                Papel(AcessoCatalogo.NomeDoPapel(area, nivel));
                PerfilDeColuna(AcessoCatalogo.NomeDoPapel(area, nivel));
            }
    }

    private void Papel(string nome)
    {
        var e = new Entity("role", Guid.NewGuid()) { ["name"] = nome, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(e); _papeis[nome] = e.Id;
    }

    private void PerfilDeColuna(string nome)
    {
        var e = new Entity("fieldsecurityprofile", Guid.NewGuid()) { ["name"] = nome };
        _svc.Com(e); _colunas[nome] = e.Id;
    }

    private Guid Usuario(params string[] papeis) => UsuarioEm(_bu, papeis);

    private Guid UsuarioEm(Guid bu, params string[] papeis)
    {
        var u = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Pessoa de Teste", ["isdisabled"] = false, ["businessunitid"] = new EntityReference("businessunit", bu) };
        _svc.Com(u);
        foreach (var papel in papeis) Vincular(u.Id, papel);
        return u.Id;
    }

    private void Vincular(Guid usuario, string papel) => _svc.Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["roleid"] = _papeis[papel] });
    private string Executar(Guid chamador, Guid usuario, string perfis) => new DefinirPerfisHandler(_svc).Executar(chamador, usuario, perfis);
    private bool Tem(Guid usuario, string papel) => PapeisDoUsuario.IdsDiretos(_svc, usuario).Contains(_papeis[papel]);
    private bool TemColuna(Guid usuario, string perfil) => PapeisDoUsuario.Ids(_svc, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid").Contains(_colunas[perfil]);
    private List<Entity> Historico() => _svc.Criados.Where(e => e.LogicalName == "cr40f_acessohistorico").ToList();
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    [Fact]
    public void Quem_nao_e_administrador_de_acessos_nao_altera()
    {
        var chamador = Usuario(Antigo, "Perfil - Financeiro - Gestor"); var alvo = Usuario();
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, alvo, FinanceiroOperador)));
        Assert.Empty(_svc.Associados);
        Assert.Empty(Historico());
    }

    [Fact]
    public void Ninguem_altera_o_proprio_acesso()
    {
        var admin = Usuario(Admin);
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Executar(admin, admin, FinanceiroGestor)));
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos);
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Executar(gestorDeAcessos, gestorDeAcessos, FinanceiroGestor)));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Alvo_desativado_de_aplicacao_ou_inexistente_e_recusado()
    {
        var admin = Usuario(Admin);
        var desativado = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Saiu", ["isdisabled"] = true, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        var aplicacao = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "# Flow", ["isdisabled"] = false, ["applicationid"] = Guid.NewGuid(), ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(desativado, aplicacao);
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, desativado.Id, FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, aplicacao.Id, FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, Guid.NewGuid(), FinanceiroOperador)));
        Assert.Equal("USUARIO_INVALIDO", Codigo(() => Executar(admin, Guid.Empty, FinanceiroOperador)));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Pedido_invalido_nao_altera_nada()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Assert.Equal("PERFIL_INVALIDO", Codigo(() => Executar(admin, alvo, "[{\"perfil\":\"diretoria\",\"nivel\":\"gestor\"}]")));
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Perfil_nao_publicado_na_unidade_do_alvo_e_recusado_sem_alterar()
    {
        var admin = Usuario(Admin); var alvo = UsuarioEm(Guid.NewGuid());
        var erro = Assert.Throws<AcessoException>(() => Executar(admin, alvo, FinanceiroOperador));
        Assert.Equal("PERFIL_INDISPONIVEL", erro.Codigo);
        Assert.Contains("Perfil - Base", erro.Message);
        Assert.Contains("Perfil - Financeiro - Operador", erro.Message);
        Assert.Empty(_svc.Associados);
    }

    [Fact]
    public void Atribui_papel_perfil_de_coluna_base_e_grava_o_historico()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Antigo);
        var resultado = Executar(admin, alvo, FinanceiroOperador);

        Assert.True(Tem(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(TemColuna(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
        Assert.True(Tem(alvo, Antigo));
        var linha = Assert.Single(Historico());
        Assert.Equal("Pessoa de Teste", linha.GetAttributeValue<string>("cr40f_name"));
        Assert.Equal(alvo, linha.GetAttributeValue<EntityReference>("cr40f_usuario").Id);
        Assert.Equal(admin, linha.GetAttributeValue<EntityReference>("cr40f_alteradopor").Id);
        Assert.Equal("[]", linha.GetAttributeValue<string>("cr40f_perfisantes"));
        Assert.Equal(FinanceiroOperador, linha.GetAttributeValue<string>("cr40f_perfisdepois"));
        Assert.Equal("{\"antes\":[],\"depois\":" + FinanceiroOperador + ",\"historico\":\"" + linha.Id + "\"}", resultado);
    }

    [Fact]
    public void Trocar_de_operador_para_gestor_troca_papel_e_perfil_de_coluna()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, FinanceiroOperador);
        Executar(admin, alvo, FinanceiroGestor);

        Assert.False(Tem(alvo, "Perfil - Financeiro - Operador"));
        Assert.False(TemColuna(alvo, "Perfil - Financeiro - Operador"));
        Assert.True(Tem(alvo, "Perfil - Financeiro - Gestor"));
        Assert.True(TemColuna(alvo, "Perfil - Financeiro - Gestor"));
        Assert.Equal(2, Historico().Count);
        Assert.Equal(FinanceiroOperador, Historico()[1].GetAttributeValue<string>("cr40f_perfisantes"));
        Assert.Equal(FinanceiroGestor, Historico()[1].GetAttributeValue<string>("cr40f_perfisdepois"));
    }

    [Fact]
    public void Repetir_o_mesmo_pedido_nao_grava_historico_nem_associa_de_novo()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, FinanceiroOperador);
        var associados = _svc.Associados.Count;
        var resultado = Executar(admin, alvo, FinanceiroOperador);

        Assert.EndsWith(",\"historico\":null}", resultado);
        Assert.Single(Historico());
        Assert.Equal(associados, _svc.Associados.Count);
        Assert.Empty(_svc.Desassociados);
    }

    [Fact]
    public void Perfil_de_coluna_faltando_e_reposto_sem_historico()
    {
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, "Perfil - RH - Operador");
        var resultado = Executar(admin, alvo, "[{\"perfil\":\"rh\",\"nivel\":\"operador\"}]");

        Assert.True(TemColuna(alvo, "Perfil - RH - Operador"));
        Assert.EndsWith(",\"historico\":null}", resultado);
        Assert.Empty(Historico());
    }

    [Fact]
    public void Administrador_de_acessos_altera_area_mas_nao_concede_nem_retira_acessos()
    {
        var chamador = Usuario(AcessoCatalogo.AdminAcessos);
        var comum = Usuario(); var outroGestor = Usuario(AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos);

        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, comum, "[{\"perfil\":\"acessos\"}]")));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Executar(chamador, outroGestor, "[]")));
        Assert.Empty(_svc.Associados);
        Assert.Empty(_svc.Desassociados);

        Executar(chamador, outroGestor, "[{\"perfil\":\"acessos\"},{\"perfil\":\"frota\",\"nivel\":\"operador\"}]");
        Assert.True(Tem(outroGestor, "Perfil - Frota - Operador"));
        Assert.True(Tem(outroGestor, AcessoCatalogo.AdminAcessos));
    }

    [Fact]
    public void Administrador_do_sistema_concede_e_retira_acessos()
    {
        var admin = Usuario(Admin); var alvo = Usuario();
        Executar(admin, alvo, "[{\"perfil\":\"acessos\"}]");
        Assert.True(Tem(alvo, AcessoCatalogo.AdminAcessos));
        Executar(admin, alvo, "[]");
        Assert.False(Tem(alvo, AcessoCatalogo.AdminAcessos));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
    }

    [Fact]
    public void Administrador_do_sistema_por_equipe_tambem_vale()
    {
        var chamador = Usuario(); var alvo = Usuario(); var equipe = Guid.NewGuid();
        _svc.Com(new Entity("teammembership", Guid.NewGuid()) { ["systemuserid"] = chamador, ["teamid"] = equipe });
        _svc.Com(new Entity("teamroles", Guid.NewGuid()) { ["teamid"] = equipe, ["roleid"] = _papeis[Admin] });

        Executar(chamador, alvo, "[{\"perfil\":\"acessos\"}]");
        Assert.True(Tem(alvo, AcessoCatalogo.AdminAcessos));
    }

    [Fact]
    public void Lista_vazia_retira_as_areas_mantem_o_base_e_nao_toca_nos_papeis_antigos()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Antigo);
        Executar(admin, alvo, "[{\"perfil\":\"rh\",\"nivel\":\"gestor\"},{\"perfil\":\"frota\",\"nivel\":\"operador\"}]");
        Executar(admin, alvo, "[]");

        Assert.False(Tem(alvo, "Perfil - RH - Gestor"));
        Assert.False(TemColuna(alvo, "Perfil - RH - Gestor"));
        Assert.False(Tem(alvo, "Perfil - Frota - Operador"));
        Assert.True(Tem(alvo, AcessoCatalogo.Base));
        Assert.True(Tem(alvo, Antigo));
        Assert.DoesNotContain(_svc.Desassociados, d => d.Alvo == _papeis[Antigo] || d.Alvo == _papeis[AcessoCatalogo.Base]);
        Assert.Equal("[]", Historico()[1].GetAttributeValue<string>("cr40f_perfisdepois"));
    }
}
