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

    MemoriaService Base(int status, Entity? linha = null, string? notaNoRegistro = null, params Entity[] antes)
    {
        var memoria = new MemoriaService().Com(antes).Com(
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

    [Fact]
    public void Reenviar_com_valor_diferente_nao_altera_despesa_nem_manutencao()
    {
        var memoria = Base(M.Programado, Linha());
        var primeira = Servico(memoria).Concluir(Pedido());
        var despesaAntes = memoria.Linha(D.Tabela, Guid.Parse(primeira.DespesaId)).GetAttributeValue<Money>(D.Valor).Value;
        var atualizadosAntes = memoria.Atualizados.Count;

        var segunda = Servico(memoria).Concluir(Pedido(p => { p.Valor = 999m; p.Estabelecimento = "Outra oficina"; p.Pagamento = M.PagamentoPix; p.Comentario = "Outro texto"; }));

        Assert.Equal(primeira.DespesaId, segunda.DespesaId);
        Assert.Equal(despesaAntes, memoria.Linha(D.Tabela, Guid.Parse(segunda.DespesaId)).GetAttributeValue<Money>(D.Valor).Value);
        Assert.Equal(_cartao, memoria.Linha(D.Tabela, Guid.Parse(segunda.DespesaId)).GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal(380.50m, memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<Money>(M.Valor).Value);
        Assert.Equal("Auto Center Centro", memoria.Linha(M.Tabela, _manutencaoId).GetAttributeValue<string>(M.Estabelecimento));
        Assert.Equal(atualizadosAntes, memoria.Atualizados.Count); // nenhuma gravação nova
    }

    [Fact]
    public void Reparo_sem_despesa_cria_com_os_valores_gravados_na_manutencao()
    {
        var memoria = Base(M.Realizado);
        var m = memoria.Linha(M.Tabela, _manutencaoId);
        m[M.Valor] = new Money(250m);
        m[M.Pagamento] = new OptionSetValue(M.PagamentoDinheiro);
        m[M.Estabelecimento] = "Oficina do Zé";
        m[M.DataManutencao] = new DateTime(2026, 11, 10, 15, 0, 0, DateTimeKind.Utc);
        m[M.ComentarioColaborador] = "Trocou as pastilhas";
        var gravadosAntes = memoria.Atualizados.Count;

        Servico(memoria).Concluir(Pedido(p => { p.Valor = 999m; p.Pagamento = M.PagamentoCartao; p.Estabelecimento = "Outra"; p.Data = "2026-11-18T14:30:00Z"; p.Comentario = "Novo"; }));

        var despesa = memoria.Todas(D.Tabela).Single();
        Assert.Equal(250m, despesa.GetAttributeValue<Money>(D.Valor).Value);
        Assert.Equal(_particular, despesa.GetAttributeValue<EntityReference>(D.Forma).Id);
        Assert.Equal("Oficina do Zé", despesa.GetAttributeValue<string>(D.Estabelecimento));
        Assert.Equal(new DateTime(2026, 11, 10, 15, 0, 0, DateTimeKind.Utc), despesa.GetAttributeValue<DateTime>(D.DataGasto));
        Assert.Equal("Manutenção - 10/11/2026", despesa.GetAttributeValue<string>(D.Nome));
        Assert.Equal("Trocou as pastilhas", despesa.GetAttributeValue<string>(D.Observacao));
        Assert.Equal(gravadosAntes, memoria.Atualizados.Count); // a manutenção não é regravada
    }

    [Fact]
    public void Categoria_inativa_com_o_mesmo_nome_e_ignorada()
    {
        var inativa = new Entity(D.TabelaCategoria, Guid.NewGuid()) { [D.Nome] = "Manutenção", ["statecode"] = new OptionSetValue(1) };
        var memoria = Base(M.Programado, null, null, inativa);

        Servico(memoria).Concluir(Pedido());

        Assert.Equal(_categoriaManutencao, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Categoria).Id);
    }

    [Fact]
    public void Manutencao_preventiva_nao_vence_a_categoria_Manutencao()
    {
        var preventiva = new Entity(D.TabelaCategoria, Guid.NewGuid()) { [D.Nome] = "Manutenção preventiva" };
        var memoria = Base(M.Programado, null, null, preventiva);

        Servico(memoria).Concluir(Pedido());

        Assert.Equal(_categoriaManutencao, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Categoria).Id);
    }

    [Fact]
    public void Sem_nome_exato_vale_a_unica_categoria_que_contem_manutencao()
    {
        var memoria = Base(M.Programado);
        memoria.Linha(D.TabelaCategoria, _categoriaManutencao)[D.Nome] = "Despesas de Manutenção";

        Servico(memoria).Concluir(Pedido());

        Assert.Equal(_categoriaManutencao, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Categoria).Id);
    }

    [Fact]
    public void Sem_nome_exato_e_com_duas_parecidas_nao_chuta()
    {
        var memoria = Base(M.Programado);
        memoria.Linha(D.TabelaCategoria, _categoriaManutencao)[D.Nome] = "Manutenção preventiva";
        memoria.Com(new Entity(D.TabelaCategoria, Guid.NewGuid()) { [D.Nome] = "Manutenção corretiva" });

        var erro = Assert.Throws<InvalidPluginExecutionException>(() => Servico(memoria).Concluir(Pedido()));
        Assert.Contains("Categoria de despesa", erro.Message);
        Assert.Empty(memoria.Todas(D.Tabela));
    }

    [Fact]
    public void Forma_inativa_com_o_mesmo_nome_e_ignorada()
    {
        var inativa = new Entity(D.TabelaForma, Guid.NewGuid()) { [D.Nome] = "Cartão de crédito", ["statecode"] = new OptionSetValue(1) };
        var memoria = Base(M.Programado, null, null, inativa);

        Servico(memoria).Concluir(Pedido());

        Assert.Equal(_cartao, memoria.Todas(D.Tabela).Single().GetAttributeValue<EntityReference>(D.Forma).Id);
    }
}
