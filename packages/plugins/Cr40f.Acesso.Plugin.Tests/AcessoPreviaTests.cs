using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>Prévia (cr40f_AcessoPrevia) e acesso amplo do DefinirPerfis.</summary>
public sealed class AcessoPreviaTests
{
    private const string Antigo = "Acesso-Betinhos-MDA";
    private const string Admin = "Administrador do Sistema";
    private static readonly DateTime Agora = new(2026, 11, 26, 15, 0, 0, DateTimeKind.Utc);

    private readonly FakeService _svc = new();
    private readonly Guid _bu = Guid.NewGuid();
    private readonly Dictionary<string, Guid> _papeis = new();
    private readonly Dictionary<string, Guid> _colunas = new();
    private readonly Dictionary<string, Guid> _privilegios = new();

    public AcessoPreviaTests()
    {
        _svc.Com(new Entity("businessunit", _bu) { ["name"] = "Raiz", ["isdisabled"] = false });
        foreach (var nome in new[] { Admin, Antigo, AcessoCatalogo.Base, AcessoCatalogo.AdminAcessos }) Papel(nome, _bu);
        PerfilDeColuna(AcessoCatalogo.AdminAcessos);
        foreach (var area in new[] { "operacional", "financeiro", "frota", "rh" })
            foreach (var nivel in new[] { "operador", "gestor" })
            {
                Papel(Nome(area, nivel), _bu);
                PerfilDeColuna(Nome(area, nivel));
            }
        foreach (var tabela in new[] { "cr40f_cotacao", "cr40f_veiculo", "cr40f_pagante", "cr40f_segredo" })
            foreach (var (tipo, direito) in new[] { ("Read", 1), ("Write", 2), ("Delete", 65536), ("Assign", 524288) })
                Privilegio("prv" + tipo + tabela, direito, tabela);
        Privilegio("prvExportToExcel", 0, null);
    }

    private static string Nome(string area, string nivel) => AcessoCatalogo.NomeDoPapel(area, nivel);
    private static string Pedido(string area, string nivel) => "[{\"perfil\":\"" + area + "\",\"nivel\":\"" + nivel + "\"}]";

    private Guid Papel(string nome, Guid bu, bool semHeranca = false, string? chave = null)
    {
        var e = new Entity("role", Guid.NewGuid()) { ["name"] = nome, ["businessunitid"] = new EntityReference("businessunit", bu), ["isinherited"] = new OptionSetValue(semHeranca ? 0 : 1) };
        _svc.Com(e); _papeis[chave ?? nome] = e.Id;
        return e.Id;
    }

    private void PerfilDeColuna(string nome)
    {
        var e = new Entity("fieldsecurityprofile", Guid.NewGuid()) { ["name"] = nome };
        _svc.Com(e); _colunas[nome] = e.Id;
    }

    private void Privilegio(string nome, int direito, string? tabela)
    {
        var p = new Entity("privilege", Guid.NewGuid()) { ["name"] = nome, ["accessright"] = direito };
        _svc.Com(p); _privilegios[nome] = p.Id;
        if (tabela == null) return;
        _svc.Com(new Entity("privilegeobjecttypecodes", Guid.NewGuid()) { ["privilegeid"] = new EntityReference("privilege", p.Id), ["objecttypecode"] = tabela });
        if (_svc.Linhas("entity").All(e => (string)e["logicalname"] != tabela))
            _svc.Com(new Entity("entity", Guid.NewGuid()) { ["logicalname"] = tabela, ["entitysetname"] = tabela + "s" });
    }

    private void Dar(string papel, string privilegio, PrivilegeDepth profundidade)
    {
        var id = _papeis[papel];
        var lista = _svc.PrivilegiosDoPapel.TryGetValue(id, out var atuais) ? atuais.ToList() : new List<RolePrivilege>();
        lista.Add(new RolePrivilege { PrivilegeId = _privilegios[privilegio], Depth = profundidade });
        _svc.PrivilegiosDoPapel[id] = lista.ToArray();
    }

    private void Coluna(string perfil, string tabela, string coluna, bool cria = false, bool grava = false) =>
        _svc.Com(new Entity("fieldpermission", Guid.NewGuid())
        {
            ["fieldsecurityprofileid"] = new EntityReference("fieldsecurityprofile", _colunas[perfil]),
            ["entityname"] = tabela, ["attributelogicalname"] = coluna, ["canread"] = new OptionSetValue(4),
            ["cancreate"] = new OptionSetValue(cria ? 4 : 0), ["canupdate"] = new OptionSetValue(grava ? 4 : 0),
        });

