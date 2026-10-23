using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class FuncionarioRepositoryTests
{
    private static Entity Func(Guid id, string nome, string? email, int status = 0) => new("cr40f_funcionarios", id)
    { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(status), ["cr40f_tipodevinculo"] = new OptionSetValue(1) };

    [Fact]
    public void PorEmail_ignora_maiusculas_e_devolve_null_quando_nao_ha()
    {
        var id = Guid.NewGuid();
        var repo = new FuncionarioRepository(new FakeService().Com(Func(id, "Ana Lima", "ana.lima@betinhos.onmicrosoft.com")));
        Assert.Equal(id, repo.PorEmail("Ana.Lima@betinhos.onmicrosoft.com")!.Id);
        Assert.Null(repo.PorEmail("x@betinhos.onmicrosoft.com"));
    }

    [Fact]
    public void Criar_grava_motorista_ativo_com_vinculo()
    {
        var svc = new FakeService();
        var id = new FuncionarioRepository(svc).Criar("Ana Lima", "ana.lima@betinhos.onmicrosoft.com", "+5512999999999", 1);
        var e = svc.Criados[0];
        Assert.Equal(id, e.Id);
        Assert.Equal(202410000, e.GetAttributeValue<OptionSetValue>("cr40f_funcao").Value);
        Assert.Equal(0, e.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(1, e.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo").Value);
        Assert.Equal("+5512999999999", e["cr40f_telefonecorporativo"]);
    }

    [Fact]
    public void Inativar_preenche_demissao_so_quando_vazia()
    {
        var id = Guid.NewGuid();
        var svc = new FakeService().Com(Func(id, "Ana Lima", "a@b.c"));
        new FuncionarioRepository(svc).Inativar(id, new DateTime(2026, 10, 22, 15, 0, 0, DateTimeKind.Utc));
        Assert.Equal(1, svc.Atualizados[0].GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        var demissao = svc.Atualizados[0].GetAttributeValue<DateTime>("cr40f_datadedemissao");
        Assert.Equal(new DateTime(2026, 10, 22, 15, 0, 0, DateTimeKind.Utc), demissao);
        Assert.Equal(DateTimeKind.Utc, demissao.Kind);
    }

    [Fact]
    public void Autorizacao_exige_funcao_de_gestao_ou_admin()
    {
        var user = Guid.NewGuid(); var roleId = Guid.NewGuid();
        var svc = new FakeService()
            .Com(new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = user, ["roleid"] = roleId })
            .Com(new Entity("role", roleId) { ["name"] = "Acesso - Gestão de Motoristas" });
        Autorizacao.Exigir(svc, user);
        var erro = Assert.Throws<AcessoException>(() => Autorizacao.Exigir(svc, Guid.NewGuid()));
        Assert.Equal("SEM_PERMISSAO", erro.Codigo);
    }
}
