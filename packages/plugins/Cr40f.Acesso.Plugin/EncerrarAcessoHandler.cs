using System;
using System.Globalization;
using System.Text;

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
            if (Simples(AcessoRules.PrimeiroNome(f.Nome)) != Simples(confirmacao)) throw new AcessoException("CONFIRMACAO_INVALIDA", "Digite o primeiro nome do funcionário para confirmar.");
            etapas.Feita("confirmacao", "ok");

            var email = f.EmailMicrosoft!.ToLowerInvariant();
            var u = _graph.UsuarioPorUpn(email);
            if (u is null) { etapas.Pulada("grupo", "usuário não existe no Entra"); etapas.Pulada("licenca", "usuário não existe no Entra"); etapas.Pulada("conta", "usuário não existe no Entra"); }
            else
            {
                Etapa(etapas, "grupo", () => { if (_graph.EhMembro(_cfg.GroupId, u.Id)) { _graph.RemoverDoGrupo(_cfg.GroupId, u.Id); etapas.Feita("grupo", "removido"); } else etapas.Pulada("grupo", "não era membro"); });
                Etapa(etapas, "licenca", () => { if (u.SkuIds.Contains(_cfg.LicenseSkuId)) { _graph.RemoverLicenca(u.Id, _cfg.LicenseSkuId); etapas.Feita("licenca", "removida"); } else etapas.Pulada("licenca", "não tinha"); });
                Etapa(etapas, "conta", () => { if (u.Ativo) { _graph.DefinirAtivo(u.Id, false); etapas.Feita("conta", "desativada"); } else etapas.Pulada("conta", "já desativada"); });
            }
            Etapa(etapas, "funcionario", () => { if (f.Status != FuncionarioRepository.StatusInativo) { _repo.Inativar(f.Id, _utcNow()); etapas.Feita("funcionario", "inativado"); } else etapas.Pulada("funcionario", "já inativo"); });
            _trace("acesso encerrado para " + email);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    private static void Etapa(Etapas etapas, string nome, Action acao)
    {
        try { acao(); }
        catch (AcessoException erro) { etapas.Erro(nome, erro.Message); throw; }
        catch (Exception erro) { etapas.Erro(nome, erro.Message); throw new AcessoException("GRAPH_INDISPONIVEL", "Falha em " + nome + ": " + erro.Message); }
    }

    private static string Simples(string texto)
    {
        var sb = new StringBuilder();
        foreach (var c in (texto ?? "").Trim().Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(c));
        return sb.ToString();
    }
}
