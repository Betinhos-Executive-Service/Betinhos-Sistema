using System;
using System.Collections.Generic;
using System.Net;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Cadastro.Plugin.Tests;

public class UrlFlowConsultaTests
{
    private const string DaVariavel = "https://variavel.example/gatilho?sig=AAA";
    private const string DaSegura = "https://segura.example/gatilho?sig=BBB";

    private readonly FakeService _svc = new();
    private readonly List<string> _trace = new();

    private void Variavel(string? padrao, string? atual)
    {
        var def = new Entity("environmentvariabledefinition", Guid.NewGuid()) { ["schemaname"] = UrlFlowConsulta.Variavel, ["defaultvalue"] = padrao };
        _svc.Com(def);
        if (atual is not null) _svc.Com(new Entity("environmentvariablevalue", Guid.NewGuid()) { ["environmentvariabledefinitionid"] = def.ToEntityReference(), ["value"] = atual });
    }

    private void SemSegredoNoTrace() => Assert.DoesNotContain(_trace, t => t.Contains("https://") || t.Contains("sig="));

    [Fact]
    public void VariavelComValorAtual_UsaVariavel()
    {
        Variavel("https://padrao.example/x", DaVariavel);
        Assert.Equal(DaVariavel, UrlFlowConsulta.Ler(_svc, DaSegura, _trace.Add));
        SemSegredoNoTrace();
    }

    [Fact]
    public void VariavelSoComPadrao_UsaPadrao()
    {
        Variavel(DaVariavel, null);
        Assert.Equal(DaVariavel, UrlFlowConsulta.Ler(_svc, DaSegura, _trace.Add));
    }

    [Fact]
    public void VariavelAusente_UsaConfiguracaoSegura()
    {
        Assert.Equal(DaSegura, UrlFlowConsulta.Ler(_svc, "  " + DaSegura + " ", _trace.Add));
        Assert.Contains(_trace, t => t.Contains("configuração segura"));
        SemSegredoNoTrace();
    }

    [Fact]
    public void VariavelVazia_UsaConfiguracaoSegura()
    {
        Variavel(null, " ");
        Assert.Equal(DaSegura, UrlFlowConsulta.Ler(_svc, DaSegura, _trace.Add));
    }

    [Fact]
    public void AmbasAusentes_NullComMotivo_EHandlerNegaIndisponivel()
    {
        Assert.Null(UrlFlowConsulta.Ler(_svc, null, _trace.Add));
        Assert.Contains(_trace, t => t.Contains("URL do flow ausente"));

        // Handler sem consulta (URL ausente) nega com o motivo no trace.
        var reserva = Guid.NewGuid(); var motorista = Guid.NewGuid(); var usuario = Guid.NewGuid(); var ana = Guid.NewGuid();
        _svc.Com(
            new Entity("cr40f_reservadeveculos", reserva) { ["cr40f_status"] = new OptionSetValue(ObterFotoPassageiroHandler.StatusProgramado), ["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", motorista), ["cr40f_passageiro1"] = new EntityReference("cr40f_bancodedados", ana) },
            new Entity("cr40f_funcionarios", motorista) { ["cr40f_emailmicrosoft"] = "joao@betinhos.com.br" },
            new Entity("systemuser", usuario) { ["domainname"] = "joao@betinhos.com.br" },
            new Entity("cr40f_bancodedados", ana) { ["new_linkdafoto"] = ObterFotoPassageiroHandler.PrefixoLink + "Passageiros/Fotos/DEV/a.jpg" });
        Assert.Equal(ObterFotoPassageiroHandler.Negado, new ObterFotoPassageiroHandler(_svc, null, _trace.Add).Executar(usuario, reserva.ToString(), ana.ToString()));
        Assert.Contains(_trace, t => t.Contains("negado: URL do flow de consulta ausente"));
    }

    [Fact]
    public void VariavelIlegivel_CaiNaSeguraERegistraMotivo()
    {
        Assert.Equal(DaSegura, UrlFlowConsulta.Ler(new FakeService { NegarRetrieveMultiple = true }, DaSegura, _trace.Add));
        Assert.Contains(_trace, t => t.Contains("ilegível"));
    }

    [Theory]
    [InlineData(WebExceptionStatus.Timeout, null, "tempo esgotado (20 s)")]
    [InlineData(WebExceptionStatus.ProtocolError, HttpStatusCode.Forbidden, "flow respondeu HTTP 403")]
    [InlineData(WebExceptionStatus.NameResolutionFailure, null, "falha de rede (NameResolutionFailure)")]
    public void MotivoFalha_SemUrl(WebExceptionStatus status, HttpStatusCode? http, string esperado) =>
        Assert.Equal(esperado, ConsultaArquivoFlow.MotivoFalha(status, http));
}
