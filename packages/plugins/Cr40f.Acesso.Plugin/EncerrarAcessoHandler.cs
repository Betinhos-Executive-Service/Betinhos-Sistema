using System;

namespace Cr40f.Acesso.Plugin;

public sealed class EncerrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly AcessoConfig _cfg; private readonly Func<DateTime> _utcNow; private readonly Action<string> _trace;
    public EncerrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, AcessoConfig cfg, Func<DateTime> utcNow, Action<string> trace)
    { _graph = graph; _repo = repo; _cfg = cfg; _utcNow = utcNow; _trace = trace; }

    public Etapas Executar(Guid funcionarioId, string confirmacao)
    {
        var etapas = new Etapas();
        try
        {
            var f = _repo.PorId(funcionarioId) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.");
            if (string.IsNullOrWhiteSpace(f.EmailMicrosoft)) throw new AcessoException("FUNCIONARIO_SEM_EMAIL", f.Nome + " não tem e-mail Microsoft; não há acesso a encerrar.");
            var esperado = AcessoRules.NomeComparavel(AcessoRules.PrimeiroNome(f.Nome));
            if (esperado.Length == 0 || string.IsNullOrWhiteSpace(confirmacao) || esperado != AcessoRules.NomeComparavel(confirmacao)) throw new AcessoException("CONFIRMACAO_INVALIDA", "Digite o primeiro nome do funcionário para confirmar.");
            etapas.Feita("confirmacao", "ok");

            var email = f.EmailMicrosoft!.ToLowerInvariant();
            var u = _graph.UsuarioPorUpn(email);
            if (u is null) { etapas.Pulada("grupo", "usuário não existe no Entra"); etapas.Pulada("licenca", "usuário não existe no Entra"); etapas.Pulada("conta", "usuário não existe no Entra"); }
            else
            {
                // R11: só mexe na conta se ela é do grupo de motoristas; evita bloquear conta de outra pessoa apontada na ficha.
                var membro = false;
                etapas.Executar("grupo", () => { membro = _graph.EhMembro(_cfg.GroupId, u.Id); });
                if (!membro) { foreach (var nome in new[] { "grupo", "licenca", "conta" }) etapas.Pulada(nome, "conta fora do grupo de motoristas"); }
                else
                {
                    etapas.Executar("grupo", () => { _graph.RemoverDoGrupo(_cfg.GroupId, u.Id); etapas.Feita("grupo", "removido"); });
                    etapas.Executar("licenca", () => { if (AcessoRules.TemLicenca(u, _cfg.LicenseSkuId)) { _graph.RemoverLicenca(u.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "removida"); } else etapas.Pulada("licenca", "não tinha"); });
                    etapas.Executar("conta", () => { if (u.Ativo) { _graph.DefinirAtivo(u.Id, false); etapas.Feita("conta", "desativada"); } else etapas.Pulada("conta", "já desativada"); });
                }
            }
            etapas.Executar("funcionario", () => { if (f.Status != FuncionarioRepository.StatusInativo) { _repo.Inativar(f.Id, _utcNow()); etapas.Feita("funcionario", "inativado"); } else etapas.Pulada("funcionario", "já inativo"); });
            _trace("acesso encerrado para " + email);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }
}