    private Guid Usuario(params string[] papeis)
    {
        var u = new Entity("systemuser", Guid.NewGuid()) { ["fullname"] = "Pessoa de Teste", ["isdisabled"] = false, ["businessunitid"] = new EntityReference("businessunit", _bu) };
        _svc.Com(u);
        foreach (var papel in papeis) Vincular(u.Id, papel);
        return u.Id;
    }

    private void Vincular(Guid usuario, string papel) => _svc.Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["roleid"] = _papeis[papel] });
    private void VincularColuna(Guid usuario, string perfil) => _svc.Com(new Entity("systemuserprofiles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["fieldsecurityprofileid"] = _colunas[perfil] });

    private Guid Equipe(Guid usuario, int tipo, string nome, string[] papeis, string[]? perfis = null)
    {
        var t = new Entity("team", Guid.NewGuid()) { ["name"] = nome, ["teamtype"] = new OptionSetValue(tipo) };
        _svc.Com(t, new Entity("teammembership", Guid.NewGuid()) { ["systemuserid"] = usuario, ["teamid"] = t.Id });
        foreach (var p in papeis) _svc.Com(new Entity("teamroles", Guid.NewGuid()) { ["teamid"] = t.Id, ["roleid"] = _papeis[p] });
        foreach (var p in perfis ?? new string[0]) _svc.Com(new Entity("teamprofiles", Guid.NewGuid()) { ["teamid"] = t.Id, ["fieldsecurityprofileid"] = _colunas[p] });
        return t.Id;
    }

    private Guid Flow(Guid dono, string nome, string entidade)
    {
        var w = new Entity("workflow", Guid.NewGuid())
        {
            ["name"] = nome, ["ownerid"] = new EntityReference("systemuser", dono),
            ["category"] = new OptionSetValue(5), ["statecode"] = new OptionSetValue(1),
            ["clientdata"] = "{\"properties\":{\"definition\":{\"actions\":{\"Atualizar\":{\"type\":\"OpenApiConnection\",\"inputs\":{\"host\":{\"apiId\":\"/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps\"},\"parameters\":{\"entityName\":\"" + entidade + "\"}}}}}}}",
        };
        _svc.Com(w);
        return w.Id;
    }

    private Guid App(string nome, params string[] papeis)
    {
        var app = new Entity("appmodule", Guid.NewGuid()) { ["name"] = nome };
        _svc.Com(app);
        foreach (var p in papeis) _svc.Com(new Entity("appmoduleroles", Guid.NewGuid()) { ["appmoduleid"] = app.Id, ["roleid"] = _papeis[p] });
        return app.Id;
    }

    private void Conexao(Guid dono) =>
        _svc.Com(new Entity("connectionreference", Guid.NewGuid()) { ["ownerid"] = new EntityReference("systemuser", dono), ["statecode"] = new OptionSetValue(0), ["connectionreferencedisplayname"] = "Dataverse da pessoa" });

    private Dictionary<string, object?> Previa(Guid chamador, Guid alvo, string perfis, bool retirar = false) =>
        JsonLeve.Ler(new PreviaHandler(_svc, Guid.NewGuid(), Agora).Executar(chamador, alvo, perfis, retirar, null));

    private static List<Dictionary<string, object?>> Itens(Dictionary<string, object?> r, string chave) =>
        ((List<object?>)r[chave]!).Cast<Dictionary<string, object?>>().ToList();

    private static Dictionary<string, object?>? Perda(Dictionary<string, object?> r, string chave) => Itens(r, "perdas").SingleOrDefault(p => (string?)p["chave"] == chave);
    private static List<string> Tipos(Dictionary<string, object?> perda) => ((List<object?>)perda["perde"]!).Cast<string>().ToList();
    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;
    private string Definir(Guid chamador, Guid alvo, string perfis, bool retirar = false, bool devolver = false) =>
        new DefinirPerfisHandler(_svc).Executar(chamador, alvo, perfis, retirar, devolver);
    private bool Tem(Guid usuario, string papel) => PapeisDoUsuario.IdsDiretos(_svc, usuario).Contains(_papeis[papel]);

    [Fact]
    public void Frota_na_unidade_filha_perde_o_que_o_Deep_da_raiz_nao_cobre()
    {
        var frota = Guid.NewGuid();
        _svc.Com(new Entity("businessunit", frota) { ["name"] = "Frota", ["parentbusinessunitid"] = new EntityReference("businessunit", _bu), ["isdisabled"] = false });
        foreach (var nivel in new[] { "operador", "gestor" }) Papel(Nome("frota", nivel), frota, chave: "copia " + nivel);
        Dar("copia gestor", "prvReadcr40f_veiculo", PrivilegeDepth.Local);
        Dar("copia gestor", "prvDeletecr40f_veiculo", PrivilegeDepth.Local);
        Dar("copia gestor", "prvWritecr40f_veiculo", PrivilegeDepth.Local);
        Dar("copia operador", "prvReadcr40f_veiculo", PrivilegeDepth.Local);
        Dar(AcessoCatalogo.Base, "prvWritecr40f_veiculo", PrivilegeDepth.Deep);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, "copia gestor");

        var r = Previa(admin, alvo, Pedido("frota", "operador"));

        var veiculo = Perda(r, "cr40f_veiculo")!;
        Assert.Equal(new[] { "Delete" }, Tipos(veiculo));
        Assert.Equal("cr40f_veiculo", veiculo["tabela"]);
        Assert.Equal(false, veiculo["incerto"]);
    }

    [Fact]
    public void Papel_de_equipe_sem_heranca_deixa_a_perda_incerta()
    {
        Papel("Equipe - Cotações", _bu, semHeranca: true);
        Dar("Equipe - Cotações", "prvWritecr40f_cotacao", PrivilegeDepth.Global);
        Dar(Nome("financeiro", "gestor"), "prvWritecr40f_cotacao", PrivilegeDepth.Local);
        Dar(Nome("financeiro", "gestor"), "prvDeletecr40f_cotacao", PrivilegeDepth.Local);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        Equipe(alvo, 0, "Cotações", new[] { "Equipe - Cotações" });

        var r = Previa(admin, alvo, Pedido("financeiro", "operador"));

        var cotacao = Perda(r, "cr40f_cotacao")!;
        Assert.Equal(new[] { "Write", "Delete" }, Tipos(cotacao));
        Assert.Equal(true, cotacao["incerto"]);
    }

    [Fact]
    public void Equipe_sem_heranca_nao_cobre_a_perda_que_fica_incerta()
    {
        Papel("Equipe - Leitura", _bu, semHeranca: true);
        Dar("Equipe - Leitura", "prvReadcr40f_pagante", PrivilegeDepth.Global);
        Dar(Nome("financeiro", "gestor"), "prvReadcr40f_pagante", PrivilegeDepth.Global);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        Equipe(alvo, 0, "Leitura", new[] { "Equipe - Leitura" });

        var pagante = Perda(Previa(admin, alvo, "[]"), "cr40f_pagante")!;

        Assert.Equal(new[] { "Read" }, Tipos(pagante));
        Assert.Equal(true, pagante["incerto"]);
    }

    [Fact]
    public void Coluna_que_o_perfil_da_equipe_ainda_da_nao_e_perda()
    {
        Coluna(Nome("financeiro", "gestor"), "cr40f_pagante", "cr40f_cpf");
        Coluna(Nome("financeiro", "gestor"), "cr40f_pagante", "cr40f_cartao");
        Coluna(Nome("rh", "operador"), "cr40f_pagante", "cr40f_cpf");
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        VincularColuna(alvo, Nome("financeiro", "gestor"));
        Equipe(alvo, 0, "RH", new string[0], new[] { Nome("rh", "operador") });

        var colunas = Itens(Previa(admin, alvo, Pedido("financeiro", "operador")), "colunas");

        Assert.Equal(new[] { "cr40f_pagante.cr40f_cartao" }, colunas.Select(c => (string)c["coluna"]!));
        Assert.Equal("cr40f_pagante", colunas[0]["tabela"]);
        Assert.Equal(new object[] { "ler" }, (List<object?>)colunas[0]["perde"]!);
    }

    [Fact]
    public void Coluna_que_continua_legivel_mas_perde_gravar_e_criar_e_perda()
    {
        Coluna(Nome("financeiro", "gestor"), "cr40f_pagante", "cr40f_cpf", cria: true, grava: true);
        Coluna(Nome("financeiro", "operador"), "cr40f_pagante", "cr40f_cpf");
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        VincularColuna(alvo, Nome("financeiro", "gestor"));

        var cpf = Itens(Previa(admin, alvo, Pedido("financeiro", "operador")), "colunas").Single();

        Assert.Equal("cr40f_pagante.cr40f_cpf", cpf["coluna"]);
        Assert.Equal(new object[] { "criar", "gravar" }, (List<object?>)cpf["perde"]!);
    }

    [Fact]
    public void Administrador_do_Sistema_so_perde_com_RetirarAmplo_e_ai_perde_tudo()
    {
        Coluna(Nome("rh", "gestor"), "cr40f_pagante", "cr40f_cpf");
        _svc.Protegida("cr40f_funcionarios", "cr40f_salario").Tabela("cr40f_funcionarios", "cr40f_name");
        var admin = Usuario(Admin); Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Admin);
        Flow(alvo, "Fluxo da pessoa", "cr40f_cotacaos");
        App("Betinhos", AcessoCatalogo.Base); App("Só para administradores");
        Conexao(alvo);

        var fica = Previa(admin, alvo, "[]");
        Assert.Equal(true, ((Dictionary<string, object?>)fica["admin"]!)["depois"]);
        Assert.Empty(Itens(fica, "perdas"));
        Assert.Empty(Itens(fica, "flows"));
        Assert.Empty(Itens(fica, "apps"));

        var r = Previa(admin, alvo, "[]", retirar: true);
        var a = (Dictionary<string, object?>)r["admin"]!;
        Assert.Equal(true, a["antes"]); Assert.Equal(false, a["depois"]);
        Assert.Equal(new[] { "Read", "Write", "Delete", "Assign" }, Tipos(Perda(r, "cr40f_cotacao")!));
        Assert.NotNull(Perda(r, "prvExportToExcel"));
        Assert.Equal(new[] { "cr40f_funcionarios.cr40f_salario", "cr40f_pagante.cr40f_cpf" }, Itens(r, "colunas").Select(c => (string)c["coluna"]!));
        Assert.All(Itens(r, "colunas"), c => Assert.Equal(new object[] { "ler", "criar", "gravar" }, (List<object?>)c["perde"]!));
        Assert.Equal(new[] { "Só para administradores" }, Itens(r, "apps").Select(a => (string)a["nome"]!));
        Assert.Equal("admin", Itens(r, "flows").Single()["tipo"]);
        Assert.Equal("Dataverse da pessoa", Itens(r, "conexoes").Single()["nome"]);
    }

    [Fact]
    public void Privilegio_avulso_aparece_pelo_nome_sem_tabela()
    {
        Dar(Nome("financeiro", "gestor"), "prvExportToExcel", PrivilegeDepth.Global);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));

        var exportar = Perda(Previa(admin, alvo, Pedido("financeiro", "operador")), "prvExportToExcel")!;

        Assert.Null(exportar["tabela"]);
        Assert.Equal(new[] { "Use" }, Tipos(exportar));
    }

    [Fact]
    public void Perda_e_coluna_trazem_o_nome_de_exibicao_da_tabela()
    {
        _svc.Tabela("cr40f_cotacao"); _svc.Rotulos["cr40f_cotacao"] = "Cotação";
        _svc.Tabela("cr40f_pagante"); _svc.Rotulos["cr40f_pagante"] = "Pagante";
        Dar(Nome("financeiro", "gestor"), "prvWritecr40f_cotacao", PrivilegeDepth.Global);
        Dar(Nome("financeiro", "gestor"), "prvDeletecr40f_veiculo", PrivilegeDepth.Global);
        Dar(Nome("financeiro", "gestor"), "prvExportToExcel", PrivilegeDepth.Global);
        Coluna(Nome("financeiro", "gestor"), "cr40f_pagante", "cr40f_cpf");
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        VincularColuna(alvo, Nome("financeiro", "gestor"));

        var r = Previa(admin, alvo, Pedido("financeiro", "operador"));

        Assert.Equal("Cotação", Perda(r, "cr40f_cotacao")!["rotulo"]);
        Assert.Equal("cr40f_veiculo", Perda(r, "cr40f_veiculo")!["rotulo"]);
        Assert.Null(Perda(r, "prvExportToExcel")!["rotulo"]);
        Assert.Equal("Pagante", Itens(r, "colunas").Single()["rotulo"]);
    }

    [Fact]
    public void Flow_da_pessoa_entra_quando_ela_perde_a_tabela_que_ele_usa()
    {
        Dar(Nome("financeiro", "gestor"), "prvWritecr40f_cotacao", PrivilegeDepth.Global);
        Dar(AcessoCatalogo.Base, "prvWritecr40f_veiculo", PrivilegeDepth.Global);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        Flow(alvo, "Atualiza cotação", "cr40f_cotacaos");
        Flow(alvo, "Atualiza veículo", "cr40f_veiculo");
        Flow(alvo, "Tabela dinâmica", "@triggerBody()?['tabela']");
        Flow(admin, "Fluxo de outra pessoa", "cr40f_cotacaos");
        var coproprietaria = Flow(admin, "Cotação compartilhada", "cr40f_cotacaos");
        _svc.Com(new Entity("principalobjectaccess", Guid.NewGuid()) { ["principalid"] = alvo, ["objectid"] = coproprietaria, ["objecttypecode"] = "workflow" });
        Conexao(alvo);

        var r = Previa(admin, alvo, Pedido("financeiro", "operador"));

        Assert.Equal(new[] { "Atualiza cotação:tabela:True", "Cotação compartilhada:tabela:False", "Tabela dinâmica:incerto:True" },
            Itens(r, "flows").Select(f => f["nome"] + ":" + f["tipo"] + ":" + f["dona"]));
        Assert.Equal("Dataverse da pessoa", Itens(r, "conexoes").Single()["nome"]);
    }

    [Fact]
    public void RetirarAmplo_mostra_o_grupo_do_Entra_que_da_o_papel_antigo_e_quantos_registros_ele_tem()
    {
        Dar(Antigo, "prvReadcr40f_cotacao", PrivilegeDepth.Global);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base);
        var grupo = Equipe(alvo, 2, "Grupo do Entra", new[] { Antigo });
        Equipe(alvo, 0, "Equipe comum", new[] { Antigo });
        _svc.Tabela("cr40f_cotacao", "owningteam");
        for (var i = 0; i < 3; i++) _svc.Com(new Entity("cr40f_cotacao", Guid.NewGuid()) { ["owningteam"] = new EntityReference("team", grupo) });
        _svc.Com(new Entity("cr40f_veiculo", Guid.NewGuid()) { ["owningteam"] = new EntityReference("team", grupo) });

        var r = Previa(admin, alvo, "[]", retirar: true);

        var g = Itens(r, "grupos").Single();
        Assert.Equal("Grupo do Entra", g["nome"]);
        Assert.Equal(3m, g["perdeDonos"]);
        Assert.Equal(false, g["limitado"]);
        Assert.Null(Perda(r, "cr40f_cotacao"));
        Assert.DoesNotContain(_svc.Consultas, q => q.EntityName == "cr40f_veiculo");
        Assert.All(_svc.Consultas.Where(q => q.EntityName == "cr40f_cotacao"), q => { Assert.False(q.ColumnSet.AllColumns); Assert.Empty(q.ColumnSet.Columns); Assert.Equal(PreviaHandler.Limite, q.PageInfo.Count); });
    }

    [Fact]
    public void RetirarAmplo_sem_ser_Administrador_do_Sistema_e_recusado()
    {
        var gestorDeAcessos = Usuario(AcessoCatalogo.AdminAcessos); var alvo = Usuario(Admin);
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Definir(gestorDeAcessos, alvo, "[]", retirar: true)));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Definir(gestorDeAcessos, alvo, "[]", devolver: true)));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Previa(gestorDeAcessos, alvo, "[]", retirar: true)));
        Assert.Empty(_svc.Desassociados);
    }

    [Fact]
    public void RetirarAmplo_que_deixa_um_so_admin_e_desfeito()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Admin, Antigo);

        Assert.Equal("ULTIMO_ADMIN", Codigo(() => Definir(admin, alvo, "[]", retirar: true)));

        Assert.True(Tem(alvo, Admin)); Assert.True(Tem(alvo, Antigo));
        Assert.DoesNotContain(_svc.Criados, e => e.LogicalName == "cr40f_acessohistorico");
    }

    [Fact]
    public void Admin_desativado_ou_de_aplicacao_nao_conta_para_o_minimo()
    {
        var admin = Usuario(Admin); var alvo = Usuario(Admin);
        var desativado = Usuario(Admin); var aplicacao = Usuario(Admin); var leitura = Usuario(Admin);
        _svc.Linhas("systemuser").Single(u => u.Id == desativado)["isdisabled"] = true;
        _svc.Linhas("systemuser").Single(u => u.Id == aplicacao)["applicationid"] = Guid.NewGuid();
        _svc.Linhas("systemuser").Single(u => u.Id == leitura)["accessmode"] = new OptionSetValue(4);

        Assert.Equal("ULTIMO_ADMIN", Codigo(() => Definir(admin, alvo, "[]", retirar: true)));
    }

    [Fact]
    public void RetirarAmplo_grava_cr40f_amplo_e_DevolverAmplo_repoe()
    {
        var admin = Usuario(Admin); Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Admin, Antigo);
        var grupo = Equipe(alvo, 2, "Grupo do Entra", new[] { Antigo });

        var resultado = Definir(admin, alvo, "[]", retirar: true);

        Assert.False(Tem(alvo, Admin)); Assert.False(Tem(alvo, Antigo)); Assert.True(Tem(alvo, AcessoCatalogo.Base));
        Assert.Single(_svc.Linhas("teamroles"), t => (Guid)t["teamid"] == grupo);
        var retirada = _svc.Linhas("cr40f_acessohistorico").Single();
        var amplo = JsonLeve.Ler((string)retirada["cr40f_amplo"]);
        Assert.Equal("retirar", amplo["acao"]);
        Assert.Equal(new[] { Admin, Antigo }.OrderBy(n => n), ((List<object?>)amplo["papeis"]!).Cast<Dictionary<string, object?>>().Select(p => (string)p["nome"]!).OrderBy(n => n));
        Assert.Contains(_papeis[Admin].ToString(), (string)retirada["cr40f_amplo"]);
        Assert.Equal("[]", retirada["cr40f_perfisantes"]); Assert.Equal("[]", retirada["cr40f_perfisdepois"]);
        Assert.DoesNotContain("amplo", (string)retirada["cr40f_perfisdepois"]);
        Assert.Contains("\"amplo\":{\"acao\":\"retirar\"", resultado);

        Definir(admin, alvo, "[]", devolver: true);

        Assert.True(Tem(alvo, Admin)); Assert.True(Tem(alvo, Antigo));
        var devolucao = _svc.Linhas("cr40f_acessohistorico").OrderBy(e => (DateTime)e["createdon"]).Last();
        Assert.Equal("devolver", JsonLeve.Ler((string)devolucao["cr40f_amplo"])["acao"]);
        Assert.Equal("NADA_A_DEVOLVER", Codigo(() => Definir(admin, alvo, "[]", devolver: true)));
    }

    [Fact]
    public void DevolverAmplo_ignora_linha_forjada_e_papel_que_nao_e_amplo()
    {
        var admin = Usuario(Admin); Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Antigo);
        Definir(admin, alvo, "[]", retirar: true);
        Assert.False(Tem(alvo, Antigo));
        string Linha(params string[] papeis) => "{\"acao\":\"retirar\",\"papeis\":[" + string.Join(",", papeis.Select(p => "{\"id\":\"" + _papeis[p] + "\",\"nome\":\"x\"}")) + "]}";
        _svc.Com(new Entity("cr40f_acessohistorico", Guid.NewGuid())
        {
            ["cr40f_usuario"] = new EntityReference("systemuser", alvo), ["cr40f_amplo"] = Linha(AcessoCatalogo.AdminAcessos),
            ["createdby"] = new EntityReference("systemuser", admin), ["createdon"] = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });
        var plugin = _svc.Linhas("cr40f_acessohistorico").First();
        plugin["cr40f_amplo"] = Linha(Antigo, AcessoCatalogo.AdminAcessos);

        Definir(admin, alvo, "[]", devolver: true);

        Assert.True(Tem(alvo, Antigo));
        Assert.False(Tem(alvo, AcessoCatalogo.AdminAcessos));
    }

    [Fact]
    public void RetirarAmplo_sem_papel_amplo_nao_grava_amplo_e_Devolver_pula_retirada_vazia()
    {
        var admin = Usuario(Admin); Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Antigo);
        Definir(admin, alvo, "[]", retirar: true);

        var resultado = Definir(admin, alvo, "[]", retirar: true);

        Assert.Contains("\"amplo\":null", resultado);
        Assert.Single(_svc.Linhas("cr40f_acessohistorico"));
        _svc.Create(new Entity("cr40f_acessohistorico") { ["cr40f_usuario"] = new EntityReference("systemuser", alvo), ["cr40f_amplo"] = "{\"acao\":\"retirar\",\"papeis\":[]}" });

        Definir(admin, alvo, "[]", devolver: true);

        Assert.True(Tem(alvo, Antigo));
    }

    [Fact]
    public void Apps_dos_papeis_tirados_entram_pela_copia_do_papel_raiz()
    {
        var frota = Guid.NewGuid();
        _svc.Com(new Entity("businessunit", frota) { ["name"] = "Frota", ["parentbusinessunitid"] = new EntityReference("businessunit", _bu), ["isdisabled"] = false });
        var copia = Papel(Nome("frota", "gestor"), frota, chave: "copia gestor");
        _svc.Linhas("role").Single(r => r.Id == copia)["parentrootroleid"] = new EntityReference("role", _papeis[Nome("frota", "gestor")]);
        Papel(Nome("frota", "operador"), frota, chave: "copia operador");
        App("Frota", Nome("frota", "gestor")); App("Betinhos", AcessoCatalogo.Base);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, "copia gestor");

        var r = Previa(admin, alvo, Pedido("frota", "operador"));

        Assert.Equal(new[] { "Frota" }, Itens(r, "apps").Select(a => (string)a["nome"]!));
    }

    [Fact]
    public void Previa_com_Tabelas_fora_das_perdas_e_recusada_e_dentro_conta_o_uso()
    {
        Dar(Nome("financeiro", "gestor"), "prvWritecr40f_cotacao", PrivilegeDepth.Global);
        Dar(Nome("financeiro", "gestor"), "prvWritecr40f_segredo", PrivilegeDepth.Global);
        var admin = Usuario(Admin); var alvo = Usuario(AcessoCatalogo.Base, Nome("financeiro", "gestor"));
        string Uso(string tabelas) => new PreviaHandler(_svc, Guid.NewGuid(), Agora).Executar(admin, alvo, Pedido("financeiro", "operador"), false, tabelas);

        Assert.Equal("TABELA_INVALIDA", Codigo(() => Uso("[\"cr40f_veiculo\"]")));
        Assert.Equal("TABELA_INVALIDA", Codigo(() => Uso("[\"cr40f_segredo\"]")));
        Assert.Equal("TABELA_INVALIDA", Codigo(() => Uso("[" + string.Join(",", Enumerable.Range(0, PreviaHandler.MaxTabelas + 1).Select(i => "\"t" + i + "\"")) + "]")));
        Assert.Equal("TABELA_INVALIDA", Codigo(() => Uso("nada")));

        Assert.Equal("{\"uso\":[{\"tabela\":\"cr40f_cotacao\",\"registros\":null,\"limitado\":false,\"incerto\":true}]}", Uso("[\"cr40f_cotacao\"]"));
        Assert.DoesNotContain(_svc.Consultas, q => q.EntityName == "cr40f_cotacao");

        _svc.Tabela("cr40f_cotacao", "createdby", "createdon", "modifiedby", "modifiedon");
        var antiga = new DateTime(2026, 8, 27, 0, 0, 0, DateTimeKind.Utc); var recente = new DateTime(2026, 8, 28, 0, 0, 0, DateTimeKind.Utc);
        Entity Cotacao(Guid criou, DateTime em, Guid alterou, DateTime alterada) => new("cr40f_cotacao", Guid.NewGuid())
            { ["createdby"] = new EntityReference("systemuser", criou), ["createdon"] = em, ["modifiedby"] = new EntityReference("systemuser", alterou), ["modifiedon"] = alterada };
        for (var i = 0; i < 5; i++) _svc.Com(Cotacao(alvo, recente, admin, recente));
        _svc.Com(Cotacao(admin, antiga, alvo, recente), Cotacao(admin, recente, admin, recente), Cotacao(alvo, antiga, alvo, antiga));
        Assert.Equal("{\"uso\":[{\"tabela\":\"cr40f_cotacao\",\"registros\":6,\"limitado\":false,\"incerto\":false}]}", Uso("[\"cr40f_cotacao\"]"));

        for (var i = 0; i < PreviaHandler.Limite; i++) _svc.Com(Cotacao(alvo, recente, alvo, recente));
        Assert.Equal("{\"uso\":[{\"tabela\":\"cr40f_cotacao\",\"registros\":5000,\"limitado\":true,\"incerto\":false}]}", Uso("[\"cr40f_cotacao\"]"));
    }
}
