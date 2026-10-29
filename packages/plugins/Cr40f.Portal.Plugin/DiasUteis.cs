using System;
using System.Collections.Generic;

namespace Cr40f.Portal.Plugin;

/// <summary>
/// Prazo da aprovação tácita: N dias úteis (segunda a sexta, sem feriados nacionais) depois do dia em Brasília.
/// Mesma regra de apps/shell/src/pages/geral/domain/portal.ts (prazoTacita): fixos + Sexta-feira Santa, UTC-3 fixo desde 2019.
/// </summary>
public static class DiasUteis
{
    public const int DiasTacita = 5;
    static readonly (int Mes, int Dia)[] Fixos = { (1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (11, 20), (12, 25) };

    /// <summary>Dia de hoje em America/Sao_Paulo.</summary>
    public static DateTime HojeEmBrasilia(DateTime agoraUtc) => agoraUtc.AddHours(-3).Date;

    /// <summary>O <paramref name="dias"/>-ésimo dia útil depois de <paramref name="dia"/> (o próprio dia não conta).</summary>
    public static DateTime Somar(DateTime dia, int dias = DiasTacita)
    {
        var atual = dia.Date;
        for (var contados = 0; contados < dias;)
        {
            atual = atual.AddDays(1);
            if (EhDiaUtil(atual)) contados++;
        }
        return atual;
    }

    public static bool EhDiaUtil(DateTime dia) =>
        dia.DayOfWeek != DayOfWeek.Saturday && dia.DayOfWeek != DayOfWeek.Sunday && !Feriados(dia.Year).Contains(dia.Date);

    /// <summary>Feriados nacionais do ano: fixos mais a Sexta-feira Santa (Páscoa − 2).</summary>
    public static HashSet<DateTime> Feriados(int ano)
    {
        var set = new HashSet<DateTime> { Pascoa(ano).AddDays(-2) };
        foreach (var (mes, dia) in Fixos) set.Add(new DateTime(ano, mes, dia));
        return set;
    }

    /// <summary>Domingo de Páscoa (Meeus/Jones/Butcher).</summary>
    static DateTime Pascoa(int ano)
    {
        int a = ano % 19, b = ano / 100, c = ano % 100, d = b / 4, e = b % 4;
        int f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = (a + 11 * h + 22 * l) / 451;
        return new DateTime(ano, (h + l - 7 * m + 114) / 31, (h + l - 7 * m + 114) % 31 + 1);
    }
}
