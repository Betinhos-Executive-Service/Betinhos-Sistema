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

/// <summary>Seções do e-mail "Multas de hoje" (spec §6), com as regras de MultaEtapas. Cada multa entra numa seção só.
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
            if (s.PrazoVencido) r.PrazoVencido.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Indicar && e.Canal == MultaCodigos.Senatran && e.AceiteEm == null && e.DataIndicacao != null && Regras.Dias(e.DataIndicacao, hoje) >= 2)
                r.Aceite.Add(Linha(m, s));
            else if ((s.Etapa == MultaEtapas.Identificar || s.Etapa == MultaEtapas.Indicar) && e.DataParaIndicar != null && Regras.Dias(hoje, e.DataParaIndicar) <= 7)
                r.Indicar.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Pagar && e.Vencimento != null && Regras.Dias(hoje, e.Vencimento) <= 5)
                r.Pagar.Add(Linha(m, s));
            else if (s.Etapa == MultaEtapas.Acertar) r.AguardandoAcerto++;
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

    private static LinhaMultaDia Linha(MultaResumo m, MultaSituacao s) => new()
    {
        Id = m.Id.ToString("D"),
        Auto = m.Auto,
        Placa = m.Placa,
        Responsavel = MultaEtapas.ResponsavelEfetivo(m.Estado) == MultaCodigos.Empresa ? "Empresa" : m.Motorista ?? "Sem responsável",
        Prazo = s.ProximoPrazo,
        Passo = s.ProximoPasso,
    };
}
