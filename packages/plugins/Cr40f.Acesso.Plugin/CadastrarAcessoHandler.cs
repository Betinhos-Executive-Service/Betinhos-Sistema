using System;
using System.Linq;

namespace Cr40f.Acesso.Plugin;

public sealed class CadastroEntrada { public string NomeCompleto = ""; public string Celular = ""; public string? EmailPessoal; public string? PrefixoEmail; public int TipoVinculo = 1; public Guid? FuncionarioId; }
public sealed class CadastroSaida { public string EmailMicrosoft = ""; public string SenhaTemporaria = ""; public Guid FuncionarioId; public string UsuarioEntraId = ""; public string LinkApp = ""; public Etapas Etapas = new(); }

/// <summary>Cadastro idempotente: cada etapa confere o estado antes de agir. Falha relança com as etapas em Data["Etapas"].</summary>
public sealed class CadastrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly AcessoConfig _cfg; private readonly Random _rng; private readonly Action<string> _trace;
    public CadastrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Random rng, Action<string> trace)
    { _graph = graph; _repo = repo; _cfg = cfg; _rng = rng; _trace = trace; }

    public CadastroSaida Executar(CadastroEntrada entrada)
    {
        var saida = new CadastroSaida { LinkApp = _cfg.AppUrl };
        var etapas = saida.Etapas;
        try
        {
            if (!AcessoRules.NomeValido(entrada.NomeCompleto)) throw new AcessoException("NOME_INVALIDO", "Informe nome e sobrenome.");
            var celular = AcessoRules.NormalizarCelular(entrada.Celular) ?? throw new AcessoException("CELULAR_INVALIDO", "Informe um celular brasileiro com DDD (11 dígitos).");
            etapas.Feita("validacao", "ok");

            var (existente, email, dono) = etapas.Executar("email", () =>
            {
                var ex = entrada.FuncionarioId is Guid fid ? _repo.PorId(fid) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.") : null;
                string em;
                if (ex?.EmailMicrosoft is { Length: > 0 } ja)
                {
                    em = ja.ToLowerInvariant();
                    // R10: conta desativada nunca é reativada aqui; a TI decide.
                    if (_graph.UsuarioPorUpn(em) is { Ativo: false }) throw new AcessoException("ACESSO_ENCERRADO", "Acesso encerrado antes. Peça à TI para reativar a conta no Entra.");
                    etapas.Pulada("email", "funcionário já tinha e-mail Microsoft");
                }
                else
                {
                    var prefixo = AcessoRules.PrefixoEmail(string.IsNullOrWhiteSpace(entrada.PrefixoEmail) ? entrada.NomeCompleto : entrada.PrefixoEmail);
                    if (prefixo.Length == 0) throw new AcessoException("NOME_INVALIDO", "Não foi possível gerar o e-mail a partir do nome.");
                    // Com FuncionarioId a regra é estrita (sem casar nome): não vincula conta de outra pessoa ao funcionário informado.
                    Func<string, bool> ocupado = ex is null
                        ? upn => EmUsoPorOutraPessoa(upn, entrada.NomeCompleto)
                        : upn => _repo.PorEmail(upn) is { } d && d.Id != ex.Id || _graph.UsuarioPorUpn(upn) is not null;
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
                    if (!u.Ativo) throw new AcessoException("ACESSO_ENCERRADO", "Acesso encerrado antes. Peça à TI para reativar a conta no Entra.");
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

            saida.FuncionarioId = etapas.Executar("funcionario", () =>
            {
                if (existente is not null) { _repo.VincularEmail(existente.Id, email, celular); etapas.Feita("funcionario", "e-mail vinculado"); return existente.Id; }
                if (dono is not null) { etapas.Pulada("funcionario", "já cadastrado"); return dono.Id; }
                var id = _repo.Criar(entrada.NomeCompleto, email, celular, entrada.TipoVinculo); etapas.Feita("funcionario", "criado"); return id;
            });

            _trace("cadastro concluído para " + email);
            return saida;
        }
        catch (AcessoException erro)
        {
            erro.Data["Etapas"] = etapas.ToJson();
            throw;
        }
    }

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
