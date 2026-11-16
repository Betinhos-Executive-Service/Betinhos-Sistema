using System;
using System.Linq;
using Cr40f.Frota.Plugin.Manutencao;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

public class ConcluirTests
{
    readonly Guid _manutencaoId = Guid.NewGuid();
    readonly EntityReference _veiculo = new("cr40f_veiculos", Guid.NewGuid());
    readonly Guid _categoriaManutencao = Guid.NewGuid();
    readonly Guid _cartao = Guid.NewGuid();
    readonly Guid _particular = Guid.NewGuid();

    MemoriaService Base(int status, Entity? linha = null, string? notaNoRegistro = null)
    {
        var memoria = new MemoriaService().Com(
            new Entity(M.Tabela, _manutencaoId) { [M.Status] = new OptionSetValue(status), [M.Veiculo] = _veiculo, [M.LinkNotaFiscal] = notaNoRegistro },
            new Entity(D.TabelaCategoria, Guid.NewGuid()) { [D.Nome] = "Combustível" },
            new Entity(D.TabelaCategoria, _categoriaManutencao) { [D.Nome] = "Manutenção" },
            new Entity(D.TabelaForma, _cartao) { [D.Nome] = "Cartão de crédito" },
            new Entity(D.TabelaForma, _particular) { [D.Nome] = "Particular (Reembolso)" });
        if (linha is not null) memoria.Com(linha);
        return memoria;
    }

    Entity Linha() => new(G.Tabela, Guid.NewGuid())
    {
        [G.Manutencao] = new EntityReference(M.Tabela, _manutencaoId),
        [G.Status] = new OptionSetValue(G.StatusProgramado),
        [G.Motorista] = new EntityReference("cr40f_funcionarios", Guid.NewGuid()),
        ["statecode"] = new OptionSetValue(0),
    };

    ConcluirPedido Pedido(Action<ConcluirPedido>? mudar = null)
    {
        var p = CicloTests.PedidoValido();
        p.ManutencaoId = _manutencaoId.ToString();
        p.Servicos = new[] { 100000007, 100000014 }; // pastilhas (Freios) + alinhamento (Pneus e rodas)
        mudar?.Invoke(p);
        return p;
    }

    static ManutencaoService Servico(MemoriaService m) => new(m, () => DateTime.UtcNow);

