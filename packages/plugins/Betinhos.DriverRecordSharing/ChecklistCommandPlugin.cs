using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using static Betinhos.DriverRecordSharing.ChecklistFactory;

namespace Betinhos.DriverRecordSharing
{
    // Custom APIs do checklist de vistoria de veículo. Não existe reprovação: a operação só solicita,
    // acompanha e cancela; o motorista conclui. O responsável é quem está com o veículo segundo a sincronização
    // Infleet já existente (new_SincronizarVeiculoAtual grava cr40f_veiculoatual no funcionário).
    public sealed class ChecklistCommandPlugin : IPlugin
    {
        private const string PhotoTable = "new_checklistveiculofoto";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);

            try
            {
                switch (context.MessageName)
                {
                    case "new_SolicitarChecklistVeiculo":
                        Request(context, caller, system);
                        break;
                    case "new_ProcessarChecklistsVeiculos":
                        Process(context, system, DateTime.UtcNow);
                        break;
                    case "new_ReatribuirChecklistVeiculo":
                        RequestAssignment(context, caller, system);
                        break;
                    case "new_ConcluirChecklistVeiculo":
                        Conclude(context, system);
                        break;
                    case "new_CancelarChecklistVeiculo":
                        Cancel(context, caller, system);
                        break;
                    case "new_ReenviarPushChecklist":
                        RetryPush(context, caller, system);
                        break;
                    case "Update" when context.PrimaryEntityName == ChecklistTable:
                        GuardClosedChecklist(context, system);
                        break;
                    case "Delete" when context.PrimaryEntityName == ChecklistTable:
                        GuardClosedChecklistDelete(context, system);
                        break;
                    default:
                        throw new InvalidPluginExecutionException("Ação de checklist desconhecida.");
                }
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error)
            {
                throw new InvalidPluginExecutionException("Falha ao processar checklist. Contate a operação.", error);
            }
        }

        private static Guid InputGuid(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || !(context.InputParameters[name] is Guid id) || id == Guid.Empty)
                throw new InvalidPluginExecutionException("Identificador do checklist inválido.");
            return id;
        }

        private static Guid? OptionalGuid(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || !(context.InputParameters[name] is Guid id) || id == Guid.Empty) return null;
            return id;
        }

        private static string InputString(IPluginExecutionContext context, string name)
        {
            return context.InputParameters.Contains(name) ? (Convert.ToString(context.InputParameters[name], CultureInfo.InvariantCulture) ?? "").Trim() : "";
        }

        // ---------- Solicitação ----------

        private static void Request(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var vehicleId = InputGuid(context, "new_VeiculoId");
            // A Custom API exige escrita no checklist; o chamador também precisa enxergar o veículo.
            caller.Retrieve(VehicleTable, vehicleId, new ColumnSet("cr40f_placa"));
            var modelId = OptionalGuid(context, "new_ModeloId");
            var vehicle = system.Retrieve(VehicleTable, vehicleId, new ColumnSet(VehicleColumns()));
            if (vehicle.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
                throw new InvalidPluginExecutionException("Veículo inativo não pode receber checklist.");
            // Sem modelo informado: o modelo cujo filtro casa com o veículo; nada casou, o padrão.
            Entity template;
            if (modelId.HasValue) template = LoadTemplate(system, modelId.Value);
            else
            {
                var templates = LoadActiveTemplates(system);
                var fallback = DefaultTemplate(templates); // exige exatamente um padrão ativo, como na rotina e na troca
                template = ResolveTemplate(templates, vehicle) ?? fallback;
            }
            var now = DateTime.UtcNow;
            var id = CreateChecklist(system, vehicle, template, Manual, now, context.InitiatingUserId, vehicleId.ToString("D") + ":M:" + Guid.NewGuid().ToString("N"));
            AssignCurrentDriver(system, id);
            context.OutputParameters["new_ChecklistId"] = id;
        }

        // ---------- Rotina diária ----------

        private static void Process(IPluginExecutionContext context, IOrganizationService system, DateTime now)
        {
            var templates = LoadActiveTemplates(system);
            DefaultTemplate(templates); // exige exatamente um padrão ativo
            var maxPeriod = templates.Max(PeriodDays);

            var open = AllRows(system, ChecklistQuery(new ColumnSet("new_veiculo", "new_estado"), AguardandoMotorista, Pendente));
            var openVehicles = new HashSet<Guid>(open.Select(row => row.GetAttributeValue<EntityReference>("new_veiculo")?.Id ?? Guid.Empty));

            // Última conclusão por veículo dentro da maior periodicidade; cada veículo compara com a do seu modelo.
            var recent = ChecklistQuery(new ColumnSet("new_veiculo", "new_concluidoem"), Concluido);
            recent.Criteria.AddCondition("new_concluidoem", ConditionOperator.GreaterThan, now.AddDays(-maxPeriod));
            var lastDone = AllRows(system, recent)
                .GroupBy(row => row.GetAttributeValue<EntityReference>("new_veiculo")?.Id ?? Guid.Empty)
                .ToDictionary(group => group.Key, group => group.Max(row => row.GetAttributeValue<DateTime>("new_concluidoem")));

            // Vendido sai no ResolveTemplate, em memória: no servidor, "diferente de Vendido" perderia os de status vazio.
            var vehicles = new QueryExpression(VehicleTable) { ColumnSet = new ColumnSet(VehicleColumns("cr40f_placa")) };
            vehicles.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

            var created = new List<Guid>();
            var day = BrazilDate(now).ToString("yyyyMMdd", CultureInfo.InvariantCulture);
            foreach (var vehicle in AllRows(system, vehicles))
            {
                if (openVehicles.Contains(vehicle.Id)) continue;
                var template = ResolveTemplate(templates, vehicle);
                if (template == null) continue;
                if (lastDone.TryGetValue(vehicle.Id, out var done) && done > now.AddDays(-PeriodDays(template))) continue;
                created.Add(CreateChecklist(system, vehicle, template, Quinzenal, now, context.InitiatingUserId, vehicle.Id.ToString("D") + ":Q:" + day));
            }

            // Novos e abertos: confere quem está com cada veículo agora.
            var assigned = 0;
            foreach (var id in created.Concat(open.Select(row => row.Id)))
                if (AssignCurrentDriver(system, id)) assigned++;
            context.OutputParameters["new_Resumo"] = "criados=" + created.Count + ";abertos=" + open.Count + ";atribuidos=" + assigned;
        }

        private static QueryExpression ChecklistQuery(ColumnSet columns, params int[] states)
        {
            var query = new QueryExpression(ChecklistTable) { ColumnSet = columns };
            query.Criteria.AddCondition("new_estado", ConditionOperator.In, states.Cast<object>().ToArray());
            return query;
        }

        private static List<Entity> AllRows(IOrganizationService system, QueryExpression query)
        {
            query.PageInfo = new PagingInfo { Count = 500, PageNumber = 1 };
            var result = new List<Entity>();
            EntityCollection page;
            do
            {
                page = system.RetrieveMultiple(query);
                result.AddRange(page.Entities);
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            } while (page.MoreRecords);
            return result;
        }

        // ---------- Atribuição ----------

        private static void RequestAssignment(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var id = InputGuid(context, "new_ChecklistId");
            caller.Retrieve(ChecklistTable, id, new ColumnSet("new_estado"));
            var checklist = system.Retrieve(ChecklistTable, id, new ColumnSet("new_estado"));
            if (!IsOpen(checklist)) throw new InvalidPluginExecutionException("Checklist já foi encerrado.");
            AssignCurrentDriver(system, id);
        }

        // ---------- Motorista ----------

        private static Entity ChecklistForCaller(IPluginExecutionContext context, IOrganizationService system)
        {
            var checklist = system.Retrieve(ChecklistTable, InputGuid(context, "new_ChecklistId"), new ColumnSet(
                "ownerid", "new_motorista", "new_estado", "new_itensjson"));
            var owner = checklist.GetAttributeValue<EntityReference>("ownerid");
            if (owner == null || owner.LogicalName != "systemuser" || owner.Id != context.InitiatingUserId)
                throw new InvalidPluginExecutionException("Este checklist não pertence ao motorista autenticado.");
            var user = system.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("internalemailaddress"));
            var email = user.GetAttributeValue<string>("internalemailaddress");
            if (string.IsNullOrWhiteSpace(email)) throw new InvalidPluginExecutionException("Usuário sem e-mail Microsoft.");
            var employee = new QueryExpression(DriverTable) { ColumnSet = new ColumnSet("cr40f_nomecompleto") };
            employee.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, email);
            employee.Criteria.AddCondition("cr40f_status", ConditionOperator.Equal, 0);
            employee.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            employee.Criteria.AddCondition("cr40f_tipodevinculo", ConditionOperator.In, new object[] { 0, 1 });
            var matches = system.RetrieveMultiple(employee).Entities;
            var linked = checklist.GetAttributeValue<EntityReference>("new_motorista");
            if (matches.Count != 1 || linked == null || matches[0].Id != linked.Id)
                throw new InvalidPluginExecutionException("Usuário não está vinculado ao motorista deste checklist.");
            return checklist;
        }

        private static void Conclude(IPluginExecutionContext context, IOrganizationService system)
        {
            var checklist = ChecklistForCaller(context, system);
            var state = Choice(checklist, "new_estado");
            // Repetição após resposta perdida não deve falhar nem duplicar fotos.
            if (state == Concluido) return;
            if (state != Pendente) throw new InvalidPluginExecutionException("Este checklist não está mais pendente.");

            var answers = ChecklistAnswers.Validate(checklist.GetAttributeValue<string>("new_itensjson"), InputString(context, "new_RespostasJson"));
            var owner = new EntityReference("systemuser", context.InitiatingUserId);
            foreach (var answer in answers)
            {
                for (var index = 0; index < answer.Fotos.Count; index++)
                {
                    var photo = answer.Fotos[index];
                    var row = new Entity(PhotoTable);
                    row["new_name"] = Limit(answer.Rotulo + " " + (index + 1), 150);
                    row["new_checklist"] = new EntityReference(ChecklistTable, checklist.Id);
                    row["new_itemchave"] = Limit(answer.Chave, 64);
                    row["new_ordem"] = index + 1;
                    row["new_link"] = photo.Link;
                    row["new_caminho"] = photo.Caminho;
                    row["new_nomearquivo"] = photo.NomeArquivo;
                    row["ownerid"] = owner;
                    system.Create(row);
                }
            }

            var update = new Entity(ChecklistTable, checklist.Id);
            update["new_respostasjson"] = ChecklistAnswers.SerializeAnswers(answers);
            var problems = ChecklistAnswers.CountProblems(answers);
            update["new_temproblema"] = problems > 0;
            update["new_qtdproblemas"] = problems;
            update["new_concluidoem"] = DateTime.UtcNow;
            update["new_estado"] = new OptionSetValue(Concluido);
            system.Update(update);
        }

        // ---------- Gestão ----------

        private static void Cancel(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var id = InputGuid(context, "new_ChecklistId");
            caller.Retrieve(ChecklistTable, id, new ColumnSet("new_estado"));
            var checklist = system.Retrieve(ChecklistTable, id, new ColumnSet("new_estado"));
            if (!IsOpen(checklist)) throw new InvalidPluginExecutionException("Somente checklist pendente pode ser cancelado.");
            var update = new Entity(ChecklistTable, id);
            update["new_estado"] = new OptionSetValue(Cancelado);
            update["new_canceladoem"] = DateTime.UtcNow;
            update["new_motivocancelamento"] = Limit(InputString(context, "new_Motivo"), 500);
            system.Update(update);
        }

        private static void RetryPush(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var id = InputGuid(context, "new_ChecklistId");
            caller.Retrieve(ChecklistTable, id, new ColumnSet("new_estado"));
            var checklist = system.Retrieve(ChecklistTable, id, new ColumnSet("new_estado", "new_pushstatus"));
            var push = Choice(checklist, "new_pushstatus");
            // Falhou: reenvio. Enviado e ainda pendente: lembrete ao motorista.
            if (Choice(checklist, "new_estado") != Pendente || (push != PushFalhou && push != PushEnviado))
                throw new InvalidPluginExecutionException("Push só pode ser reenviado para checklist pendente com motorista atribuído.");
            var update = new Entity(ChecklistTable, id);
            update["new_pushstatus"] = new OptionSetValue(PushPendente);
            update["new_pusherro"] = "";
            system.Update(update);
        }

        private static readonly string[] ClosedFields =
        {
            "new_veiculo", "new_motorista", "new_modelo", "new_itensjson", "new_respostasjson", "new_estado", "new_concluidoem", "new_origem"
        };

        private static void GuardClosedChecklist(IPluginExecutionContext context, IOrganizationService system)
        {
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (target == null || target.LogicalName != ChecklistTable) return;
            var current = system.Retrieve(ChecklistTable, target.Id, new ColumnSet("new_estado"));
            if (IsOpen(current)) return;
            if (ClosedFields.Any(target.Contains))
                throw new InvalidPluginExecutionException("Checklist concluído ou cancelado não pode ser alterado.");
        }

        private static void GuardClosedChecklistDelete(IPluginExecutionContext context, IOrganizationService system)
        {
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null || target.LogicalName != ChecklistTable) return;
            var current = system.Retrieve(ChecklistTable, target.Id, new ColumnSet("new_estado"));
            if (Choice(current, "new_estado") == Concluido)
                throw new InvalidPluginExecutionException("Checklist concluído não pode ser excluído.");
        }
    }
}
