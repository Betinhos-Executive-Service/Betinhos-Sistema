using System;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class UnidadeDoDocumentoTests
{
    static readonly Guid Raiz = new Guid("00000000-0000-0000-0000-000000000001");
    static readonly Guid Frota = new Guid("00000000-0000-0000-0000-000000000002");
    static readonly Guid Veiculo = new Guid("00000000-0000-0000-0000-000000000010");
    static readonly Guid Funcionario = new Guid("00000000-0000-0000-0000-000000000011");
    static readonly Unidades ComFrota = new Unidades(Raiz, Frota);
    static readonly Unidades SemFrota = new Unidades(Raiz, null);

    static Entity Doc(Guid? veiculo = null, Guid? funcionario = null, Guid? unidade = null)
    {
        var e = new Entity("cr40f_documento");
        if (veiculo.HasValue) e["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", veiculo.Value);
        if (funcionario.HasValue) e["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", funcionario.Value);
        if (unidade.HasValue) e["owningbusinessunit"] = new EntityReference("businessunit", unidade.Value);
        return e;
    }

    [Fact]
    public void Sem_unidade_Frota_nao_faz_nada()
        => Assert.Null(UnidadeDoDocumento.Decidir("Create", Doc(veiculo: Veiculo), null, SemFrota));

    [Fact]
    public void Create_de_veiculo_vai_para_a_Frota()
        => Assert.Equal(Frota, UnidadeDoDocumento.Decidir("Create", Doc(veiculo: Veiculo), null, ComFrota));

    [Fact]
    public void Create_de_funcionario_vai_para_a_raiz()
        => Assert.Equal(Raiz, UnidadeDoDocumento.Decidir("Create", Doc(funcionario: Funcionario), null, ComFrota));

    [Fact]
    public void Funcionario_vence_quando_tem_os_dois()
        => Assert.Equal(Raiz, UnidadeDoDocumento.Decidir("Create", Doc(Veiculo, Funcionario), null, ComFrota));

    [Fact]
    public void Update_sem_mudar_de_unidade_nao_grava()
        => Assert.Null(UnidadeDoDocumento.Decidir("Update", new Entity("cr40f_documento"), Doc(veiculo: Veiculo, unidade: Frota), ComFrota));

    [Fact]
    public void Update_que_troca_veiculo_por_funcionario_volta_para_a_raiz()
    {
        var alvo = Doc(funcionario: Funcionario);
        alvo["cr40f_veiculo"] = null;
        Assert.Equal(Raiz, UnidadeDoDocumento.Decidir("Update", alvo, Doc(veiculo: Veiculo, unidade: Frota), ComFrota));
    }

    [Fact]
    public void Update_com_ownerid_sempre_regrava()
    {
        var alvo = new Entity("cr40f_documento");
        alvo["ownerid"] = new EntityReference("systemuser", new Guid("00000000-0000-0000-0000-000000000020"));
        Assert.Equal(Frota, UnidadeDoDocumento.Decidir("Update", alvo, Doc(veiculo: Veiculo, unidade: Frota), ComFrota));
    }

    [Fact]
    public void Sem_dono_nao_faz_nada()
        => Assert.Null(UnidadeDoDocumento.Decidir("Create", Doc(), null, ComFrota));

    static Entity Bu(Guid id, string nome, Guid? pai, bool desativada = false)
    {
        var e = new Entity("businessunit", id);
        e["name"] = nome;
        if (pai.HasValue) e["parentbusinessunitid"] = new EntityReference("businessunit", pai.Value);
        e["isdisabled"] = desativada;
        return e;
    }

    [Fact]
    public void Ler_acha_raiz_e_Frota_por_nome_ignorando_caixa()
    {
        var u = Unidades.Ler(new FakeService().Com(Bu(Raiz, "org", null), Bu(Frota, "FROTA", Raiz)));
        Assert.Equal(Raiz, u.Raiz);
        Assert.Equal(Frota, u.Frota);
    }

    [Fact]
    public void Ler_ignora_Frota_desativada_ou_fora_da_raiz()
    {
        var neta = new Guid("00000000-0000-0000-0000-000000000003");
        var u = Unidades.Ler(new FakeService().Com(Bu(Raiz, "org", null), Bu(Frota, "Frota", Raiz, desativada: true), Bu(neta, "Frota", Frota)));
        Assert.Null(u.Frota);
    }

    [Fact]
    public void Ler_recusa_duas_Frotas()
    {
        var outra = new Guid("00000000-0000-0000-0000-000000000004");
        var svc = new FakeService().Com(Bu(Raiz, "org", null), Bu(Frota, "Frota", Raiz), Bu(outra, "frota", Raiz));
        Assert.Throws<InvalidPluginExecutionException>(() => Unidades.Ler(svc));
    }
}
