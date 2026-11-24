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
/// Fixtures/multa-etapas.json (seção "divisoes"). O termo de multa tem divisão própria (TermoMultaCommandPlugin.CalcularParcelas), com a mesma regra: resto na última.</summary>
public static class MultaParcelas
{
    /// <summary>Máximo de parcelas de uma entrada nova (decisão da Frota, 24/11/2026): 1x, 2x ou 3x, iguais, em meses seguidos.</summary>
    public const int MaximoParcelas = 3;
    /// <summary>Teto de Dividir: termos assinados antes de 24/11/2026 podem ter de 4 a 12 parcelas e o acerto delas continua valendo.</summary>
    public const int MaximoHistorico = 12;
    /// <summary>Meses à frente em que o primeiro desconto pode cair (janela de competência; não é o limite de parcelas).</summary>
    public const int JanelaMeses = 12;

    public static List<ParcelaPlano> Dividir(decimal valor, int n, string primeira)
    {
        if (n < 1 || n > MaximoHistorico) throw new ArgumentOutOfRangeException(nameof(n));
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
        return (mes.AddMonths(-1).ToString("yyyy-MM-01", CultureInfo.InvariantCulture), mes.AddMonths(JanelaMeses).ToString("yyyy-MM-01", CultureInfo.InvariantCulture));
    }

    public static string MesBr(string iso) => iso.Substring(5, 2) + "/" + iso.Substring(0, 4);

    private static DateTime Mes(string iso) => DateTime.ParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
