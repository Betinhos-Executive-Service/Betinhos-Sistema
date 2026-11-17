using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json.Linq;

namespace Betinhos.Planner.Notifications
{
    /// <summary>
    /// Sends Dataverse in-app notifications without depending on a browser tab.
    /// Register on Create / cr40f_plannertarefaevento / PostOperation / Asynchronous.
    /// </summary>
    public sealed class PlannerTaskEventNotificationPlugin : IPlugin
    {
        private const string EventTable = "cr40f_plannertarefaevento";
        private const string EmployeeTable = "cr40f_funcionarios";
        private const string TaskTable = "cr40f_plannertarefa";
        private const string EmployeeId = "cr40f_funcionariosid";
        private const string UserLookup = "cr40f_usuariodataverse";
        private const int NormalPriority = 200000000;
        private const int TimedToast = 200000000;
        private const int ExpirySeconds = 1209600;
        private const int MaxRecipients = 50;
        private const int MaxBodyLength = 4000;
        // Tarefa da multa (Cr40f.Frota.Plugin, MultaTarefaPlugin): evento criado pelo step assíncrono do sistema (Depth 2, sem ator).
        private const string MultaSourceType = "multa";
        private const string MultaCodePrefix = "MULTA:";
        private const int MultaOrigin = 100000003;
        private const int MaxDepth = 1;
        private const int MultaStepDepth = 2;
        private const string ResponsibleTable = "cr40f_plannertarearesponsavel";

