using System;
using System.Collections.Generic;

namespace Cr40f.Financeiro.Plugin;

public sealed class PaganteSnap
{
    public Guid Id { get; set; }
    public int? Status { get; set; }
    public int ValorCents { get; set; }
}

public sealed class ReservaSnap
{
    public Guid Id { get; set; }
    public int? FatStatus { get; set; }
    public Guid? CpId { get; set; }
    public int? CpStatus { get; set; }
    public int CpValorCents { get; set; }
    /// <summary>Há linha de log em que este motor marcou esta reserva como Pago por esta OP.</summary>
    public bool PagoPorEstaOp { get; set; }
}

public sealed class OpSnapshot
{
    public Guid Id { get; set; }
    public int? Status { get; set; }
    public int? ValorCents { get; set; }
    public List<PaganteSnap> Pagantes { get; } = new();
    public List<ReservaSnap> Reservas { get; } = new();
}

public sealed class Mudanca
{
    public string Entidade { get; set; } = "";
    public Guid Id { get; set; }
    public string Campo { get; set; } = "";
    public int? De { get; set; }
    public int? Para { get; set; }
    /// <summary>Para lookups: true = limpar o campo (De/Para ficam null).</summary>
    public bool LimparLookup { get; set; }
    public string Motivo { get; set; } = "";
}
