using System;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class UsuarioDataverseRepositoryTests
{
    private static FakeService ComUnidadeRaiz() => new FakeService().Com(new Entity("businessunit", Guid.NewGuid()) { ["parentbusinessunitid"] = null });

    [Fact]
    public void Garantir_cria_e_informa_o_estado_gravado()
    {
        var svc = ComUnidadeRaiz();
        var repo = new UsuarioDataverseRepository(svc);
        Assert.True(repo.Garantir(Guid.NewGuid(), "ana.lima@betinhos.onmicrosoft.com", "Ana Lima"));
        Assert.Contains("isdisabled=False", repo.Estado);
        Assert.Contains("email=ana.lima@betinhos.onmicrosoft.com", repo.Estado);
        Assert.Empty(svc.Atualizados);
    }

    [Fact]
    public void Garantir_corrige_email_sobrescrito_pelo_Dataverse()
    {
        var svc = ComUnidadeRaiz();
        svc.AoCriar = e => { if (e.LogicalName == "systemuser") e["internalemailaddress"] = null; };
        var repo = new UsuarioDataverseRepository(svc);
        repo.Garantir(Guid.NewGuid(), "ana.lima@betinhos.onmicrosoft.com", "Ana Lima");
        Assert.Contains("email=(vazio)", repo.Estado);
        Assert.Equal("ana.lima@betinhos.onmicrosoft.com", Assert.Single(svc.Atualizados)["internalemailaddress"]);
    }

    [Fact]
    public void Garantir_habilita_o_systemuser_que_o_Dataverse_cria_desabilitado()
    {
        var svc = ComUnidadeRaiz();
        svc.AoCriar = e => { if (e.LogicalName == "systemuser") e["isdisabled"] = true; };
        var repo = new UsuarioDataverseRepository(svc);
        repo.Garantir(Guid.NewGuid(), "ana.lima@betinhos.onmicrosoft.com", "Ana Lima");
        Assert.IsType<Microsoft.Crm.Sdk.Messages.SetStateRequest>(Assert.Single(svc.Executados));
        Assert.Contains("isdisabled=False", repo.Estado);
    }
}