        public void Execute(IServiceProvider serviceProvider)
        {
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Depth > MultaStepDepth || !string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase)) return;
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity)) return;

            var target = (Entity)context.InputParameters["Target"];
            if (!string.Equals(target.LogicalName, EventTable, StringComparison.OrdinalIgnoreCase)) return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var initiatingService = factory.CreateOrganizationService(context.InitiatingUserId);
            var service = factory.CreateOrganizationService(context.UserId);
            var eventRow = LoadAuthorizedEvent(initiatingService, target.Id);
            // O evento da multa é gravado pelo sistema (step assíncrono, Depth 2): o usuário que editou a multa pode não ler o evento. Só no
            // Depth 2 lê com o usuário do step, e abaixo o evento só segue se for mesmo a atribuição da tarefa de multa.
            if (eventRow == null && context.Depth > MaxDepth) eventRow = LoadAuthorizedEvent(service, target.Id);
            if (eventRow == null) return;

            var field = eventRow.GetAttributeValue<string>("cr40f_campo") ?? string.Empty;
            if (!field.StartsWith("notification:", StringComparison.OrdinalIgnoreCase)) return;
            var contextJson = ParseContext(eventRow.GetAttributeValue<string>("cr40f_valornovo"));
            if (!IsSupportedField(field) || !HasValidEventShape(eventRow, contextJson)) return;

            var actorEmployeeId = ReadGuid(contextJson, "actorEmployeeId");
            var multaAssignment = !actorEmployeeId.HasValue && context.Depth == MultaStepDepth && IsMultaAssignment(service, tracing, eventRow, field, contextJson);
            if (context.Depth > MaxDepth && !multaAssignment) return;
            if (actorEmployeeId.HasValue)
            {
                if (!ActorMatchesInitiatingUser(initiatingService, actorEmployeeId.Value, context.InitiatingUserId)) return;
            }
            else if (!multaAssignment && !IsSystemGenerated(field, contextJson)) return;

            var recipientEmployeeIds = RecipientEmployeeIds(field, contextJson);
            if (actorEmployeeId.HasValue) recipientEmployeeIds.Remove(actorEmployeeId.Value);
            if (recipientEmployeeIds.Count == 0) return;

            var users = ResolveUsers(service, recipientEmployeeIds);
            var taskTitle = ResolveTaskTitle(multaAssignment ? service : initiatingService, eventRow);
            var title = NotificationTitle(field);
            var body = field.EndsWith(":assignment", StringComparison.OrdinalIgnoreCase)
                ? (string.IsNullOrWhiteSpace(taskTitle) ? "Tarefa" : taskTitle)
                : BuildBody(eventRow.GetAttributeValue<string>("cr40f_descricao"), taskTitle);
            var iconType = NotificationIcon(field, contextJson);

            foreach (var userId in users)
            {
                try
                {
                    SendAppNotification(service, userId, title, body, iconType);
                }
                catch (Exception error)
                {
                    // Notification failure must not roll back the task event.
                    tracing?.Trace("Planner notification failed for {0}: {1}", userId, error);
                }
            }
        }

        private static bool IsSupportedField(string field)
        {
            return field.Equals("notification:assignment", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:mention", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:deadline", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:status", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:waiting", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:assignees", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:overdue_manual", StringComparison.OrdinalIgnoreCase)
                || field.Equals("notification:test", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSystemGenerated(string field, JObject context)
        {
            return field.Equals("notification:test", StringComparison.OrdinalIgnoreCase)
                || (field.Equals("notification:deadline", StringComparison.OrdinalIgnoreCase)
                    && (string.Equals(context["collectionType"]?.ToString(), "due_today", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(context["collectionType"]?.ToString(), "overdue", StringComparison.OrdinalIgnoreCase)));
        }

        /// <summary>
        /// Atribuição da tarefa de multa, gerada pelo sistema (sem ator), só no Depth do step assíncrono (quem chama confere): o contexto diz
        /// sourceType "multa", a tarefa confere (origem Multa e cr40f_codigoorigem igual ao sourceCode, "MULTA:&lt;id&gt;") e todos os
        /// assigneeIds já são responsáveis da tarefa (cr40f_plannertarearesponsavel). Sem isso, um usuário comum forjaria o evento para
        /// notificar quem quisesse. Lê com o service do step.
        /// </summary>
        private static bool IsMultaAssignment(IOrganizationService service, ITracingService tracing, Entity eventRow, string field, JObject context)
        {
            if (!field.Equals("notification:assignment", StringComparison.OrdinalIgnoreCase)) return false;
            if (!string.Equals(context["sourceType"]?.ToString(), MultaSourceType, StringComparison.OrdinalIgnoreCase)) return false;
            var sourceCode = context["sourceCode"]?.ToString() ?? string.Empty;
            if (!sourceCode.StartsWith(MultaCodePrefix, StringComparison.Ordinal)) return false;
            var task = eventRow.GetAttributeValue<EntityReference>("cr40f_tarefa");
            if (service == null || task == null || task.Id == Guid.Empty) return false;
            try
            {
                var row = service.Retrieve(TaskTable, task.Id, new ColumnSet("cr40f_origem", "cr40f_codigoorigem"));
                var origin = row.GetAttributeValue<OptionSetValue>("cr40f_origem");
                if (origin == null || origin.Value != MultaOrigin
                    || !string.Equals(row.GetAttributeValue<string>("cr40f_codigoorigem"), sourceCode, StringComparison.Ordinal)) return false;
                var assignees = new HashSet<Guid>();
                AddIds(assignees, context, "assigneeIds");
                if (assignees.Count == 0) return false;
                var responsibles = new HashSet<Guid>();
                var query = new QueryExpression(ResponsibleTable) { ColumnSet = new ColumnSet("cr40f_funcionario") };
                query.Criteria.AddCondition("cr40f_tarefa", ConditionOperator.Equal, task.Id);
                foreach (var link in service.RetrieveMultiple(query).Entities)
                {
                    var employee = link.GetAttributeValue<EntityReference>("cr40f_funcionario");
                    if (employee != null) responsibles.Add(employee.Id);
                }
                return assignees.IsSubsetOf(responsibles);
            }
            catch (Exception error)
            {
                tracing?.Trace("Planner notification: evento da multa recusado ao conferir a tarefa {0}: {1}", task.Id, error);
                return false;
            }
        }

        private static bool HasValidEventShape(Entity target, JObject context)
        {
            var description = target.GetAttributeValue<string>("cr40f_descricao") ?? string.Empty;
            var value = target.GetAttributeValue<string>("cr40f_valornovo") ?? string.Empty;
            var task = target.GetAttributeValue<EntityReference>("cr40f_tarefa");
            return context != null && description.Length <= 4000 && value.Length <= 16000
                && task != null && task.Id != Guid.Empty && string.Equals(task.LogicalName, TaskTable, StringComparison.OrdinalIgnoreCase);
        }

        private static Entity LoadAuthorizedEvent(IOrganizationService service, Guid eventId)
        {
            if (service == null || eventId == Guid.Empty) return null;
            try
            {
                return service.Retrieve(EventTable, eventId, new ColumnSet("cr40f_campo", "cr40f_valornovo", "cr40f_descricao", "cr40f_tarefa"));
            }
            catch
            {
                return null;
            }
        }

        private static JObject ParseContext(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return new JObject();
            try { return JObject.Parse(value); } catch { return new JObject(); }
        }

        private static HashSet<Guid> RecipientEmployeeIds(string field, JObject context)
        {
            var result = new HashSet<Guid>();
            if (field.EndsWith(":test", StringComparison.OrdinalIgnoreCase)
                || (field.EndsWith(":deadline", StringComparison.OrdinalIgnoreCase)
                    && (string.Equals(context["collectionType"]?.ToString(), "due_today", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(context["collectionType"]?.ToString(), "overdue", StringComparison.OrdinalIgnoreCase))))
            {
                AddIds(result, context, "notificationRecipientIds");
            }
            else if (field.EndsWith(":assignment", StringComparison.OrdinalIgnoreCase))
            {
                AddIds(result, context, "assigneeIds");
            }
            else if (field.EndsWith(":mention", StringComparison.OrdinalIgnoreCase))
            {
                AddIds(result, context, "mentionedEmployeeIds");
            }
            else if (field.EndsWith(":overdue_manual", StringComparison.OrdinalIgnoreCase))
            {
                AddIds(result, context, "notificationRecipientIds");
            }
            else if (field.EndsWith(":assignees", StringComparison.OrdinalIgnoreCase))
            {
                AddIds(result, context, "removedAssigneeIds");
            }
            else
            {
                AddId(result, context, "creatorEmployeeId");
                AddIds(result, context, "assigneeIds");
                AddIds(result, context, "previousAssigneeIds");
                AddIds(result, context, "mentionedEmployeeIds");
                AddIds(result, context, "waitingTargetIds");
            }
            return result.Count <= MaxRecipients ? result : new HashSet<Guid>();
        }

        private static void AddIds(HashSet<Guid> target, JObject context, string property)
        {
            var values = context[property] as JArray;
            if (values == null || values.Count > MaxRecipients) return;
            foreach (var value in values)
            {
                var id = ParseGuid(value.ToString());
                if (id.HasValue) target.Add(id.Value);
            }
        }

        private static void AddId(HashSet<Guid> target, JObject context, string property)
        {
            var id = ReadGuid(context, property);
            if (id.HasValue) target.Add(id.Value);
        }

        private static Guid? ReadGuid(JObject context, string property)
        {
            return ParseGuid(context[property]?.ToString());
        }

        private static Guid? ParseGuid(string value)
        {
            Guid id;
            return Guid.TryParse(value?.Trim('{', '}'), out id) ? (Guid?)id : null;
        }

        private static IEnumerable<Guid> ResolveUsers(IOrganizationService service, HashSet<Guid> employeeIds)
        {
            if (service == null || employeeIds == null || employeeIds.Count == 0 || employeeIds.Count > MaxRecipients) return new Guid[0];
            var query = new QueryExpression(EmployeeTable)
            {
                ColumnSet = new ColumnSet(UserLookup)
            };
            query.Criteria.AddCondition(EmployeeId, ConditionOperator.In, employeeIds.Cast<object>().ToArray());
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var userIds = new HashSet<Guid>();
            foreach (var employee in service.RetrieveMultiple(query).Entities)
            {
                var user = employee.GetAttributeValue<EntityReference>(UserLookup);
                if (user != null && user.Id != Guid.Empty && string.Equals(user.LogicalName, "systemuser", StringComparison.OrdinalIgnoreCase)) userIds.Add(user.Id);
            }
            if (userIds.Count == 0) return new Guid[0];

            var activeUserQuery = new QueryExpression("systemuser") { ColumnSet = new ColumnSet(false) };
            activeUserQuery.Criteria.AddCondition("systemuserid", ConditionOperator.In, userIds.Cast<object>().ToArray());
            activeUserQuery.Criteria.AddCondition("isdisabled", ConditionOperator.Equal, false);
            return service.RetrieveMultiple(activeUserQuery).Entities.Select(row => row.Id).Distinct().ToArray();
        }

        private static string ResolveTaskTitle(IOrganizationService service, Entity target)
        {
            var task = target.GetAttributeValue<EntityReference>("cr40f_tarefa");
            if (task == null || task.Id == Guid.Empty || !string.Equals(task.LogicalName, TaskTable, StringComparison.OrdinalIgnoreCase)) return string.Empty;
            try
            {
                var row = service.Retrieve(TaskTable, task.Id, new ColumnSet("cr40f_titulo", "statecode"));
                var state = row.GetAttributeValue<OptionSetValue>("statecode");
                return state == null || state.Value != 0 ? string.Empty : row.GetAttributeValue<string>("cr40f_titulo") ?? string.Empty;
            }
            catch { return string.Empty; }
        }

        private static bool ActorMatchesInitiatingUser(IOrganizationService service, Guid actorEmployeeId, Guid initiatingUserId)
        {
            if (service == null || actorEmployeeId == Guid.Empty || initiatingUserId == Guid.Empty) return false;
            try
            {
                var query = new QueryExpression(EmployeeTable)
                {
                    ColumnSet = new ColumnSet(UserLookup),
                    TopCount = 2
                };
                query.Criteria.AddCondition(EmployeeId, ConditionOperator.Equal, actorEmployeeId);
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                var rows = service.RetrieveMultiple(query).Entities;
                if (rows.Count != 1) return false;
                var user = rows[0].GetAttributeValue<EntityReference>(UserLookup);
                return user != null && user.Id == initiatingUserId && string.Equals(user.LogicalName, "systemuser", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static string NotificationTitle(string field)
        {
            if (field.EndsWith(":test", StringComparison.OrdinalIgnoreCase)) return "Teste de notificação";
            if (field.EndsWith(":deadline", StringComparison.OrdinalIgnoreCase)) return "Prazo alterado";
            if (field.EndsWith(":assignment", StringComparison.OrdinalIgnoreCase)) return "Nova tarefa:";
            if (field.EndsWith(":mention", StringComparison.OrdinalIgnoreCase)) return "Você foi mencionado";
            if (field.EndsWith(":status", StringComparison.OrdinalIgnoreCase)) return "Status alterado";
            if (field.EndsWith(":waiting", StringComparison.OrdinalIgnoreCase)) return "Retorno aguardado";
            if (field.EndsWith(":overdue_manual", StringComparison.OrdinalIgnoreCase)) return "Cobrança de tarefa atrasada";
            if (field.EndsWith(":assignees", StringComparison.OrdinalIgnoreCase)) return "Responsáveis alterados";
            return "Atualização de tarefa";
        }

        private static string BuildBody(string description, string taskTitle)
        {
            var body = (description ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(taskTitle)) body = string.IsNullOrWhiteSpace(body) ? taskTitle : body + " Tarefa: " + taskTitle + ".";
            if (string.IsNullOrWhiteSpace(body)) body = "A tarefa teve uma atualização.";
            return body.Length <= MaxBodyLength ? body : body.Substring(0, MaxBodyLength - 3) + "...";
        }

        private static int NotificationIcon(string field, JObject context)
        {
            if (field.EndsWith(":mention", StringComparison.OrdinalIgnoreCase)) return 100000004;
            if (field.EndsWith(":waiting", StringComparison.OrdinalIgnoreCase)) return 100000003;
            if (field.EndsWith(":overdue_manual", StringComparison.OrdinalIgnoreCase)) return 100000003;
            if (field.EndsWith(":status", StringComparison.OrdinalIgnoreCase) && string.Equals(context["nextStatus"]?.ToString(), "done", StringComparison.OrdinalIgnoreCase)) return 100000001;
            return 100000000;
        }

        private static void SendAppNotification(IOrganizationService service, Guid userId, string title, string body, int iconType)
        {
            var request = new OrganizationRequest("SendAppNotification");
            request["Title"] = title;
            request["Body"] = body;
            request["Recipient"] = new EntityReference("systemuser", userId);
            request["Priority"] = new OptionSetValue(NormalPriority);
            request["Expiry"] = ExpirySeconds;
            request["IconType"] = new OptionSetValue(iconType);
            request["ToastType"] = new OptionSetValue(TimedToast);
            service.Execute(request);
        }
    }
}
