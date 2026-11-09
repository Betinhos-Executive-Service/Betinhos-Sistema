using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.ExpenseUpload
{
    public sealed class ExpenseUploadCommand : IPlugin
    {
        const string Attachment = "cr40f_anexodespesaoperacional";
        const string Expense = "cr40f_despesaoperacional";
        const int Pending = 100000000, Sent = 100000001, Failed = 100000002, Processing = 100000004;

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName != "new_ExpenseUploadTransition")
                throw new InvalidPluginExecutionException("Mensagem inválida.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            // Honor the caller's existing row permissions; never elevate.
            var service = factory.CreateOrganizationService(context.UserId);
            var json = new JavaScriptSerializer();
            var input = json.Deserialize<Dictionary<string, object>>((string)context.InputParameters["new_Command"]);
            var id = Guid.Parse(Text(input, "attachmentId"));
            var attempt = Guid.Parse(Text(input, "attemptId")).ToString();
            var row = service.Retrieve(Attachment, id, new ColumnSet("new_uploadattemptid", "new_uploadrunid", "cr40f_status", "cr40f_despesa", "cr40f_nomearquivo", "cr40f_mimetype"));
            var parentId = row.GetAttributeValue<EntityReference>("cr40f_despesa").Id;
            var parent = service.Retrieve(Expense, parentId, new ColumnSet("cr40f_statusanexo", "new_uploadexpectedcount"));
            var status = row.GetAttributeValue<OptionSetValue>("cr40f_status").Value;
            var command = Text(input, "action");
            var runId = Text(input, "runId");
            if (command != "retry" && command != "cancelUnclaimed" && (String.IsNullOrEmpty(runId) || runId.Length > 100))
                throw new InvalidPluginExecutionException("ID da execução obrigatório.");
            if (!String.Equals(row.GetAttributeValue<string>("new_uploadattemptid"), attempt, StringComparison.OrdinalIgnoreCase))
            {
                context.OutputParameters["new_Result"] = json.Serialize(new { applied = false, status, stale = true });
                return;
            }
            var patch = new Entity(Attachment, id);
            bool applied = false;
            if (command == "claim" && status == Processing && row.GetAttributeValue<string>("new_uploadrunid") == runId)
            {
                context.OutputParameters["new_Result"] = json.Serialize(new { applied = true, status, expenseId = parentId, fileName = row.GetAttributeValue<string>("cr40f_nomearquivo"), mimeType = row.GetAttributeValue<string>("cr40f_mimetype") });
                return;
            }
            if (command == "claim" && status == Pending)
            {
                patch["new_uploadrunid"] = runId;
                patch["cr40f_status"] = new OptionSetValue(Processing);
                patch["new_uploaderror"] = null;
                applied = true;
            }
            else if (command == "cancelUnclaimed" && status == Pending)
            {
                patch["cr40f_status"] = new OptionSetValue(Failed);
                patch["new_uploaderror"] = "Tentativa encerrada pelo usuário antes do início do processamento.";
                applied = true;
            }
            else if (command == "retry" && status == Failed)
            {
                patch["new_uploadattemptid"] = Guid.Parse(Text(input, "nextAttemptId")).ToString();
                patch["new_uploadrunid"] = null;
                patch["cr40f_status"] = new OptionSetValue(Pending);
                patch["new_uploaderror"] = null;
                applied = true;
            }
            else if (command == "complete" && status == Processing && row.GetAttributeValue<string>("new_uploadrunid") == runId)
            {
                var link = Text(input, "shareLink");
                if (!Uri.TryCreate(link, UriKind.Absolute, out var uri) || uri.Scheme != "https" || link.Length > 1000)
                    throw new InvalidPluginExecutionException("Link de comprovante inválido.");
                patch["cr40f_urlsharepoint"] = link;
                patch["cr40f_sharelink"] = link;
                patch["cr40f_driveitemid"] = Text(input, "fileId");
                patch["cr40f_dataenvio"] = DateTime.UtcNow;
                patch["cr40f_status"] = new OptionSetValue(Sent);
                patch["new_uploaderror"] = null;
                applied = true;
            }
            else if (command == "fail" && status == Processing && row.GetAttributeValue<string>("new_uploadrunid") == runId)
            {
                var error = Regex.Replace(Text(input, "error"), @"https?://[^\s]+", "[URL omitida]", RegexOptions.IgnoreCase);
                error = Regex.Replace(error, @"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email omitido]");
                error = Regex.Replace(error, @"(?:Bearer\s+|(?:sig|token|secret|key)=)[^\s,;]+", "[credencial omitida]", RegexOptions.IgnoreCase);
                error = Regex.Replace(error, @"[A-Za-z0-9+/=]{128,}", "[conteúdo omitido]");
                patch["new_uploaderror"] = error.Substring(0, Math.Min(2000, error.Length));
                patch["cr40f_status"] = new OptionSetValue(Failed);
                applied = true;
            }
            else if (!new[] { "claim", "retry", "complete", "fail", "cancelUnclaimed" }.Contains(command))
                throw new InvalidPluginExecutionException("Transição inválida.");

            if (applied)
            {
                Update(service, patch, row.RowVersion);
                var query = new QueryExpression(Attachment) { ColumnSet = new ColumnSet("cr40f_status") };
                query.Criteria.AddCondition("cr40f_despesa", ConditionOperator.Equal, parentId);
                var states = service.RetrieveMultiple(query).Entities.Select(e => e.GetAttributeValue<OptionSetValue>("cr40f_status").Value).ToArray();
                var expected = parent.GetAttributeValue<int>("new_uploadexpectedcount");
                var pending = states.Length < expected || states.Any(s => s == Pending || s == Processing);
                var parentStatus = pending ? 100000001 : states.All(s => s == Sent) ? 100000002 : states.Any(s => s == Sent) ? 100000004 : 100000003;
                Update(service, new Entity(Expense, parentId) { ["cr40f_statusanexo"] = new OptionSetValue(parentStatus) }, parent.RowVersion);
            }
            context.OutputParameters["new_Result"] = json.Serialize(new { applied, status = applied ? ((OptionSetValue)patch["cr40f_status"]).Value : status, expenseId = parentId, fileName = row.GetAttributeValue<string>("cr40f_nomearquivo"), mimeType = row.GetAttributeValue<string>("cr40f_mimetype") });
        }

        static void Update(IOrganizationService service, Entity patch, string version)
        {
            if (String.IsNullOrEmpty(version)) throw new InvalidPluginExecutionException("Controle de versão indisponível.");
            patch.RowVersion = version;
            service.Execute(new UpdateRequest { Target = patch, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
        }
        static string Text(Dictionary<string, object> input, string key) => input.TryGetValue(key, out var value) ? Convert.ToString(value) ?? "" : "";
    }
}
