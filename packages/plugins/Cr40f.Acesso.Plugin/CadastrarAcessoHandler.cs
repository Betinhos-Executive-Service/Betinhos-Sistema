using System;
using System.Globalization;
using System.Linq;
using System.Text;

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

            var existente = entrada.FuncionarioId is Guid fid ? _repo.PorId(fid) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.") : null;
            string email;
            if (existente?.EmailMicrosoft is { Length: > 0 } ja) { email = ja.ToLowerInvariant(); etapas.Pulada("email", "funcionário já tinha e-mail Microsoft"); }
            else
            {
                var prefixo = AcessoRules.PrefixoEmail(string.IsNullOrWhiteSpace(entrada.PrefixoEmail) ? entrada.NomeCompleto : entrada.PrefixoEmail);
                if (prefixo.Length == 0) throw new AcessoException("NOME_INVALIDO", "Não foi possível gerar o e-mail a partir do nome.");
                email = AcessoRules.EmailComSufixo(prefixo, _cfg.Dominio, upn => EmUsoPorOutraPessoa(upn, entrada.NomeCompleto));
                etapas.Feita("email", email);
            }
            saida.EmailMicrosoft = email;

            var dono = _repo.PorEmail(email);
            if (dono is not null && existente is not null && dono.Id != existente.Id)
                throw new AcessoException("EMAIL_EM_USO_POR_OUTRO_FUNCIONARIO", "O e-mail " + email + " já pertence a " + dono.Nome + ".");

            var usuario = Etapa(etapas, "usuario", () =>
            {
                var u = _graph.UsuarioPorUpn(email);
                if (u is not null) { etapas.Pulada("usuario", u.Ativo ? "já existia; senha não alterada" : "já existia (desativado); senha não alterada"); if (!u.Ativo) _graph.DefinirAtivo(u.Id, true); return u; }
                if (_graph.LicencasLivres(_cfg.LicenseSkuId) <= 0) throw new AcessoException("SEM_LICENCA_DISPONIVEL", "Não há licença livre no plano configurado.");
                saida.SenhaTemporaria = AcessoRules.GerarSenha(_rng);
                u = _graph.CriarUsuario(email, entrada.NomeCompleto.Trim(), saida.SenhaTemporaria, celular);
                etapas.Feita("usuario", "criado"); return u;
            });
            saida.UsuarioEntraId = usuario.Id;

            Etapa(etapas, "licenca", () =>
            {
                if (usuario.SkuIds.Contains(_cfg.LicenseSkuId)) { etapas.Pulada("licenca", "já atribuída"); return 0; }
                _graph.AtribuirLicenca(usuario.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "atribuída"); return 0;
            });

            Etapa(etapas, "grupo", () =>
            {
                if (_graph.EhMembro(_cfg.GroupId, usuario.Id)) { etapas.Pulada("grupo", "já era membro"); return 0; }
                _graph.AdicionarAoGrupo(_cfg.GroupId, usuario.Id); etapas.Feita("grupo", "adicionado"); return 0;
            });

            saida.FuncionarioId = Etapa(etapas, "funcionario", () =>
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
        var alvo = NomeNormalizado(nome);
        var dono = _repo.PorEmail(upn);
        if (dono is not null) return NomeNormalizado(dono.Nome) != alvo;
        var usuario = _graph.UsuarioPorUpn(upn);
        return usuario is not null && NomeNormalizado(usuario.DisplayName) != alvo;
    }

    private static string NomeNormalizado(string? nome)
    {
        var semAcento = new StringBuilder();
        foreach (var c in (nome ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) semAcento.Append(c);
        return string.Join(" ", semAcento.ToString().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static T Etapa<T>(Etapas etapas, string nome, Func<T> acao)
    {
        try { return acao(); }
        catch (AcessoException erro) { etapas.Erro(nome, erro.Message); throw; }
        catch (Exception erro) { etapas.Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
    }
}
