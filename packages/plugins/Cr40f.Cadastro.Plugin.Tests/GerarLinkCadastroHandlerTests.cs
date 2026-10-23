using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Cadastro.Plugin.Tests;

public class GerarLinkCadastroHandlerTests
{
    private static readonly DateTime Agora = new(2026, 10, 22, 12, 0, 0, DateTimeKind.Utc);
    private static readonly byte[] Bytes = Enumerable.Range(0, 32).Select(i => (byte)(i * 7 + 250)).ToArray();
    private static readonly string Token = GerarLinkCadastroHandler.Base64Url(Bytes);

    private readonly FakeService _svc = new();
    private readonly Guid _reserva = Guid.NewGuid(), _ana = Guid.NewGuid(), _bia = Guid.NewGuid(), _caio = Guid.NewGuid();

    private GerarLinkCadastroHandler Handler(FakeService? usuario = null) => new(usuario ?? _svc, _svc, () => Agora, () => Bytes);

    private Entity Pessoa(Guid id, string nome) => new("cr40f_bancodedados", id) { ["cr40f_nomedopassageiro"] = nome, ["cr40f_telefone"] = "11999990000", ["cr40f_email"] = nome.ToLowerInvariant() + "@x.com" };
    private Entity Reserva(int status = 202410001) => new("cr40f_reservadeveculos", _reserva) { ["cr40f_status"] = new OptionSetValue(status) };
    private Entity Filho(Guid pessoa, int ordem) => new("cr40f_servicosporpassageiro", Guid.NewGuid()) { ["cr40f_geral"] = new EntityReference("cr40f_reservadeveculos", _reserva), ["cr40f_bancodedados"] = new EntityReference("cr40f_bancodedados", pessoa), ["cr40f_ordemdeselecao"] = ordem };
    private Entity Link(Guid? pessoa, int status)
    {
        var e = new Entity("cr40f_linkcadastro", Guid.NewGuid()) { ["cr40f_reserva"] = new EntityReference("cr40f_reservadeveculos", _reserva), ["cr40f_status"] = new OptionSetValue(status) };
        if (pessoa is Guid p) e["cr40f_passageiro"] = new EntityReference("cr40f_bancodedados", p);
        return e;
    }

    private void Basico() => _svc.Com(Reserva(), Pessoa(_ana, "Ana"), Pessoa(_bia, "Bia"), Filho(_bia, 2), Filho(_ana, 1));
    private Entity Criado() => _svc.Criados.Single(e => e.LogicalName == "cr40f_linkcadastro");

