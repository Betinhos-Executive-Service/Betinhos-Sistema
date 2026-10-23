using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class EncerrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\",\"environmentId\":\"env\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly Guid _id = Guid.NewGuid();

    private EncerrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), new UsuarioDataverseRepository(_svc, _ => { }), Cfg, _ => { });
    private Entity ComSystemuser(bool desabilitado = false) { var s = new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = Guid.Parse("00000000-0000-0000-0000-0000000000a1"), ["isdisabled"] = desabilitado, ["islicensed"] = true }; _svc.Com(s); return s; }
    private void ComFuncionario(string? email = "ana.lima@betinhos.onmicrosoft.com") => _svc.Com(new Entity("cr40f_funcionarios", _id) { ["cr40f_nomecompleto"] = "Ana Lima", ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(0) });
    private void ComUsuarioCompleto()
    {
        var u = new GraphUsuario { Id = "00000000-0000-0000-0000-0000000000a1", Upn = "ana.lima@betinhos.onmicrosoft.com", Ativo = true }; u.SkuIds.Add("sku");
        _graph.Usuarios[u.Upn] = u; _graph.Membros.Add(("g", u.Id));
    }

    [Fact]
    public void Encerra_tudo_sem_mexer_no_funcionario()
    {
        ComFuncionario(); ComUsuarioCompleto();
        var etapas = Handler().Executar(_id, "ANA").ToJson();
        Assert.Contains("\"etapa\":\"grupo\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"feita\"", etapas);
        Assert.False(_graph.Usuarios["ana.lima@betinhos.onmicrosoft.com"].Ativo);
        Assert.DoesNotContain(_svc.Atualizados, e => e.LogicalName == "cr40f_funcionarios");
        Assert.DoesNotContain("\"etapa\":\"funcionario\"", etapas);
    }

    [Fact]
    public void Reexecucao_pula_tudo()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Handler().Executar(_id, "Ana");
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.Contains("\"etapa\":\"grupo\",\"estado\":\"pulada\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"pulada\"", etapas);
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"pulada\"", etapas);
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Reexecucao_apos_falha_na_conta_termina_o_encerramento()
    {
        ComFuncionario(); ComUsuarioCompleto();
        _graph.FalharEm = "DefinirAtivo";
        Assert.Throws<AcessoException>(() => Handler().Executar(_id, "Ana"));
        _graph.FalharEm = null;
        Handler().Executar(_id, "Ana");
        Assert.False(_graph.Usuarios["ana.lima@betinhos.onmicrosoft.com"].Ativo);
        Assert.DoesNotContain(("g", "00000000-0000-0000-0000-0000000000a1"), _graph.Membros);
    }

    [Fact]
    public void Confirmacao_errada_nao_toca_em_nada()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Assert.Equal("CONFIRMACAO_INVALIDA", Assert.Throws<AcessoException>(() => Handler().Executar(_id, "Maria")).Codigo);
        Assert.Empty(_graph.Chamadas); Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Sem_email_falha()
    {
        ComFuncionario(email: null);
        Assert.Equal("FUNCIONARIO_SEM_EMAIL", Assert.Throws<AcessoException>(() => Handler().Executar(_id, "Ana")).Codigo);
    }

    [Fact]
    public void Usuario_inexistente_no_entra_pula_tudo_e_nao_toca_no_funcionario()
    {
        ComFuncionario();
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"pulada\"", etapas);
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Usuario_fora_do_grupo_nao_perde_conta_nem_licenca()
    {
        ComFuncionario(); ComUsuarioCompleto(); _graph.Membros.Clear();
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        foreach (var e in new[] { "grupo", "licenca", "conta" })
            Assert.Contains("\"etapa\":\"" + e + "\",\"estado\":\"pulada\",\"detalhe\":\"conta fora do grupo de motoristas\"", etapas);
        Assert.True(_graph.Usuarios["ana.lima@betinhos.onmicrosoft.com"].Ativo);
        Assert.Contains("sku", _graph.Usuarios["ana.lima@betinhos.onmicrosoft.com"].SkuIds);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas); Assert.DoesNotContain("RemoverLicenca", _graph.Chamadas);
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Sku_com_caixa_diferente_e_removido()
    {
        ComFuncionario(); ComUsuarioCompleto();
        var u = _graph.Usuarios["ana.lima@betinhos.onmicrosoft.com"]; u.SkuIds.Clear(); u.SkuIds.Add("SKU");
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"feita\"", Handler().Executar(_id, "Ana").ToJson());
        Assert.Contains("RemoverLicenca", _graph.Chamadas);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("   ", "  ")]
    public void Confirmacao_vazia_com_nome_vazio_nao_toca_em_nada(string nome, string confirmacao)
    {
        _svc.Com(new Entity("cr40f_funcionarios", _id) { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = "ana.lima@betinhos.onmicrosoft.com", ["cr40f_status"] = new OptionSetValue(0) });
        ComUsuarioCompleto();
        Assert.Equal("CONFIRMACAO_INVALIDA", Assert.Throws<AcessoException>(() => Handler().Executar(_id, confirmacao)).Codigo);
        Assert.Empty(_graph.Chamadas); Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Confirmacao_vazia_falha_mesmo_com_nome()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Assert.Equal("CONFIRMACAO_INVALIDA", Assert.Throws<AcessoException>(() => Handler().Executar(_id, " ")).Codigo);
        Assert.Empty(_graph.Chamadas);
    }

    [Fact]
    public void Bloqueia_systemuser_na_hora_sem_mexer_no_funcionario()
    {
        ComFuncionario(); ComUsuarioCompleto(); var s = ComSystemuser();
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.Contains("\"etapa\":\"bloqueio\",\"estado\":\"feita\",\"detalhe\":\"bloqueado no Dataverse\"", etapas);
        Assert.True(s.GetAttributeValue<bool>("isdisabled"));
        var req = Assert.IsType<Microsoft.Crm.Sdk.Messages.SetStateRequest>(Assert.Single(_svc.Executados));
        Assert.Equal(new EntityReference("systemuser", s.Id), req.EntityMoniker);
        Assert.Equal(1, req.State.Value); Assert.Equal(-1, req.Status.Value);
        Assert.DoesNotContain(_svc.Atualizados, e => e.LogicalName == "cr40f_funcionarios");
    }

    [Fact]
    public void Systemuser_ja_bloqueado_ou_ausente_pula_bloqueio()
    {
        ComFuncionario(); ComUsuarioCompleto();
        Assert.Contains("\"etapa\":\"bloqueio\",\"estado\":\"pulada\",\"detalhe\":\"sem usuário no Dataverse\"", Handler().Executar(_id, "Ana").ToJson());
        ComSystemuser(desabilitado: true); _graph.Membros.Add(("g", "00000000-0000-0000-0000-0000000000a1"));
        Assert.Contains("\"etapa\":\"bloqueio\",\"estado\":\"pulada\",\"detalhe\":\"já bloqueado\"", Handler().Executar(_id, "Ana").ToJson());
        Assert.Empty(_svc.Executados);
    }

    [Fact]
    public void Fora_do_grupo_nao_bloqueia_systemuser()
    {
        ComFuncionario(); ComUsuarioCompleto(); _graph.Membros.Clear(); var s = ComSystemuser();
        Assert.Contains("\"etapa\":\"bloqueio\",\"estado\":\"pulada\",\"detalhe\":\"conta fora do grupo de motoristas\"", Handler().Executar(_id, "Ana").ToJson());
        Assert.False(s.GetAttributeValue<bool>("isdisabled")); Assert.Empty(_svc.Executados);
    }
}
