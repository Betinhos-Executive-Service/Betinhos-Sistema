using System;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AppConfigBloqueioTests
{
    private static readonly DateTime Agora = new(2026, 11, 23, 15, 0, 0, DateTimeKind.Utc);
    private readonly FakeService _svc = new();
    private readonly Guid _gestor = Guid.NewGuid(), _servico = Guid.NewGuid(), _usuarioBia = Guid.NewGuid(), _usuarioSemFicha = Guid.NewGuid();
    private readonly Guid _bia = Guid.NewGuid(), _ana = Guid.NewGuid();

    public AppConfigBloqueioTests()
    {
        var roleId = Guid.NewGuid();
        _svc.Com(new Entity("role", roleId) { ["name"] = AppConfigAutorizacao.FuncaoGestor }, new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = _gestor, ["roleid"] = roleId },
            new Entity("systemuser", _gestor) { ["internalemailaddress"] = "gestor@exemplo.test" });
        _svc.Com(new Entity("systemuser", _usuarioBia) { ["internalemailaddress"] = "bia.souza@exemplo.test" });
        _svc.Com(new Entity("systemuser", _usuarioSemFicha) { ["internalemailaddress"] = "ninguem@exemplo.test" });
        Ficha(_bia, "Bia Souza", "bia.souza@exemplo.test");
        Ficha(_ana, "Ana Lima", "ana.lima@exemplo.test");
    }

    private void Ficha(Guid id, string nome, string email)
        => _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(0), ["cr40f_tipodevinculo"] = new OptionSetValue(0) });

    private AppConfigBloqueioHandler Handler => new(new AppConfigRepository(_svc), new AppConfigAutorizacao(_svc), () => Agora);

    private void Publicar(string json)
    {
        var repo = new AppConfigRepository(_svc); var aut = new AppConfigAutorizacao(_svc);
        new AppConfigSalvarRascunhoHandler(repo, aut).Executar(_gestor, json, null, false);
        new AppConfigPublicarHandler(repo, aut, () => Agora).Executar(_gestor, null);
    }

    private void Desligar(string chave) => Publicar("{\"proprio\":{\"" + chave + "\":false},\"terceiro\":{}}");

    [Fact]
    public void Ideias_recusa_o_proprio_motorista_com_o_modulo_desligado()
    {
        Desligar("ideas");
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Handler.Executar(_usuarioBia, AppConfigBloqueios.Ideias, null));
        Assert.Equal(AppConfigBloqueios.Ideias.TextoRecusa, erro.Message);
        Assert.Contains("Procure o escritório", erro.Message);
    }

    [Fact]
    public void Ideias_libera_com_o_modulo_ligado()
    {
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Ideias, null);
    }

    [Fact]
    public void Ideias_nunca_recusa_gestao_nem_quem_nao_tem_ficha()
    {
        Desligar("ideas");
        Handler.Executar(_gestor, AppConfigBloqueios.Ideias, null);          // Planner do shell gravando ideia
        Handler.Executar(_usuarioSemFicha, AppConfigBloqueios.Ideias, null); // conta de serviço, escritório
        Handler.Executar(Guid.NewGuid(), AppConfigBloqueios.Ideias, null);   // usuário desconhecido
    }

    [Fact]
    public void Ideias_gestor_com_ficha_propria_desligada_tambem_passa()
    {
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "Gestor", ["cr40f_emailmicrosoft"] = "gestor@exemplo.test", ["cr40f_status"] = new OptionSetValue(0), ["cr40f_tipodevinculo"] = new OptionSetValue(0) });
        Desligar("ideas");
        Handler.Executar(_gestor, AppConfigBloqueios.Ideias, null);
    }

    [Fact]
    public void Treinamentos_recusa_o_motorista_atualizando_a_propria_participacao()
    {
        Desligar("treinamentos");
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, _bia));
        Assert.Equal(AppConfigBloqueios.Treinamentos.TextoRecusa, erro.Message);
    }

    [Fact]
    public void Treinamentos_libera_participacao_de_outro_funcionario()
    {
        Desligar("treinamentos");
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, _ana);
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, null);
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, Guid.NewGuid());
    }

    [Fact]
    public void Treinamentos_libera_gestao_mesmo_na_participacao_da_propria_pessoa()
    {
        Desligar("treinamentos");
        Handler.Executar(_gestor, AppConfigBloqueios.Treinamentos, _bia);
        Handler.Executar(_usuarioSemFicha, AppConfigBloqueios.Treinamentos, _bia);
    }

    [Fact]
    public void Treinamentos_libera_com_o_modulo_ligado()
    {
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, _bia);
    }

    [Fact]
    public void Desligar_um_modulo_nao_bloqueia_o_outro()
    {
        Desligar("treinamentos");
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Ideias, null);
        Desligar("ideas");
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Treinamentos, _bia);
    }

    [Fact]
    public void Ficha_sem_acesso_ativo_nao_e_recusada()
    {
        _svc.Linhas("cr40f_funcionarios").Single(f => f.Id == _bia)["cr40f_status"] = new OptionSetValue(1);
        Desligar("ideas");
        Handler.Executar(_usuarioBia, AppConfigBloqueios.Ideias, null);
    }

    [Fact]
    public void Buscar_escolhe_a_regra_por_mensagem_e_tabela()
    {
        Assert.Same(AppConfigBloqueios.Ideias, AppConfigBloqueios.Buscar("Create", "cr40f_boasideias"));
        Assert.Same(AppConfigBloqueios.Treinamentos, AppConfigBloqueios.Buscar("Update", "cr40f_treinamentoparticipacao"));
        Assert.Null(AppConfigBloqueios.Buscar("Update", "cr40f_boasideias"));
        Assert.Null(AppConfigBloqueios.Buscar("Create", "cr40f_treinamentoparticipacao"));
        Assert.Null(AppConfigBloqueios.Buscar(null, null));
    }

    [Fact]
    public void Colunas_do_filtro_do_step_ficam_iguais_as_do_registrador()
    {
        var registrador = System.IO.File.ReadAllText(System.IO.Path.Combine(RaizDoRepo(), "packages", "plugins", "tools", "Cr40f.Acesso.Registrar", "Program.cs"));
        Assert.Contains("ColunasBloqueioTreinamentos = \"" + string.Join(",", AppConfigBloqueios.ColunasDoMotoristaNaParticipacao) + "\"", registrador);
    }

    private static string RaizDoRepo()
    {
        var dir = new System.IO.DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !System.IO.File.Exists(System.IO.Path.Combine(dir.FullName, "pnpm-workspace.yaml"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("raiz do repositório não encontrada");
    }
}
