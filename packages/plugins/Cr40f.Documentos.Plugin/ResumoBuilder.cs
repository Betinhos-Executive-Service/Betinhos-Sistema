using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Cr40f.Documentos.Plugin;

/// <summary>Porta de montarPendencias/indexarVigentes (apps/shell/src/pages/documentos/domain/pendencias.ts).</summary>
public static class ResumoBuilder
{
    private static readonly string[] Ordem = { Status.Vencido, Status.Vence7, Status.Faltando, Status.Vence30, Status.Vence60 };
    private static readonly HashSet<string> EmAlerta = new() { Status.Vencido, Status.Vence7, Status.Vence30, Status.Vence60 };
    private static readonly HashSet<string> Urgente = new() { Status.Vencido, Status.Vence7, Status.Faltando };
    private static readonly CompareInfo PtBr = CultureInfo.GetCultureInfo("pt-BR").CompareInfo;

    private static string Chave(string donoId, string tipoId) => donoId + "|" + tipoId;

    public static bool IsObrigatorio(TipoDoc tipo, Dono dono) =>
        dono.ObrigKey.HasValue && tipo.ObrigatorioPara.Contains(dono.ObrigKey.Value);

    /// <summary>Vigente por dono+tipo; com dois vigentes vale o de maior validade (ou emissão), depois o modificado mais recente.</summary>
    public static Dictionary<string, DocEmitido> IndexarVigentes(IEnumerable<DocEmitido> docs)
    {
        var mapa = new Dictionary<string, DocEmitido>();
        var ordenados = docs
            .Where(d => d.Situacao == "vigente")
            .OrderByDescending(d => d.Validade ?? d.Emissao ?? "", StringComparer.Ordinal)
            .ThenByDescending(d => d.ModificadoEm ?? "", StringComparer.Ordinal);
        foreach (var doc in ordenados)
        {
            var chave = Chave(doc.DonoId, doc.TipoId);
            if (!mapa.ContainsKey(chave)) mapa[chave] = doc;
        }
        return mapa;
    }

    public static List<Pendencia> MontarPendencias(IList<TipoDoc> tipos, IList<Dono> donos, IList<DocEmitido> docs, string hoje)
    {
        var vigentes = IndexarVigentes(docs);
        var lista = new List<Pendencia>();
        foreach (var dono in donos)
        {
            if (!dono.Ativo) continue;
            foreach (var tipo in tipos)
            {
                if (!tipo.Ativo || tipo.Categoria != dono.Categoria) continue;
                if (!vigentes.TryGetValue(Chave(dono.Id, tipo.Id), out var doc))
                {
                    if (IsObrigatorio(tipo, dono)) lista.Add(new Pendencia(dono, tipo, null, Status.Faltando, null));
                    continue;
                }
                var estado = Vencimento.EstadoDe(doc.Validade, hoje, tipo.TemValidade);
                if (EmAlerta.Contains(estado.Status)) lista.Add(new Pendencia(dono, tipo, doc, estado.Status, estado.Dias));
            }
        }
        // OrderBy é estável, como o sort do JavaScript.
        return lista.OrderBy(p => p, Comparer<Pendencia>.Create(Comparar)).ToList();
    }

    public static Resumo Montar(IList<TipoDoc> tipos, IList<Dono> donos, IList<DocEmitido> docs, string hoje)
    {
        var pendencias = MontarPendencias(tipos, donos, docs, hoje);
        var resumo = new Resumo { Hoje = hoje };
        foreach (var categoria in Categorias.Todas)
        {
            var daCategoria = pendencias.Where(p => p.Dono.Categoria == categoria).ToList();
            resumo.Categorias.Add(new ResumoCategoria
            {
                Categoria = categoria,
                Contagens = new Contagens
                {
                    Vencido = daCategoria.Count(p => p.Estado == Status.Vencido),
                    Vence7 = daCategoria.Count(p => p.Estado == Status.Vence7),
                    Vence30 = daCategoria.Count(p => p.Estado == Status.Vence30),
                    Vence60 = daCategoria.Count(p => p.Estado == Status.Vence60),
                    Faltando = daCategoria.Count(p => p.Estado == Status.Faltando),
                },
                Urgentes = daCategoria.Where(p => Urgente.Contains(p.Estado)).Select(p => new ItemUrgente
                {
                    Dono = p.Dono.Nome,
                    Detalhe = p.Dono.Detalhe,
                    Tipo = p.Tipo.Nome,
                    Validade = p.Doc?.Validade,
                    Estado = p.Estado,
                    Dias = p.Dias,
                }).ToList(),
            });
        }
        return resumo;
    }

    private static int Comparar(Pendencia a, Pendencia b)
    {
        var c = Array.IndexOf(Ordem, a.Estado).CompareTo(Array.IndexOf(Ordem, b.Estado));
        if (c != 0) return c;
        c = (a.Dias ?? 0).CompareTo(b.Dias ?? 0);
        if (c != 0) return c;
        c = PtBr.Compare(a.Dono.Nome, b.Dono.Nome);
        if (c != 0) return c;
        c = a.Tipo.Ordem.CompareTo(b.Tipo.Ordem);
        return c != 0 ? c : PtBr.Compare(a.Tipo.Nome, b.Tipo.Nome);
    }
}
