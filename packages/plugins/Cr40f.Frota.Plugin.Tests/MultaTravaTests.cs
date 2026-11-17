using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class MultaTravaTests
{
    private static Entity Alvo(Guid id, params (string Coluna, object Valor)[] campos)
    {
        var e = new Entity(MultaMapper.Tabela, id);
        foreach (var (c, v) in campos) e[c] = v;
        return e;
    }

    private static Entity Pre(Guid id, int status) => Alvo(id, ("cr40f_status", new OptionSetValue(status)));

    [Fact]
    public void Observar_nao_recusa_e_registra_a_origem()
    {
        var mundo = new FakeMundo();
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Contains(mundo.Traces, t => t.Contains("Recusaria") && t.Contains("cr40f_status") && t.Contains("gravação direta"));
    }

    [Fact]
    public void Travar_recusa_gravacao_direta_de_campo_de_passo()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Contains("passo a passo", erro.Message);
        Assert.Contains(mundo.Traces, t => t.StartsWith("Recusada"));
    }

    [Fact]
    public void Gravacao_vinda_da_PassoMulta_passa_mesmo_travada()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "TRAVAR");
        var id = Guid.NewGuid();
        var pai = new RemoteExecutionContext { MessageName = PassoMultaPlugin.Mensagem };
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar), pai);

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Variavel_compartilhada_nao_engana_a_trava()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var ctx = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Identificar));
        ctx.SharedVariables["origem"] = PassoMultaPlugin.Mensagem;

        Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));
    }

    [Fact]
    public void Campo_livre_e_mesmo_valor_passam()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var id = Guid.NewGuid();
        var livre = Contexto.Gravacao("Update", Alvo(id, ("cr40f_vencimento", new DateTime(2026, 12, 1, 12, 0, 0, DateTimeKind.Utc)), ("cr40f_valorcomdesconto", new Money(105.53m))), Pre(id, MultaCodigos.Pagar));
        var mesmo = Contexto.Gravacao("Update", Alvo(id, ("cr40f_status", new OptionSetValue(MultaCodigos.Pagar))), Pre(id, MultaCodigos.Pagar));

        Contexto.Rodar(new MultaTravaPlugin(), livre, mundo);
        Contexto.Rodar(new MultaTravaPlugin(), mesmo, mundo);

        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Create_exige_o_numero_do_auto()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid()));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Equal("Informe o número do auto de infração.", erro.Message);
    }

    [Fact]
    public void Create_recusa_auto_repetido()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        mundo.Add(Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "1A2B3C")));
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid(), ("cr40f_novacoluna", " 1a2b3c ")));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Equal("Já existe multa com o auto 1a2b3c.", erro.Message);
    }

    [Fact]
    public void Create_comeca_na_etapa_1_e_aceita_o_motorista()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var alvo = Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "9Z8Y7X"), ("cr40f_status", new OptionSetValue(MultaCodigos.Indicar)), ("cr40f_motorista", new EntityReference("cr40f_funcionarios", Guid.NewGuid())));
        var ctx = Contexto.Gravacao("Create", alvo);

        Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo);

        Assert.Equal(MultaCodigos.Identificar, alvo.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Empty(mundo.Traces);
    }

    [Fact]
    public void Create_com_campo_de_passo_e_recusado_quando_travada()
    {
        var mundo = new FakeMundo().Variavel(MultaTravaPlugin.ModoVariavel, "travar");
        var ctx = Contexto.Gravacao("Create", Alvo(Guid.NewGuid(), ("cr40f_novacoluna", "5W4V3U"), ("cr40f_responsavel", new OptionSetValue(MultaCodigos.Empresa))));

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Contexto.Rodar(new MultaTravaPlugin(), ctx, mundo));

        Assert.Contains("cr40f_responsavel", erro.Message);
    }
}
