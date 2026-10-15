using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Financeiro.Plugin;

public sealed class ReservaMensal
{
    public Guid Id { get; set; }
    public DateTime SaidaUtc { get; set; }
    public int? Status { get; set; }
    public int? FatStatus { get; set; }
    public bool TemOp { get; set; }
    public int? CpValorCents { get; set; }
}

public static class FechamentoMensal
{
    static readonly TimeSpan Offset = TimeSpan.FromHours(3); // America/Sao_Paulo, UTC-03:00 sem horário de verão

    public static (DateTime Inicio, DateTime Fim) Janela(string mes)
    {
        if (!DateTime.TryParseExact(mes + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            throw new InvalidPluginExecutionException("mes deve estar no formato AAAA-MM.");
        var ini = DateTime.SpecifyKind(d, DateTimeKind.Utc).Add(Offset);
        return (ini, ini.AddMonths(1));
    }

    public static void ValidarMes(string mes, DateTime agoraUtc)
    {
        var (_, fim) = Janela(mes);
        if (agoraUtc < fim) throw new InvalidPluginExecutionException("O mês ainda não terminou.");
    }

    public static IReadOnlyList<ReservaMensal> Elegiveis(IEnumerable<ReservaMensal> reservas, string mes)
    {
        var (ini, fim) = Janela(mes);
        return reservas.Where(r => r.Status == Codigos.ReservaConcluida && r.FatStatus == Codigos.ReservaFatMensal && !r.TemOp && r.SaidaUtc >= ini && r.SaidaUtc < fim).ToList();
    }

    public static int TotalCents(IEnumerable<ReservaMensal> reservas)
    {
        var lista = reservas.ToList();
        if (lista.Any(r => r.CpValorCents is null || r.CpValorCents <= 0))
            throw new InvalidPluginExecutionException("Há serviços sem composição de preço; complete antes de fechar o mês.");
        return lista.Sum(r => r.CpValorCents!.Value);
    }
}
