using System;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Protecao.Plugin.Tests;

public class ProtecaoCamposTests
{
    const string Planilha = "{\"cr40f_destino\":\"Aeroporto; \\n\",\"cr40f_dataehorriodesada\":\"2026-11-04T14:30:00Z\",\"cr40f_horrioprevistoderetorno\":\"\",\"cr40f_status\":\"202410001\",\"cr40f_cr\":\"501019731\"}";
    static readonly Guid Id = Guid.NewGuid();

    static Entity Anterior(string? lista = null, string? snapshot = Planilha, int tipo = 202410000) => new("cr40f_reservadeveculos", Id)
    {
        [ProtecaoCampos.Lista] = lista, [ProtecaoCampos.Snapshot] = snapshot,
        ["cr40f_status"] = new OptionSetValue(202410001), ["cr40f_tipodeveiculo"] = new OptionSetValue(tipo),
    };
    static Entity Alvo() => new("cr40f_reservadeveculos", Id);

    [Fact]
    public void Equipe_muda_status_para_valor_diferente_da_planilha_protege()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        var r = ProtecaoCampos.Aplicar(alvo, Anterior());
        Assert.Equal(new[] { "cr40f_status" }, r.Adicionados);
        Assert.Equal("cr40f_status", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Sincronizacao_tira_campo_protegido_e_mantem_snapshot()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410001); alvo["cr40f_cr"] = "999"; alvo[ProtecaoCampos.Snapshot] = Planilha;
        var r = ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_status"));
        Assert.Equal(new[] { "cr40f_status" }, r.Barrados);
        Assert.False(alvo.Contains("cr40f_status"));
        Assert.True(alvo.Contains("cr40f_cr"));
        Assert.True(alvo.Contains(ProtecaoCampos.Snapshot));
        Assert.False(alvo.Contains(ProtecaoCampos.Lista));
    }

    [Fact]
    public void Status_cancelado_da_tenaris_tambem_e_barrado()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410002); alvo[ProtecaoCampos.Snapshot] = Planilha;
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_status"));
        Assert.False(alvo.Contains("cr40f_status"));
    }

    [Fact]
    public void Reserva_sem_snapshot_nao_protege()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        var r = ProtecaoCampos.Aplicar(alvo, Anterior(snapshot: null));
        Assert.Empty(r.Adicionados);
        Assert.False(alvo.Contains(ProtecaoCampos.Lista));
    }

    [Fact]
    public void Valor_igual_ao_da_planilha_nao_protege()
    {
        var alvo = Alvo();
        alvo["cr40f_status"] = new OptionSetValue(202410001);
        alvo["cr40f_destino"] = "Aeroporto; \n";
        alvo["cr40f_dataehorriodesada"] = new DateTime(2026, 11, 4, 14, 30, 0, DateTimeKind.Utc);
        alvo["cr40f_horrioprevistoderetorno"] = null;
        var r = ProtecaoCampos.Aplicar(alvo, Anterior());
        Assert.Empty(r.Adicionados);
    }

    [Fact]
    public void Lista_existente_e_mantida_sem_duplicar()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005); alvo["cr40f_cr"] = "123";
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_observaointerna; cr40f_STATUS"));
        Assert.Equal("cr40f_observaointerna,cr40f_status,cr40f_cr", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Passageiros_nunca_entram_na_lista()
    {
        var alvo = Alvo(); alvo["cr40f_passageirosetelefonedecontato"] = "Fulano - (12) 9999";
        Assert.Empty(ProtecaoCampos.Aplicar(alvo, Anterior()).Adicionados);
    }

    [Fact]
    public void Tipo_de_veiculo_fora_do_snapshot_compara_com_valor_anterior()
    {
        var igual = Alvo(); igual["cr40f_tipodeveiculo"] = new OptionSetValue(202410000);
        Assert.Empty(ProtecaoCampos.Aplicar(igual, Anterior()).Adicionados);
        var outro = Alvo(); outro["cr40f_tipodeveiculo"] = new OptionSetValue(202410001);
        Assert.Equal(new[] { "cr40f_tipodeveiculo" }, ProtecaoCampos.Aplicar(outro, Anterior()).Adicionados);
    }

    [Fact]
    public void Snapshot_invalido_compara_com_valor_anterior_sem_quebrar()
    {
        var alvo = Alvo(); alvo["cr40f_status"] = new OptionSetValue(202410005);
        Assert.Equal(new[] { "cr40f_status" }, ProtecaoCampos.Aplicar(alvo, Anterior(snapshot: "{quebrado")).Adicionados);
    }

    [Fact]
    public void Equipe_limpa_campo_que_a_planilha_preenche_protege()
    {
        var alvo = Alvo(); alvo["cr40f_cr"] = null;
        Assert.Equal(new[] { "cr40f_cr" }, ProtecaoCampos.Aplicar(alvo, Anterior()).Adicionados);
    }

    [Fact]
    public void Lista_vinda_no_proprio_alvo_e_a_base()
    {
        var alvo = Alvo(); alvo[ProtecaoCampos.Lista] = "cr40f_trajeto"; alvo["cr40f_status"] = new OptionSetValue(202410005);
        ProtecaoCampos.Aplicar(alvo, Anterior("cr40f_cr"));
        Assert.Equal("cr40f_trajeto,cr40f_status", alvo[ProtecaoCampos.Lista]);
    }
}

public class ProtegerCamposPluginTests
{
    static FakeContext Contexto(Entity alvo, Entity anterior)
    {
        var c = new FakeContext("Update", "cr40f_reservadeveculos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        c.PreEntityImages[ProtegerCamposPlugin.ImagemAnterior] = anterior;
        return c;
    }

    [Fact]
    public void Plugin_protege_no_proprio_target()
    {
        var id = Guid.NewGuid();
        var alvo = new Entity("cr40f_reservadeveculos", id) { ["cr40f_status"] = new OptionSetValue(202410005) };
        var anterior = new Entity("cr40f_reservadeveculos", id) { [ProtecaoCampos.Snapshot] = "{\"cr40f_status\":\"202410001\"}" };
        ProtegerCamposPlugin.Processar(Contexto(alvo, anterior));
        Assert.Equal("cr40f_status", alvo[ProtecaoCampos.Lista]);
    }

    [Fact]
    public void Outra_tabela_ou_mensagem_nao_faz_nada()
    {
        var alvo = new Entity("cr40f_composicaodeprecos", Guid.NewGuid());
        var c = new FakeContext("Update", "cr40f_composicaodeprecos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        Assert.Null(ProtegerCamposPlugin.Processar(c));
    }

    [Fact]
    public void Sem_imagem_pre_nao_quebra()
    {
        var alvo = new Entity("cr40f_reservadeveculos", Guid.NewGuid()) { ["cr40f_status"] = new OptionSetValue(202410005) };
        var c = new FakeContext("Update", "cr40f_reservadeveculos", alvo.Id, 1);
        c.InputParameters["Target"] = alvo;
        Assert.Empty(ProtegerCamposPlugin.Processar(c)!.Adicionados);
    }
}
