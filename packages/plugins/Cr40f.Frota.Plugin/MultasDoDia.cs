using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;

namespace Cr40f.Frota.Plugin;

[DataContract]
public sealed class LinhaMultaDia
{
    [DataMember(Name = "id", Order = 1)] public string Id { get; set; } = "";
    [DataMember(Name = "auto", Order = 2)] public string Auto { get; set; } = "";
    [DataMember(Name = "placa", Order = 3)] public string? Placa { get; set; }
    [DataMember(Name = "responsavel", Order = 4)] public string Responsavel { get; set; } = "";
    [DataMember(Name = "prazo", Order = 5)] public string? Prazo { get; set; }
    [DataMember(Name = "passo", Order = 6)] public string Passo { get; set; } = "";
}

[DataContract]
public sealed class MultasDoDiaResultado
{
    [DataMember(Name = "hoje", Order = 1)] public string Hoje { get; set; } = "";
    [DataMember(Name = "total", Order = 2)] public int Total { get; set; }
    [DataMember(Name = "prazoVencido", Order = 3)] public List<LinhaMultaDia> PrazoVencido { get; set; } = new();
    [DataMember(Name = "indicar", Order = 4)] public List<LinhaMultaDia> Indicar { get; set; } = new();
    [DataMember(Name = "aceite", Order = 5)] public List<LinhaMultaDia> Aceite { get; set; } = new();
    [DataMember(Name = "pagar", Order = 6)] public List<LinhaMultaDia> Pagar { get; set; } = new();
    [DataMember(Name = "aguardandoAcerto", Order = 7)] public int AguardandoAcerto { get; set; }
}

/// <summary>Seções do e-mail "Multas de hoje" (spec §6), com as regras de MultaEtapas. Cada multa entra numa seção só. Etapas 1 e 2 sem prazo informado ficam no fim de "Indicar".
/// "Pagar com 40%" inclui as guias já vencidas (dias &lt;= 5, inclusive negativos): nunca perder prazo.</summary>
public static class MultasDoDia
{
    public static MultasDoDiaResultado Montar(IEnumerable<MultaResumo> multas, string hoje)
    {
        var r = new MultasDoDiaResultado { Hoje = hoje };
        foreach (var m in multas)
        {
            var e = m.Estado;
            var s = MultaEtapas.Avaliar(e, hoje);
            var prazoPassado = e.DataParaIndicar != null && string.CompareOrdinal(e.DataParaIndicar, hoje) < 0;
            if (s.PrazoVencido) r.PrazoVencido.Add(Linha(m, s, prazoPassado));
            else if (s.Etapa == MultaEtapas.Indicar && MultaEtapas.AceitePendente(e) && (prazoPassado || Regras.Dias(e.DataIndicacao!, hoje) >= 2))
                r.Aceite.Add(Linha(m, s, prazoPassado));
            else if ((s.Etapa == MultaEtapas.Identificar || s.Etapa == MultaEtapas.Indicar) && (e.DataParaIndicar == null || Regras.Dias(hoje, e.DataParaIndicar) <= 7))
                r.Indicar.Add(Linha(m, s, prazoPassado));
            else if (s.Etapa == MultaEtapas.Pagar && e.Vencimento != null && Regras.Dias(hoje, e.Vencimento) <= 5)
                r.Pagar.Add(Linha(m, s, prazoPassado));
            else if (s.Etapa == MultaEtapas.Acertar && !s.Descontando) r.AguardandoAcerto++; // descontando em folha: nada para a Frota fazer
        }
        foreach (var lista in new[] { r.PrazoVencido, r.Indicar, r.Aceite, r.Pagar })
            lista.Sort((a, b) =>
            {
                var c = string.CompareOrdinal(a.Prazo ?? "9999", b.Prazo ?? "9999");
                return c != 0 ? c : string.CompareOrdinal(a.Auto, b.Auto);
            });
        r.Total = r.PrazoVencido.Count + r.Indicar.Count + r.Aceite.Count + r.Pagar.Count + r.AguardandoAcerto;
        return r;
    }

    private static LinhaMultaDia Linha(MultaResumo m, MultaSituacao s, bool prazoPassado) => new()
    {
        Id = m.Id.ToString("D"),
        Auto = m.Auto,
        Placa = m.Placa,
        Responsavel = MultaEtapas.ResponsavelEfetivo(m.Estado) == MultaCodigos.Empresa ? "Empresa" : m.Motorista ?? "Sem responsável",
        Prazo = s.ProximoPrazo,
        Passo = PassoDaLinha(s, prazoPassado),
    };

    /// <summary>Nunca deixa a linha sem passo (multa na etapa sem pendência) nem esconde a falta do prazo.</summary>
    private static string PassoDaLinha(MultaSituacao s, bool prazoPassado)
    {
        var passo = string.IsNullOrEmpty(s.ProximoPasso) ? "Conferir a etapa" : s.ProximoPasso;
        // Indicada (só falta o aceite) depois do prazo: a multa não cai em "Prazo vencido", mas o e-mail avisa que o prazo passou.
        if (s.Etapa == MultaEtapas.Indicar && !s.PrazoVencido && prazoPassado) return passo + " (prazo de indicação vencido)";
        return (s.Etapa == MultaEtapas.Identificar || s.Etapa == MultaEtapas.Indicar) && s.ProximoPrazo == null ? passo + " (sem prazo informado)" : passo;
    }
}
