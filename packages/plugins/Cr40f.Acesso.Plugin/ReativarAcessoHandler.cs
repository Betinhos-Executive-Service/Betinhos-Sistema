using System;

namespace Cr40f.Acesso.Plugin;

public sealed class ReativacaoSaida { public string EmailMicrosoft = ""; public string SenhaTemporaria = ""; public string LinkApp = ""; public Etapas Etapas = new(); }

/// <summary>
/// Reativa o acesso ao app de quem já teve conta: conta ativa, senha nova, licença, grupo e systemuser.
/// Idempotente (pula o que já está feito), exceto a senha, redefinida a cada execução. Não mexe no cadastro do funcionário.
/// </summary>
public sealed class ReativarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly UsuarioDataverseRepository _usuarios; private readonly IPowerPlatformGateway _pp; private readonly AcessoConfig _cfg; private readonly Random _rng; private readonly Action<string> _trace;
    public ReativarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, UsuarioDataverseRepository usuarios, IPowerPlatformGateway pp, AcessoConfig cfg, Random rng, Action<string> trace)
    { _graph = graph; _repo = repo; _usuarios = usuarios; _pp = pp; _cfg = cfg; _rng = rng; _trace = trace; }

    public ReativacaoSaida Executar(Guid funcionarioId)
    {
        var saida = new ReativacaoSaida { LinkApp = _cfg.AppUrl };
        var etapas = saida.Etapas;
        try
        {
            var f = _repo.PorId(funcionarioId) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.");
            if (string.IsNullOrWhiteSpace(f.EmailMicrosoft)) throw new AcessoException("FUNCIONARIO_SEM_EMAIL", f.Nome + " não tem e-mail Microsoft; use \"Cadastrar acesso\".");
            var email = f.EmailMicrosoft!.Trim().ToLowerInvariant();
            saida.EmailMicrosoft = email;

            var u = etapas.Executar("usuario", () => _graph.UsuarioPorUpn(email) ?? throw new AcessoException("CONTA_NAO_EXISTE", "A conta Microsoft não existe mais; cadastre o acesso de novo."));
            etapas.Feita("usuario", "encontrado");

            etapas.Executar("conta", () =>
            {
                if (u.Ativo) { etapas.Pulada("conta", "já ativa"); return; }
                _graph.DefinirAtivo(u.Id, true); u.Ativo = true; etapas.Feita("conta", "reativada");
            });

            // Sem a permissão de senha as outras etapas seguem; o erro volta no fim, com elas registradas.
            AcessoException? semPermissaoSenha = null;
            try
            {
                etapas.Executar("senha", () =>
                {
                    var senha = AcessoRules.GerarSenha(_rng);
                    _graph.RedefinirSenha(u.Id, senha);
                    saida.SenhaTemporaria = senha; etapas.Feita("senha", "redefinida");
                });
            }
            catch (AcessoException erro) when (erro.Codigo == "SEM_PERMISSAO_SENHA") { semPermissaoSenha = erro; }

            etapas.Executar("licenca", () =>
            {
                if (AcessoRules.TemLicenca(u, _cfg.LicenseSkuId)) { etapas.Pulada("licenca", "já atribuída"); return; }
                if (_graph.LicencasLivres(_cfg.LicenseSkuId) <= 0) throw new AcessoException("SEM_LICENCA_DISPONIVEL", "Não há licença livre no plano configurado.");
                _graph.AtribuirLicenca(u.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "atribuída");
            });

            etapas.Executar("grupo", () =>
            {
                if (_graph.EhMembro(_cfg.GroupId, u.Id)) { etapas.Pulada("grupo", "já era membro"); return; }
                _graph.AdicionarAoGrupo(_cfg.GroupId, u.Id); etapas.Feita("grupo", "adicionado");
            });

            CadastrarAcessoHandler.GarantirSystemuser(etapas, _usuarios, _pp, u.Id);

            if (semPermissaoSenha is not null) throw semPermissaoSenha;
            _trace("acesso reativado para " + email);
            return saida;
        }
        catch (AcessoException erro)
        {
            erro.Data["Etapas"] = etapas.ToJson();
            throw;
        }
    }
}
