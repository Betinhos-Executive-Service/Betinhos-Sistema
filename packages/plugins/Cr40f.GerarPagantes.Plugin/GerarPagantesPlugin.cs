using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Cr40f.GerarPagantes.Plugin;

public sealed class GerarPagantesPluginV2 : IPlugin
{
    private static readonly JsonSerializerSettings ApiResponseJsonSettings = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver()
    };

    private const string Financeiro = "cr40f_financeiro";
    private const string Pagantes = "cr40f_pagantes";
    private const string Composicao = "cr40f_composicaodeprecos";
    private const string Servico = "cr40f_reservadeveculos";
    private const string Operacao = "cr40f_geracaopagantesoperacao";
    private const string Limpeza = "cr40f_cielolinkcleanup";
    private const int NotApplicable = 202410000;
    private const int Pending = 202410001;
    private const int Completed = 202410002;
    private const int Failed = 202410003;
    private static readonly HashSet<int> PaymentMethods = new() { 202410000, 202410001, 202410002 };
    public GerarPagantesPluginV2() { }

    public GerarPagantesPluginV2(string unsecureConfiguration, string secureConfiguration) { }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var service = factory.CreateOrganizationService(context.UserId);
        var configurationService = factory.CreateOrganizationService(null);
        var logWriter = new OperationalLogWriter(service, tracing);
        var response = new GerarPagantesResponse();
        try
        {
            var target = GetTarget(context);
            var request = DeserializeRequest(context);
            response.RequestId = request.RequestId;
            response.FinanceiroId = target.Id;
            if (request.RequestId == Guid.Empty) throw new InvalidPluginExecutionException("requestId é obrigatório.");
            if (IsProcessed(service, request.RequestId)) throw new InvalidPluginExecutionException("Esta solicitação já foi processada.");
            var finance = service.Retrieve(Financeiro, target.Id, new ColumnSet("versionnumber", "statecode", "statuscode", "ownerid"));
            ValidateOperationAccess(service, context, finance);
            ValidateVersion(finance, request.ExpectedFinanceiroVersion);
            var totalCents = CalculateOperationTotal(service, target.Id);
            ValidateRequest(service, request, totalCents);
            response.TotalCents = totalCents;
            var existing = LoadExistingPayers(service, target.Id);
            ValidateExistingPayload(request, existing);
            var needsCielo = request.Pagantes.Any(payer => payer.GenerateLink) ||
                existing.Values.Any(row => !string.IsNullOrWhiteSpace(row.GetAttributeValue<string>("cr40f_cielolinkid")));
            var settings = PluginSettings.Load(configurationService);
            settings.ValidateFor(request, needsCielo);
            var cielo = needsCielo ? new CieloClient(settings.CieloClientId, settings.CieloClientSecret) : null;
            var graph = request.Pagantes.Any(payer => payer.SendEmail) ? new GraphEmailClient(settings) : null;
            var renderer = graph != null ? new PaymentEmailRenderer() : null;
            var emailAssets = graph != null ? new EmailAssetProvider(service, settings.EmailAssetPrefix).Load() : null;
            var createdLinks = new List<string>();
            var supersededLinks = new List<string>();
            try
            {
                if (request.ReplaceExisting) DeleteRemovedPayers(service, cielo, existing, Array.Empty<Guid>());
                else DeleteRemovedPayers(service, cielo, existing, request.Pagantes
                    .Select(payer => payer.ExistingPaganteId)
                    .Where(id => id.HasValue)
                    .Select(id => id!.Value));
                foreach (var payer in request.Pagantes)
                {
                    var existingPayer = !request.ReplaceExisting && payer.ExistingPaganteId.HasValue &&
                        existing.TryGetValue(payer.ExistingPaganteId.Value, out var row) ? row : null;
                    var result = UpsertPayer(service, cielo, graph, renderer, emailAssets, target.Id, request, payer,
                        existingPayer, request.RequestId, createdLinks, supersededLinks);
                    response.Results.Add(result);
                    if (!string.IsNullOrWhiteSpace(result.Error))
                    {
                        response.Errors.Add(new ApiError { Code = "PAYER_PROCESSING_FAILED", Message = result.Error!, PaganteId = payer.PaganteId });
                        logWriter.TryWritePayerError(context, target.Id, result.PagantesRecordId, payer.PaganteId, result.Error!);
                    }
                }
                response.Success = response.Errors.Count == 0;
                // Links antigos só são cancelados depois que os novos foram gravados.
                foreach (var linkId in supersededLinks)
                {
                    try { cielo?.DeleteLinkAsync(linkId).GetAwaiter().GetResult(); }
                    catch (Exception cleanupError) { QueueCleanup(service, linkId, cleanupError.Message); }
                }
                WriteOperation(service, request.RequestId, target.Id, response.Success, response);
            }
            catch (Exception operationError)
            {
                foreach (var linkId in createdLinks)
                {
                    try { cielo?.DeleteLinkAsync(linkId).GetAwaiter().GetResult(); }
                    catch (Exception cleanupError) { QueueCleanup(service, linkId, cleanupError.Message); }
                }
                throw new InvalidPluginExecutionException("Não foi possível concluir a geração dos pagantes. " + Sanitize(operationError.Message), operationError);
            }
        }
        catch (Exception error)
        {
            tracing.Trace("cr40f_GerarPagantes: {0}", error);
            logWriter.TryWriteError(context, error);
            throw error is InvalidPluginExecutionException
                ? error
                : new InvalidPluginExecutionException("Não foi possível concluir a geração dos pagantes. " + Sanitize(error.Message), error);
        }
        context.OutputParameters["cr40f_ResponseJson"] = JsonConvert.SerializeObject(response, ApiResponseJsonSettings);
    }

    private static EntityReference GetTarget(IPluginExecutionContext context)
    {
        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not EntityReference target || target.LogicalName != Financeiro)
            throw new InvalidPluginExecutionException("A Custom API deve ser vinculada a uma OP.");
        return target;
    }

    private static GerarPagantesRequest DeserializeRequest(IPluginExecutionContext context)
    {
        var json = context.InputParameters.Contains("cr40f_RequestJson") ? context.InputParameters["cr40f_RequestJson"] as string : null;
        return !string.IsNullOrWhiteSpace(json) ? JsonConvert.DeserializeObject<GerarPagantesRequest>(json!) ?? throw new InvalidPluginExecutionException("Payload inválido.") : throw new InvalidPluginExecutionException("cr40f_RequestJson é obrigatório.");
    }

    private static void ValidateVersion(Entity finance, string expectedVersion)
    {
        var current = finance.GetAttributeValue<long?>("versionnumber")?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(expectedVersion) || !string.Equals(current, expectedVersion, StringComparison.Ordinal))
            throw new InvalidPluginExecutionException("A OP foi alterada por outro usuário. Atualize os dados antes de salvar.");
    }

    private static void ValidateRequest(IOrganizationService service, GerarPagantesRequest request, int totalCents)
    {
        if (!request.Pagantes.Any()) throw new InvalidPluginExecutionException("Selecione ao menos um pagante.");
        if (request.Pagantes.GroupBy(p => p.PaganteId).Any(group => group.Key == Guid.Empty || group.Count() > 1)) throw new InvalidPluginExecutionException("Existem pagantes inválidos ou duplicados.");
        if (request.Pagantes.Any(p => p.AmountCents <= 0 || !PaymentMethods.Contains(p.PaymentMethod))) throw new InvalidPluginExecutionException("Todos os pagantes devem possuir valor e forma de pagamento válidos.");
        if (request.Pagantes.Any(p => p.SendEmail && (!p.GenerateLink || p.RecipientId == Guid.Empty || string.IsNullOrWhiteSpace(p.RecipientName) || !System.Text.RegularExpressions.Regex.IsMatch(p.RecipientEmail?.Trim() ?? "", @"^\S+@\S+\.\S+$")))) throw new InvalidPluginExecutionException("Envio de e-mail exige link e destinatário válido.");
        if (request.Pagantes.Sum(p => p.AmountCents) != totalCents && !request.AllowTotalMismatch) throw new InvalidPluginExecutionException("O total do rateio diverge do valor da OP.");
        var ids = request.Pagantes.Select(p => p.PaganteId).Concat(request.Pagantes.Where(p => p.SendEmail).Select(p => p.RecipientId)).Distinct().ToArray();
        var people = service.RetrieveMultiple(new QueryExpression("cr40f_bancodedados") { ColumnSet = new ColumnSet("cr40f_nomedopassageiro", "cr40f_email", "statecode"), Criteria = new FilterExpression(LogicalOperator.And) { Conditions = { new ConditionExpression("cr40f_bancodedadosid", ConditionOperator.In, ids.Cast<object>().ToArray()) } } }).Entities.ToDictionary(p => p.Id);
        foreach (var payer in request.Pagantes)
        {
            if (!people.TryGetValue(payer.PaganteId, out var person) || person.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1) throw new InvalidPluginExecutionException("Um pagante não existe ou está inativo.");
            if (!string.Equals(person.GetAttributeValue<string>("cr40f_nomedopassageiro")?.Trim() ?? string.Empty, payer.Name?.Trim() ?? string.Empty, StringComparison.Ordinal) || !string.Equals(person.GetAttributeValue<string>("cr40f_email")?.Trim() ?? string.Empty, payer.Email?.Trim() ?? string.Empty, StringComparison.OrdinalIgnoreCase)) throw new InvalidPluginExecutionException("Os dados do pagante divergem do Dataverse.");
            if (payer.SendEmail && (!people.TryGetValue(payer.RecipientId, out var recipient) || !string.Equals(recipient.GetAttributeValue<string>("cr40f_nomedopassageiro")?.Trim() ?? string.Empty, payer.RecipientName?.Trim() ?? string.Empty, StringComparison.Ordinal) || !string.Equals(recipient.GetAttributeValue<string>("cr40f_email")?.Trim() ?? string.Empty, payer.RecipientEmail?.Trim() ?? string.Empty, StringComparison.OrdinalIgnoreCase))) throw new InvalidPluginExecutionException("Os dados do destinatário divergem do Dataverse.");
        }
    }

    private static void ValidateOperationAccess(IOrganizationService service, IPluginExecutionContext context, Entity finance)
    {
        var status = finance.FormattedValues.TryGetValue("statuscode", out var formatted) ? formatted : "inactive";
        if (finance.GetAttributeValue<OptionSetValue>("statecode")?.Value == 1 || status.IndexOf("cancel", StringComparison.OrdinalIgnoreCase) >= 0 || status.IndexOf("encerr", StringComparison.OrdinalIgnoreCase) >= 0 || status.IndexOf("fechad", StringComparison.OrdinalIgnoreCase) >= 0) throw new InvalidPluginExecutionException("Operation is closed and cannot generate payers.");
        var access = (RetrievePrincipalAccessResponse)service.Execute(new RetrievePrincipalAccessRequest { Target = finance.ToEntityReference(), Principal = new EntityReference("systemuser", context.UserId) });
        if ((access.AccessRights & AccessRights.WriteAccess) != AccessRights.WriteAccess) throw new InvalidPluginExecutionException("User has no write permission for this operation.");
    }

    private static void ValidateExistingPayload(GerarPagantesRequest request, IReadOnlyDictionary<Guid, Entity> existing)
    {
        foreach (var payer in request.Pagantes.Where(p => p.ExistingPaganteId.HasValue))
        {
            if (!existing.TryGetValue(payer.ExistingPaganteId!.Value, out var row) || row.GetAttributeValue<EntityReference>("cr40f_bancodedados")?.Id != payer.PaganteId) throw new InvalidPluginExecutionException("Existing payer record does not belong to this operation.");
            if (IsLockedPayer(row) && IsPayerChanged(row, payer)) throw new InvalidPluginExecutionException($"O pagante {payer.Name} já está pago ou autorizado e não pode ser alterado.");
        }
        foreach (var removed in existing.Where(item => !request.Pagantes.Any(payer => payer.ExistingPaganteId == item.Key)).Select(item => item.Value))
            if (IsLockedPayer(removed)) throw new InvalidPluginExecutionException("Um pagante pago ou autorizado não pode ser removido do rateio.");
    }

    private static int CalculateOperationTotal(IOrganizationService service, Guid financeiroId)
    {
        var services = service.RetrieveMultiple(new QueryExpression(Servico)
        {
            ColumnSet = new ColumnSet(false),
            Criteria = new FilterExpression(LogicalOperator.And)
            {
                Conditions = { new ConditionExpression("cr40f_financeiro", ConditionOperator.Equal, financeiroId) }
            }
        }).Entities;
        if (!services.Any()) throw new InvalidPluginExecutionException("Esta OP não possui serviços vinculados.");
        var compositions = service.RetrieveMultiple(new QueryExpression(Composicao)
        {
            ColumnSet = new ColumnSet("new_valortotal"),
            Criteria = new FilterExpression(LogicalOperator.And)
            {
                Conditions = { new ConditionExpression("cr40f_servicorelacionadogeral", ConditionOperator.In, services.Select(item => item.Id).Cast<object>().ToArray()) }
            }
        }).Entities;
        var cents = compositions.Sum(row => (int)Math.Round((row.GetAttributeValue<Money>("new_valortotal")?.Value ?? 0m) * 100m, MidpointRounding.AwayFromZero));
        if (cents <= 0) throw new InvalidPluginExecutionException("A OP não possui composição de preço válida.");
        return cents;
    }

    private static Dictionary<Guid, Entity> LoadExistingPayers(IOrganizationService service, Guid financeiroId) => service.RetrieveMultiple(new QueryExpression(Pagantes)
    {
        ColumnSet = new ColumnSet("cr40f_bancodedados", "cr40f_valor", "cr40f_formadepagamento", "cr40f_status", "cr40f_cielolinkid", "cr40f_cieloordernumber", "cr40f_linkdepagamento", "cr40f_statusenvioemail"),
        Criteria = new FilterExpression(LogicalOperator.And) { Conditions = { new ConditionExpression("cr40f_financeiro", ConditionOperator.Equal, financeiroId) } }
    }).Entities.ToDictionary(entity => entity.Id);

    private PaganteResult UpsertPayer(
        IOrganizationService service,
        CieloClient? cielo,
        GraphEmailClient? graph,
        PaymentEmailRenderer? renderer,
        IReadOnlyCollection<InlineEmailAsset>? emailAssets,
        Guid financeiroId,
        GerarPagantesRequest request,
        PaganteRequest payer,
        Entity? existing,
        Guid requestId,
        ICollection<string> createdLinks,
        ICollection<string> supersededLinks)
    {
        var changed = existing == null || IsPayerChanged(existing, payer);
        var existingLinkId = existing?.GetAttributeValue<string>("cr40f_cielolinkid");
        // Pagante pago/autorizado e sem alteração fica intacto (status, link e e-mail preservados).
        if (existing != null && IsLockedPayer(existing))
            return new PaganteResult { PaganteId = payer.PaganteId, PagantesRecordId = existing.Id, LinkStatus = string.IsNullOrWhiteSpace(existingLinkId) ? "NotApplicable" : "Generated", PaymentUrl = existing.GetAttributeValue<string>("cr40f_linkdepagamento") };
        // Pagante editado (valor, forma de pagamento ou sem link): o link atual é substituído/cancelado.
        if (!string.IsNullOrWhiteSpace(existingLinkId) && (changed || !payer.GenerateLink)) supersededLinks.Add(existingLinkId!);
        var keepsLink = !changed && payer.GenerateLink && !string.IsNullOrWhiteSpace(existingLinkId);
        // Pagante sem alteração cujo e-mail já foi enviado só recebe de novo quando o reenvio for pedido.
        var emailAlreadySent = keepsLink && existing!.GetAttributeValue<OptionSetValue>("cr40f_statusenvioemail")?.Value == Completed && !payer.ResendEmail;
        var sendEmail = payer.SendEmail && !emailAlreadySent;
        var entity = existing ?? new Entity(Pagantes);
        entity["cr40f_financeiro"] = new EntityReference(Financeiro, financeiroId);
        entity["cr40f_bancodedados"] = new EntityReference("cr40f_bancodedados", payer.PaganteId);
        entity["cr40f_valor"] = new Money(payer.AmountCents / 100m);
        entity["cr40f_formadepagamento"] = new OptionSetValue(payer.PaymentMethod);
        entity["cr40f_status"] = new OptionSetValue(Pending);
        entity["cr40f_statusgeracaolink"] = new OptionSetValue(payer.GenerateLink ? Pending : NotApplicable);
        if (!emailAlreadySent) entity["cr40f_statusenvioemail"] = new OptionSetValue(payer.SendEmail ? Pending : NotApplicable);
        entity["cr40f_errogeracaolink"] = null;
        if (!emailAlreadySent) entity["cr40f_erroenvioemail"] = null;
        var result = new PaganteResult { PaganteId = payer.PaganteId, LinkStatus = payer.GenerateLink ? "Pending" : "NotApplicable", EmailStatus = emailAlreadySent ? "Sent" : payer.SendEmail ? "Pending" : "NotApplicable" };
        if (!keepsLink)
        {
            entity["cr40f_cielolinkid"] = null;
            entity["cr40f_cieloordernumber"] = null;
            entity["cr40f_linkdepagamento"] = null;
        }
        if (existing == null)
        {
            result.PagantesRecordId = service.Create(entity);
        }
        else
        {
            service.Update(entity);
            result.PagantesRecordId = existing.Id;
        }

        if (!payer.GenerateLink) return result;
        try
        {
            if (keepsLink)
            {
                result.LinkStatus = "Generated";
                result.PaymentUrl = existing!.GetAttributeValue<string>("cr40f_linkdepagamento");
                service.Update(new Entity(Pagantes, result.PagantesRecordId)
                {
                    ["cr40f_statusgeracaolink"] = new OptionSetValue(Completed),
                    ["cr40f_errogeracaolink"] = null
                });
            }
            else
            {
                var orderNumber = CreateOrderNumber(result.PagantesRecordId);
                var link = (cielo ?? throw new InvalidOperationException("Cliente Cielo indisponível."))
                    .CreateLinkAsync(orderNumber, BuildCieloName(request, payer), BuildCieloDescription(request), payer.AmountCents)
                    .GetAwaiter().GetResult();
                createdLinks.Add(link.Id!);
                result.LinkStatus = "Generated";
                result.PaymentUrl = link.ShortUrl;
                service.Update(new Entity(Pagantes, result.PagantesRecordId)
                {
                    ["cr40f_cielolinkid"] = link.Id,
                    ["cr40f_linkdepagamento"] = link.ShortUrl,
                    ["cr40f_cieloordernumber"] = orderNumber,
                    ["cr40f_statusgeracaolink"] = new OptionSetValue(Completed),
                    ["cr40f_errogeracaolink"] = null
                });
            }
        }
        catch (Exception error)
        {
            result.LinkStatus = "Failed";
            result.EmailStatus = sendEmail ? "Failed" : "NotApplicable";
            result.Error = Sanitize(error.Message);
            service.Update(new Entity(Pagantes, result.PagantesRecordId)
            {
                ["cr40f_statusgeracaolink"] = new OptionSetValue(Failed),
                ["cr40f_errogeracaolink"] = result.Error,
                ["cr40f_statusenvioemail"] = new OptionSetValue(sendEmail ? Failed : NotApplicable),
                ["cr40f_erroenvioemail"] = sendEmail ? "E-mail não enviado porque o link não foi gerado." : null
            });
            return result;
        }

        if (!sendEmail) return result;
        try
        {
            var email = (renderer ?? throw new InvalidOperationException("Renderer de e-mail indisponível."))
                .Render(request, payer, result.PaymentUrl ?? throw new InvalidOperationException("URL de pagamento ausente."));
            (graph ?? throw new InvalidOperationException("Cliente Microsoft Graph indisponível."))
                .SendAsync(payer.RecipientEmail, email, emailAssets ?? Array.Empty<InlineEmailAsset>())
                .GetAwaiter().GetResult();
            result.EmailStatus = "Sent";
            service.Update(new Entity(Pagantes, result.PagantesRecordId)
            {
                ["cr40f_statusenvioemail"] = new OptionSetValue(Completed),
                ["cr40f_dataenvioemail"] = DateTime.UtcNow,
                ["cr40f_erroenvioemail"] = null
            });
        }
        catch (Exception error)
        {
            result.EmailStatus = "Failed";
            result.Error = Sanitize(error.Message);
            service.Update(new Entity(Pagantes, result.PagantesRecordId)
            {
                ["cr40f_statusenvioemail"] = new OptionSetValue(Failed),
                ["cr40f_erroenvioemail"] = result.Error
            });
        }
        return result;
    }

    private static void DeleteRemovedPayers(IOrganizationService service, CieloClient? cielo, IReadOnlyDictionary<Guid, Entity> existing, IEnumerable<Guid> retained)
    {
        var keep = new HashSet<Guid>(retained);
        foreach (var row in existing.Where(item => !keep.Contains(item.Key)).Select(item => item.Value))
        {
            var linkId = row.GetAttributeValue<string>("cr40f_cielolinkid");
            if (!string.IsNullOrWhiteSpace(linkId))
                (cielo ?? throw new InvalidOperationException("Configuração Cielo ausente para cancelar link existente."))
                    .DeleteLinkAsync(linkId).GetAwaiter().GetResult();
            service.Delete(Pagantes, row.Id);
        }
    }

    private static void QueueCleanup(IOrganizationService service, string cieloLinkId, string reason) => service.Create(new Entity(Limpeza)
    {
        ["cr40f_name"] = $"Limpeza Cielo {cieloLinkId}",
        ["cr40f_cielolinkid"] = cieloLinkId,
        ["cr40f_ultimoerro"] = Sanitize(reason)
    });

    private static void WriteOperation(IOrganizationService service, Guid requestId, Guid financeiroId, bool success, GerarPagantesResponse response) => service.Create(new Entity(Operacao)
    {
        ["cr40f_name"] = $"Geração {financeiroId:D} - {requestId:D}",
        ["cr40f_request_id"] = requestId.ToString("D"),
        ["cr40f_financeiro"] = new EntityReference(Financeiro, financeiroId),
        ["cr40f_sucesso"] = success,
        ["cr40f_resultado"] = JsonConvert.SerializeObject(response)
    });

    private static bool IsProcessed(IOrganizationService service, Guid requestId) => service.RetrieveMultiple(new QueryExpression(Operacao)
    {
        ColumnSet = new ColumnSet(false), TopCount = 1,
        Criteria = new FilterExpression(LogicalOperator.And) { Conditions = { new ConditionExpression("cr40f_request_id", ConditionOperator.Equal, requestId.ToString("D")) } }
    }).Entities.Any();

    private static bool IsPayerChanged(Entity row, PaganteRequest payer) =>
        row.GetAttributeValue<EntityReference>("cr40f_bancodedados")?.Id != payer.PaganteId ||
        Math.Round((row.GetAttributeValue<Money>("cr40f_valor")?.Value ?? 0m) * 100m) != payer.AmountCents ||
        row.GetAttributeValue<OptionSetValue>("cr40f_formadepagamento")?.Value != payer.PaymentMethod;

    private static bool IsLockedPayer(Entity row)
    {
        var status = row.FormattedValues.TryGetValue("cr40f_status", out var label) ? label : string.Empty;
        return status.Equals("Pago", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("Autorizado", StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildCieloName(GerarPagantesRequest request, PaganteRequest payer)
    {
        var operation = string.IsNullOrWhiteSpace(request.FinanceiroDisplayId) ? "OP" : request.FinanceiroDisplayId.Trim();
        var payerName = string.IsNullOrWhiteSpace(payer.Name) ? "Pagante" : payer.Name.Trim();
        return $"{operation} | {payerName}";
    }

    private static string BuildCieloDescription(GerarPagantesRequest request)
    {
        var start = FormatDate(request.ServiceStartDate);
        var end = FormatDate(request.ServiceEndDate);
        if (string.IsNullOrWhiteSpace(start) && string.IsNullOrWhiteSpace(end)) return "Serviços prestados de transporte executivo.";
        if (string.IsNullOrWhiteSpace(end) || start == end) return $"Serviços prestados de transporte em {start}.";
        return $"Serviços prestados de transporte no período {start} - {end}.";
    }

    private static string FormatDate(string? value) => DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var date)
        ? date.ToString("dd/MM/yyyy", CultureInfo.GetCultureInfo("pt-BR"))
        : string.Empty;

    // Cielo aceita até 20 caracteres. Usa o GUID do registro de Pagantes para que cada pagante tenha
    // um OrderNumber próprio (o Flow Atualizar Status de Pagamento localiza o registro por esse valor).
    // Mesma regra do FlowGerarPagantesHttp (Compose_Order_Number). A versão anterior concatenava
    // financeiroId + paganteId + requestId e cortava em 20, o que sobrava só o financeiroId:
    // todos os pagantes da mesma OP recebiam o mesmo OrderNumber.
    private static string CreateOrderNumber(Guid pagantesRecordId) => pagantesRecordId.ToString("N").Substring(0, 20).ToUpperInvariant();
    private static string Sanitize(string message) => string.IsNullOrWhiteSpace(message) ? "Erro não detalhado." : message.Length > 500 ? message.Substring(0, 500) : message;
}
