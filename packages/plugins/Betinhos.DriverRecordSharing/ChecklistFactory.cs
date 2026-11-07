using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Criação e atribuição de checklists de veículo, compartilhadas pelo ChecklistCommandPlugin
    // (quinzenal e manual) e pelos demais fluxos que geram checklist (troca de motorista).
    public static class ChecklistFactory
    {
        public const string TemplateTable = "new_checklistmodelo";
        public const string TemplateItemTable = "new_checklistmodeloitem";
        public const string ChecklistTable = "new_checklistveiculo";
        public const string VehicleTable = "cr40f_veiculos";
        public const string DriverTable = "cr40f_funcionarios";

        public const int Quinzenal = 100000000;
        public const int Manual = 100000001;
        public const int Troca = 100000002;
        public const int AguardandoMotorista = 100000000;
        public const int Pendente = 100000001;
        public const int Concluido = 100000002;
        public const int Cancelado = 100000003;
        public const int PushPendente = 100000000;
        public const int PushEnviado = 100000001;
        public const int PushFalhou = 100000002;

        public const int VeiculoVendido = 202410000;
        public const int VeiculoAtivo = 202410001;
        public const int VeiculoProprio = 100000000;
        public const int DefaultPeriodDays = 15;

        private static readonly string[] TemplateColumns = { "new_name", "new_ativo", "new_periodicidadedias", "new_padraoquinzenal", "new_filtrojson", "new_prioridade" };

        internal static int Choice(Entity entity, string name) => entity.GetAttributeValue<OptionSetValue>(name)?.Value ?? -1;

        internal static string Limit(string value, int max) => string.IsNullOrEmpty(value) || value.Length <= max ? value ?? "" : value.Substring(0, max);

        internal static DateTime BrazilDate(DateTime utc) => utc.AddHours(-3).Date;

        public static bool IsOpen(Entity checklist)
        {
            var state = Choice(checklist, "new_estado");
            return state == AguardandoMotorista || state == Pendente;
        }

        public static bool IsOwnActiveVehicle(Entity vehicle) =>
            vehicle.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0
            && Choice(vehicle, "cr40f_statusdoveiculo") == VeiculoAtivo
            && Choice(vehicle, "new_categoriadoveiculo") == VeiculoProprio;

        // Universo da rotina: veículo ativo no Dataverse e não vendido (filtros podem alcançar Terceiro/Aluguel).
        public static bool IsChecklistEligible(Entity vehicle) =>
            Choice(vehicle, "statecode") == 0 && Choice(vehicle, "cr40f_statusdoveiculo") != VeiculoVendido;

        // Colunas do veículo usadas pela escolha do modelo (regra do padrão + allowlist do filtro).
        public static string[] VehicleColumns(params string[] extra) =>
            new[] { "statecode", "cr40f_statusdoveiculo", "new_categoriadoveiculo" }.Concat(VehicleFilter.Columns).Concat(extra).Distinct().ToArray();

        public static int PeriodDays(Entity template)
        {
            var period = template.GetAttributeValue<int?>("new_periodicidadedias") ?? DefaultPeriodDays;
            return period < 1 || period > 365 ? DefaultPeriodDays : period;
        }

        // Modelos ativos, inclusive o padrão; carregar uma vez por execução.
        public static List<Entity> LoadActiveTemplates(IOrganizationService system)
        {
            var query = new QueryExpression(TemplateTable) { ColumnSet = new ColumnSet(TemplateColumns) };
            query.Criteria.AddCondition("new_ativo", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            return system.RetrieveMultiple(query).Entities.ToList();
        }

        // Escolha do modelo para o veículo: o primeiro modelo não padrão com filtro que casa, na ordem de
        // prioridade (menor vence, nulo por último, desempate por nome e id); senão o padrão, se o veículo é
        // próprio e ativo; senão null. Modelo não padrão sem filtro nunca é escolhido aqui. Não valida o padrão
        // único: cada fluxo chama DefaultTemplate no seu ponto (a troca só depois dos "ignorado").
        public static Entity ResolveTemplate(IReadOnlyCollection<Entity> templates, Entity vehicle)
        {
            if (!IsChecklistEligible(vehicle)) return null;
            var chosen = templates
                .Where(template => !template.GetAttributeValue<bool>("new_padraoquinzenal"))
                .OrderBy(template => template.GetAttributeValue<int?>("new_prioridade") ?? int.MaxValue)
                .ThenBy(template => template.GetAttributeValue<string>("new_name") ?? "", StringComparer.OrdinalIgnoreCase)
                .ThenBy(template => template.Id.ToString("D"), StringComparer.Ordinal) // igual à Gestão (TS)
                .FirstOrDefault(template => VehicleFilter.Matches(template.GetAttributeValue<string>("new_filtrojson"), vehicle));
            if (chosen != null) return chosen;
            return IsOwnActiveVehicle(vehicle) ? templates.FirstOrDefault(template => template.GetAttributeValue<bool>("new_padraoquinzenal")) : null;
        }

        public static Entity DefaultTemplate(IEnumerable<Entity> templates)
        {
            var defaults = templates.Where(template => template.GetAttributeValue<bool>("new_padraoquinzenal")).ToList();
            if (defaults.Count != 1)
                throw new InvalidPluginExecutionException("Defina exatamente um modelo ativo como padrão quinzenal.");
            return defaults[0];
        }

        public static Entity LoadTemplate(IOrganizationService system, Guid templateId)
        {
            var template = system.Retrieve(TemplateTable, templateId, new ColumnSet(TemplateColumns));
            if (!template.GetAttributeValue<bool>("new_ativo"))
                throw new InvalidPluginExecutionException("Modelo de checklist inativo.");
            return template;
        }

        private static List<ChecklistItem> TemplateItems(IOrganizationService system, Guid templateId)
        {
            var query = new QueryExpression(TemplateItemTable)
            {
                ColumnSet = new ColumnSet("new_name", "new_ordem", "new_instrucao", "new_tipo", "new_obrigatorio", "new_unidade", "new_opcoesproblema")
            };
            query.Criteria.AddCondition("new_modelo", ConditionOperator.Equal, templateId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var items = system.RetrieveMultiple(query).Entities
                .Select(row =>
                {
                    var item = new ChecklistItem
                    {
                        Chave = row.Id.ToString("D"),
                        Ordem = row.GetAttributeValue<int?>("new_ordem") ?? 0,
                        Rotulo = (row.GetAttributeValue<string>("new_name") ?? "").Trim(),
                        Instrucao = (row.GetAttributeValue<string>("new_instrucao") ?? "").Trim(),
                        Tipo = ChecklistAnswers.TipoFromChoice(Choice(row, "new_tipo")),
                        Obrigatorio = row.GetAttributeValue<bool>("new_obrigatorio"),
                        Unidade = (row.GetAttributeValue<string>("new_unidade") ?? "").Trim()
                    };
                    if (item.Tipo == ChecklistAnswers.OkNok) item.OpcoesProblema = ChecklistAnswers.ParseProblemOptions(row.GetAttributeValue<string>("new_opcoesproblema"));
                    return item;
                })
                .OrderBy(item => item.Ordem)
                .ThenBy(item => item.Rotulo, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
            if (items.Count == 0 || items.Count > ChecklistAnswers.MaxItems || items.Any(item => item.Rotulo.Length == 0))
                throw new InvalidPluginExecutionException("Modelo de checklist sem itens válidos.");
            return items;
        }

        public static Guid CreateChecklist(IOrganizationService system, Entity vehicle, Entity template, int origin, DateTime now, Guid requestedBy, string uniqueKey, IDictionary<string, object> extra = null)
        {
            var plate = (vehicle.GetAttributeValue<string>("cr40f_placa") ?? "").Trim();
            var items = TemplateItems(system, template.Id);
            var checklist = new Entity(ChecklistTable);
            checklist["new_name"] = Limit("Checklist " + plate + " - " + BrazilDate(now).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), 150);
            checklist["new_veiculo"] = new EntityReference(VehicleTable, vehicle.Id);
            checklist["new_modelo"] = new EntityReference(TemplateTable, template.Id);
            checklist["new_itensjson"] = ChecklistAnswers.SerializeItems(items);
            checklist["new_origem"] = new OptionSetValue(origin);
            checklist["new_estado"] = new OptionSetValue(AguardandoMotorista);
            checklist["new_chaveunica"] = Limit(uniqueKey, 120);
            checklist["new_solicitadoem"] = now;
            checklist["new_solicitadopor"] = requestedBy.ToString("D");
            if (extra != null) foreach (var pair in extra) checklist[pair.Key] = pair.Value;
            return system.Create(checklist);
        }

        // Troca cancela o que ainda estava aberto para o veículo, menos o checklist novo (exceptId), que é de quem recebeu.
        public static int CancelOpenForHandover(IOrganizationService system, Guid vehicleId, DateTime now, Guid exceptId)
        {
            var query = new QueryExpression(ChecklistTable) { ColumnSet = new ColumnSet("new_estado") };
            query.Criteria.AddCondition("new_veiculo", ConditionOperator.Equal, vehicleId);
            query.Criteria.AddCondition("new_estado", ConditionOperator.In, AguardandoMotorista, Pendente);
            var open = system.RetrieveMultiple(query).Entities.Where(row => row.Id != exceptId).ToList();
            foreach (var row in open)
            {
                var update = new Entity(ChecklistTable, row.Id);
                update["new_estado"] = new OptionSetValue(Cancelado);
                update["new_canceladoem"] = now;
                update["new_motivocancelamento"] = VehicleHandover.CancelReason;
                system.Update(update);
            }
            return open.Count;
        }

        // Checklist de troca já atribuído é de quem recebeu o carro; a rotina e o "Reatribuir" não o passam adiante.
        public static bool KeepsReceiver(Entity checklist) =>
            Choice(checklist, "new_origem") == Troca && checklist.GetAttributeValue<EntityReference>("new_motorista") != null;

        // Atualização inicial do checklist com o hodômetro Infleet atual do veículo.
        private static Entity OdometerUpdate(IOrganizationService system, Entity checklist)
        {
            var vehicleRef = checklist.GetAttributeValue<EntityReference>("new_veiculo");
            var vehicle = system.Retrieve(VehicleTable, vehicleRef.Id, new ColumnSet("cr40f_hodometro"));
            var update = new Entity(ChecklistTable, checklist.Id);
            var odometer = vehicle.GetAttributeValue<int?>("cr40f_hodometro");
            if (odometer.HasValue) update["new_odometroinfleet"] = (decimal)odometer.Value;
            return update;
        }

        // Responsável = funcionário ativo cujo veículo atual (sincronizado da Infleet) é o veículo do checklist.
        // Sem candidato único: mantém o motorista anterior e registra o motivo para a gestão. Retorna true se trocou.
        public static bool AssignCurrentDriver(IOrganizationService system, Guid checklistId)
        {
            var checklist = system.Retrieve(ChecklistTable, checklistId, new ColumnSet("new_estado", "new_motorista", "new_veiculo", "new_origem"));
            if (!IsOpen(checklist)) return false;
            if (KeepsReceiver(checklist)) return false;
            var vehicleRef = checklist.GetAttributeValue<EntityReference>("new_veiculo");
            var update = OdometerUpdate(system, checklist);

            var match = CurrentDriver(system, vehicleRef.Id, out var error);
            if (match == null)
            {
                update["new_erroatribuicao"] = Limit(error, 500);
                system.Update(update);
                return false;
            }
            return ApplyAssignment(system, checklist, update, match.Item1, match.Item2);
        }

        // Atribuição direta a um funcionário já conhecido (checklist de troca), sem a regra "quem pegou por último".
        public static bool AssignDriver(IOrganizationService system, Guid checklistId, Guid driverId)
        {
            var checklist = system.Retrieve(ChecklistTable, checklistId, new ColumnSet("new_estado", "new_motorista", "new_veiculo"));
            if (!IsOpen(checklist)) return false;
            var update = OdometerUpdate(system, checklist);
            var driver = system.Retrieve(DriverTable, driverId, new ColumnSet("cr40f_nomecompleto", "cr40f_emailmicrosoft", "statecode", "cr40f_status", "cr40f_tipodevinculo"));
            // Mesmos filtros do Conclude: quem está fora deles receberia o push mas não conseguiria enviar.
            string error;
            var user = CanSubmit(driver)
                ? UserForDriver(system, driver, out error)
                : NotSubmittable(driver, out error);
            if (user == null)
            {
                update["new_erroatribuicao"] = Limit(error, 500);
                system.Update(update);
                return false;
            }
            return ApplyAssignment(system, checklist, update, driver, user);
        }

        private static int IntValue(Entity entity, string name)
        {
            var value = entity.Contains(name) ? entity[name] : null;
            return value is OptionSetValue option ? option.Value : value is int number ? number : -1;
        }

        // Espelha o filtro do ChecklistCommandPlugin.ChecklistForCaller (statecode 0, cr40f_status 0, vínculo 0 ou 1).
        private static bool CanSubmit(Entity driver)
        {
            var link = IntValue(driver, "cr40f_tipodevinculo");
            return IntValue(driver, "statecode") == 0 && IntValue(driver, "cr40f_status") == 0 && (link == 0 || link == 1);
        }

        private static Entity NotSubmittable(Entity driver, out string error)
        {
            error = "Motorista " + driver.GetAttributeValue<string>("cr40f_nomecompleto") + " não está ativo como motorista (status ou vínculo) e não conseguiria enviar o checklist.";
            return null;
        }

        private static bool ApplyAssignment(IOrganizationService system, Entity checklist, Entity update, Entity driver, Entity user)
        {
            update["new_erroatribuicao"] = "";
            var current = checklist.GetAttributeValue<EntityReference>("new_motorista");
            if (Choice(checklist, "new_estado") == Pendente && current != null && current.Id == driver.Id)
            {
                system.Update(update);
                return false;
            }
            update["new_motorista"] = new EntityReference(DriverTable, driver.Id);
            update["ownerid"] = new EntityReference("systemuser", user.Id);
            update["new_estado"] = new OptionSetValue(Pendente);
            update["new_atribuidoem"] = DateTime.UtcNow;
            update["new_pushstatus"] = new OptionSetValue(PushPendente);
            update["new_pusherro"] = "";
            system.Update(update);
            return true;
        }

        private static DateTime Since(Entity driver) => driver.GetAttributeValue<DateTime?>("new_veiculoatualdesde") ?? DateTime.MinValue;

        private static Tuple<Entity, Entity> CurrentDriver(IOrganizationService system, Guid vehicleId, out string error)
        {
            var query = new QueryExpression(DriverTable) { ColumnSet = new ColumnSet("cr40f_nomecompleto", "cr40f_emailmicrosoft", "new_veiculoatualdesde") };
            query.Criteria.AddCondition("cr40f_veiculoatual", ConditionOperator.Equal, vehicleId);
            query.Criteria.AddCondition("cr40f_status", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("cr40f_tipodevinculo", ConditionOperator.In, new object[] { 0, 1 });
            var drivers = system.RetrieveMultiple(query).Entities.OrderByDescending(Since).ToList();
            if (drivers.Count == 0)
            {
                error = "Nenhum motorista ativo está com este veículo segundo a Infleet.";
                return null;
            }
            // Dois motoristas com o mesmo carro: vale quem pegou por último; empate fica para a operação.
            if (drivers.Count > 1 && Since(drivers[0]) == Since(drivers[1]))
            {
                error = "Mais de um motorista aparece com este veículo; confira na Infleet.";
                return null;
            }
            var driver = drivers[0];
            var user = UserForDriver(system, driver, out error);
            return user == null ? null : Tuple.Create(driver, user);
        }

        // Usuário Microsoft único e ativo do funcionário; null com o motivo em error.
        public static Entity UserForDriver(IOrganizationService system, Entity driver, out string error)
        {
            var email = (driver.GetAttributeValue<string>("cr40f_emailmicrosoft") ?? "").Trim();
            var name = driver.GetAttributeValue<string>("cr40f_nomecompleto");
            if (email.Length == 0) { error = "Motorista " + name + " sem e-mail Microsoft."; return null; }
            var users = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("systemuserid") };
            users.Criteria.AddCondition("internalemailaddress", ConditionOperator.Equal, email);
            users.Criteria.AddCondition("isdisabled", ConditionOperator.Equal, false);
            var found = system.RetrieveMultiple(users).Entities;
            if (found.Count != 1) { error = "Motorista " + name + " sem usuário Microsoft único ativo."; return null; }
            error = "";
            return found[0];
        }
    }
}