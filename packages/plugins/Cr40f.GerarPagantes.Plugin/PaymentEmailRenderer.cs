using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class PaymentEmailRenderer
{
    private const string ResourceName = "Cr40f.GerarPagantes.Plugin.Assets.payment-email-template.html";
    private readonly string _template;

    public PaymentEmailRenderer()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Template de e-mail não incorporado: {ResourceName}.");
        using var reader = new StreamReader(stream);
        _template = reader.ReadToEnd();
    }

    public PaymentEmail Render(GerarPagantesRequest request, PaganteRequest payer, string paymentUrl)
    {
        var start = FormatDate(request.ServiceStartDate);
        var end = FormatDate(request.ServiceEndDate);
        var endLabel = string.IsNullOrWhiteSpace(end) || string.Equals(start, end, StringComparison.Ordinal)
            ? string.Empty
            : "- " + end;
        var body = _template
            .Replace("{{PAYER_NAME}}", Encode(payer.Name))
            .Replace("{{SERVICE_START_DATE}}", Encode(start))
            .Replace("{{SERVICE_END_DATE}}", Encode(endLabel))
            .Replace("{{AMOUNT}}", Encode((payer.AmountCents / 100m).ToString("C", CultureInfo.GetCultureInfo("pt-BR"))))
            .Replace("{{PAYMENT_URL}}", WebUtility.HtmlEncode(paymentUrl));
        var operation = string.IsNullOrWhiteSpace(request.FinanceiroDisplayId) ? "OP" : request.FinanceiroDisplayId.Trim();
        return new PaymentEmail(
            $"Link de Pagamento {operation} para {payer.Name?.Trim()} | Betinhos Executive Service",
            body);
    }

    private static string FormatDate(string? value) => DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var date)
        ? date.ToString("dd/MM/yyyy", CultureInfo.GetCultureInfo("pt-BR"))
        : string.Empty;

    private static string Encode(string? value) => WebUtility.HtmlEncode(value?.Trim() ?? string.Empty);
}

public sealed class PaymentEmail
{
    public PaymentEmail(string subject, string htmlBody) { Subject = subject; HtmlBody = htmlBody; }
    public string Subject { get; }
    public string HtmlBody { get; }
}
