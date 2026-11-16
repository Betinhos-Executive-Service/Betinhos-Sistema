using System;
using System.Globalization;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Uma despesa da categoria Manutenção por manutenção, com os mesmos campos que o App gravava (expenses.payload.ts).</summary>
public sealed class DespesaManutencao
{
    readonly IOrganizationService _service;
    public DespesaManutencao(IOrganizationService service) => _service = service;

    public (Guid Id, int StatusAnexo) Garantir(Guid manutencaoId, EntityReference veiculo, EntityReference motorista, ConcluirPedido p, DateTime dataUtc)
    {
        var categoria = PorNome(D.TabelaCategoria, n => n.Contains("manutencao")) ?? throw Ciclo.Erro("Categoria de despesa \"Manutenção\" não encontrada.");
        var nomesForma = NomesForma(p.Pagamento).Select(Normalizar).ToArray();
        var forma = PorNome(D.TabelaForma, n => nomesForma.Contains(n)) ?? throw Ciclo.Erro("Forma de pagamento da despesa não encontrada: " + NomesForma(p.Pagamento)[0] + ".");

        var dados = new Entity(D.Tabela)
        {
            [D.Nome] = categoria.GetAttributeValue<string>(D.Nome) + " - " + DataBrasilia(dataUtc).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            [D.DataGasto] = dataUtc,
            [D.Valor] = new Money(p.Valor),
            [D.Observacao] = string.IsNullOrWhiteSpace(p.Comentario) ? "Sem comentarios." : p.Comentario!.Trim(),
            [D.Estabelecimento] = p.Estabelecimento.Trim(),
            [D.Motorista] = motorista,
            [D.Categoria] = categoria.ToEntityReference(),
            [D.Forma] = forma.ToEntityReference(),
            [D.Cidade] = new EntityReference(D.TabelaCidade, Guid.Parse(p.CidadeId)),
            [D.Veiculo] = veiculo,
            [D.Manutencao] = new EntityReference(M.Tabela, manutencaoId),
        };

        var existente = Existente(manutencaoId);
        if (existente is null)
        {
            dados[D.StatusOperacional] = new OptionSetValue(D.StatusInicial);
            dados[D.StatusFinanceiro] = new OptionSetValue(D.StatusInicial);
            dados[D.StatusAnexo] = new OptionSetValue(D.AnexoPendente);
            dados[D.Origem] = new OptionSetValue(D.OrigemApp);
            return (_service.Create(dados), D.AnexoPendente);
        }
        dados.Id = existente.Id;
        _service.Update(dados);
        return (existente.Id, existente.GetAttributeValue<OptionSetValue>(D.StatusAnexo)?.Value ?? D.AnexoPendente);
    }

    /// <summary>Mesmos nomes do App (mapMaintenancePaymentToExpensePaymentNames), com Dinheiro como reembolso.</summary>
    public static string[] NomesForma(int pagamento) => pagamento switch
    {
        M.PagamentoPedidoCompra => new[] { "Faturado (Plano mensal)", "Faturado" },
        M.PagamentoPix or M.PagamentoDinheiro => new[] { "Particular (Reembolso)", "Particular" },
        _ => new[] { "Cartao de credito", "Cartão de crédito" },
    };

    Entity? Existente(Guid manutencaoId)
    {
        var query = new QueryExpression(D.Tabela) { ColumnSet = new ColumnSet(D.StatusAnexo), TopCount = 1 };
        query.Criteria.AddCondition(D.Manutencao, ConditionOperator.Equal, manutencaoId);
        return _service.RetrieveMultiple(query).Entities.FirstOrDefault();
    }

    Entity? PorNome(string tabela, Func<string, bool> aceita)
    {
        var linhas = _service.RetrieveMultiple(new QueryExpression(tabela) { ColumnSet = new ColumnSet(D.Nome) }).Entities;
        return linhas.FirstOrDefault(l => aceita(Normalizar(l.GetAttributeValue<string>(D.Nome) ?? "")));
    }

    static DateTime DataBrasilia(DateTime utc) => utc.AddHours(-3);

    public static string Normalizar(string texto)
    {
        var decomposto = texto.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in decomposto)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC).Trim().ToLowerInvariant();
    }
}
