using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Xunit;

namespace Cr40f.Prontuario.Plugin.Tests;

public sealed class FakePermissoes : IPermissoes
{
    public bool Pode { get; set; } = true;
    public bool PodeAnotar(Guid usuarioId, EntityReference funcionario) => Pode;
}

public sealed class FakeConfig : IConfiguracao
{
    public string? Url { get; set; } = "https://prod-00.brazilsouth.logic.azure.com/workflows/x/triggers/manual/paths/invoke?sig=abc";
    public string? UrlEnvio() => Url;
}

public class PrepararAnexoTests
{
    private static readonly DateTime Agora = new(2026, 11, 5, 15, 30, 12, DateTimeKind.Utc);
    private static readonly Guid Usuario = Guid.NewGuid();
    private static readonly Guid FuncId = Guid.NewGuid();
    private static readonly byte[] Bytes = Enumerable.Range(1, 32).Select(i => (byte)i).ToArray();

    private static (FakeService, PrepararAnexoHandler, FakePermissoes, FakeConfig) Montar()
    {
        var svc = new FakeService().Com(new Entity("cr40f_funcionarios", FuncId) { ["cr40f_nomecompleto"] = "Maria Souza" });
        var perm = new FakePermissoes(); var cfg = new FakeConfig();
        return (svc, new PrepararAnexoHandler(svc, perm, cfg, () => Agora, () => Bytes), perm, cfg);
    }

    [Fact]
    public void Sucesso_grava_so_o_hash_e_devolve_token_url_e_expiracao_em_10_min()
    {
        var (svc, h, _, cfg) = Montar();
        var saida = h.Executar(Usuario, FuncId.ToString());

        Assert.Equal(Token.Base64Url(Bytes), saida.Token);
        Assert.True(saida.Token.Length >= 43);
        Assert.Equal(Agora.AddMinutes(10), saida.ExpiraEm);
        Assert.Equal(cfg.Url, saida.UrlEnvio);
        var criado = Assert.Single(svc.Criados);
        Assert.Equal("cr40f_liberacaoanexo", criado.LogicalName);
        Assert.Equal(saida.LiberacaoId, criado.Id);
        Assert.Equal(Token.Sha256Hex(saida.Token), criado["cr40f_tokenhash"]);
        Assert.Equal(FuncId, ((EntityReference)criado["cr40f_funcionario"]).Id);
        Assert.Equal(Usuario, ((EntityReference)criado["cr40f_solicitante"]).Id);
        Assert.Equal("Anexo no prontuário · Maria Souza", criado["cr40f_name"]);
        // O token puro não aparece em nenhum atributo gravado.
        Assert.DoesNotContain(criado.Attributes.Values, v => v is string s && s.Contains(saida.Token));
    }

