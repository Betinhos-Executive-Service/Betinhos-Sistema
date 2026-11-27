using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Encerra o acesso de um administrativo (não motorista): tira papéis diretos, perfis de coluna e equipes com papel,
/// grava o histórico com o que saiu (para o reativar) e bloqueia o systemuser. Não mexe no Entra nem na ficha.</summary>
public sealed class EncerrarAdministrativoHandler
{
    private readonly IOrganizationService _sistema;
    public EncerrarAdministrativoHandler(IOrganizationService sistema) { _sistema = sistema; }

    public Etapas Executar(Guid chamador, Guid usuario, string? confirmacao)
    {
        var etapas = new Etapas();
        try
        {
            // Todas as recusas antes de qualquer gravação.
            var admin = AcessoPrevisao.Autorizar(_sistema, chamador);
            if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém encerra o próprio acesso.");
            var alvo = CicloAdministrativo.Alvo(_sistema, usuario);
            var bloqueado = alvo.GetAttributeValue<bool>("isdisabled");
            if (bloqueado && CicloAdministrativo.Acao(CicloAdministrativo.UltimoCiclo(_sistema, usuario).Registro) == CicloAdministrativo.Encerrar)
                throw new AcessoException("JA_ENCERRADO", "O acesso desta pessoa já está encerrado.");
            if (!admin && PapeisDoUsuario.Nomes(_sistema, usuario).Any(CicloAdministrativo.SoAdminDoSistema))
                throw new AcessoException("SEM_PERMISSAO", "Esta pessoa tem o acesso amplo ou o perfil Administrador de acessos: só o Administrador do Sistema encerra.");

            var papeis = PapeisDoUsuario.IdsDiretos(_sistema, usuario).Distinct()
                .Select(id => (Id: id, Nome: PapeisDoUsuario.NomeDoPapel(_sistema, id))).ToList();
            // AdminsDiretos conta a própria pessoa quando ela está habilitada: tirar o dela deixa um a menos.
            if (!bloqueado && papeis.Any(p => AcessoCatalogo.EhAdminDoSistema(new[] { p.Nome ?? "" })) && DefinirPerfisHandler.AdminsDiretos(_sistema) <= 2)
                throw new AcessoException("ULTIMO_ADMIN", "Sobrariam menos de 2 pessoas com Administrador do Sistema direto.");

            var esperado = AcessoRules.NomeComparavel(AcessoRules.PrimeiroNome(CicloAdministrativo.Nome(alvo)));
            if (esperado.Length == 0 || esperado != AcessoRules.NomeComparavel(confirmacao))
                throw new AcessoException("CONFIRMACAO_INVALIDA", "Digite o primeiro nome da pessoa para confirmar.");
            etapas.Feita("confirmacao", "ok");

            var antes = CicloAdministrativo.PerfisJson(_sistema, usuario);
            var colunas = PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid").Distinct()
                .Select(id => (Id: id, Nome: CicloAdministrativo.NomeDe(_sistema, "fieldsecurityprofile", id))).ToList();
            var equipes = new List<(Guid Id, string? Nome)>();
            foreach (var id in PapeisDoUsuario.Ids(_sistema, "teammembership", "systemuserid", usuario, "teamid").Distinct())
            {
                var equipe = CicloAdministrativo.Equipe(_sistema, id);
                // Equipe padrão da unidade de negócio: toda pessoa da unidade é membro e não dá para sair.
                if (equipe == null || equipe.GetAttributeValue<bool>("isdefault")) continue;
                if (PapeisDoUsuario.Ids(_sistema, "teamroles", "teamid", id, "roleid").Count == 0) continue;
                var nome = equipe.GetAttributeValue<string>("name");
                if (CicloAdministrativo.EhEquipeDoEntra(equipe)) { etapas.Pulada("equipes", nome + ": equipe de grupo do Entra; tire a pessoa do grupo no Entra"); continue; }
                equipes.Add((id, nome));
            }
            var amplo = CicloAdministrativo.Amplo(CicloAdministrativo.Encerrar, papeis, colunas, equipes);

            // Custom API síncrona: qualquer falha daqui em diante desfaz tudo (transação do Dataverse).
            if (papeis.Count > 0)
            {
                _sistema.Disassociate("systemuser", usuario, new Relationship("systemuserroles_association"),
                    new EntityReferenceCollection(papeis.Select(p => new EntityReference("role", p.Id)).ToList()));
                etapas.Feita("papeis", papeis.Count + " retirado(s)");
            }
            else etapas.Pulada("papeis", "não tinha");
            if (colunas.Count > 0)
            {
                _sistema.Disassociate("systemuser", usuario, new Relationship("systemuserprofiles_association"),
                    new EntityReferenceCollection(colunas.Select(p => new EntityReference("fieldsecurityprofile", p.Id)).ToList()));
                etapas.Feita("perfisColuna", colunas.Count + " retirado(s)");
            }
            else etapas.Pulada("perfisColuna", "não tinha");
            foreach (var equipe in equipes)
                _sistema.Execute(new RemoveMembersTeamRequest { TeamId = equipe.Id, MemberIds = new[] { usuario } });
            if (equipes.Count > 0) etapas.Feita("equipes", equipes.Count + " retirada(s)");
            else etapas.Pulada("equipes", "sem equipe com papel");

            CicloAdministrativo.Historico(_sistema, alvo, chamador, antes, "[]", amplo);
            etapas.Feita("historico", "gravado");

            if (bloqueado) etapas.Pulada("bloqueio", "já bloqueado");
            else { new UsuarioDataverseRepository(_sistema).Bloquear(usuario); etapas.Feita("bloqueio", "bloqueado no Dataverse"); }

            Conferir(etapas, usuario);
            return etapas;
        }
        catch (AcessoException erro) { erro.Data["Etapas"] = etapas.ToJson(); throw; }
    }

