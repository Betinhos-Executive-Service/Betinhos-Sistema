using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class EncerrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"u\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly Guid _id = Guid.NewGuid();

    private EncerrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), Cfg, () => new DateTime(2026, 10, 22, 12, 0, 0, DateTimeKind.Utc), _ => { });
    private void ComFuncionario(string? email = "ana.lima@betinhos.com.br") => _svc.Com(new Entity("cr40f_funcionarios", _id) { ["cr40f_nomecompleto"] = "Ana Lima", ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(0) });
    private void ComUsuarioCompleto()
    {
        var u = new GraphUsuario { Id = "u1", Upn = "ana.lima@betinhos.com.br", Ativo = true }; u.SkuIds.Add("sku");
        _graph.Usuarios[u.Upn] = u; _graph.Membros.Add(("g", "u1"));
    }

    [Fact]
    public void Encerra_tudo_e_inativa()
    {
        ComFuncionario(); ComUsuarioCompleto();
        var etapas = Handler().Executar(_id, "ANA").ToJson();
        Assert.Contains("\"etapa\":\"grupo\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"feita\"", etapas);
        Assert.False(_graph.Usuarios["ana.lima@betinhos.com.br"].Ativo);
        Assert.Equal(1, _svc.Atualizados[0].GetAttributeValue<OptionSetValue>("cr40f_status").Value);
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
        Assert.Contains("\"etapa\":\"funcionario\",\"estado\":\"pulada\"", etapas);
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
    public void Usuario_inexistente_no_entra_so_inativa_o_funcionario()
    {
        ComFuncionario();
        var etapas = Handler().Executar(_id, "Ana").ToJson();
        Assert.Contains("\"etapa\":\"conta\",\"estado\":\"pulada\"", etapas);
        Assert.Contains("\"etapa\":\"funcionario\",\"estado\":\"feita\"", etapas);
    }
}