    [Fact]
    public void EscopoServico_ListaPassageirosNaOrdemESemPassageiroNoLink()
    {
        Basico();
        var json = Handler().Executar(_reserva.ToString(), null);
        Assert.StartsWith("{\"ok\":true,\"link\":\"https://cadastro.betinhos.com.br/#t=" + Token + "\"", json);
        Assert.True(json.IndexOf(_ana.ToString()) < json.IndexOf(_bia.ToString()));
        Assert.Contains("\"email\":\"ana@x.com\"", json);
        Assert.Contains("\"foto\":null", json);
        Assert.False(Criado().Contains("cr40f_passageiro"));
        Assert.Equal(0, Criado()["cr40f_envios"]);
        Assert.Equal(StatusLink.Ativo, Criado().GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void EscopoPassageiro_SoEle()
    {
        Basico();
        var json = Handler().Executar(_reserva.ToString(), _bia.ToString());
        Assert.Contains(_bia.ToString(), json);
        Assert.DoesNotContain(_ana.ToString(), json);
        Assert.Equal(_bia, Criado().GetAttributeValue<EntityReference>("cr40f_passageiro").Id);
    }

    [Fact]
    public void PassageiroForaDoServico_Erro()
    {
        Basico();
        Assert.Equal("{\"ok\":false,\"erro\":\"Passageiro não pertence a este serviço.\"}", Handler().Executar(_reserva.ToString(), Guid.NewGuid().ToString()));
        Assert.Empty(_svc.Criados);
    }

    [Fact]
    public void ServicoSemPassageiros_Erro()
    {
        _svc.Com(Reserva());
        Assert.Contains("\"ok\":false", Handler().Executar(_reserva.ToString(), null));
        Assert.Empty(_svc.Criados);
    }

    [Theory]
    [InlineData(202410002)]
    [InlineData(202410010)]
    public void ServicoCancelado_Erro(int status)
    {
        _svc.Com(Reserva(status), Pessoa(_ana, "Ana"), Filho(_ana, 1));
        Assert.Contains("cancelado", Handler().Executar(_reserva.ToString(), null));
        Assert.Empty(_svc.Criados);
    }

    [Fact]
    public void UsuarioSemAcesso_ErroAmigavel()
    {
        Basico();
        var json = Handler(new FakeService { NegarLeitura = true }).Executar(_reserva.ToString(), null);
        Assert.Equal("{\"ok\":false,\"erro\":\"Serviço não encontrado ou você não tem acesso a ele.\"}", json);
        Assert.Empty(_svc.Criados);
    }

    [Fact]
    public void RevogaSoAtivosEUsadosDoMesmoEscopo()
    {
        Basico();
        Entity servicoAtivo = Link(null, StatusLink.Ativo), servicoUsado = Link(null, StatusLink.UsadoParcialmente), servicoExpirado = Link(null, StatusLink.Expirado), daAna = Link(_ana, StatusLink.Ativo);
        _svc.Com(servicoAtivo, servicoUsado, servicoExpirado, daAna);
        Handler().Executar(_reserva.ToString(), null);
        Assert.Equal(StatusLink.Revogado, servicoAtivo.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(StatusLink.Revogado, servicoUsado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(StatusLink.Expirado, servicoExpirado.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        Assert.Equal(StatusLink.Ativo, daAna.GetAttributeValue<OptionSetValue>("cr40f_status").Value);

        Handler().Executar(_reserva.ToString(), _ana.ToString());
        Assert.Equal(StatusLink.Revogado, daAna.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
    }

    [Fact]
    public void GravaHashENuncaOToken()
    {
        Basico();
        Handler().Executar(_reserva.ToString(), null);
        var hash = Criado().GetAttributeValue<string>("cr40f_tokenhash");
        Assert.Matches("^[0-9a-f]{64}$", hash);
        Assert.NotEqual(Token, hash);
        Assert.Equal(GerarLinkCadastroHandler.Sha256Hex(Token), hash);
        Assert.DoesNotContain(Criado().Attributes, kv => kv.Value is string s && s.Contains(Token));
        Assert.Equal(43, Token.Length);
        Assert.DoesNotContain('=', Token);
    }

    [Fact]
    public void ExpiraEm36Horas()
    {
        Basico();
        var json = Handler().Executar(_reserva.ToString(), null);
        Assert.Equal(Agora.AddHours(36), Criado().GetAttributeValue<DateTime>("cr40f_expiraem"));
        Assert.Contains("\"expiraEm\":\"2026-10-24T00:00:00Z\"", json);
    }

    [Fact]
    public void SemFilhos_UsaLookupsPassageiro1a4_ComDedupe()
    {
        var reserva = Reserva();
        reserva["cr40f_passageiro1"] = new EntityReference("cr40f_bancodedados", _caio);
        reserva["cr40f_passageiro2"] = new EntityReference("cr40f_bancodedados", _ana);
        reserva["cr40f_passageiro4"] = new EntityReference("cr40f_bancodedados", _caio);
        _svc.Com(reserva, Pessoa(_ana, "Ana"), Pessoa(_caio, "Caio"));
        var json = Handler().Executar(_reserva.ToString(), null);
        Assert.Equal(2, json.Split(new[] { "\"id\":" }, StringSplitOptions.None).Length - 1);
        Assert.True(json.IndexOf(_caio.ToString()) < json.IndexOf(_ana.ToString()));
    }

    [Fact]
    public void FilhosDuplicados_Dedupe()
    {
        _svc.Com(Reserva(), Pessoa(_ana, "Ana"), Filho(_ana, 1), Filho(_ana, 2));
        var json = Handler().Executar(_reserva.ToString(), null);
        Assert.Equal(1, json.Split(new[] { "\"id\":" }, StringSplitOptions.None).Length - 1);
    }

    [Fact]
    public void ReservaIdInvalido_Erro() => Assert.Contains("\"ok\":false", Handler().Executar("abc", null));
}
