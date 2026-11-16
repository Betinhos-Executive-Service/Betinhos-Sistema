using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>A linha da Geral guarda só a programação da manutenção (quando e quem). No máximo uma ativa por manutenção.</summary>
public static class LinhaGeral
{
    static readonly string[] Colunas = { G.Status, G.Motorista, G.Veiculo, G.Saida, G.FoiProgramado, G.Categoria, G.Manutencao };

    public static Entity? Ativa(IOrganizationService service, Guid manutencaoId)
    {
        var query = new QueryExpression(G.Tabela) { ColumnSet = new ColumnSet(Colunas), TopCount = 3 };
        query.Criteria.AddCondition(G.Manutencao, ConditionOperator.Equal, manutencaoId);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition(G.Status, ConditionOperator.NotIn, G.StatusCancelado, G.StatusCanceladoComReservas);
        var linhas = service.RetrieveMultiple(query).Entities;
        if (linhas.Count > 1) throw Ciclo.Erro("Esta manutenção tem mais de uma linha ativa na Geral. Cancele as duplicadas antes de continuar.");
        return linhas.FirstOrDefault();
    }

    /// <summary>Como Ativa, mas a linha já concluída também conta (Concluir repetido). Não filtra statecode: a concluída pode estar inativa.</summary>
    public static Entity? AtivaOuConcluida(IOrganizationService service, Guid manutencaoId)
    {
        var query = new QueryExpression(G.Tabela) { ColumnSet = new ColumnSet(Colunas), TopCount = 3 };
        query.Criteria.AddCondition(G.Manutencao, ConditionOperator.Equal, manutencaoId);
        query.Criteria.AddCondition(G.Status, ConditionOperator.NotIn, G.StatusCancelado, G.StatusCanceladoComReservas);
        var linhas = service.RetrieveMultiple(query).Entities;
        if (linhas.Count > 1) throw Ciclo.Erro("Esta manutenção tem mais de uma linha ativa na Geral. Cancele as duplicadas antes de continuar.");
        return linhas.FirstOrDefault();
    }

    /// <summary>
    /// Linha encaixada e ainda não programada: sem motorista (a operação escolhe) e saída no início da janela.
    /// Os campos fixos são os que o flow antigo gravava; as observações só entram quando preenchidas.
    /// </summary>
    public static Entity Nova(Guid manutencaoId, EntityReference veiculo, DateTime saidaUtc, string? comentarioMotorista, string? comentarioInterno)
    {
        var linha = new Entity(G.Tabela)
        {
            [G.Categoria] = new OptionSetValue(G.CategoriaManutencao),
            [G.Manutencao] = new EntityReference(M.Tabela, manutencaoId),
            [G.Veiculo] = veiculo,
            [G.Saida] = saidaUtc,
            [G.Status] = new OptionSetValue(G.StatusAProgramar),
            [G.FoiProgramado] = false,
            [G.StatusFaturamento] = new OptionSetValue(G.NaoFaturavel),
            [G.TipoVeiculo] = new OptionSetValue(G.TipoVeiculoBasico),
            [G.TipoServico] = new OptionSetValue(G.TipoServicoManutencao),
            [G.Destino] = G.TextoManutencao,
            [G.EnderecoSaida] = G.TextoManutencao,
            [G.Passageiros] = G.TextoManutencao,
            [G.Perfil] = G.TextoManutencao,
            [G.ObsFaturamento] = G.TextoManutencao,
            [G.Trajeto] = G.TextoTrajeto,
        };
        if (!string.IsNullOrWhiteSpace(comentarioMotorista)) linha[G.ObsOperacao] = comentarioMotorista!.Trim();
        if (!string.IsNullOrWhiteSpace(comentarioInterno)) linha[G.ObsInterna] = comentarioInterno!.Trim();
        return linha;
    }

    /// <summary>Reagendamento: volta a "a programar" e tira o motorista (o DriverNoticePlugin avisa quem saiu).</summary>
    public static Entity Reabrir(Guid geralId, EntityReference veiculo, DateTime saidaUtc, string? comentarioMotorista)
    {
        var linha = new Entity(G.Tabela, geralId)
        {
            [G.Veiculo] = veiculo,
            [G.Saida] = saidaUtc,
            [G.Motorista] = null,
            [G.Status] = new OptionSetValue(G.StatusAProgramar),
            [G.FoiProgramado] = false,
        };
        if (!string.IsNullOrWhiteSpace(comentarioMotorista)) linha[G.ObsOperacao] = comentarioMotorista!.Trim();
        return linha;
    }

    public static Entity Cancelar(Guid geralId) => new(G.Tabela, geralId) { [G.Status] = new OptionSetValue(G.StatusCancelado) };
}
