using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;

namespace Cr40f.GerarPagantes.Plugin;

internal sealed class OperationalLogWriter
{
    private const string Table = "new_appmotoristaslog";
    private const int NameMaxLength = 160;
    private const int MessageMaxLength = 20000;
    private const int StackMaxLength = 100000;
    private readonly IOrganizationService _service;
    private readonly ITracingService _tracing;

    public OperationalLogWriter(IOrganizationService service, ITracingService tracing)
    {
        _service = service;
        _tracing = tracing;
    }

    public void TryWriteError(IPluginExecutionContext context, Exception exception)
    {
        try
        {
            var action = $"{context?.MessageName ?? "unknown"}:{context?.PrimaryEntityName ?? "unknown"}";
            var message = exception.Message ?? "Erro desconhecido no plugin Gerar Pagantes.";
            var record = new Entity(Table);
            record["new_name"] = Truncate($"Tela Gerar Pagantes - {action}", NameMaxLength);
            record["new_occurredat"] = DateTime.UtcNow;
            record["new_severity"] = "error";
            record["new_source"] = "Dataverse plugin";
            record["new_action"] = Truncate(action, 180);
            record["new_phase"] = "Custom API";
            record["new_component"] = "Cr40f.GerarPagantes.Plugin";
            record["new_detailid"] = context?.PrimaryEntityId.ToString("D") ?? "";
            record["new_detailtype"] = context?.PrimaryEntityName ?? "";
            record["new_message"] = Truncate(message, MessageMaxLength);
            record["new_stack"] = Truncate(exception.ToString(), StackMaxLength);
            record["new_errorname"] = Truncate(exception.GetType().FullName ?? exception.GetType().Name, 220);
            record["new_errorcode"] = Truncate(GetErrorCode(exception), 120);
            record["new_appname"] = "Tela Gerar Pagantes";
            record["new_payloadjson"] = Truncate(BuildPayloadJson(context), StackMaxLength);
            record["new_rawjson"] = Truncate(BuildErrorJson(exception), StackMaxLength);
            var logId = _service.Create(record);
            _tracing?.Trace("GerarPagantes OperationalLogWriter wrote logId={0}", logId);
        }
        catch (Exception loggingError)
        {
            _tracing?.Trace("GerarPagantes OperationalLogWriter failed: {0}", loggingError);
        }
    }

    public void TryWritePayerError(IPluginExecutionContext context, Guid financeiroId, Guid pagantesRecordId, Guid payerId, string message)
    {
        try
        {
            var record = new Entity(Table);
            record["new_name"] = "Tela Gerar Pagantes - falha por pagante";
            record["new_occurredat"] = DateTime.UtcNow;
            record["new_severity"] = "error";
            record["new_source"] = "Dataverse plugin";
            record["new_action"] = "ProcessPayer";
            record["new_phase"] = "Custom API";
            record["new_component"] = "Cr40f.GerarPagantes.Plugin";
            record["new_detailid"] = pagantesRecordId.ToString("D");
            record["new_detailtype"] = "cr40f_pagantes";
            record["new_message"] = Truncate(message, MessageMaxLength);
            record["new_errorname"] = "PayerProcessingFailure";
            record["new_appname"] = "Tela Gerar Pagantes";
            record["new_payloadjson"] = "{" +
                $"\"correlationId\":\"{EscapeJson(context.CorrelationId.ToString())}\"," +
                $"\"financeiroId\":\"{financeiroId:D}\"," +
                $"\"pagantesRecordId\":\"{pagantesRecordId:D}\"," +
                $"\"payerId\":\"{payerId:D}\"" +
                "}";
            _service.Create(record);
        }
        catch (Exception loggingError)
        {
            _tracing?.Trace("GerarPagantes OperationalLogWriter payer log failed: {0}", loggingError);
        }
    }

    private static string GetErrorCode(Exception exception)
    {
        var fault = exception as FaultException<OrganizationServiceFault>;
        return fault?.Detail?.ErrorCode.ToString() ?? "";
    }

    private static string BuildPayloadJson(IPluginExecutionContext? context)
    {
        if (context == null) return "{}";
        return "{" +
            $"\"correlationId\":\"{EscapeJson(context.CorrelationId.ToString())}\"," +
            $"\"operationId\":\"{EscapeJson(context.OperationId.ToString())}\"," +
            $"\"messageName\":\"{EscapeJson(context.MessageName)}\"," +
            $"\"primaryEntityName\":\"{EscapeJson(context.PrimaryEntityName)}\"," +
            $"\"primaryEntityId\":\"{EscapeJson(context.PrimaryEntityId.ToString("D"))}\"," +
            $"\"stage\":{context.Stage},\"mode\":{context.Mode},\"depth\":{context.Depth}," +
            $"\"userId\":\"{EscapeJson(context.UserId.ToString("D"))}\"," +
            $"\"initiatingUserId\":\"{EscapeJson(context.InitiatingUserId.ToString("D"))}\"" +
            "}";
    }

    private static string BuildErrorJson(Exception exception) => "{" +
        $"\"type\":\"{EscapeJson(exception.GetType().FullName ?? exception.GetType().Name)}\"," +
        $"\"message\":\"{EscapeJson(exception.Message)}\"," +
        $"\"errorCode\":\"{EscapeJson(GetErrorCode(exception))}\"" +
        "}";

    private static string EscapeJson(string value) => string.IsNullOrEmpty(value)
        ? ""
        : value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t");

    private static string Truncate(string value, int maxLength) => string.IsNullOrEmpty(value) || value.Length <= maxLength
        ? value ?? ""
        : value.Substring(0, maxLength);
}