    [Fact]
    public void Conclui_manutencao_cria_despesa_e_conclui_a_linha()
    {
        var linha = Linha();
        var memoria = Base(M.Programado, linha);

        var resposta = Servico(memoria).Concluir(Pedido());

        var m = memoria.Linha(M.Tabela, _manutencaoId);
        Assert.Equal(M.Realizado, m.GetAttributeValue<OptionSetValue>(M.Status).Value);
        Assert.Equal(new[] { 100000007, 100000014 }, m.GetAttributeValue<OptionSetValueCollection>(M.Servicos).Select(o => o.Value));
        Assert.Equal(new[] { 100000001, 100000002 }, m.GetAttributeValue<OptionSetValueCollection>(M.Categorias).Select(o => o.Value).OrderBy(v => v));
        Assert.Equal(M.OrigemManual, m.GetAttributeValue<OptionSetValue>(M.Origem).Value);
        Assert.Equal(85200, m.GetAttributeValue<int>(M.KmRealizado));
        Assert.Equal(380.50m, m.GetAttributeValue<Money>(M.Valor).Value);
        Assert.Equal(M.PagamentoCartao, m.GetAttributeValue<OptionSetValue>(M.Pagamento).Value);
        Assert.Equal("https://sharepoint/nota.jpg", m.GetAttributeValue<string>(M.LinkNotaFiscal));

        var despesa = memoria.Todas(D.Tabela).Single();
        Assert.Equal(resposta.DespesaId, despesa.Id.ToString());
        Assert.Equal(_categoriaManutencao, despesa.GetAttributeValue<EntityReference>(D.Categoria).Id);
        Assert.Equal(_cartao, despesa.GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal(_manutencaoId, despesa.GetAttributeValue<EntityReference>(D.Manutencao).Id);
        Assert.Equal(_veiculo.Id, despesa.GetAttributeValue<EntityReference>(D.Veiculo).Id);
        Assert.Equal(D.AnexoPendente, resposta.StatusAnexo);

        Assert.Equal(G.StatusConcluido, memoria.Linha(G.Tabela, linha.Id).GetAttributeValue<OptionSetValue>(G.Status).Value);
        Assert.Equal(linha.Id.ToString(), resposta.GeralId);
    }

    [Fact]
    public void Despesa_nova_leva_todos_os_campos_obrigatorios_do_Dataverse()
    {
        var memoria = Base(M.Programado, Linha());
        var p = Pedido();

        Servico(memoria).Concluir(p);

        var despesa = memoria.Todas(D.Tabela).Single();
        Assert.Equal("Manutenção - 18/11/2026", despesa.GetAttributeValue<string>(D.Nome));
        Assert.Equal(new DateTime(2026, 11, 18, 14, 30, 0, DateTimeKind.Utc), despesa.GetAttributeValue<DateTime>(D.DataGasto));
        Assert.Equal(p.Valor, despesa.GetAttributeValue<Money>(D.Valor).Value);
        Assert.Equal(p.RealizadoPorId, despesa.GetAttributeValue<EntityReference>(D.Motorista).Id.ToString());
        Assert.Equal(D.StatusInicial, despesa.GetAttributeValue<OptionSetValue>(D.StatusOperacional).Value);
        Assert.Equal(D.StatusInicial, despesa.GetAttributeValue<OptionSetValue>(D.StatusFinanceiro).Value);
        Assert.Equal(D.OrigemApp, despesa.GetAttributeValue<OptionSetValue>(D.Origem).Value);
        Assert.Equal(100000000, despesa.GetAttributeValue<OptionSetValue>(D.Origem).Value);
        Assert.Equal(p.CidadeId, despesa.GetAttributeValue<EntityReference>(D.Cidade).Id.ToString());
        Assert.Equal("Auto Center Centro", despesa.GetAttributeValue<string>(D.Estabelecimento));
    }

    [Fact]
    public void Repetir_nao_duplica_despesa_e_preserva_o_anexo_enviado()
    {
        var memoria = Base(M.Agendado, Linha());
        var primeira = Servico(memoria).Concluir(Pedido());
        memoria.Update(new Entity(D.Tabela, Guid.Parse(primeira.DespesaId)) { [D.StatusAnexo] = new OptionSetValue(D.AnexoEnviado) });

        var segunda = Servico(memoria).Concluir(Pedido());

        Assert.Single(memoria.Todas(D.Tabela));
        Assert.Equal(primeira.DespesaId, segunda.DespesaId);
        Assert.Equal(D.AnexoEnviado, segunda.StatusAnexo);
    }

    [Fact]
    public void Dinheiro_vira_Particular_na_despesa()
    {
        var memoria = Base(M.Programado);
        Servico(memoria).Concluir(Pedido(p => p.Pagamento = M.PagamentoDinheiro));
        Assert.Equal(_particular, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal(M.PagamentoDinheiro, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Pagamento).Value);
    }

    [Fact]
    public void Sem_nota_fiscal_nao_conclui()
    {
        var memoria = Base(M.Programado);
        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Concluir(Pedido(p => p.LinkNotaFiscal = null)));
        Assert.Contains("nota fiscal", erro.Message);
        Assert.Empty(memoria.Criados);
    }

    [Fact]
    public void Nota_ja_gravada_no_registro_vale()
    {
        var memoria = Base(M.Programado, notaNoRegistro: "https://sharepoint/antes.jpg");
        Servico(memoria).Concluir(Pedido(p => p.LinkNotaFiscal = null));
        Assert.Equal(M.Realizado, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<OptionSetValue>(M.Status).Value);
    }

    [Fact]
    public void Sem_linha_na_Geral_conclui_mesmo_assim()
    {
        var memoria = Base(M.Solicitado); // escritório lançando depois do fato
        var resposta = Servico(memoria).Concluir(Pedido());
        Assert.Null(resposta.GeralId);
        Assert.Single(memoria.Todas(D.Tabela));
    }

    [Fact]
    public void Cancelada_nao_conclui()
    {
        var memoria = Base(M.Cancelado);
        Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Concluir(Pedido()));
    }

    [Fact]
    public void Grava_a_manutencao_antes_da_linha()
    {
        var memoria = Base(M.Programado, Linha());
        Servico(memoria).Concluir(Pedido());
        var ordem = memoria.Atualizados.Select(e => e.LogicalName).Where(n => n is M.Tabela or G.Tabela).ToList();
        Assert.True(ordem.IndexOf(M.Tabela) < ordem.IndexOf(G.Tabela));
    }
}