    /// <summary>Relê. O que sobrou vira a etapa "conferencia" em erro, sem exceção (exceção desfaria o encerramento inteiro).
    /// Equipes: todas as que ainda dão papel, inclusive as que o encerrar não mexe (Entra e padrão).</summary>
    private void Conferir(Etapas etapas, Guid usuario)
    {
        var faltas = new List<string>();
        try
        {
            var papeis = PapeisDoUsuario.IdsDiretos(_sistema, usuario);
            if (papeis.Count > 0) faltas.Add("papéis diretos: " + string.Join(", ", papeis.Select(id => PapeisDoUsuario.NomeDoPapel(_sistema, id) ?? id.ToString())));
            var colunas = PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid");
            if (colunas.Count > 0) faltas.Add("perfis de coluna: " + string.Join(", ", colunas.Select(id => CicloAdministrativo.NomeDe(_sistema, "fieldsecurityprofile", id) ?? id.ToString())));
            foreach (var id in PapeisDoUsuario.Ids(_sistema, "teammembership", "systemuserid", usuario, "teamid").Distinct())
            {
                if (PapeisDoUsuario.Ids(_sistema, "teamroles", "teamid", id, "roleid").Count == 0) continue;
                var equipe = CicloAdministrativo.Equipe(_sistema, id);
                var motivo = equipe == null ? null : CicloAdministrativo.MotivoEquipeIntocavel(equipe);
                faltas.Add("ainda recebe papel pela equipe " + (equipe?.GetAttributeValue<string>("name") ?? id.ToString()) + (motivo == null ? "" : " (" + motivo + ")"));
            }
            if (!CicloAdministrativo.Alvo(_sistema, usuario).GetAttributeValue<bool>("isdisabled")) faltas.Add("usuário ainda habilitado");
        }
        catch (Exception erro) { faltas = new List<string> { "não foi possível conferir (" + erro.Message + ")" }; }
        if (faltas.Count == 0) etapas.Feita("conferencia", "acesso retirado");
        else etapas.Erro("conferencia", string.Join("; ", faltas));
    }
}
