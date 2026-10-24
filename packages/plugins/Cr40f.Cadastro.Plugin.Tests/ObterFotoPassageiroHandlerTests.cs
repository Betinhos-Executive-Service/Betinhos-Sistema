using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Cadastro.Plugin.Tests;

public class ObterFotoPassageiroHandlerTests
{
    private const string Link = "https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/DEV/abc.jpg";
    private const string Base64 = "/9j/4AAQ";

    private sealed class FakeArquivos : IConsultaArquivo
    {
        public List<string> Caminhos { get; } = new();
        public Exception? Falha { get; set; }
        public string Mime { get; set; } = "image/jpeg";
        public ArquivoLido Ler(string caminhoSharePoint, string nomeArquivo)
        {
            Caminhos.Add(caminhoSharePoint + "|" + nomeArquivo);
            if (Falha is not null) throw Falha;
            return new ArquivoLido(Mime, Base64);
        }
    }

    private readonly FakeService _svc = new();
    private readonly FakeArquivos _arquivos = new();
    private readonly Guid _reserva = Guid.NewGuid(), _ana = Guid.NewGuid(), _motorista = Guid.NewGuid(), _usuario = Guid.NewGuid(), _outroUsuario = Guid.NewGuid();
    private readonly List<string> _trace = new();

    private string Executar(Guid? usuario = null, Guid? passageiro = null) =>
        new ObterFotoPassageiroHandler(_svc, _arquivos, _trace.Add).Executar(usuario ?? _usuario, _reserva.ToString(), (passageiro ?? _ana).ToString());

    private void Cenario(int status = ObterFotoPassageiroHandler.StatusProgramado, bool comMotorista = true, string? link = Link, bool viaFilho = true)
    {
        var reserva = new Entity("cr40f_reservadeveculos", _reserva) { ["cr40f_status"] = new OptionSetValue(status) };
        if (comMotorista) reserva["cr40f_motorista"] = new EntityReference("cr40f_funcionarios", _motorista);
        if (!viaFilho) reserva["cr40f_passageiro1"] = new EntityReference("cr40f_bancodedados", _ana);
        var pessoa = new Entity("cr40f_bancodedados", _ana) { ["cr40f_nomedopassageiro"] = "Ana" };
        if (link is not null) pessoa["new_linkdafoto"] = link;
        _svc.Com(reserva, pessoa,
            new Entity("cr40f_funcionarios", _motorista) { ["cr40f_emailmicrosoft"] = " Joao.Motorista@Betinhos.com.br " },
            new Entity("systemuser", _usuario) { ["domainname"] = "joao.motorista@betinhos.com.br", ["internalemailaddress"] = "joao.motorista@betinhos.com.br" },
            new Entity("systemuser", _outroUsuario) { ["domainname"] = "maria@betinhos.com.br", ["internalemailaddress"] = "maria@betinhos.com.br" });
        if (viaFilho) _svc.Com(new Entity("cr40f_servicosporpassageiro", Guid.NewGuid()) { ["cr40f_geral"] = new EntityReference("cr40f_reservadeveculos", _reserva), ["cr40f_bancodedados"] = new EntityReference("cr40f_bancodedados", _ana), ["cr40f_ordemdeselecao"] = 1 });
    }

    [Fact]
    public void MotoristaCertoProgramado_DevolveFoto()
    {
        Cenario();
        Assert.Equal("{\"ok\":true,\"mimeType\":\"image/jpeg\",\"conteudoBase64\":\"" + Base64 + "\"}", Executar());
        Assert.Equal("/Documentos Compartilhados/Passageiros/Fotos/DEV/abc.jpg|abc.jpg", Assert.Single(_arquivos.Caminhos));
    }

    [Fact]
    public void FallbackPassageiro1a4_DevolveFoto()
    {
        Cenario(viaFilho: false);
        Assert.StartsWith("{\"ok\":true", Executar());
    }

