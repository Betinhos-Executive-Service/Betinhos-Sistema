using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Reativa o acesso de um administrativo encerrado: desbloqueia e repõe papéis, perfis de coluna e equipes do último encerramento
/// gravado pelo plugin. Só vale se esse encerramento é a última linha do plugin para a pessoa e a conta segue bloqueada.
/// O que não existe mais, papel de outra unidade de negócio e equipe que virou do Entra ou padrão são pulados, avisando.</summary>
public sealed class ReativarAdministrativoHandler
{
    private readonly IOrganizationService _sistema;
    public ReativarAdministrativoHandler(IOrganizationService sistema) { _sistema = sistema; }

    public Etapas Executar(Guid chamador, Guid usuario)
    {
        var etapas = new Etapas();
        try
        {
            // Todas as recusas antes de qualquer gravação.
            var admin = AcessoPrevisao.Autorizar(_sistema, chamador);
            if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém reativa o próprio acesso.");
            var alvo = CicloAdministrativo.Alvo(_sistema, usuario);
            var (registro, ultimaLinha) = CicloAdministrativo.UltimoCiclo(_sistema, usuario);
            if (registro == null || CicloAdministrativo.Acao(registro) != CicloAdministrativo.Encerrar)
                throw new AcessoException("NADA_A_REATIVAR", "Não há encerramento de acesso a reativar para esta pessoa.");
            if (!ultimaLinha || !alvo.GetAttributeValue<bool>("isdisabled"))
                throw new AcessoException("NADA_A_REATIVAR", "O acesso desta pessoa mudou depois do encerramento (conta habilitada ou perfis alterados): ajuste os perfis pela ficha em vez de reativar.");

            var papeisAntes = CicloAdministrativo.Itens(registro, "papeis");
            var colunasAntes = CicloAdministrativo.Itens(registro, "perfisColuna");
            var equipesAntes = CicloAdministrativo.Itens(registro, "equipes");
            // Mesma regra do encerrar: amplo ou Administrador de acessos, direto (nome atual ou o gravado) ou por equipe a repor, só volta pelo Administrador do Sistema.
            var restrito = papeisAntes.Any(p => CicloAdministrativo.SoAdminDoSistema(p.Nome) || CicloAdministrativo.SoAdminDoSistema(PapeisDoUsuario.NomeDoPapel(_sistema, p.Id)))
                || equipesAntes.Any(e => PapeisDoUsuario.Ids(_sistema, "teamroles", "teamid", e.Id, "roleid").Any(r => CicloAdministrativo.SoAdminDoSistema(PapeisDoUsuario.NomeDoPapel(_sistema, r))));
            if (restrito && !admin) throw new AcessoException("SEM_PERMISSAO", "O encerramento tirou o acesso amplo ou o perfil Administrador de acessos: só o Administrador do Sistema reativa.");

            // O que repor, calculado antes de gravar: dentro da transação, um erro do Dataverse desfaz tudo mesmo se capturado.
            var unidade = alvo.GetAttributeValue<EntityReference>("businessunitid")?.Id;
            var papeis = Repor(etapas, "papeis", papeisAntes, PapeisDoUsuario.IdsDiretos(_sistema, usuario), "papel", id =>
            {
                var papel = CicloAdministrativo.Papel(_sistema, id);
                if (papel == null) return (null, null);
                // Papel direto só vale na unidade de negócio da pessoa; ela pode ter mudado de unidade depois do encerramento.
                var outraUnidade = papel.GetAttributeValue<EntityReference>("businessunitid")?.Id != unidade;
                return (papel.GetAttributeValue<string>("name"), outraUnidade ? "é de outra unidade de negócio" : null);
            });
            var colunas = Repor(etapas, "perfisColuna", colunasAntes, PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"),
                "perfil de coluna", id => (CicloAdministrativo.NomeDe(_sistema, "fieldsecurityprofile", id), null));
            var equipes = Repor(etapas, "equipes", equipesAntes, PapeisDoUsuario.Ids(_sistema, "teammembership", "systemuserid", usuario, "teamid"), "equipe", id =>
            {
                var equipe = CicloAdministrativo.Equipe(_sistema, id);
                return equipe == null ? (null, null) : (equipe.GetAttributeValue<string>("name"), CicloAdministrativo.MotivoEquipeIntocavel(equipe));
            });
            var antes = CicloAdministrativo.PerfisJson(_sistema, usuario);
            var amplo = CicloAdministrativo.Amplo(CicloAdministrativo.Reativar, papeis, colunas, equipes);

            _sistema.Execute(new SetStateRequest { EntityMoniker = new EntityReference("systemuser", usuario), State = new OptionSetValue(0), Status = new OptionSetValue(-1) });
            etapas.Feita("desbloqueio", "desbloqueado no Dataverse");
            if (papeis.Count > 0)
                _sistema.Associate("systemuser", usuario, new Relationship("systemuserroles_association"),
                    new EntityReferenceCollection(papeis.Select(p => new EntityReference("role", p.Id)).ToList()));
            if (colunas.Count > 0)
                _sistema.Associate("systemuser", usuario, new Relationship("systemuserprofiles_association"),
                    new EntityReferenceCollection(colunas.Select(p => new EntityReference("fieldsecurityprofile", p.Id)).ToList()));
            foreach (var equipe in equipes) _sistema.Execute(new AddMembersTeamRequest { TeamId = equipe.Id, MemberIds = new[] { usuario } });

            CicloAdministrativo.Historico(_sistema, alvo, chamador, antes, CicloAdministrativo.PerfisJson(_sistema, usuario), amplo);
            etapas.Feita("historico", "gravado");
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    /// <summary>O que repor: existe hoje (nome lido de novo), não tem motivo para pular e a pessoa ainda não tem. O resto vira etapa pulada.
    /// <paramref name="ler"/> devolve o nome atual (nulo = não existe mais) e o motivo para pular (nulo = repõe).</summary>
    private static List<(Guid Id, string? Nome)> Repor(Etapas etapas, string etapa, List<(Guid Id, string? Nome)> gravados, List<Guid> atuais, string tipo, Func<Guid, (string? Nome, string? Pular)> ler)
    {
        var repor = new List<(Guid Id, string? Nome)>();
        foreach (var item in gravados)
        {
            if (repor.Any(r => r.Id == item.Id) || atuais.Contains(item.Id)) continue;
            var (nome, pular) = ler(item.Id);
            if (nome == null) { etapas.Pulada(etapa, tipo + " " + (item.Nome ?? item.Id.ToString()) + " não existe mais"); continue; }
            if (pular != null) { etapas.Pulada(etapa, tipo + " " + nome + ": " + pular + "; não reposto"); continue; }
            repor.Add((item.Id, nome));
        }
        if (repor.Count > 0) etapas.Feita(etapa, repor.Count + " reposto(s)");
        else if (gravados.Count == 0) etapas.Pulada(etapa, "não tinha");
        return repor;
    }
}
