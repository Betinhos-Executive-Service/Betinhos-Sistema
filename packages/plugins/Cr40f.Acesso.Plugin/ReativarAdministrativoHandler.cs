using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Reativa o acesso de um administrativo encerrado: desbloqueia e repõe papéis, perfis de coluna e equipes do último encerramento
/// gravado pelo plugin. O que não existe mais é pulado, avisando.</summary>
public sealed class ReativarAdministrativoHandler
{
    private readonly IOrganizationService _sistema;
    public ReativarAdministrativoHandler(IOrganizationService sistema) { _sistema = sistema; }

    public Etapas Executar(Guid chamador, Guid usuario)
    {
        var etapas = new Etapas();
        try
        {
            var admin = AcessoPrevisao.Autorizar(_sistema, chamador);
            if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém reativa o próprio acesso.");
            var alvo = CicloAdministrativo.Alvo(_sistema, usuario);
            var registro = CicloAdministrativo.UltimoCiclo(_sistema, usuario);
            if (registro == null || CicloAdministrativo.Acao(registro) != CicloAdministrativo.Encerrar)
                throw new AcessoException("NADA_A_REATIVAR", "Não há encerramento de acesso a reativar para esta pessoa.");

            var papeisAntes = CicloAdministrativo.Itens(registro, "papeis");
            var colunasAntes = CicloAdministrativo.Itens(registro, "perfisColuna");
            var equipesAntes = CicloAdministrativo.Itens(registro, "equipes");
            // Mesma regra do encerrar: amplo direto (nome atual ou o gravado) ou por equipe a repor só volta pelo Administrador do Sistema.
            var amplo = papeisAntes.Any(p => AcessoCatalogo.EhAmplo(p.Nome) || AcessoCatalogo.EhAmplo(PapeisDoUsuario.NomeDoPapel(_sistema, p.Id)))
                || equipesAntes.Any(e => PapeisDoUsuario.Ids(_sistema, "teamroles", "teamid", e.Id, "roleid").Any(r => AcessoCatalogo.EhAmplo(PapeisDoUsuario.NomeDoPapel(_sistema, r))));
            if (amplo && !admin) throw new AcessoException("SEM_PERMISSAO", "O encerramento tirou o acesso amplo: só o Administrador do Sistema reativa.");

            if (alvo.GetAttributeValue<bool>("isdisabled"))
            {
                _sistema.Execute(new SetStateRequest { EntityMoniker = new EntityReference("systemuser", usuario), State = new OptionSetValue(0), Status = new OptionSetValue(-1) });
                etapas.Feita("desbloqueio", "desbloqueado no Dataverse");
            }
            else etapas.Pulada("desbloqueio", "já habilitado");

            var antes = CicloAdministrativo.PerfisJson(_sistema, usuario);
            var papeis = Repor(etapas, "papeis", papeisAntes, id => PapeisDoUsuario.NomeDoPapel(_sistema, id), PapeisDoUsuario.IdsDiretos(_sistema, usuario), "papel");
            if (papeis.Count > 0)
                _sistema.Associate("systemuser", usuario, new Relationship("systemuserroles_association"),
                    new EntityReferenceCollection(papeis.Select(p => new EntityReference("role", p.Id)).ToList()));
            var colunas = Repor(etapas, "perfisColuna", colunasAntes, id => CicloAdministrativo.NomeDe(_sistema, "fieldsecurityprofile", id),
                PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"), "perfil de coluna");
            if (colunas.Count > 0)
                _sistema.Associate("systemuser", usuario, new Relationship("systemuserprofiles_association"),
                    new EntityReferenceCollection(colunas.Select(p => new EntityReference("fieldsecurityprofile", p.Id)).ToList()));
            var equipes = Repor(etapas, "equipes", equipesAntes, id => CicloAdministrativo.Equipe(_sistema, id)?.GetAttributeValue<string>("name"),
                PapeisDoUsuario.Ids(_sistema, "teammembership", "systemuserid", usuario, "teamid"), "equipe");
            foreach (var equipe in equipes) _sistema.Execute(new AddMembersTeamRequest { TeamId = equipe.Id, MemberIds = new[] { usuario } });

            CicloAdministrativo.Historico(_sistema, alvo, chamador, antes, CicloAdministrativo.PerfisJson(_sistema, usuario),
                CicloAdministrativo.Json(CicloAdministrativo.Reativar, papeis, colunas, equipes));
            etapas.Feita("historico", "gravado");
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    /// <summary>O que repor: existe hoje (nome lido de novo) e a pessoa ainda não tem. O que não existe vira etapa pulada.</summary>
    private static List<(Guid Id, string? Nome)> Repor(Etapas etapas, string etapa, List<(Guid Id, string? Nome)> gravados, Func<Guid, string?> nomeAtual, List<Guid> atuais, string tipo)
    {
        var repor = new List<(Guid Id, string? Nome)>();
        foreach (var item in gravados)
        {
            if (repor.Any(r => r.Id == item.Id) || atuais.Contains(item.Id)) continue;
            var nome = nomeAtual(item.Id);
            if (nome == null) { etapas.Pulada(etapa, tipo + " " + (item.Nome ?? item.Id.ToString()) + " não existe mais"); continue; }
            repor.Add((item.Id, nome));
        }
        if (repor.Count > 0) etapas.Feita(etapa, repor.Count + " reposto(s)");
        else if (gravados.Count == 0) etapas.Pulada(etapa, "não tinha");
        return repor;
    }
}