    [Fact]
    public void OutroMotorista_Nega()
    {
        Cenario();
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar(_outroUsuario));
        Assert.Empty(_arquivos.Caminhos);
    }

    [Theory]
    // Choices reais do DEV (24/10/2026).
    [InlineData(202410006)] // Em Execução
    [InlineData(202410008)] // Concluído
    [InlineData(202410002)] // Cancelado
    [InlineData(202410001)] // Confirmado
    public void StatusDiferenteDeProgramado_Nega(int status)
    {
        Cenario(status);
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
        Assert.Empty(_arquivos.Caminhos);
    }

    [Fact]
    public void ServicoSemMotorista_Nega()
    {
        Cenario(comMotorista: false);
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
    }

    [Fact]
    public void PassageiroForaDoServico_Nega()
    {
        Cenario();
        var outro = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_bancodedados", outro) { ["new_linkdafoto"] = Link });
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar(passageiro: outro));
        Assert.Empty(_arquivos.Caminhos);
    }

    [Fact]
    public void SemFoto_Nega()
    {
        Cenario(link: null);
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
    }

    [Theory]
    [InlineData("https://betinhos.sharepoint.com/:i:/s/BetinhosGestoInterna/EabcToken")]
    [InlineData("https://betinhos.sharepoint.com/:i:/r/sites/OutroSite/Documentos%20Compartilhados/x.jpg")]
    [InlineData("https://evil.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/x.jpg")]
    [InlineData("https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/%2E%2E/%2E%2E/Privado/x.jpg")]
    [InlineData("https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/")]
    public void UrlForaDaBiblioteca_Nega(string link)
    {
        Cenario(link: link);
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
        Assert.Empty(_arquivos.Caminhos);
    }

    [Fact]
    public void FalhaOuTimeoutDoFlow_NegaComDetalheSoNoTrace()
    {
        Cenario();
        _arquivos.Falha = new WebExceptionSimulada("The operation has timed out");
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
        Assert.Contains(_trace, t => t.Contains("timed out"));
    }

    [Fact]
    public void ArquivoQueNaoEImagem_Nega()
    {
        Cenario();
        _arquivos.Mime = "application/pdf";
        Assert.Equal(ObterFotoPassageiroHandler.Negado, Executar());
    }

    [Fact]
    public void CaminhoDecodificado()
    {
        Assert.Equal("/Documentos Compartilhados/Passageiros/Fotos/PROD/Jo\u00e3o 1.png",
            ObterFotoPassageiroHandler.CaminhoNaBiblioteca("https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Passageiros/Fotos/PROD/Jo%C3%A3o%201.png?csf=1&web=1"));
    }

    [Fact]
    public void RespostaDoFlowAcimaDoLimite_Falha()
    {
        Assert.Throws<InvalidOperationException>(() => ConsultaArquivoFlow.LerComLimite(new MemoryStream(new byte[11]), 10));
        Assert.Equal(10, ConsultaArquivoFlow.LerComLimite(new MemoryStream(new byte[10]), 10).Length);
    }

    [Fact]
    public void RespostaDoFlow_Desserializa()
    {
        var r = ConsultaArquivoFlow.Desserializar(Encoding.UTF8.GetBytes("{\"conteudoBase64\":\"QQ==\",\"mimeType\":\"image/png\",\"extra\":1}"));
        Assert.Equal("QQ==", r.conteudoBase64);
        Assert.Equal("image/png", r.mimeType);
    }

    [Fact]
    public void UrlDoFlowInvalida_Falha()
    {
        Assert.Throws<InvalidOperationException>(() => new ConsultaArquivoFlow(""));
        Assert.Throws<InvalidOperationException>(() => new ConsultaArquivoFlow("http://x.com/flow"));
    }

    private sealed class WebExceptionSimulada : Exception { public WebExceptionSimulada(string m) : base(m) { } }
}
