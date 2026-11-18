using System;
using System.Collections.Generic;
using System.Globalization;

namespace Cr40f.Frota.Plugin;

public sealed class ParcelaPlano
{
    public int Numero { get; set; }
    public int Total { get; set; }
    /// <summary>yyyy-MM-01.</summary>
    public string Competencia { get; set; } = "";
    public decimal Valor { get; set; }
}

/// <summary>Parcelas do Acertar -> folha (spec RH §3). Espelho: dividirParcelas/janelaCompetencia de multaEtapas.ts; paridade em
/// Fixtures/multa-etapas.json (seção "divisoes"). O termo de multa tem divisão própria (sobra nas primeiras) e não usa esta classe.</summary>
public static class MultaParcelas
{
    public const int Maximo = 12;

    public static List<ParcelaPlano> Dividir(decimal valor, int n, string primeira)
    {
        if (n < 1 || n > Maximo) throw new ArgumentOutOfRangeException(nameof(n));
        var centavos = (long)decimal.Round(valor * 100m, 0, MidpointRounding.AwayFromZero);
        var parcela = centavos / n;
        var inicio = Mes(Competencia(primeira));
        var plano = new List<ParcelaPlano>(n);
        for (var i = 1; i <= n; i++)
            plano.Add(new ParcelaPlano
            {
                Numero = i,
                Total = n,
                Competencia = inicio.AddMonths(i - 1).ToString("yyyy-MM-01", CultureInfo.InvariantCulture),
                Valor = (i == n ? centavos - parcela * (n - 1) : parcela) / 100m,
            });
        return plano;
    }

    public static string Competencia(string mes) => mes.Length == 7 ? mes + "-01" : mes.Substring(0, 7) + "-01";

    public static (string De, string Ate) Janela(string hoje)
    {
        var mes = Mes(Competencia(hoje.Substring(0, 7)));
        return (mes.AddMonths(-1).ToString("yyyy-MM-01", CultureInfo.InvariantCulture), mes.AddMonths(Maximo).ToString("yyyy-MM-01", CultureInfo.InvariantCulture));
    }

    public static string MesBr(string iso) => iso.Substring(5, 2) + "/" + iso.Substring(0, 4);

    private static DateTime Mes(string iso) => DateTime.ParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
