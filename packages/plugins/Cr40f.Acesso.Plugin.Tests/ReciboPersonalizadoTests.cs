using System;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class ReciboPersonalizadoTests
{
    private static readonly DateTime Agora = new(2026, 11, 23, 15, 0, 0, DateTimeKind.Utc);
    private readonly FakeService _svc = new();
    private readonly Guid _gestor = Guid.NewGuid(), _usuarioBia = Guid.NewGuid(), _usuarioSemFicha = Guid.NewGuid();
    private readonly Guid _bia = Guid.NewGuid(), _ana = Guid.NewGuid();

    public ReciboPersonalizadoTests()
    {
        var roleId = Guid.NewGuid();
        _svc.Com(new Entity("role", roleId) { ["name"] = AppConfigAutorizacao.FuncaoGestor }, new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = _gestor, ["roleid"] = roleId },
            new Entity("systemuser", _gestor) { ["internalemailaddress"] = "gestor@betinhos.com" });
        _svc.Com(new Entity("systemuser", _usuarioBia) { ["internalemailaddress"] = "bia.souza@betinhos.com" });
        _svc.Com(new Entity("systemuser", _usuarioSemFicha) { ["internalemailaddress"] = "ninguem@betinhos.com" });
        Ficha(_bia, "Bia Souza", "bia.souza@betinhos.com");
        Ficha(_ana, "Ana Lima", "ana.lima@betinhos.com");
    }

    private void Ficha(Guid id, string nome, string email)
        => _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(0), ["cr40f_tipodevinculo"] = new OptionSetValue(0) });

    private ReciboPersonalizadoHandler Handler => new(new AppConfigRepository(_svc), () => Agora);

    private void Publicar(string json)
    {
        var repo = new AppConfigRepository(_svc); var aut = new AppConfigAutorizacao(_svc);
        new AppConfigSalvarRascunhoHandler(repo, aut).Executar(_gestor, json, null, false);
        new AppConfigPublicarHandler(repo, aut, () => Agora).Executar(_gestor, null);
    }

    private void ColunaLegada(Guid id, bool valor) => _svc.Linhas("cr40f_funcionarios").Single(f => f.Id == id)["cr40f_gerarrecibopersonalizado"] = valor;

    [Fact]
    public void Recusa_o_proprio_motorista_com_recibo_personalizado_desligado()
    {
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Handler.Executar(_usuarioBia, _bia));
        Assert.Equal(ReciboPersonalizadoHandler.Mensagem, erro.Message);
    }

    [Fact]
    public void Libera_o_proprio_motorista_quando_a_matriz_liga_o_servico()
    {
        Publicar("{\"proprio\":{\"services.personalReceipt\":true},\"terceiro\":{}}");
        Handler.Executar(_usuarioBia, _bia);
    }

    [Fact]
    public void Nunca_recusa_recibo_criado_por_outra_pessoa()
    {
        Handler.Executar(_gestor, _bia);          // gestão criando recibo da Bia
        Handler.Executar(_usuarioBia, _ana);      // Bia criando recibo em nome de outra ficha
        Handler.Executar(_usuarioSemFicha, _bia); // usuário sem ficha (conta de serviço, escritório)
    }

    [Fact]
    public void Recibo_sem_motorista_passa()
    {
        Handler.Executar(_usuarioBia, null);
        Handler.Executar(_usuarioBia, Guid.Empty);
    }

    [Fact]
    public void Legado_coluna_sim_sem_linha_libera()
    {
        ColunaLegada(_bia, true);
        Handler.Executar(_usuarioBia, _bia);
    }

    [Fact]
    public void Legado_coluna_sim_com_excecao_desligando_recusa()
    {
        ColunaLegada(_bia, true);
        var repo = new AppConfigRepository(_svc);
        new AppConfigDefinirPessoaHandler(repo, new AppConfigAutorizacao(_svc), () => Agora).Executar(_gestor, _bia, "excecao", "services.personalReceipt", false, "teste", null, false);
        Assert.Throws<InvalidPluginExecutionException>(() => Handler.Executar(_usuarioBia, _bia));
    }

    [Fact]
    public void Legado_coluna_nao_segue_a_matriz()
    {
        ColunaLegada(_bia, false);
        Assert.Throws<InvalidPluginExecutionException>(() => Handler.Executar(_usuarioBia, _bia));
    }
}
