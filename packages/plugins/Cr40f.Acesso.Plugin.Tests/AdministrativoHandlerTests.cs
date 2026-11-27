using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>Encerrar e reativar o acesso de um administrativo (cr40f_AcessoEncerrar / cr40f_AcessoReativar).</summary>
public sealed class AdministrativoHandlerTests
{
    private const string Antigo = "Acesso-Betinhos-MDA";
    private const string Admin = "Administrador do Sistema";
    private const string FinOp = "Perfil - Financeiro - Operador";
    private const string FinGestor = "Perfil - Financeiro - Gestor";

    private readonly FakeService _svc = new();
    private readonly Guid _bu = Guid.NewGuid();
    private readonly Dictionary<string, Guid> _papeis = new();
    private readonly Dictionary<string, Guid> _colunas = new();

    public AdministrativoHandlerTests()
    {
        foreach (var nome in new[] { Admin, Antigo, AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos, FinOp, FinGestor })
        {
            var e = new Entity("role", Guid.NewGuid()) { ["name"] = nome, ["businessunitid"] = new EntityReference("businessunit", _bu) };
            _svc.Com(e); _papeis[nome] = e.Id;
        }
        foreach (var nome in new[] { FinOp, AcessoCatalogo.AdminAcessos })
        {
            var e = new Entity("fieldsecurityprofile", Guid.NewGuid()) { ["name"] = nome };
            _svc.Com(e); _colunas[nome] = e.Id;
        }
    }

