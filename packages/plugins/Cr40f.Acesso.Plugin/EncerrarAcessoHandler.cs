using System;

namespace Cr40f.Acesso.Plugin;

public sealed class EncerrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly UsuarioDataverseRepository _usuarios; private readonly AcessoConfig _cfg; private readonly Action<string> _trace;
    public EncerrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, UsuarioDataverseRepository usuarios, AcessoConfig cfg, Action<string> trace)
    { _graph = graph; _repo = repo; _usuarios = usuarios; _cfg = cfg; _trace = trace; }

    private static readonly string[] EtapasDeConta = { "grupo", "licenca", "conta", "bloqueio" };

    public Etapas Executar(Guid funcionarioId, string confirmacao)
    {
        var etapas = new Etapas { Trace = _trace };
        try
        {
            var f = _repo.PorId(funcionarioId) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário não encontrado.");
            if (string.IsNullOrWhiteSpace(f.EmailMicrosoft)) throw new AcessoException("FUNCIONARIO_SEM_EMAIL", f.Nome + " não tem e-mail Microsoft; não há acesso a encerrar.");
            var esperado = AcessoRules.NomeComparavel(AcessoRules.PrimeiroNome(f.Nome));
            if (esperado.Length == 0 || string.IsNullOrWhiteSpace(confirmacao) || esperado != AcessoRules.NomeComparavel(confirmacao)) throw new AcessoException("CONFIRMACAO_INVALIDA", "Digite o primeiro nome do funcionário para confirmar.");
            etapas.Feita("confirmacao", "ok");

            var email = f.EmailMicrosoft!.ToLowerInvariant();
            var u = _graph.UsuarioPorUpn(email);
            if (u is null) { foreach (var nome in EtapasDeConta) etapas.Pulada(nome, "usuário não existe no Entra"); }
            else
            {
                // R11: só mexe na conta se ela é do grupo de motoristas; evita bloquear conta de outra pessoa apontada na ficha.
                var membro = false;
                etapas.Executar("grupo", () => { membro = _graph.EhMembro(_cfg.GroupId, u.Id); });
                // O Dataverse só desabilita o systemuser ao sincronizar com o Entra (horas); bloqueia já para a ficha refletir o encerramento.
                void Bloquear() => etapas.Executar("bloqueio", () =>
                {
                    var s = _usuarios.PorObjectId(Guid.Parse(u.Id));
                    if (s is null) etapas.Pulada("bloqueio", "sem usuário no Dataverse");
                    else if (s.GetAttributeValue<bool>("isdisabled")) etapas.Pulada("bloqueio", "já bloqueado");
                    else { _usuarios.Bloquear(s.Id); etapas.Feita("bloqueio", "bloqueado no Dataverse"); }
                });
                if (!membro)
                {
                    foreach (var nome in new[] { "grupo", "licenca", "conta" }) etapas.Pulada(nome, "conta fora do grupo de motoristas");
                    // Conta já desativada no Entra (ex.: tentativa anterior parou no SetState depois de sair do grupo): conclui o bloqueio.
                    // Conta ativa fora do grupo continua intocada (R11).
                    if (u.Ativo) etapas.Pulada("bloqueio", "conta fora do grupo de motoristas"); else Bloquear();
                }
                else
                {
                    // Grupo depois de licença e conta: é o marcador do R11; sair dele antes deixaria licença e conta ativas se uma etapa falhasse e a tela tentasse de novo.
                    etapas.Executar("licenca", () => { if (AcessoRules.TemLicenca(u, _cfg.LicenseSkuId)) { _graph.RemoverLicenca(u.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "removida"); } else etapas.Pulada("licenca", "não tinha"); });
                    etapas.Executar("conta", () => { if (u.Ativo) { _graph.DefinirAtivo(u.Id, false); etapas.Feita("conta", "desativada"); } else etapas.Pulada("conta", "já desativada"); });
                    etapas.Executar("grupo", () => { _graph.RemoverDoGrupo(_cfg.GroupId, u.Id); etapas.Feita("grupo", "removido"); });
                    // Depois do grupo: se o SetState falhar, a nova tentativa cai no ramo "fora do grupo" acima e conclui o bloqueio.
                    Bloquear();
                }
            }
            // Só acesso ao app: status e demissão do funcionário são do RH e não mudam aqui (decisão de 23/10/2026).
            _trace("acesso encerrado para " + email);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }
}