    [Fact]
    public void Sem_permissao_de_anotar_nega_sem_gravar()
    {
        var (svc, h, perm, _) = Montar();
        perm.Pode = false;
        var erro = Assert.Throws<ProntuarioException>(() => h.Executar(Usuario, FuncId.ToString()));
        Assert.Contains("não tem permissão", erro.Message);
        Assert.Empty(svc.Criados);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public void Funcionario_invalido(string? id)
    {
        var (_, h, _, _) = Montar();
        Assert.Contains("Funcionário inválido", Assert.Throws<ProntuarioException>(() => h.Executar(Usuario, id)).Message);
    }

    [Fact]
    public void Funcionario_inexistente()
    {
        var (_, h, _, _) = Montar();
        Assert.Equal("Funcionário não encontrado.", Assert.Throws<ProntuarioException>(() => h.Executar(Usuario, Guid.NewGuid().ToString())).Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("http://inseguro")]
    public void Sem_url_configurada(string? url)
    {
        var (svc, h, _, cfg) = Montar();
        cfg.Url = url;
        Assert.Contains("cr40f_URLFlowAnexarProntuario", Assert.Throws<ProntuarioException>(() => h.Executar(Usuario, FuncId.ToString())).Message);
        Assert.Empty(svc.Criados);
    }

    [Fact]
    public void Token_aleatorio_padrao_tem_32_bytes_e_muda()
    {
        Assert.Equal(32, Token.BytesAleatorios().Length);
        Assert.NotEqual(Token.Base64Url(Token.BytesAleatorios()), Token.Base64Url(Token.BytesAleatorios()));
    }
}

public class PermissoesDataverseTests
{
    private static FakeService Svc(bool criar, bool anexar, AccessRights acesso) => new()
    {
        AoExecutar = r => r switch
        {
            RetrieveUserPrivilegeByPrivilegeNameRequest p => new RetrieveUserPrivilegeByPrivilegeNameResponse { Results = { ["RolePrivileges"] = (p.PrivilegeName == "prvCreateNote" ? criar : anexar) ? new[] { new RolePrivilege(0, Guid.NewGuid()) } : Array.Empty<RolePrivilege>() } },
            RetrievePrincipalAccessRequest => new RetrievePrincipalAccessResponse { Results = { ["AccessRights"] = acesso } },
            _ => null,
        },
    };

    [Theory]
    [InlineData(true, true, AccessRights.AppendToAccess | AccessRights.ReadAccess, true)]
    [InlineData(false, true, AccessRights.AppendToAccess, false)]
    [InlineData(true, false, AccessRights.AppendToAccess, false)]
    [InlineData(true, true, AccessRights.ReadAccess, false)]
    public void Exige_criar_e_anexar_nota_e_appendto_no_funcionario(bool criar, bool anexar, AccessRights acesso, bool esperado)
    {
        Assert.Equal(esperado, new PermissoesDataverse(Svc(criar, anexar, acesso)).PodeAnotar(Guid.NewGuid(), new EntityReference("cr40f_funcionarios", Guid.NewGuid())));
    }
}

public class ConsumirAnexoTests
{
    private static readonly DateTime Criada = new(2026, 11, 5, 15, 30, 12, DateTimeKind.Utc);
    private static readonly Guid FuncId = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private static readonly Guid Usuario = Guid.NewGuid();
    private const string TokenCerto = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
    private const string UmaFoto = "[{\"nome\":\"foto.jpg\",\"mimeType\":\"image/jpeg\",\"tamanho\":2048}]";

    private static (FakeService svc, Guid libId) Base(DateTime? usadaEm = null)
    {
        var libId = Guid.NewGuid();
        var lib = new Entity("cr40f_liberacaoanexo", libId)
        {
            ["cr40f_tokenhash"] = Token.Sha256Hex(TokenCerto),
            ["cr40f_expiraem"] = Criada.AddMinutes(10),
            ["cr40f_funcionario"] = new EntityReference("cr40f_funcionarios", FuncId),
            ["cr40f_solicitante"] = new EntityReference("systemuser", Usuario),
        };
        if (usadaEm is not null) lib["cr40f_usadaem"] = usadaEm.Value;
        return (new FakeService().Com(lib, new Entity("systemuser", Usuario) { ["fullname"] = "Ana <Lima>" }), libId);
    }

    private static ConsumirAnexoHandler H(FakeService svc, DateTime agora, bool dev = false) => new(svc, dev, () => agora);

    [Fact]
    public void Sucesso_marca_usada_e_devolve_pasta_nomes_e_corpo()
    {
        var (svc, id) = Base();
        var saida = H(svc, Criada.AddMinutes(3)).Executar(id.ToString(), TokenCerto, UmaFoto, "  Documento RG ", "Linha 1\r\n\r\nLinha <2>");

        Assert.True(saida.Ok, saida.Erro);
        Assert.Equal(FuncId, saida.FuncionarioId);
        Assert.Equal("Funcionarios/11111111-2222-3333-4444-555555555555/Anotacoes", saida.Pasta);
        Assert.Equal("Ana <Lima>", saida.Solicitante);
        Assert.Equal("Documento RG", saida.Titulo);
        // 15:33:12 UTC = 12:33:12 em São Paulo.
        Assert.Equal("20261105-123312 foto.jpg", Assert.Single(saida.Arquivos).Nome);
        Assert.Equal("<p style=\"margin: 0;\">Linha 1</p><p style=\"margin: 0;\">&nbsp;</p><p style=\"margin: 0;\">Linha &lt;2&gt;</p><p style=\"margin: 0;\">Anexado por Ana &lt;Lima&gt; via Claude</p>", saida.CorpoHtml);
        var lib = svc.Linha("cr40f_liberacaoanexo", id)!;
        Assert.Equal(Criada.AddMinutes(3), lib["cr40f_usadaem"]);
        Assert.Equal(1, lib["cr40f_arquivos"]);
        var update = Assert.Single(svc.Executados.OfType<UpdateRequest>());
        Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
    }

    [Fact]
    public void No_dev_a_pasta_leva_DEV()
    {
        var (svc, id) = Base();
        Assert.Equal("Funcionarios/DEV/11111111-2222-3333-4444-555555555555/Anotacoes", H(svc, Criada, dev: true).Executar(id.ToString(), TokenCerto, UmaFoto, "", "").Pasta);
    }

    [Fact]
    public void Titulo_vazio_usa_padrao_e_corpo_so_com_autor()
    {
        var (svc, id) = Base();
        var saida = H(svc, Criada).Executar(id.ToString(), TokenCerto, UmaFoto, null, null);
        Assert.Equal(ConsumirAnexoHandler.TituloPadrao, saida.Titulo);
        Assert.Equal("<p style=\"margin: 0;\">Anexado por Ana &lt;Lima&gt; via Claude</p>", saida.CorpoHtml);
    }

    [Theory]
    [InlineData("AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyB")]
    [InlineData("")]
    [InlineData(null)]
    public void Token_errado_nega_sem_marcar(string? token)
    {
        var (svc, id) = Base();
        var saida = H(svc, Criada).Executar(id.ToString(), token, UmaFoto, "", "");
        Assert.False(saida.Ok);
        Assert.Equal("LIBERACAO", saida.Codigo);
        Assert.Contains("inválida", saida.Erro);
        Assert.False(svc.Linha("cr40f_liberacaoanexo", id)!.Contains("cr40f_usadaem"));
    }

    [Fact]
    public void Liberacao_inexistente_ou_id_invalido_tem_a_mesma_resposta_do_token_errado()
    {
        var (svc, _) = Base();
        Assert.Contains("inválida", H(svc, Criada).Executar(Guid.NewGuid().ToString(), TokenCerto, UmaFoto, "", "").Erro);
        Assert.Contains("inválida", H(svc, Criada).Executar("xyz", TokenCerto, UmaFoto, "", "").Erro);
    }

    [Fact]
    public void Expirada_nega()
    {
        var (svc, id) = Base();
        var saida = H(svc, Criada.AddMinutes(10)).Executar(id.ToString(), TokenCerto, UmaFoto, "", "");
        Assert.False(saida.Ok);
        Assert.Contains("expirada", saida.Erro);
    }

    [Fact]
    public void Ja_usada_nega()
    {
        var (svc, id) = Base(usadaEm: Criada.AddMinutes(1));
        var saida = H(svc, Criada.AddMinutes(2)).Executar(id.ToString(), TokenCerto, UmaFoto, "", "");
        Assert.False(saida.Ok);
        Assert.Contains("já foi usada", saida.Erro);
    }

    [Fact]
    public void Segunda_chamada_com_o_mesmo_token_nega()
    {
        var (svc, id) = Base();
        Assert.True(H(svc, Criada).Executar(id.ToString(), TokenCerto, UmaFoto, "", "").Ok);
        Assert.Contains("já foi usada", H(svc, Criada).Executar(id.ToString(), TokenCerto, UmaFoto, "", "").Erro);
    }

    [Fact]
    public void Corrida_entre_leitura_e_marcacao_nega_pela_rowversion()
    {
        var (svc, id) = Base();
        // Outra chamada marca a liberação entre a leitura e a atualização desta.
        var primeira = true;
        svc.AoExecutar = null;
        var original = svc.Linha("cr40f_liberacaoanexo", id)!;
        var handler = new ConsumirAnexoHandler(new InterceptaUpdate(svc, () =>
        {
            if (!primeira) return; primeira = false;
            svc.Execute(new UpdateRequest { Target = new Entity("cr40f_liberacaoanexo", id) { ["cr40f_usadaem"] = Criada } });
        }), false, () => Criada);
        var saida = handler.Executar(id.ToString(), TokenCerto, UmaFoto, "", "");
        Assert.False(saida.Ok);
        Assert.Contains("já foi usada", saida.Erro);
        Assert.Equal(Criada, original["cr40f_usadaem"]);
    }

    [Theory]
    [InlineData("[{\"nome\":\"a.exe\",\"mimeType\":\"application/x-msdownload\",\"tamanho\":10}]", "só fotos")]
    [InlineData("[{\"nome\":\"a.exe\",\"mimeType\":\"application/pdf\",\"tamanho\":10}]", "extensão não combina")]
    [InlineData("[{\"nome\":\"a.pdf\",\"mimeType\":\"application/pdf\",\"tamanho\":10485761}]", "maior que 10 MB")]
    [InlineData("[{\"nome\":\"a.pdf\",\"mimeType\":\"application/pdf\",\"tamanho\":0}]", "vazio")]
    [InlineData("[]", "Nenhum arquivo")]
    [InlineData("", "Nenhum arquivo")]
    [InlineData("{oops", "inválida")]
    public void Arquivo_invalido_nega_sem_consumir(string json, string trecho)
    {
        var (svc, id) = Base();
        var saida = H(svc, Criada).Executar(id.ToString(), TokenCerto, json, "", "");
        Assert.False(saida.Ok);
        Assert.Equal("ARQUIVOS", saida.Codigo);
        Assert.Contains(trecho, saida.Erro);
        Assert.False(svc.Linha("cr40f_liberacaoanexo", id)!.Contains("cr40f_usadaem"));
    }

    [Fact]
    public void Mais_de_10_arquivos_ou_total_acima_de_50_MB_nega()
    {
        string Lista(int n, long tamanho) => "[" + string.Join(",", Enumerable.Range(1, n).Select(i => $"{{\"nome\":\"f{i}.png\",\"mimeType\":\"image/png\",\"tamanho\":{tamanho}}}")) + "]";
        Assert.Contains("No máximo 10", ConsumirAnexoHandler.ValidarArquivos(Lista(11, 1), Criada, out _));
        Assert.Contains("50 MB", ConsumirAnexoHandler.ValidarArquivos(Lista(6, 10L * 1024 * 1024), Criada, out _));
        Assert.Null(ConsumirAnexoHandler.ValidarArquivos(Lista(5, 10L * 1024 * 1024), Criada, out var ok));
        Assert.Equal(5, ok.Count);
    }

    [Fact]
    public void Tipos_aceitos_e_nomes_sanitizados_e_unicos()
    {
        var json = "[{\"nome\":\"a.JPEG\",\"mimeType\":\"IMAGE/JPEG\",\"tamanho\":1},{\"nome\":\"x.heic\",\"mimeType\":\"image/heic\",\"tamanho\":1},{\"nome\":\"y.heif\",\"mimeType\":\"image/heif\",\"tamanho\":1},{\"nome\":\"../ma:u.pdf\",\"mimeType\":\"application/pdf\",\"tamanho\":1},{\"nome\":\"_ma_u.pdf\",\"mimeType\":\"application/pdf\",\"tamanho\":1}]";
        Assert.Null(ConsumirAnexoHandler.ValidarArquivos(json, Criada, out var finais));
        Assert.Equal(new[] { "20261105-123012 a.JPEG", "20261105-123012 x.heic", "20261105-123012 y.heif", "20261105-123012 _ma_u.pdf", "20261105-123012 _ma_u (2).pdf" }, finais.Select(f => f.Nome));
        Assert.Equal("image/jpeg", finais[0].MimeType);
    }

    [Fact]
    public void Arquivos_json_ida_e_volta()
    {
        var lista = ConsumirAnexoHandler.Ler(UmaFoto)!;
        Assert.Equal("[{\"nome\":\"foto.jpg\",\"mimeType\":\"image\\/jpeg\",\"tamanho\":2048}]", ConsumirAnexoHandler.Escrever(lista));
    }

    /// <summary>Roda uma ação antes de repassar o UpdateRequest (simula outra chamada no meio).</summary>
    private sealed class InterceptaUpdate : IOrganizationService
    {
        private readonly FakeService _s; private readonly Action _antes;
        public InterceptaUpdate(FakeService s, Action antes) { _s = s; _antes = antes; }
        public OrganizationResponse Execute(OrganizationRequest request) { if (request is UpdateRequest) _antes(); return _s.Execute(request); }
        public Guid Create(Entity entity) => _s.Create(entity);
        public Entity Retrieve(string entityName, Guid id, Microsoft.Xrm.Sdk.Query.ColumnSet columnSet) => _s.Retrieve(entityName, id, columnSet);
        public void Update(Entity entity) => _s.Update(entity);
        public void Delete(string entityName, Guid id) => _s.Delete(entityName, id);
        public EntityCollection RetrieveMultiple(Microsoft.Xrm.Sdk.Query.QueryBase query) => _s.RetrieveMultiple(query);
        public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    }
}

public class FormatoTests
{
    [Fact]
    public void Sanitiza_como_a_tela()
    {
        Assert.Equal("a_b_c.pdf", Formato.SanitizarNome("a/b:c.pdf"));
        Assert.Equal("pdf", Formato.SanitizarNome(".pdf"));
        Assert.Equal("arquivo", Formato.SanitizarNome(""));
        Assert.Equal("x.y", Formato.SanitizarNome("x..y"));
        Assert.Equal(new string('a', 120) + ".pdf", Formato.SanitizarNome(new string('a', 200) + ".pdf"));
    }

    [Fact]
    public void Comparacao_em_tempo_constante()
    {
        Assert.True(Token.IguaisTempoConstante("abc", "abc"));
        Assert.False(Token.IguaisTempoConstante("abc", "abd"));
        Assert.False(Token.IguaisTempoConstante("abc", "abcd"));
        Assert.False(Token.IguaisTempoConstante("", "a"));
    }

    [Fact]
    public void Hash_conhecido()
    {
        Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Token.Sha256Hex("abc"));
    }
}