    private Guid Usuario(params string[] papeis)
    {
        var u = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Pessoa de Teste", ["isdisabled"] = false, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(u);
        foreach (var p in papeis) _svc.Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = u.Id, ["roleid"] = _papeis[p] });
        return u.Id;
    }

    private void Coluna(Guid usuario, string perfil) =>
        _svc.Com(new Entity("systemuserprofiles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["fieldsecurityprofileid"] = _colunas[perfil] });

    private Guid Equipe(Guid usuario, string nome, string[] papeis, bool padrao = false, int tipo = 0)
    {
        var t = new Entity("team", Guid.NewGuid()) { ["name"] = nome, ["isdefault"] = padrao, ["teamtype"] = new OptionSetValue(tipo) };
        _svc.Com(t, new Entity("teammembership", Guid.NewGuid()) { ["systemuserid"] = usuario, ["teamid"] = t.Id });
        foreach (var p in papeis) _svc.Com(new Entity("teamroles", Guid.NewGuid()) { ["teamid"] = t.Id, ["roleid"] = _papeis[p] });
        return t.Id;
    }

    private string Encerrar(Guid chamador, Guid alvo, string? confirmacao = "pessoa") => new EncerrarAdministrativoHandler(_svc).Executar(chamador, alvo, confirmacao).ToJson();
    private string Reativar(Guid chamador, Guid alvo) => new ReativarAdministrativoHandler(_svc).Executar(chamador, alvo).ToJson();
    private List<Guid> Diretos(Guid u) => PapeisDoUsuario.IdsDiretos(_svc, u);
    private List<Guid> Colunas(Guid u) => PapeisDoUsuario.Ids(_svc, "systemuserprofiles", "systemuserid", u, "fieldsecurityprofileid");
    private List<Guid> Equipes(Guid u) => PapeisDoUsuario.Ids(_svc, "teammembership", "systemuserid", u, "teamid");
    private bool Bloqueado(Guid u) => _svc.Linhas("systemuser").Single(e => e.Id == u).GetAttributeValue<bool>("isdisabled");
    private List<Entity> Historico() => _svc.Linhas("cr40f_acessohistorico").OrderBy(e => (DateTime)e["createdon"]).ToList();
    private static List<Dictionary<string, object?>> Lista(Dictionary<string, object?> r, string campo) => ((List<object?>)r[campo]!).Cast<Dictionary<string, object?>>().ToList();
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    /// <summary>Dois Administradores do Sistema além do alvo: nenhum teste cai no ULTIMO_ADMIN sem querer.</summary>
    private Guid DoisAdmins() { Usuario(Admin); return Usuario(Admin); }

    private void NadaMudou(Guid alvo, int papeis)
    {
        Assert.Equal(papeis, Diretos(alvo).Count);
        Assert.False(Bloqueado(alvo));
        Assert.Empty(Historico());
        Assert.Empty(_svc.Desassociados);
    }

    [Fact]
    public void Encerrar_tira_papeis_perfis_de_coluna_e_equipes_grava_o_historico_e_bloqueia()
    {
        var admin = DoisAdmins();
        var alvo = Usuario(AcessoCatalogo.Base, FinOp);
        Coluna(alvo, FinOp);
        var equipe = Equipe(alvo, "Equipe Financeiro", new[] { FinGestor });
        var padrao = Equipe(alvo, "Unidade raiz", new[] { AcessoCatalogo.Base }, padrao: true);
        var semPapel = Equipe(alvo, "Equipe sem papel", new string[0]);

        var etapas = Encerrar(admin, alvo, "  PÉSSOA ");

        Assert.Empty(Diretos(alvo));
        Assert.Empty(Colunas(alvo));
        Assert.Equal(new[] { padrao, semPapel }.OrderBy(x => x), Equipes(alvo).OrderBy(x => x));
        Assert.True(Bloqueado(alvo));
        var linha = Assert.Single(Historico());
        Assert.Equal(alvo, linha.GetAttributeValue<EntityReference>("cr40f_usuario").Id);
        Assert.Equal(admin, linha.GetAttributeValue<EntityReference>("cr40f_alteradopor").Id);
        Assert.Equal("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]", linha["cr40f_perfisantes"]);
        Assert.Equal("[]", linha["cr40f_perfisdepois"]);
        var amplo = JsonLeve.Ler((string)linha["cr40f_amplo"]);
        Assert.Equal("encerrar", amplo["acao"]);
        Assert.Equal(new[] { AcessoCatalogo.Base, FinOp }.OrderBy(n => n), Lista(amplo, "papeis").Select(p => (string)p["nome"]!).OrderBy(n => n));
        Assert.Equal(_colunas[FinOp].ToString(), Assert.Single(Lista(amplo, "perfisColuna"))["id"]);
        var e = Assert.Single(Lista(amplo, "equipes"));
        Assert.Equal(equipe.ToString(), e["id"]); Assert.Equal("Equipe Financeiro", e["nome"]);
        Assert.Contains("{\"etapa\":\"conferencia\",\"estado\":\"feita\"", etapas);
        Assert.Contains("{\"etapa\":\"bloqueio\",\"estado\":\"feita\"", etapas);
    }

    [Fact]
    public void Encerrar_pula_equipe_do_Entra_e_a_conferencia_aponta_o_que_sobrou()
    {
        var admin = DoisAdmins();
        var alvo = Usuario(AcessoCatalogo.Base);
        var grupo = Equipe(alvo, "Grupo do Entra", new[] { FinOp }, tipo: 2);
        _svc.IgnorarExecute = true;

        var etapas = Encerrar(admin, alvo);

        Assert.Contains(grupo, Equipes(alvo));
        Assert.Contains("Grupo do Entra: equipe de grupo do Entra", etapas);
        Assert.Contains("{\"etapa\":\"conferencia\",\"estado\":\"erro\",\"detalhe\":\"usuário ainda habilitado\"}", etapas);
        Assert.Empty(Lista(JsonLeve.Ler((string)Historico().Single()["cr40f_amplo"]), "equipes"));
    }

    [Fact]
    public void Sem_perfil_Administrador_de_acessos_e_recusado()
    {
        DoisAdmins();
        var chamador = Usuario(FinGestor, Antigo); var alvo = Usuario(AcessoCatalogo.Base);
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Encerrar(chamador, alvo)));
        NadaMudou(alvo, 1);
    }

    [Fact]
    public void Amplo_direto_ou_por_equipe_so_o_Administrador_do_Sistema_encerra()
    {
        DoisAdmins();
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos);
        var direto = Usuario(AcessoCatalogo.Base, Antigo);
        var porEquipe = Usuario(AcessoCatalogo.Base);
        Equipe(porEquipe, "Equipe antiga", new[] { Antigo });

        Assert.Equal("SEM_PERMISSAO", Codigo(() => Encerrar(gestorDeAcessos, direto)));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Encerrar(gestorDeAcessos, porEquipe)));
        NadaMudou(direto, 2);

        // Sem o amplo, o Administrador de acessos encerra.
        var comum = Usuario(AcessoCatalogo.Base, FinOp);
        Encerrar(gestorDeAcessos, comum);
        Assert.True(Bloqueado(comum));
    }

    [Fact]
    public void Ninguem_encerra_o_proprio_acesso()
    {
        DoisAdmins();
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos);
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Encerrar(gestorDeAcessos, gestorDeAcessos)));
        Assert.Equal("PROPRIO_ACESSO", Codigo(() => Reativar(gestorDeAcessos, gestorDeAcessos)));
        NadaMudou(gestorDeAcessos, 1);
    }

    [Fact]
    public void Encerrar_que_deixa_menos_de_2_Administradores_do_Sistema_e_recusado()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Admin, AcessoCatalogo.Base);
        Assert.Equal("ULTIMO_ADMIN", Codigo(() => Encerrar(admin, alvo)));
        NadaMudou(alvo, 2);

        Usuario(Admin);
        Encerrar(admin, alvo);
        Assert.Empty(Diretos(alvo));
    }

    [Fact]
    public void Primeiro_nome_errado_e_recusado()
    {
        var admin = DoisAdmins(); var alvo = Usuario(AcessoCatalogo.Base);
        Assert.Equal("CONFIRMACAO_INVALIDA", Codigo(() => Encerrar(admin, alvo, "Outra")));
        Assert.Equal("CONFIRMACAO_INVALIDA", Codigo(() => Encerrar(admin, alvo, "Pessoa de Teste")));
        Assert.Equal("CONFIRMACAO_INVALIDA", Codigo(() => Encerrar(admin, alvo, null)));
        NadaMudou(alvo, 1);
    }

    [Fact]
    public void Encerrar_duas_vezes_e_JA_ENCERRADO()
    {
        var admin = DoisAdmins(); var alvo = Usuario(AcessoCatalogo.Base);
        Encerrar(admin, alvo);
        Assert.Equal("JA_ENCERRADO", Codigo(() => Encerrar(admin, alvo)));
        Assert.Single(Historico());
    }

    [Fact]
    public void Reativar_sem_encerramento_ou_ja_reativado_e_NADA_A_REATIVAR()
    {
        var admin = DoisAdmins(); var alvo = Usuario(AcessoCatalogo.Base);
        Assert.Equal("NADA_A_REATIVAR", Codigo(() => Reativar(admin, alvo)));

        Encerrar(admin, alvo);
        Reativar(admin, alvo);
        Assert.Equal("NADA_A_REATIVAR", Codigo(() => Reativar(admin, alvo)));
        Assert.Equal(2, Historico().Count);
    }

    [Fact]
    public void Reativar_devolve_o_que_tinha_e_pula_papel_apagado()
    {
        var admin = DoisAdmins();
        var alvo = Usuario(AcessoCatalogo.Base, FinOp, FinGestor);
        Coluna(alvo, FinOp);
        var equipe = Equipe(alvo, "Equipe Financeiro", new[] { FinGestor });
        Encerrar(admin, alvo);
        _svc.Delete("role", _papeis[FinGestor]);

        var etapas = Reativar(admin, alvo);

        Assert.False(Bloqueado(alvo));
        Assert.Equal(new[] { _papeis[AcessoCatalogo.Base], _papeis[FinOp] }.OrderBy(x => x), Diretos(alvo).OrderBy(x => x));
        Assert.Equal(new[] { _colunas[FinOp] }, Colunas(alvo));
        Assert.Equal(new[] { equipe }, Equipes(alvo));
        Assert.Contains("{\"etapa\":\"papeis\",\"estado\":\"pulada\",\"detalhe\":\"papel " + FinGestor + " não existe mais\"}", etapas);
        var linha = Historico().Last();
        Assert.Equal("[]", linha["cr40f_perfisantes"]);
        Assert.Equal("[{\"perfil\":\"financeiro\",\"nivel\":\"operador\"}]", linha["cr40f_perfisdepois"]);
        var amplo = JsonLeve.Ler((string)linha["cr40f_amplo"]);
        Assert.Equal("reativar", amplo["acao"]);
        Assert.Equal(2, Lista(amplo, "papeis").Count);
        Assert.Single(Lista(amplo, "equipes"));
    }

    [Fact]
    public void Reativar_ignora_historico_que_o_plugin_nao_gravou()
    {
        var admin = DoisAdmins(); var alvo = Usuario();
        _svc.Linhas("systemuser").Single(e => e.Id == alvo)["isdisabled"] = true;
        _svc.Com(new Entity("cr40f_acessohistorico", Guid.NewGuid())
        {
            ["cr40f_usuario"] = new EntityReference("systemuser", alvo),
            ["cr40f_amplo"] = CicloAdministrativo.Json("encerrar", new[] { (_papeis[Admin], (string?)Admin) }, new (Guid, string?)[0], new (Guid, string?)[0]),
            ["createdby"] = new EntityReference("systemuser", admin), ["createdon"] = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });

        Assert.Equal("NADA_A_REATIVAR", Codigo(() => Reativar(admin, alvo)));
        Assert.True(Bloqueado(alvo));
        Assert.Empty(Diretos(alvo));
    }

    [Fact]
    public void Reativar_que_devolve_o_amplo_exige_o_Administrador_do_Sistema()
    {
        var admin = DoisAdmins();
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos);
        var alvo = Usuario(AcessoCatalogo.Base, Antigo);
        Encerrar(admin, alvo);

        Assert.Equal("SEM_PERMISSAO", Codigo(() => Reativar(gestorDeAcessos, alvo)));
        Assert.True(Bloqueado(alvo));
        Reativar(admin, alvo);
        Assert.Contains(_papeis[Antigo], Diretos(alvo));
    }

    [Fact]
    public void Devolver_amplo_ignora_encerrar_e_reativar()
    {
        var admin = DoisAdmins();
        var alvo = Usuario(AcessoCatalogo.Base, Antigo);
        var definir = new DefinirPerfisHandler(_svc);
        definir.Executar(admin, alvo, "[]", retirarAmplo: true);
        Assert.DoesNotContain(_papeis[Antigo], Diretos(alvo));
        Encerrar(admin, alvo);
        Reativar(admin, alvo);

        definir.Executar(admin, alvo, "[]", devolverAmplo: true);

        Assert.Contains(_papeis[Antigo], Diretos(alvo));
    }
}
