using System;
using System.Collections.Generic;
using System.Linq;

namespace Cr40f.Acesso.Plugin;

public sealed class EncerrarAcessoHandler
{
    private readonly IGraphGateway _graph; private readonly FuncionarioRepository _repo; private readonly UsuarioDataverseRepository _usuarios; private readonly AcessoConfig _cfg; private readonly Action<string> _trace; private readonly Action<int> _esperar;
    public EncerrarAcessoHandler(IGraphGateway graph, FuncionarioRepository repo, UsuarioDataverseRepository usuarios, AcessoConfig cfg, Action<string> trace, Action<int>? esperar = null)
    { _graph = graph; _repo = repo; _usuarios = usuarios; _cfg = cfg; _trace = trace; _esperar = esperar ?? System.Threading.Thread.Sleep; }

    // O Graph demora a refletir as mudanças: até 3 leituras em ~6 s antes de acusar o que sobrou.
    private const int Conferencias = 3, IntervaloMs = 3000;

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
                    // Por objectId e por e-mail: a ficha lê o systemuser pelo e-mail, então todos com ele precisam ficar bloqueados.
                    var daConta = _usuarios.DaConta(Guid.Parse(u.Id), email);
                    var habilitados = daConta.Where(s => !s.GetAttributeValue<bool>("isdisabled")).ToList();
                    if (daConta.Count == 0) etapas.Pulada("bloqueio", "sem usuário no Dataverse");
                    else if (habilitados.Count == 0) etapas.Pulada("bloqueio", "já bloqueado");
                    else
                    {
                        foreach (var s in habilitados) _usuarios.Bloquear(s.Id);
                        etapas.Feita("bloqueio", habilitados.Count == 1 ? "bloqueado no Dataverse" : habilitados.Count + " usuários bloqueados no Dataverse");
                    }
                });
                if (!membro)
                {
                    // Conta ativa fora do grupo continua intocada (R11), mas é erro: o motorista seguiria com acesso (caso Bruno, PROD 10/11/2026).
                    if (u.Ativo)
                    {
                        const string msg = "A conta Microsoft está ativa, mas fora do grupo de motoristas configurado. Nada foi alterado: confira com a TI o e-mail da ficha e o grupo do plugin.";
                        etapas.Erro("grupo", msg);
                        throw new AcessoException("CONTA_FORA_DO_GRUPO", msg);
                    }
                    // Conta já desativada no Entra (ex.: tentativa anterior parou no SetState depois de sair do grupo): conclui o bloqueio.
                    foreach (var nome in new[] { "grupo", "licenca", "conta" }) etapas.Pulada(nome, "conta fora do grupo de motoristas");
                    Bloquear();
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
                Conferir(etapas, email, Guid.Parse(u.Id), membro);
            }
            // Só acesso ao app: status e demissão do funcionário são do RH e não mudam aqui (decisão de 23/10/2026).
            _trace("acesso encerrado para " + email);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    /// <summary>Relê a conta depois de encerrar. O que sobrou vira a etapa "conferencia" em erro, sem exceção:
    /// exceção desfaria o bloqueio do systemuser (transação do Dataverse), e o Entra não volta junto.</summary>
    private void Conferir(Etapas etapas, string email, Guid objectId, bool estavaNoGrupo)
    {
        var faltas = new List<string>();
        for (var tentativa = 1; tentativa <= Conferencias; tentativa++)
        {
            if (tentativa > 1) _esperar(IntervaloMs);
            try { faltas = Restante(email, objectId, estavaNoGrupo); }
            catch (Exception erro) { faltas = new List<string> { "não foi possível conferir (" + erro.Message + ")" }; }
            if (faltas.Count == 0) { etapas.Feita("conferencia", "acesso retirado"); return; }
            _trace("conferencia " + tentativa + ": " + string.Join(", ", faltas));
        }
        etapas.Erro("conferencia", string.Join(", ", faltas));
    }

    private List<string> Restante(string email, Guid objectId, bool estavaNoGrupo)
    {
        var achados = new List<string>();
        var u = _graph.UsuarioPorUpn(email);
        if (u is not null)
        {
            if (u.Ativo) achados.Add("conta Microsoft ainda ativa");
            // Licença só é retirada de quem estava no grupo; conta desativada fora dele pode manter a dela.
            if (estavaNoGrupo && AcessoRules.TemLicenca(u, _cfg.LicenseSkuId)) achados.Add("licença ainda atribuída");
            if (_graph.EhMembro(_cfg.GroupId, u.Id)) achados.Add("ainda no grupo de motoristas");
        }
        if (_usuarios.DaConta(objectId, email).Any(s => !s.GetAttributeValue<bool>("isdisabled"))) achados.Add("usuário ainda habilitado no Dataverse");
        return achados;
    }
}
