using System;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class AppConfigHandlersTests
{
    private static readonly DateTime Agora = new(2026, 11, 23, 15, 0, 0, DateTimeKind.Utc);
    private readonly FakeService _svc = new();
    private readonly Guid _gestor = Guid.NewGuid(), _admin = Guid.NewGuid(), _comum = Guid.NewGuid(), _servico = Guid.NewGuid(), _usuarioAna = Guid.NewGuid();
    private readonly Guid _ana = Guid.NewGuid(), _bia = Guid.NewGuid(), _inativo = Guid.NewGuid();

    public AppConfigHandlersTests()
    {
        Papel(_gestor, AppConfigAutorizacao.FuncaoGestor); Papel(_admin, "Administrador do Sistema");
        _svc.Com(new Entity("systemuser", _comum) { ["internalemailaddress"] = "comum@betinhos.com" });
        _svc.Com(new Entity("systemuser", _servico) { ["applicationid"] = Guid.NewGuid() });
        _svc.Com(new Entity("systemuser", _usuarioAna) { ["internalemailaddress"] = "Ana.Lima@betinhos.com" });
        Ficha(_ana, "Ana Lima", "ana.lima@betinhos.com", 0, 1);
        Ficha(_bia, "Bia Souza", "bia.souza@betinhos.com", 0, 0);
        Ficha(_inativo, "Caio Inativo", "caio@betinhos.com", 1, 0);
    }

    private void Papel(Guid usuario, string nome)
    {
        var roleId = Guid.NewGuid();
        _svc.Com(new Entity("role", roleId) { ["name"] = nome }, new Entity("systemuserroles", Guid.NewGuid()) { ["systemuserid"] = usuario, ["roleid"] = roleId });
        if (!_svc.Linhas("systemuser").Any(u => u.Id == usuario)) _svc.Com(new Entity("systemuser", usuario));
    }

    private void Ficha(Guid id, string nome, string email, int status, int vinculo)
        => _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = nome, ["cr40f_emailmicrosoft"] = email, ["cr40f_status"] = new OptionSetValue(status), ["cr40f_tipodevinculo"] = new OptionSetValue(vinculo) });

    private AppConfigRepository Repo => new(_svc);
    private AppConfigAutorizacao Aut => new(_svc);
    private AppConfigEfetivaHandler Efetiva => new(Repo, Aut, () => Agora);
    private AppConfigSalvarRascunhoHandler Salvar => new(Repo, Aut);
    private AppConfigPublicarHandler Publicar => new(Repo, Aut, () => Agora);
    private AppConfigDefinirPessoaHandler Pessoa => new(Repo, Aut, () => Agora);

    private static string Codigo(Action acao) => Assert.Throws<AcessoException>(acao).Codigo;

    private const string Rascunho1 = "{\"proprio\":{\"history\":false},\"terceiro\":{\"multas\":true}}";

    // ---- Efetiva ----

    [Fact]
    public void Efetiva_sem_versao_publicada_vale_o_padrao_do_catalogo()
    {
        var json = Efetiva.Executar(_usuarioAna, null);
        Assert.Contains("\"versao\":null", json);
        Assert.Contains("\"perfil\":\"terceiro\"", json);
        Assert.Contains("\"multas\":false", json);
        Assert.Contains("\"history\":true", json);
    }

    [Fact]
    public void Efetiva_aplica_a_versao_publicada_pelo_perfil_do_vinculo()
    {
        Salvar.Executar(_gestor, Rascunho1, null, false); Publicar.Executar(_gestor, "primeira");
        var json = Efetiva.Executar(_usuarioAna, _ana);
        Assert.Contains("\"versao\":1", json);
        Assert.Contains("\"history\":true", json);
        Assert.Contains("\"multas\":true", json);
    }

    [Fact]
    public void Efetiva_de_outra_pessoa_exige_gestao_ou_conta_de_servico()
    {
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Efetiva.Executar(_comum, _ana)));
        Assert.Contains("\"perfil\":\"terceiro\"", Efetiva.Executar(_gestor, _ana));
        Assert.Contains("\"perfil\":\"proprio\"", Efetiva.Executar(_servico, _bia));
    }

    [Fact]
    public void Efetiva_recusa_funcionario_inativo_ou_inexistente_e_chamador_sem_ficha()
    {
        Assert.Equal("MOTORISTA_INVALIDO", Codigo(() => Efetiva.Executar(_gestor, _inativo)));
        Assert.Equal("MOTORISTA_INVALIDO", Codigo(() => Efetiva.Executar(_gestor, Guid.NewGuid())));
        Assert.Equal("MOTORISTA_INVALIDO", Codigo(() => Efetiva.Executar(_comum, null)));
    }

    [Fact]
    public void Efetiva_considera_piloto_e_excecao_vigente()
    {
        Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, false);
        Assert.Contains("\"multas\":true", Efetiva.Executar(_gestor, _bia));
        Pessoa.Executar(_gestor, _bia, "excecao", "multas", false, "teste", null, false);
        var json = Efetiva.Executar(_gestor, _bia);
        Assert.Contains("\"multas\":false", json);
        Assert.Contains("\"multas\":\"excecao\"", json);
    }

    // ---- Salvar rascunho ----

    [Fact]
    public void Salvar_exige_gestor()
        => Assert.Equal("SEM_PERMISSAO", Codigo(() => Salvar.Executar(_comum, Rascunho1, null, false)));

    [Fact]
    public void Salvar_cria_e_depois_atualiza_com_a_marca_certa()
    {
        var marca1 = Salvar.Executar(_gestor, Rascunho1, null, false);
        Assert.NotEmpty(marca1);
        var marca2 = Salvar.Executar(_gestor, "{\"proprio\":{\"history\":true},\"terceiro\":{}}", marca1, false);
        Assert.NotEqual(marca1, marca2);
        var linha = Assert.Single(_svc.Linhas("cr40f_appconfigversao"));
        Assert.Contains("\"history\":true", linha.GetAttributeValue<string>("cr40f_conteudo"));
        Assert.Equal(AppConfigRepository.Rascunho, linha.GetAttributeValue<OptionSetValue>("cr40f_estado").Value);
    }

    [Fact]
    public void Salvar_com_marca_velha_ou_sem_marca_havendo_rascunho_e_rascunho_alterado()
    {
        var marca1 = Salvar.Executar(_gestor, Rascunho1, null, false);
        Salvar.Executar(_gestor, Rascunho1, marca1, false);
        Assert.Equal("RASCUNHO_ALTERADO", Codigo(() => Salvar.Executar(_gestor, Rascunho1, marca1, false)));
        Assert.Equal("RASCUNHO_ALTERADO", Codigo(() => Salvar.Executar(_gestor, Rascunho1, null, false)));
    }

    [Fact]
    public void Salvar_com_marca_sem_haver_rascunho_e_rascunho_alterado()
        => Assert.Equal("RASCUNHO_ALTERADO", Codigo(() => Salvar.Executar(_gestor, Rascunho1, "2026-11-23T12:00:00.0000000Z", false)));

    [Fact]
    public void Salvar_recusa_chave_fora_do_catalogo_e_chave_fixa_desligada()
    {
        Assert.Equal("CHAVE_INVALIDA", Codigo(() => Salvar.Executar(_gestor, "{\"proprio\":{\"nao-existe\":true},\"terceiro\":{}}", null, false)));
        Assert.Equal("CHAVE_FIXA", Codigo(() => Salvar.Executar(_gestor, "{\"proprio\":{\"services\":false},\"terceiro\":{}}", null, false)));
        Assert.Equal("CHAVE_INVALIDA", Codigo(() => Salvar.Executar(_gestor, "{\"proprio\":{\"history\":\"sim\"},\"terceiro\":{}}", null, false)));
        Assert.Equal("CHAVE_INVALIDA", Codigo(() => Salvar.Executar(_gestor, "isso nao e json", null, false)));
        Assert.Empty(_svc.Linhas("cr40f_appconfigversao"));
    }

    [Fact]
    public void Salvar_descartar_remove_o_rascunho_e_nao_falha_sem_ele()
    {
        Assert.Equal("", Salvar.Executar(_gestor, null, null, true));
        Salvar.Executar(_gestor, Rascunho1, null, false);
        Assert.Equal("", Salvar.Executar(_gestor, null, null, true));
        Assert.Empty(_svc.Linhas("cr40f_appconfigversao"));
    }

    // ---- Publicar ----

    [Fact]
    public void Publicar_exige_gestor()
    {
        Salvar.Executar(_gestor, Rascunho1, null, false);
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Publicar.Executar(_comum, null)));
    }

    [Fact]
    public void Publicar_sem_rascunho_e_nada_a_publicar()
        => Assert.Equal("NADA_A_PUBLICAR", Codigo(() => Publicar.Executar(_gestor, null)));

    [Fact]
    public void Primeiro_publicar_cria_a_versao_1_e_remove_o_rascunho()
    {
        Salvar.Executar(_gestor, Rascunho1, null, false);
        Assert.Equal(1, Publicar.Executar(_gestor, "primeira"));
        var linha = Assert.Single(_svc.Linhas("cr40f_appconfigversao"));
        Assert.Equal(1, linha.GetAttributeValue<int>("cr40f_numero"));
        Assert.Equal(AppConfigRepository.Publicada, linha.GetAttributeValue<OptionSetValue>("cr40f_estado").Value);
        Assert.Equal("primeira", linha.GetAttributeValue<string>("cr40f_nota"));
        Assert.Equal(Agora, linha.GetAttributeValue<DateTime>("cr40f_publicadoem"));
    }

    [Fact]
    public void Publicar_de_novo_cria_a_versao_seguinte_e_marca_a_anterior_como_substituida()
    {
        Salvar.Executar(_gestor, Rascunho1, null, false); Publicar.Executar(_gestor, null);
        Salvar.Executar(_gestor, "{\"proprio\":{\"history\":false,\"treinamentos\":false},\"terceiro\":{\"multas\":true}}", null, false);
        Assert.Equal(2, Publicar.Executar(_gestor, null));
        var linhas = _svc.Linhas("cr40f_appconfigversao");
        Assert.Equal(2, linhas.Count);
        Assert.Equal(AppConfigRepository.Substituida, linhas.Single(l => l.GetAttributeValue<int>("cr40f_numero") == 1).GetAttributeValue<OptionSetValue>("cr40f_estado").Value);
        Assert.Equal(AppConfigRepository.Publicada, linhas.Single(l => l.GetAttributeValue<int>("cr40f_numero") == 2).GetAttributeValue<OptionSetValue>("cr40f_estado").Value);
    }

    [Fact]
    public void Publicar_rascunho_igual_a_publicada_e_nada_a_publicar()
    {
        Salvar.Executar(_gestor, Rascunho1, null, false); Publicar.Executar(_gestor, null);
        Salvar.Executar(_gestor, "{\"terceiro\":{\"multas\":true},\"proprio\":{\"history\":false,\"ideas\":true}}", null, false);
        Assert.Equal("NADA_A_PUBLICAR", Codigo(() => Publicar.Executar(_gestor, null)));
        Assert.Single(_svc.Linhas("cr40f_appconfigversao").Where(l => l.GetAttributeValue<OptionSetValue>("cr40f_estado").Value == AppConfigRepository.Publicada));
    }

    // ---- Definir pessoa ----

    [Fact]
    public void Definir_excecao_exige_gestor_e_piloto_exige_admin()
    {
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Pessoa.Executar(_comum, _bia, "excecao", "multas", true, "motivo", null, false)));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Pessoa.Executar(_gestor, _bia, "piloto", null, false, null, null, false)));
        Assert.Equal("SEM_PERMISSAO", Codigo(() => Pessoa.Executar(_gestor, _bia, "piloto", null, false, null, null, true)));
    }

    [Fact]
    public void Definir_excecao_valida_chave_motivo_validade_e_funcionario()
    {
        Assert.Equal("CHAVE_INVALIDA", Codigo(() => Pessoa.Executar(_gestor, _bia, "excecao", "nao-existe", true, "m", null, false)));
        Assert.Equal("CHAVE_INVALIDA", Codigo(() => Pessoa.Executar(_gestor, _bia, "outro", "multas", true, "m", null, false)));
        Assert.Equal("CHAVE_FIXA", Codigo(() => Pessoa.Executar(_gestor, _bia, "excecao", "services", false, "m", null, false)));
        Assert.Equal("MOTIVO_OBRIGATORIO", Codigo(() => Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "  ", null, false)));
        Assert.Equal("VALIDADE_INVALIDA", Codigo(() => Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "m", "2026-11-22", false)));
        Assert.Equal("VALIDADE_INVALIDA", Codigo(() => Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "m", "amanha", false)));
        Assert.Equal("MOTORISTA_INVALIDO", Codigo(() => Pessoa.Executar(_gestor, _inativo, "excecao", "multas", true, "m", null, false)));
        Assert.Empty(_svc.Linhas("cr40f_appconfigpessoa"));
    }

    [Fact]
    public void Excecao_com_validade_de_hoje_e_aceita()
    {
        Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "teste", "2026-11-23", false);
        Assert.Single(_svc.Linhas("cr40f_appconfigpessoa"));
    }

    [Fact]
    public void Excecao_nova_na_mesma_chave_encerra_a_anterior_sem_excluir()
    {
        Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "primeira", null, false);
        var json = Pessoa.Executar(_gestor, _bia, "excecao", "multas", false, "segunda", null, false);
        Assert.Equal("{\"criadas\":1,\"encerradas\":1}", json);
        var linhas = _svc.Linhas("cr40f_appconfigpessoa");
        Assert.Equal(2, linhas.Count);
        Assert.Single(linhas, l => !l.Contains("cr40f_encerradoem"));
        Assert.Empty(_svc.Excluidos);
        Assert.Contains("\"multas\":false", Efetiva.Executar(_gestor, _bia));
    }

    [Fact]
    public void Encerrar_excecao_e_piloto_grava_encerradoem_e_e_idempotente()
    {
        Pessoa.Executar(_gestor, _bia, "excecao", "multas", true, "m", null, false);
        Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, false);
        Assert.Equal("{\"criadas\":0,\"encerradas\":1}", Pessoa.Executar(_gestor, _bia, "excecao", "multas", false, null, null, true));
        Assert.Equal("{\"criadas\":0,\"encerradas\":1}", Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, true));
        Assert.Equal("{\"criadas\":0,\"encerradas\":0}", Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, true));
        Assert.All(_svc.Linhas("cr40f_appconfigpessoa"), l => Assert.Equal(Agora, l.GetAttributeValue<DateTime>("cr40f_encerradoem")));
        Assert.Empty(_svc.Excluidos);
        Assert.Contains("\"piloto\":false", Efetiva.Executar(_gestor, _bia));
    }

    [Fact]
    public void Piloto_repetido_nao_cria_outra_linha()
    {
        Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, false);
        Assert.Equal("{\"criadas\":0,\"encerradas\":0}", Pessoa.Executar(_admin, _bia, "piloto", null, false, null, null, false));
        Assert.Single(_svc.Linhas("cr40f_appconfigpessoa"));
    }

    // ---- Conteúdo ----

    [Fact]
    public void Conteudo_escreve_em_ordem_de_catalogo_e_le_de_volta()
    {
        var m = AppConfigConteudo.Ler("{\"terceiro\":{\"multas\":true},\"proprio\":{\"ideas\":false,\"history\":true}}")!;
        Assert.Equal("{\"proprio\":{\"history\":true,\"ideas\":false},\"terceiro\":{\"multas\":true}}", AppConfigConteudo.Escrever(m));
        Assert.Null(AppConfigConteudo.Ler("  "));
    }
}
