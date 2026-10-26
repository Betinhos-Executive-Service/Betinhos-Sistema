using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Acesso.Plugin.Tests;

public sealed class CadastrarAcessoHandlerTests
{
    private static readonly AcessoConfig Cfg = AcessoConfig.Parse("{\"tenantId\":\"t\",\"clientId\":\"c\",\"licenseSkuId\":\"sku\",\"groupId\":\"g\",\"appUrl\":\"https://app\",\"environmentId\":\"env\"}", "{\"clientSecret\":\"s\"}");
    private readonly FakeGraphGateway _graph = new();
    private readonly FakePowerPlatformGateway _pp;
    private readonly FakeService _svc = new();
    private readonly List<string> _trace = new();

    private static readonly Guid RaizId = Guid.NewGuid();
    public CadastrarAcessoHandlerTests() { _svc.Com(new Entity("businessunit", RaizId) { ["name"] = "betinhos" }); _pp = new FakePowerPlatformGateway(_svc); }

    private CadastrarAcessoHandler Handler() => new(_graph, new FuncionarioRepository(_svc), new UsuarioDataverseRepository(_svc, _ => { }), _pp, Cfg, new Random(1), _trace.Add);
    private List<Entity> Funcionarios => _svc.Criados.Where(e => e.LogicalName == "cr40f_funcionarios").ToList();
    private List<Entity> SystemUsers => _svc.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("systemuser")).Entities.ToList();
    private static CadastroEntrada Entrada() => new() { NomeCompleto = "João da Silva Ávila", Celular = "(12) 99123-4567" };

    [Fact]
    public void Caminho_feliz_cria_usuario_licenca_grupo_e_funcionario()
    {
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila@betinhos.onmicrosoft.com", saida.EmailMicrosoft);
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        Assert.Equal("https://app", saida.LinkApp);
        Assert.Contains("sku", _graph.Usuarios[saida.EmailMicrosoft].SkuIds);
        Assert.Contains(("g", FakeGraphGateway.IdDe("joao.avila@betinhos.onmicrosoft.com")), _graph.Membros);
        Assert.Single(Funcionarios);
        Assert.Equal("+5512991234567", Funcionarios[0]["cr40f_telefonecorporativo"]);
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
        Assert.Single(Funcionarios);
        Assert.Contains("\"etapa\":\"usuario\",\"estado\":\"pulada\"", segunda.Etapas.ToJson());
    }

    [Fact]
    public void Sufixo_quando_upn_ja_existe_para_outra_pessoa()
    {
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.onmicrosoft.com", Ativo = true };
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "João Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.onmicrosoft.com", ["cr40f_status"] = new OptionSetValue(0) });
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", Handler().Executar(Entrada()).EmailMicrosoft);
    }

    [Fact]
    public void FuncionarioId_vincula_email_em_vez_de_criar()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal(id, saida.FuncionarioId);
        Assert.Empty(Funcionarios);
        Assert.Equal("joao.avila@betinhos.onmicrosoft.com", _svc.Atualizados[0]["cr40f_emailmicrosoft"]);
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
        Assert.Equal("joaozinho.avila@betinhos.onmicrosoft.com", Handler().Executar(e).EmailMicrosoft);
    }

    [Fact]
    public void PrefixoEmail_da_tela_com_ponto_mantem_o_ponto()
    {
        var e = Entrada(); e.PrefixoEmail = "joao.avila";
        Assert.Equal("joao.avila@betinhos.onmicrosoft.com", Handler().Executar(e).EmailMicrosoft);
    }

    [Fact]
    public void Reexecucao_apos_falha_na_licenca_reaproveita_o_email_sem_sufixo()
    {
        _graph.FalharEm = "AtribuirLicenca";
        Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        _graph.FalharEm = null;
        _graph.Chamadas.Clear();
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila@betinhos.onmicrosoft.com", saida.EmailMicrosoft);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.Contains("sku", _graph.Usuarios[saida.EmailMicrosoft].SkuIds);
        Assert.Single(Funcionarios);
    }

    [Fact]
    public void Sufixo_quando_usuario_entra_sem_funcionario_tem_outro_nome()
    {
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João Pedro Ávila", Ativo = true };
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", Handler().Executar(Entrada()).EmailMicrosoft);
    }

    [Fact]
    public void FuncionarioId_nao_reaproveita_email_de_homonimo()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "joao  da silva avila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.onmicrosoft.com", ["cr40f_status"] = new OptionSetValue(0) });
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", saida.EmailMicrosoft);
        Assert.Equal(id, saida.FuncionarioId);
    }

    [Fact]
    public void FuncionarioId_nao_vincula_usuario_entra_orfao_de_mesmo_nome()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_status"] = new OptionSetValue(0) });
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "orfao", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João da Silva Ávila", Ativo = true };
        var e = Entrada(); e.FuncionarioId = id;
        var saida = Handler().Executar(e);
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", saida.EmailMicrosoft);
        Assert.Equal(FakeGraphGateway.IdDe("joao.avila2@betinhos.onmicrosoft.com"), saida.UsuarioEntraId);
        Assert.Contains("CriarUsuario", _graph.Chamadas);
        Assert.Empty(_graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"].SkuIds);
    }

    [Fact]
    public void Sem_FuncionarioId_upn_desativado_conta_como_ocupado_mesmo_homonimo_exato()
    {
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João da Silva Ávila", Ativo = false };
        var saida = Handler().Executar(Entrada());
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", saida.EmailMicrosoft);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas);
        Assert.False(_graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"].Ativo);
    }

    [Fact]
    public void Sem_FuncionarioId_dono_homonimo_com_conta_desativada_gera_sufixo()
    {
        _svc.Com(new Entity("cr40f_funcionarios", Guid.NewGuid()) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.onmicrosoft.com", ["cr40f_status"] = new OptionSetValue(1) });
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João da Silva Ávila", Ativo = false };
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", Handler().Executar(Entrada()).EmailMicrosoft);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas);
    }

    [Fact]
    public void FuncionarioId_com_email_de_conta_desativada_lanca_ACESSO_ENCERRADO_sem_escrever()
    {
        var id = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", id) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_emailmicrosoft"] = "joao.avila@betinhos.onmicrosoft.com", ["cr40f_status"] = new OptionSetValue(1) });
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "velho", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João da Silva Ávila", Ativo = false };
        var e = Entrada(); e.FuncionarioId = id;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(e));
        Assert.Equal("ACESSO_ENCERRADO", erro.Codigo);
        Assert.Contains("Use \"Reativar acesso\" na ficha", erro.Message);
        Assert.DoesNotContain("DefinirAtivo", _graph.Chamadas); Assert.DoesNotContain("AtribuirLicenca", _graph.Chamadas); Assert.DoesNotContain("AdicionarAoGrupo", _graph.Chamadas);
        Assert.Empty(_svc.Atualizados); Assert.Empty(Funcionarios);
    }

    [Fact]
    public void Sku_com_caixa_diferente_conta_como_ja_atribuida()
    {
        var u = new GraphUsuario { Id = Guid.NewGuid().ToString(), Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João da Silva Ávila", Ativo = true }; u.SkuIds.Add("SKU");
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

    [Fact]
    public void Caminho_feliz_segue_a_ordem_das_etapas()
    {
        var json = Handler().Executar(Entrada()).Etapas.ToJson();
        var ordem = new[] { "validacao", "email", "usuario", "licenca", "grupo", "systemuser", "funcionario" }.Select(e => json.IndexOf("\"etapa\":\"" + e + "\"", StringComparison.Ordinal)).ToList();
        Assert.DoesNotContain(-1, ordem);
        Assert.Equal(ordem.OrderBy(i => i), ordem);
    }

    private static Guid ObjectIdDe(string upn) => Guid.Parse(FakeGraphGateway.IdDe(upn));
    private const string Upn = "joao.avila@betinhos.onmicrosoft.com";

    [Fact]
    public void Systemuser_ausente_e_sincronizado_pelo_Power_Platform()
    {
        var saida = Handler().Executar(Entrada());
        Assert.Equal(Guid.Parse(saida.UsuarioEntraId), Assert.Single(_pp.Sincronizados));
        Assert.Equal(ObjectIdDe(Upn), Assert.Single(SystemUsers)["azureactivedirectoryobjectid"]);
        Assert.DoesNotContain(_svc.Criados, e => e.LogicalName == "systemuser");
        Assert.Contains("\"etapa\":\"systemuser\",\"estado\":\"feita\",\"detalhe\":\"sincronizado pelo Power Platform\"", saida.Etapas.ToJson());
        Assert.Single(Funcionarios);
    }

    [Fact]
    public void Systemuser_existente_habilitado_e_licenciado_e_pulado_sem_addUser()
    {
        _svc.Com(new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = ObjectIdDe(Upn), ["isdisabled"] = false, ["islicensed"] = true });
        var saida = Handler().Executar(Entrada());
        Assert.Empty(_pp.Sincronizados);
        Assert.Contains("\"etapa\":\"systemuser\",\"estado\":\"pulada\"", saida.Etapas.ToJson());
        Assert.Single(Funcionarios);
    }

    [Theory]
    [InlineData(true, true)]    // desabilitado
    [InlineData(false, false)]  // sem licença
    public void Systemuser_desabilitado_ou_sem_licenca_com_Entra_ativo_e_ressincronizado(bool desabilitado, bool licenciado)
    {
        _svc.Com(new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = ObjectIdDe(Upn), ["isdisabled"] = desabilitado, ["islicensed"] = licenciado });
        var saida = Handler().Executar(Entrada());
        Assert.Equal(ObjectIdDe(Upn), Assert.Single(_pp.Sincronizados));
        Assert.Contains("\"etapa\":\"systemuser\",\"estado\":\"feita\"", saida.Etapas.ToJson());
    }

    [Fact]
    public void Systemuser_ainda_ausente_apos_addUser_fica_pendente_e_cria_funcionario_sem_email()
    {
        _pp.CriarSystemuser = false;
        var saida = Handler().Executar(Entrada());
        Assert.Equal(14, saida.SenhaTemporaria.Length);
        var etapas = saida.Etapas.ToJson();
        Assert.Contains("\"etapa\":\"grupo\",\"estado\":\"feita\"", etapas);
        Assert.Contains("\"etapa\":\"systemuser\",\"estado\":\"pendente\",\"detalhe\":\"o Dataverse libera em instantes\"", etapas);
        Assert.Contains("\"etapa\":\"funcionario\",\"estado\":\"pendente\"", etapas);
        Assert.Single(Funcionarios);
        Assert.False(Funcionarios[0].Contains("cr40f_emailmicrosoft"));   // DriverRecordSharing: e-mail só com systemuser pronto
        Assert.Equal(saida.FuncionarioId, Funcionarios[0].Id);
        Assert.Equal(1 + UsuarioDataverseRepository.Tentativas, _svc.Consultas.Count(c => c.EntityName == "systemuser"));
        Assert.Contains(_trace, t => t.StartsWith("etapa systemuser: ") && t.EndsWith(" ms"));
    }

    [Fact]
    public void Concluir_liberacao_com_funcionarioId_reaproveita_conta_e_grava_email()
    {
        _pp.CriarSystemuser = false;
        var primeira = Handler().Executar(Entrada());
        _pp.CriarSystemuser = true;
        _graph.Chamadas.Clear();
        var entrada = Entrada(); entrada.FuncionarioId = primeira.FuncionarioId; entrada.PrefixoEmail = "joao.avila";
        var segunda = Handler().Executar(entrada);
        Assert.Equal(primeira.EmailMicrosoft, segunda.EmailMicrosoft);
        Assert.Equal("", segunda.SenhaTemporaria);   // senha da primeira execução continua valendo
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.Single(Funcionarios);
        Assert.Equal(primeira.EmailMicrosoft, _svc.Atualizados.Last()["cr40f_emailmicrosoft"]);
        Assert.Contains("\"etapa\":\"funcionario\",\"estado\":\"feita\",\"detalhe\":\"e-mail vinculado\"", segunda.Etapas.ToJson());
    }

    [Fact]
    public void Pendente_em_ficha_sem_celular_grava_so_o_celular()
    {
        _pp.CriarSystemuser = false;
        var fid = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", fid) { ["cr40f_nomecompleto"] = "João da Silva Ávila" });
        var entrada = Entrada(); entrada.FuncionarioId = fid;
        Handler().Executar(entrada);
        var atualizado = Assert.Single(_svc.Atualizados);
        Assert.Equal("+5512991234567", atualizado["cr40f_telefonecorporativo"]);
        Assert.False(atualizado.Contains("cr40f_emailmicrosoft"));   // e-mail só com o systemuser pronto
    }

    [Fact]
    public void Reexecucao_sem_funcionarioId_conclui_no_mesmo_funcionario()
    {
        _pp.CriarSystemuser = false;
        Handler().Executar(Entrada());
        _pp.CriarSystemuser = true;
        _graph.Chamadas.Clear();
        Handler().Executar(Entrada());
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.Single(SystemUsers);
        Assert.Single(Funcionarios);
        Assert.Equal("joao.avila@betinhos.onmicrosoft.com", Funcionarios[0]["cr40f_emailmicrosoft"]);
    }

    [Fact]
    public void Sem_funcionarioId_homonimo_desligado_sem_email_nao_e_reaproveitado()
    {
        var antigo = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", antigo) { ["cr40f_nomecompleto"] = "João da Silva Ávila", ["cr40f_funcao"] = new OptionSetValue(FuncionarioRepository.FuncaoMotorista), ["cr40f_status"] = new OptionSetValue(1) });
        var saida = Handler().Executar(Entrada());
        Assert.NotEqual(antigo, saida.FuncionarioId);
        Assert.Equal(saida.FuncionarioId, Assert.Single(Funcionarios).Id);   // criou um novo; o antigo não foi tocado
        Assert.Empty(_svc.Atualizados);
    }

    [Fact]
    public void Reexecucao_com_mesmo_nome_e_prefixo_personalizado_reusa_a_mesma_conta()
    {
        _pp.CriarSystemuser = false;
        var e1 = Entrada(); e1.PrefixoEmail = "jsilva";
        var primeira = Handler().Executar(e1);
        _pp.CriarSystemuser = true;
        _graph.Chamadas.Clear();
        var e2 = Entrada(); e2.PrefixoEmail = "jsilva";
        var segunda = Handler().Executar(e2);
        Assert.Equal("jsilva@betinhos.onmicrosoft.com", segunda.EmailMicrosoft);
        Assert.Equal(primeira.EmailMicrosoft, segunda.EmailMicrosoft);
        Assert.DoesNotContain("CriarUsuario", _graph.Chamadas);
        Assert.Single(_graph.Usuarios);
        Assert.Single(Funcionarios);
        Assert.Equal("jsilva@betinhos.onmicrosoft.com", Funcionarios[0]["cr40f_emailmicrosoft"]);
    }

    [Fact]
    public void Com_funcionarioId_conta_de_outro_nome_continua_ocupada()
    {
        _graph.Usuarios["joao.avila@betinhos.onmicrosoft.com"] = new GraphUsuario { Id = "outro", Upn = "joao.avila@betinhos.onmicrosoft.com", DisplayName = "João Ávila Outro", Ativo = true };
        var fid = Guid.NewGuid();
        _svc.Com(new Entity("cr40f_funcionarios", fid) { ["cr40f_nomecompleto"] = "João da Silva Ávila" });
        var entrada = Entrada(); entrada.FuncionarioId = fid;
        Assert.Equal("joao.avila2@betinhos.onmicrosoft.com", Handler().Executar(entrada).EmailMicrosoft);
    }

    [Fact]
    public void Falha_do_addUser_para_antes_do_funcionario()
    {
        _pp.Falhar = true;
        var erro = Assert.Throws<AcessoException>(() => Handler().Executar(Entrada()));
        Assert.Equal("GRAPH_INDISPONIVEL", erro.Codigo);
        Assert.Contains("\"etapa\":\"systemuser\",\"estado\":\"erro\"", (string)erro.Data["Etapas"]!);
        Assert.Empty(Funcionarios);
    }
}
