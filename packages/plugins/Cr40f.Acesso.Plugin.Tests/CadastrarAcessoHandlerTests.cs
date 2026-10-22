using System;
using System.Collections.Generic;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class CadastrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://app\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakeService _svc = new();
    private readonly List<string> _trace = new();

    private CadastrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), Cfg, new Random(1), _trace.Add);
    private static CadastroEntrada Entrada() => new() { NomeCompleto = "João da Silva Ávila", Celular = "(12) 99123-4567" };

    [Fact]
    public void Caminho_feliz_cria_usuario_licenca_grupo_e_funcionario()
    {
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila@betinhos.com.br", saida.EmailMicrosoft);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        Assert.Equal("https://app", saida.LinkApp);
        Assert.Contains("sku", _graph.Usuarios[saida.EmailMicrosoft].SkuIds);
        Assert.Contains(("g", "id-joao.avila@betinhos.com.br"), _graph.Membros);
        Assert.Single(_svc.Criados);
        Assert.Equal("+5512991234567", _svc.Criados[0]["cr40f_telefonecorporativo"]);
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"feita\"", saida.Etapas.ToJson());
        Assert.DoesNotContain(saida.SenhaTemporaria, string.Join("\n", _trace));
    }

    [Fact]
    public void Reexecucao_pula_o_que_ja_existe_e_nao_reseta_senha()
    {
        var primeira = Handler().Executar(Entrada());
        _graph.Chamadas.Clear();
        var segunda = Handler().Executar(Entrada());
        Assert.Equal(primeira.EmailMicrosoft, segunda.EmailMicrosoft);
        Assert.Equal("", segunda.SenhaTemporaria);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas);
        Assert.DoesNotContain("AdicionarAoGrupo", _graph.Chamadas);
        Assert.Single(_svc.Criados);
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"pulada\"", segunda.Etapas.ToJson());
    }

    [Fact]
    public void Sufixo_quando_upn_ja_existe_para_outra_pessoa()
    {
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.com.br", Ativo = true };
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "João Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.com.br", ["cr40f_status"] = new OptionSetValue(0) });
        Assert.Equal("joao.avila2@betinhos.com.br", Handler().Executar(Entrada()).EmailMicrosoft);
    }

    [Fact]
    public void FuncionarioId_vincula_email_em_vez_de_criar()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal(id, saida.FuncionarioId);
        Assert.Empty(_svc.Criados);
        Assert.Equal("joao.avila@betinhos.com.br", _svc.Atualizados[0]["cr40f_emailmicrosoft"]);
    }

    [Fact]
    public void Sem_licenca_livre_falha_antes_de_criar()
    {
        _graph.Livres = 0;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        Assert.Equal("SEM_LICENCA_DISPONIVEL", erro.Codigo);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
    }

    [Theory]
    [InlineData("João", "NOME_INVALIDO")]
    [InlineData("João Silva|1234", "CELULAR_INVALIDO")]
    public void Validacao(string entrada, string codigo)
    {
        var partes = entrada.Split('|');
        var e = new CadastroEntrada { NomeCompleto = partes[0], Celular = partes.Length > 1 ? partes[1] : "12991234567" };
        Assert.Equal(codigo, Assert.Throws<AcessoException>(() => Handler().Executar(e)).Codigo);
    }

    [Fact]
    public void Falha_na_licenca_relanca_com_etapas_feitas()
    {
        _graph.FalharEm = "AtribuirLicenca";
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        var etapas = (string)erro.Data["Etapas"]!;
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"licenca\",\"estado\":\"erro\"", etapas);
    }

    [Fact]
    public void PrefixoEmail_informado_vence_o_gerado()
    {
        var e = Entrada(); e.PrefixoEmail = "Joãozinho Ávila";
        Assert.Equal("joaozinho.avila@betinhos.com.br", Handler().Executar(e).EmailMicrosoft);
    }

    [Fact]
    public void Reexecucao_apos_falha_na_licenca_reaproveita_o_email_sem_sufixo()
    {
        _graph.FalharEm = "AtribuirLicenca";
        Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        _graph.FalharEm = null;
        _graph.Chamadas.Clear();
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila@betinhos.com.br", saida.EmailMicrosoft);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.Contains("sku", _graph.Usuarios[saida.EmailMicrosoft].SkuIds);
        Assert.Single(_svc.Criados);
    }

    [Fact]
    public void Sufixo_quando_usuario_entra_sem_funcionario_tem_outro_nome()
    {
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.com.br", DisplayName = "João Pedro Ávila", Ativo = true };
        Assert.Equal("joao.avila2@betinhos.com.br", Handler().Executar(Entrada()).EmailMicrosoft);
    }

    [Fact]
    public void FuncionarioId_nao_reaproveita_email_de_homonimo()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "joao  da silva avila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.com.br", ["cr40f_status"] = new OptionSetValue(0) });
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal("joao.avila2@betinhos.com.br", saida.EmailMicrosoft);
        Assert.Equal(id, saida.FuncionarioId);
    }

    [Fact]
    public void FuncionarioId_nao_vincula_usuario_entra_orfao_de_mesmo_nome()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "orfao", Upn = "joao.avila@betinhos.com.br", DisplayName = "João da Silva Ávila", Ativo = true };
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal("joao.avila2@betinhos.com.br", saida.EmailMicrosoft);
        Assert.Equal("id-joao.avila2@betinhos.com.br", saida.UsuarioEntraId);
        Assert.Contains("CriarUsuario", _graph.Chamadas);
        Assert.Empty(_graph.Usuarios["joao.avila@betinhos.com.br"].SkuIds);
    }

    [Fact]
    public void Sem_FuncionarioId_upn_desativado_conta_como_ocupado_mesmo_homonimo_exato()
    {
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.com.br", DisplayName = "João da Silva Ávila", Ativo = false };
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila2@betinhos.com.br", saida.EmailMicrosoft);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas);
        Assert.False(_graph.Usuarios["joao.avila@betinhos.com.br"].Ativo);
    }

    [Fact]
    public void Sem_FuncionarioId_dono_homonimo_com_conta_desativada_gera_sufixo()
    {
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.com.br", ["cr40f_status"] = new OptionSetValue(1) });
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.com.br", DisplayName = "João da Silva Ávila", Ativo = false };
        Assert.Equal("joao.avila2@betinhos.com.br", Handler().Executar(Entrada()).EmailMicrosoft);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas);
    }

    [Fact]
    public void FuncionarioId_com_email_de_conta_desativada_lanca_ACESSO_ENCERRADO_sem_escrever()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.com.br", ["cr40f_status"] = new OptionSetValue(1) });
        _graph.Usuarios["joao.avila@betinhos.com.br"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.com.br", DisplayName = "João da Silva Ávila", Ativo = false };
        var e = Entrada(); e.FuncionarioId = id;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(e));
        Assert.Equal("ACESSO_ENCERRADO", erro.Codigo);
        Assert.Contains("Peça à TI para reativar a conta no Entra.", erro.Message);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas); Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas); Assert.DoesNotContain("AdicionarAoGrupo", _graph.Chamadas);
        Assert.Empty(_svc.Atualizados); Assert.Empty(_svc.Criados);
    }

    [Fact]
    public void Sku_com_caixa_diferente_conta_como_ja_atribuida()
    {
        var u = new GraphUsuario { Id = "u1", Upn = "joao.avila@betinhos.com.br", DisplayName = "João da Silva Ávila", Ativo = true }; u.SkuIds.Add("SKU");
        _graph.Usuarios[u.Upn] = u;
        Handler().Executar(Entrada());
        Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas);
    }

    [Theory]
    [InlineData("joao@gmail.com", "joao@gmail.com")]
    [InlineData("  joao@gmail.com ", "joao@gmail.com")]
    [InlineData("joao-gmail.com", null)]
    [InlineData("joao@gmail", null)]
    [InlineData("jo ao@gmail.com", null)]
    [InlineData(null, null)]
    public void EmailPessoal_valido_vai_para_otherMails(string? informado, string? esperado)
    {
        var e = Entrada(); e.EmailPessoal = informado;
        Handler().Executar(e);
        Assert.Equal(esperado, _graph.UltimoEmailPessoal);
    }
}
