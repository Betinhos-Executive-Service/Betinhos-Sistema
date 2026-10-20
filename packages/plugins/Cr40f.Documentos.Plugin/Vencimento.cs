using System;
using System.Globalization;

namespace Cr40f.Documentos.Plugin;

public sealed class EstadoValidade
{
    public EstadoValidade(string status, int? dias)
    {
        Status = status;
        Dias = dias;
    }

    public string Status { get; }
    public int? Dias { get; }
}

/// <summary>Porta de apps/shell/src/pages/documentos/domain/vencimento.ts (statusDe + marcoDe).</summary>
public static class Vencimento
{
    public const int JanelaDias = 60;

    public static int DiasEntre(string de, string ate) => (Data(ate) - Data(de)).Days;

    public static EstadoValidade EstadoDe(string? validade, string hoje, bool temValidade)
    {
        if (!temValidade || string.IsNullOrEmpty(validade)) return new EstadoValidade(Status.SemValidade, null);
        var dias = DiasEntre(hoje, validade!);
        if (dias < 0) return new EstadoValidade(Status.Vencido, dias);
        if (dias <= 7) return new EstadoValidade(Status.Vence7, dias);
        if (dias <= 30) return new EstadoValidade(Status.Vence30, dias);
        if (dias <= JanelaDias) return new EstadoValidade(Status.Vence60, dias);
        return new EstadoValidade(Status.Ok, dias);
    }

    private static DateTime Data(string iso) =>
        DateTime.ParseExact(iso.Substring(0, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
