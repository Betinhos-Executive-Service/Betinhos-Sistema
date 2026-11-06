using System;
using System.Collections.Generic;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class GerarPagantesRequest
{
    public Guid RequestId { get; set; }
    public string ExpectedFinanceiroVersion { get; set; } = string.Empty;
    public string FinanceiroDisplayId { get; set; } = string.Empty;
    public string? ServiceStartDate { get; set; }
    public string? ServiceEndDate { get; set; }
    public bool AllowTotalMismatch { get; set; }
    public bool ReplaceExisting { get; set; }
    public List<PaganteRequest> Pagantes { get; set; } = new();
}

public sealed class PaganteRequest
{
    public Guid PaganteId { get; set; }
    public Guid? ExistingPaganteId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    /// <summary>Pessoa destinatária; nula quando o e-mail foi digitado sem cadastro.</summary>
    public Guid? RecipientId { get; set; }
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientEmail { get; set; } = string.Empty;
    public int AmountCents { get; set; }
    public int PaymentMethod { get; set; }
    public bool GenerateLink { get; set; }
    public bool SendEmail { get; set; }
    public bool ResendEmail { get; set; }
    public bool ReceiptToRecipient { get; set; }
}

public sealed class GerarPagantesResponse
{
    public bool Success { get; set; }
    public Guid RequestId { get; set; }
    public Guid FinanceiroId { get; set; }
    public int TotalCents { get; set; }
    public List<PaganteResult> Results { get; set; } = new();
    public List<ApiError> Errors { get; set; } = new();
}

public sealed class PaganteResult
{
    public Guid PaganteId { get; set; }
    public Guid PagantesRecordId { get; set; }
    public string LinkStatus { get; set; } = "NotApplicable";
    public string EmailStatus { get; set; } = "NotApplicable";
    public string? PaymentUrl { get; set; }
    public string? Error { get; set; }
}

public sealed class ApiError
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public Guid? PaganteId { get; set; }
}
