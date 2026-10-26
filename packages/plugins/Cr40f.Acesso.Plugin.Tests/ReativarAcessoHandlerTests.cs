using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class ReativarAcessoHandlerTests
{
    private const string Upn = "ana.lima@betinhos.onmicrosoft.com";
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://app\",\"environmentId\":\"env\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly FakePowerPlatformGateway _pp;
    private readonly List<string> _trace = new();
    private readonly Guid _id = Guid.NewGuid();
    private static readonly string UsuarioId = FakeGraphGateway.IdDe(Upn);

    public ReativarAcessoHandlerTests() { _pp = new FakePowerPlatformGateway(_svc); }

    private ReativarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), new UsuarioDataverseRepository(_svc, _ => { }), _pp, Cfg, new Random(7), _trace.Add);
    private void ComFuncionario(string? email = Upn) => _svc.Com(new Entity("cr40f_funcionarios", _id) { ["cr40f_nomecompleto"] = "Ana Lima", ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(1) });
    /// <summary>Estado deixado pelo Encerrar: conta desativada, sem licença e fora do grupo.</summary>
    private GraphUsuario ComContaEncerrada() => _graph.Usuarios[Upn] = new GraphUsuario { Id = UsuarioId, Upn = Upn, DisplayName = "Ana Lima", Ativo = false };
    private static string Etapa(string nome, string estado) => "\"etapa\":\"" + nome + "\",\"estado\":\"" + estado + "\"";

    [Fact]
    public void AddUser_400_logo_apos_a_licenca_fica_pendente_e_ainda_entrega_senha()
    {
        ComFuncionario(); ComContaEncerrada();
        _pp.LicencaPropagando = true;
        var saida = Handler().Executar(_id);
        var json = saida.Etapas.ToJson();
        Assert.Contains(Etapa("systemuser", "pendente"), json);
        Assert.Contains(Etapa("senha", "feita"), json);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
    }

    [Fact]
    public void Systemuser_atrasado_fica_pendente_e_ainda_entrega_senha_sem_mexer_no_funcionario()
    {
        ComFuncionario(); ComContaEncerrada();
        _pp.CriarSystemuser = false;
        var saida = Handler().Executar(_id);
        var json = saida.Etapas.ToJson();
        Assert.Contains(Etapa("systemuser", "pendente"), json);
        Assert.Contains(Etapa("senha", "feita"), json);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Caminho_feliz_reativa_conta_licenca_grupo_systemuser_e_senha()
    {
        ComFuncionario(); ComContaEncerrada();
        var saida = Handler().Executar(_id);
        var u = _graph.Usuarios[Upn];
        Assert.True(u.Ativo);
        Assert.Contains("sku", u.SkuIds);
        Assert.Contains(("g", UsuarioId), _graph.Membros);
        Assert.Equal(Guid.Parse(UsuarioId), Assert.Single(_pp.Sincronizados));
        Assert.Equal(Upn, saida.EmailMicrosoft);
        Assert.Equal("https://app", saida.LinkApp);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        Assert.Equal(saida.SenhaTemporaria, Assert.Single(_graph.Senhas));
        var json = saida.Etapas.ToJson();
        foreach (var e in new[] { "conta", "senha", "licenca", "grupo", "systemuser" }) Assert.Contains(Etapa(e, "feita"), json);
        Assert.DoesNotContain(saida.SenhaTemporaria, string.Join("\n", _trace));
        Assert.DoesNotContain(saida.SenhaTemporaria, json);
        // Só acesso: o cadastro do funcionário (status, demissão) não muda.
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Reexecucao_pula_o_que_ja_esta_feito_e_gera_senha_nova()
    {
        ComFuncionario(); ComContaEncerrada();
        var primeira = Handler().Executar(_id);
        _graph.Chamadas.Clear();
        var segunda = Handler().Executar(_id).Etapas.ToJson();
        foreach (var e in new[] { "conta", "licenca", "grupo", "systemuser" }) Assert.Contains(Etapa(e, "pulada"), segunda);
        Assert.Contains(Etapa("senha", "feita"), segunda);
        Assert.Equal(2, _graph.Senhas.Count);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas);
        Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas);
        Assert.DoesNotContain("AdicionarAoGrupo", _graph.Chamadas);
        Assert.Single(_pp.Sincronizados);
        Assert.NotNull(primeira);
    }

    [Fact]
    public void Conta_inexistente_falha_com_CONTA_NAO_EXISTE()
    {
        ComFuncionario();
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(_id));
        Assert.Equal("CONTA_NAO_EXISTE", erro.Codigo);
        Assert.Contains(Etapa("usuario", "erro"), (string)erro.Data["Etapas"]!);
        Assert.DoesNotContain("RedefinirSenha", _graph.Chamadas);
    }

    [Fact]
    public void Sem_email_falha_com_FUNCIONARIO_SEM_EMAIL_sem_chamar_o_graph()
    {
        ComFuncionario(email: null);
        Assert.Equal("FUNCIONARIO_SEM_EMAIL", Assert.Throws<AcessoException>(() => Handler().Executar(_id)).Codigo);
        Assert.Empty(_graph.Chamadas);
    }

    [Fact]
    public void Sem_permissao_de_senha_termina_as_outras_etapas_e_falha_no_fim()
    {
        ComFuncionario(); ComContaEncerrada(); _graph.SemPermissaoSenha = true;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(_id));
        Assert.Equal("SEM_PERMISSAO_SENHA", erro.Codigo);
        var json = (string)erro.Data["Etapas"]!;
        Assert.Contains(Etapa("senha", "erro"), json);
        foreach (var e in new[] { "conta", "licenca", "grupo", "systemuser" }) Assert.Contains(Etapa(e, "feita"), json);
        Assert.True(_graph.Usuarios[Upn].Ativo);
        Assert.Contains(("g", UsuarioId), _graph.Membros);
    }

    [Fact]
    public void Sem_licenca_livre_falha_com_SEM_LICENCA_DISPONIVEL()
    {
        ComFuncionario(); ComContaEncerrada(); _graph.Livres = 0;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(_id));
        Assert.Equal("SEM_LICENCA_DISPONIVEL", erro.Codigo);
        Assert.Contains(Etapa("licenca", "erro"), (string)erro.Data["Etapas"]!);
        Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas);
        // Senha por último: falha antes não deixa senha nova que ninguém viu.
        Assert.DoesNotContain("RedefinirSenha", _graph.Chamadas);
        Assert.Empty(_graph.Senhas);
    }

    [Fact]
    public void Conta_ja_ativa_com_licenca_e_grupo_so_redefine_senha()
    {
        ComFuncionario();
        var u = ComContaEncerrada(); u.Ativo = true; u.SkuIds.Add("sku"); _graph.Membros.Add(("g", UsuarioId));
        _svc.Com(new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = Guid.Parse(UsuarioId), ["isdisabled"] = false, ["islicensed"] = true });
        var json = Handler().Executar(_id).Etapas.ToJson();
        Assert.Contains(Etapa("senha", "feita"), json);
        Assert.Contains(Etapa("conta", "pulada"), json);
        Assert.Empty(_pp.Sincronizados);
    }

    [Fact]
    public void Systemuser_bloqueado_pelo_encerrar_e_ressincronizado_e_termina_habilitado()
    {
        ComFuncionario(); ComContaEncerrada();
        var s = new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = Guid.Parse(UsuarioId), ["isdisabled"] = true, ["islicensed"] = true };
        _svc.Com(s);
        var json = Handler().Executar(_id).Etapas.ToJson();
        Assert.Contains(Etapa("systemuser", "feita"), json);
        Assert.Equal(Guid.Parse(UsuarioId), Assert.Single(_pp.Sincronizados));
        Assert.False(s.GetAttributeValue<bool>("isdisabled")); Assert.True(s.GetAttributeValue<bool>("islicensed"));
    }
}
