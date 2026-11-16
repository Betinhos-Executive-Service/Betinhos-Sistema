using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin.Manutencao;

public sealed partial class ManutencaoService
{
    /// <summary>
    /// Caminho único para Realizado (App e shell). Roda na transação da Custom API: despesa, manutenção e linha
    /// entram juntas ou nada entra. Repetir é seguro: com a manutenção já Realizada, só garante despesa e linha.
    /// </summary>
    public ConcluirResposta Concluir(ConcluirPedido p)
    {
        var id = Id(p.ManutencaoId);
        Ciclo.ValidarConclusao(p);
        var m = _service.Retrieve(M.Tabela, id, new ColumnSet(M.Status, M.Veiculo, M.LinkNotaFiscal));
        var status = Status(m);
        var veiculo = m.GetAttributeValue<EntityReference>(M.Veiculo) ?? throw Ciclo.Erro("A manutenção não tem veículo.");
        var realizadoPor = new EntityReference("cr40f_funcionarios", Guid.Parse(p.RealizadoPorId));
        var data = Ciclo.LerDataHora(p.Data);
        var jaRealizada = status == M.Realizado;

        if (!jaRealizada)
        {
            Ciclo.ExigirConcluivel(status);
            var nota = string.IsNullOrWhiteSpace(p.LinkNotaFiscal) ? m.GetAttributeValue<string>(M.LinkNotaFiscal) : p.LinkNotaFiscal;
            if (string.IsNullOrWhiteSpace(nota)) throw Ciclo.Erro("Falta a foto da nota fiscal.");
        }

        var linha = LinhaGeral.AtivaOuConcluida(_service, id);
        var despesa = new DespesaManutencao(_service).Garantir(id, veiculo, realizadoPor, p, data);
        if (!jaRealizada) _service.Update(Conclusao(id, p, data, realizadoPor));
        if (linha is not null && Status(linha, G.Status) != G.StatusConcluido)
        {
            _service.Update(new Entity(G.Tabela, linha.Id)
            {
                [G.Status] = new OptionSetValue(G.StatusConcluido),
                [G.DataFinalizacao] = data,
                [G.ObservacaoFinal] = p.Comentario?.Trim() ?? "",
            });
        }
        return new ConcluirResposta { DespesaId = despesa.Id.ToString(), StatusAnexo = despesa.StatusAnexo, GeralId = linha?.Id.ToString() };
    }

    static Entity Conclusao(Guid id, ConcluirPedido p, DateTime data, EntityReference realizadoPor)
    {
        var e = new Entity(M.Tabela, id)
        {
            [M.Status] = new OptionSetValue(M.Realizado),
            [M.DataManutencao] = data,
            [M.KmRealizado] = p.Km,
            [M.Valor] = new Money(p.Valor),
            [M.Pagamento] = new OptionSetValue(p.Pagamento),
            [M.Estabelecimento] = p.Estabelecimento.Trim(),
            [M.RealizadoPor] = realizadoPor,
            [M.Servicos] = new OptionSetValueCollection(p.Servicos.Distinct().Select(s => new OptionSetValue(s)).ToList()),
            [M.Categorias] = new OptionSetValueCollection(Catalogo.Categorias(p.Servicos).Select(c => new OptionSetValue(c)).ToList()),
            [M.Origem] = new OptionSetValue(M.OrigemManual),
        };
        if (!string.IsNullOrWhiteSpace(p.ServicoRealizado)) e[M.ServicoRealizado] = p.ServicoRealizado!.Trim();
        if (!string.IsNullOrWhiteSpace(p.Comentario)) e[M.ComentarioColaborador] = p.Comentario!.Trim();
        if (!string.IsNullOrWhiteSpace(p.LinkNotaFiscal)) e[M.LinkNotaFiscal] = p.LinkNotaFiscal;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal1)) e[M.LinkFotoFinal1] = p.LinkFotoFinal1;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal2)) e[M.LinkFotoFinal2] = p.LinkFotoFinal2;
        if (!string.IsNullOrWhiteSpace(p.LinkFotoFinal3)) e[M.LinkFotoFinal3] = p.LinkFotoFinal3;
        return e;
    }
}
