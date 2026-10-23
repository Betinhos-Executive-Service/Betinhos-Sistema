using System;
using System.Linq;

namespace Cr40f.Acesso.Plugin;

public sealed class CadastroEntrada { public string NomeCompleto = ""; public string Celular = ""; public string? EmailPessoal; public string? PrefixoEmail; public int TipoVinculo = 1; public Guid? FuncionarioId; }
public sealed class CadastroSaida { public string EmailMicrosoft = ""; public string SenhaTemporaria = ""; public Guid FuncionarioId; public string UsuarioEntraId = ""; public string LinkApp = ""; public Etapas Etapas = new(); }

/// <summary>Cadastro idempotente: cada etapa confere o estado antes de agir. Falha relança com as etapas em Data["Etapas"].</summary>
public sealed class CadastrarAcessoHandler
{
    internal const string MsgEncerrado = "Acesso encerrado antes. Use \"Reativar acesso\" na ficha do funcionário.";
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly UsuarioDataverseRepository _usuarios; private readonly IPowerPlatformGateway _pp; private readonly AcessoConfig _cfg; private readonly Random _rng; private readonly Action<string> _trace;
    public CadastrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, UsuarioDataverseRepository usuarios, IPowerPlatformGateway pp, AcessoConfig cfg, Random rng, Action<string> trace)
    { _graph = graph; _repo = repo; _usuarios = usuarios; _pp = pp; _cfg = cfg; _rng = rng; _trace = trace; }

    public CadastroSaida Executar(CadastroEntrada entrada)
    {
        var saida = new CadastroSaida { LinkApp = _cfg.AppUrl };
        var etapas = saida.Etapas;
        etapas.Trace = _trace;
        try
        {
            if (!AcessoRules.NomeValido(entrada.NomeCompleto)) throw new AcessoException("NOME_INVALIDO", "Informe nome e sobrenome.");
            var celular = AcessoRules.NormalizarCelular(entrada.Celular) ?? throw new AcessoException("CELULAR_INVALIDO", "Informe um celular brasileiro com DDD (11 dígitos).");
            etapas.Feita("validacao", "ok");

            var (existente, email, dono) = etapas.Executar("email", () =>
            {
                // Sem FuncionarioId, reaproveita o funcionário criado sem e-mail numa execução que ficou com a liberação pendente.
                var ex = entrada.FuncionarioId is Guid fid ? _repo.PorId(fid) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.") : _repo.SemEmailPorNome(entrada.NomeCompleto);
                string em;
                if (ex?.EmailMicrosoft is { Length: > 0 } ja)
                {
                    em = ja.ToLowerInvariant();
                    // R10: conta desativada nunca é reativada pelo cadastro; o caminho é "Reativar acesso".
                    if (_graph.UsuarioPorUpn(em) is { Ativo: false }) throw new AcessoException("ACESSO_ENCERRADO", CadastrarAcessoHandler.MsgEncerrado);
                    etapas.Pulada("email", "funcionário já tinha e-mail Microsoft");
                }
                else
                {
                    var prefixo = string.IsNullOrWhiteSpace(entrada.PrefixoEmail) ? AcessoRules.PrefixoEmail(entrada.NomeCompleto) : AcessoRules.PrefixoInformado(entrada.PrefixoEmail);
                    if (prefixo.Length == 0) throw new AcessoException("NOME_INVALIDO", "Não foi possível gerar o e-mail a partir do nome.");
                    // Com FuncionarioId a regra é estrita: conta existente é de outra pessoa, salvo a sobra de uma execução
                    // com liberação pendente (ativa, mesmo nome, já com licença e no grupo). Órfã sem licença não é vinculada.
                    Func<string, bool> ocupado = ex is null
                        ? upn => EmUsoPorOutraPessoa(upn, entrada.NomeCompleto)
                        : upn => _repo.PorEmail(upn) is { } d && d.Id != ex.Id
                            || _graph.UsuarioPorUpn(upn) is { } u && !SobraDeLiberacaoPendente(u, ex.Nome);
                    em = AcessoRules.EmailComSufixo(prefixo, _cfg.Dominio, ocupado);
                    etapas.Feita("email", em);
                }
                var dn = _repo.PorEmail(em);
                if (dn is not null && ex is not null && dn.Id != ex.Id)
                    throw new AcessoException("EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO", "O e-mail " + em + " já pertence a " + dn.Nome + ".");
                return (ex, em, dn);
            });
            saida.EmailMicrosoft = email;

            var usuario = etapas.Executar("usuario", () =>
            {
                var u = _graph.UsuarioPorUpn(email);
                if (u is not null)
                {
                    if (!u.Ativo) throw new AcessoException("ACESSO_ENCERRADO", CadastrarAcessoHandler.MsgEncerrado);
                    etapas.Pulada("usuario", "já existia; senha não alterada"); return u;
                }
                if (_graph.LicencasLivres(_cfg.LicenseSkuId) <= 0) throw new AcessoException("SEM_LICENCA_DISPONIVEL", "Não há licença livre no plano configurado.");
                saida.SenhaTemporaria = AcessoRules.GerarSenha(_rng);
                u = _graph.CriarUsuario(email, entrada.NomeCompleto.Trim(), saida.SenhaTemporaria, celular, EmailValido(entrada.EmailPessoal));
                etapas.Feita("usuario", "criado"); return u;
            });
            saida.UsuarioEntraId = usuario.Id;

            etapas.Executar("licenca", () =>
            {
                if (AcessoRules.TemLicenca(usuario, _cfg.LicenseSkuId)) { etapas.Pulada("licenca", "já atribuída"); return; }
                _graph.AtribuirLicenca(usuario.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "atribuída");
            });

            etapas.Executar("grupo", () =>
            {
                if (_graph.EhMembro(_cfg.GroupId, usuario.Id)) { etapas.Pulada("grupo", "já era membro"); return; }
                _graph.AdicionarAoGrupo(_cfg.GroupId, usuario.Id); etapas.Feita("grupo", "adicionado");
            });

            // Antes do funcionário: gravar cr40f_emailmicrosoft dispara o DriverRecordSharing, que exige o systemuser.
            // A conta do Entra já está ativa aqui (desativada parou em "usuario" com ACESSO_ENCERRADO).
            // Pendente: o funcionário fica sem o e-mail (nada mais é gravado nele); nova execução conclui o vínculo.
            var liberado = GarantirSystemuser(etapas, _usuarios, _pp, usuario.Id);

            saida.FuncionarioId = etapas.Executar("funcionario", () =>
            {
                if (dono is not null) { etapas.Pulada("funcionario", "já cadastrado"); return dono.Id; }
                if (!liberado)
                {
                    if (existente is not null) { etapas.Pendente("funcionario", "e-mail vinculado quando o Dataverse liberar"); return existente.Id; }
                    var novo = _repo.Criar(entrada.NomeCompleto, null, celular, entrada.TipoVinculo); etapas.Pendente("funcionario", "criado sem e-mail até o Dataverse liberar"); return novo;
                }
                if (existente is not null) { _repo.VincularEmail(existente.Id, email, celular); etapas.Feita("funcionario", "e-mail vinculado"); return existente.Id; }
                var id = _repo.Criar(entrada.NomeCompleto, email, celular, entrada.TipoVinculo); etapas.Feita("funcionario", "criado"); return id;
            });

            _trace((liberado ? "cadastro concluído para " : "cadastro com liberação pendente para ") + email);
            return saida;
        }
        catch (AcessoException erro)
        {
            erro.Data["Etapas"] = etapas.ToJson();
            throw;
        }
    }

    /// <summary>systemuser ausente, desabilitado ou sem licença é ressincronizado pelo addUser do Power Platform (Create pelo SDK nasce sem licença).</summary>
    /// <returns>false quando a espera acabou sem o systemuser pronto: etapa "pendente", sem falhar o fluxo.</returns>
    internal static bool GarantirSystemuser(Etapas etapas, UsuarioDataverseRepository usuarios, IPowerPlatformGateway pp, string usuarioEntraId)
        => etapas.Executar("systemuser", () =>
        {
            var objectId = Guid.Parse(usuarioEntraId);
            if (usuarios.Pronto(objectId)) { etapas.Pulada("systemuser", "já existe no Dataverse"); return true; }
            pp.SincronizarUsuario(objectId);
            if (!usuarios.AguardarPronto(objectId)) { etapas.Pendente("systemuser", MsgLiberando); return false; }
            etapas.Feita("systemuser", "sincronizado pelo Power Platform");
            return true;
        });

    internal const string MsgLiberando = "o Dataverse libera em instantes";

    /// <summary>
    /// O e-mail só conta como ocupado se pertence a outra pessoa. Reaproveita (idempotência) quando o funcionário dono
    /// tem o mesmo nome, ou quando não há funcionário e o usuário do Entra tem o mesmo nome (sobra de tentativa que falhou).
    /// </summary>
    private bool EmUsoPorOutraPessoa(string upn, string nome)
    {
        var alvo = AcessoRules.NomeComparavel(nome);
        var usuario = _graph.UsuarioPorUpn(upn);
        if (usuario is { Ativo: false }) return true;   // R10: conta desativada conta como ocupada, mesmo homônimo exato
        var dono = _repo.PorEmail(upn);
        if (dono is not null) return AcessoRules.NomeComparavel(dono.Nome) != alvo;
        return usuario is not null && AcessoRules.NomeComparavel(usuario.DisplayName) != alvo;
    }

    private bool SobraDeLiberacaoPendente(GraphUsuario u, string nome)
        => u.Ativo && AcessoRules.NomeComparavel(u.DisplayName) == AcessoRules.NomeComparavel(nome)
           && AcessoRules.TemLicenca(u, _cfg.LicenseSkuId) && _graph.EhMembro(_cfg.GroupId, u.Id);

    /// <summary>E-mail pessoal com forma básica (algo@dominio.tld, sem espaços); inválido é ignorado.</summary>
    internal static string? EmailValido(string? email)
    {
        var e = (email ?? "").Trim();
        var arroba = e.IndexOf('@');
        if (arroba <= 0 || arroba != e.LastIndexOf('@') || e.Any(char.IsWhiteSpace)) return null;
        var dominio = e.Substring(arroba + 1);
        var ponto = dominio.LastIndexOf('.');
        return ponto > 0 && ponto < dominio.Length - 1 ? e : null;
    }
}
