using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Grava o erro do plugin no rastreamento (plugintracelog), que e o unico registro que sobrevive
    /// a falha de um plugin sincrono. Um Create em new_appmotoristaslog dentro da transacao nunca persiste:
    /// se uma chamada aninhada falhou, a transacao ja esta abortada ("ISV code reduced the open transaction
    /// count"); se o erro e de validacao propria, o throw seguinte faz rollback do registro.
    /// O registro em new_appmotoristaslog e feito pelo App (reportAppError) com a mensagem retornada,
    /// cujo "Ref" e o correlationid deste rastreamento.
    /// </summary>
    internal static class PluginErrorTrace
    {
        private const int MessageMaxLength = 2000;

        public static void Write(ITracingService tracing, IPluginExecutionContext context, Exception exception)
        {
            if (tracing == null || exception == null)
            {
                return;
            }

            try
            {
                var action = $"{context?.MessageName ?? "unknown"}:{context?.PrimaryEntityName ?? "unknown"}";
                var json = "{" +
                    "\"event\":\"plugin-error\"," +
                    "\"severity\":\"critical\"," +
                    "\"source\":\"DriverRecordSharingPlugin\"," +
                    "\"component\":\"Betinhos.DriverRecordSharing\"," +
                    $"\"action\":\"{EscapeJson(action)}\"," +
                    $"\"correlationId\":\"{EscapeJson(context?.CorrelationId.ToString("N") ?? "")}\"," +
                    $"\"errorName\":\"{EscapeJson(exception.GetType().FullName ?? exception.GetType().Name)}\"," +
                    $"\"errorCode\":\"{EscapeJson(GetErrorCode(exception))}\"," +
                    $"\"message\":\"{EscapeJson(Truncate(GetMessage(exception), MessageMaxLength))}\"," +
                    $"\"context\":{BuildContextJson(context)}" +
                    "}";
                tracing.Trace("OperationalLog {0}", json);
            }
            catch (Exception traceException)
            {
                tracing.Trace("PluginErrorTrace failed: {0}", traceException);
            }
        }

        private static string GetMessage(Exception exception)
        {
            var fault = exception as FaultException<OrganizationServiceFault>;
            var detail = fault?.Detail?.Message;
            return string.IsNullOrWhiteSpace(detail) ? (exception.Message ?? "") : detail;
        }

        private static string GetErrorCode(Exception exception)
        {
            var fault = exception as FaultException<OrganizationServiceFault>;
            return fault?.Detail?.ErrorCode.ToString() ?? "";
        }

        private static string BuildContextJson(IPluginExecutionContext context)
        {
            if (context == null)
            {
                return "{}";
            }

            return "{" +
                $"\"operationId\":\"{EscapeJson(context.OperationId.ToString())}\"," +
                $"\"messageName\":\"{EscapeJson(context.MessageName)}\"," +
                $"\"primaryEntityName\":\"{EscapeJson(context.PrimaryEntityName)}\"," +
                $"\"primaryEntityId\":\"{EscapeJson(context.PrimaryEntityId.ToString("D"))}\"," +
                $"\"stage\":{context.Stage}," +
                $"\"mode\":{context.Mode}," +
                $"\"depth\":{context.Depth}," +
                $"\"userId\":\"{EscapeJson(context.UserId.ToString("D"))}\"," +
                $"\"initiatingUserId\":\"{EscapeJson(context.InitiatingUserId.ToString("D"))}\"" +
                "}";
        }

        private static string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "";
            }

            return value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n")
                .Replace("\t", "\\t");
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            {
                return value ?? "";
            }

            return value.Substring(0, maxLength);
        }
    }
}
