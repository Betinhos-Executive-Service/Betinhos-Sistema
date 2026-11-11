using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Step assíncrono no Update de cr40f_funcionarios.cr40f_veiculoatual (pré-imagem "pre").
    // Quando a sincronização Infleet passa um carro da frota própria para outro motorista, quem recebe
    // ganha um checklist de origem Troca. Roda fora da transação da sincronização: falha aqui não a desfaz.
    public sealed class HandoverChecklistPlugin : IPlugin
    {
        private readonly string _secureConfig;

        public HandoverChecklistPlugin(string unsecureConfig, string secureConfig) { _secureConfig = secureConfig; }

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.MessageName != PluginConfig.UpdateMessage || context.PrimaryEntityName != PluginConfig.EmployeeTable) return;

            var system = factory.CreateOrganizationService(null);
            IVehicleHistoryGateway gateway = null;
            try { gateway = new InfleetGraphQlGateway(InfleetGraphQlGateway.ReadToken(system, _secureConfig, tracing)); }
            catch (InfleetUnavailableException error) { tracing?.Trace("HandoverChecklist sem Infleet: {0}", error.Message); }

            var result = Handle(context, system, gateway, DateTime.UtcNow, tracing);
            tracing?.Trace("HandoverChecklist {0}", result);
        }

        public static string Handle(IPluginExecutionContext context, IOrganizationService system, IVehicleHistoryGateway gateway, DateTime now, ITracingService tracing)
        {
            var target = context.InputParameters.Contains(PluginConfig.TargetParameterName) ? context.InputParameters[PluginConfig.TargetParameterName] as Entity : null;
            if (target == null || !target.Contains(PluginConfig.EmployeeCurrentVehicle)) return "ignorado:sem-mudanca";
            var newVehicle = target.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle);
            if (newVehicle == null) return "ignorado:veiculo-vazio";
            if (target.GetAttributeValue<OptionSetValue>(PluginConfig.EmployeeCurrentVehicleOrigin)?.Value != PluginConfig.EmployeeCurrentVehicleOriginInfleet) return "ignorado:origem-nao-infleet";
            var pre = context.PreEntityImages.Contains(PluginConfig.PreImageAlias) ? context.PreEntityImages[PluginConfig.PreImageAlias] : null;
            if (pre?.GetAttributeValue<EntityReference>(PluginConfig.EmployeeCurrentVehicle)?.Id == newVehicle.Id) return "ignorado:mesmo-veiculo";

            var vehicle = system.Retrieve(PluginConfig.VehicleTable, newVehicle.Id, new ColumnSet(ChecklistFactory.VehicleColumns(PluginConfig.VehiclePlate, PluginConfig.VehicleInfleetId)));
            // Próprio e ativo (padrão se nenhum filtro casa) ou alcançado pelo filtro de algum modelo (Terceiro/Aluguel).
            var templates = ChecklistFactory.LoadActiveTemplates(system);
            // Ambiente sem nenhum modelo ativo ainda não usa checklist; modelo ativo sem padrão continua sendo erro.
            if (templates.Count == 0) return "ignorado:sem-modelo-ativo";
            var template = ChecklistFactory.ResolveTemplate(templates, vehicle);
            if (template == null && !ChecklistFactory.IsOwnActiveVehicle(vehicle)) return "ignorado:frota-nao-propria";
            var receiver = system.Retrieve(PluginConfig.EmployeeTable, target.Id, new ColumnSet(PluginConfig.EmployeeInfleetDriverId));
            if (RecentHandoverExists(system, vehicle.Id, receiver.Id, now)) return "ignorado:troca-recente";

            // Decisão 7: falha da Infleet não impede o checklist; o entregador fica "não identificado".
            var previous = PreviousDriverResult.Unknown;
            try
            {
                if (gateway != null)
                    previous = gateway.PreviousDriver(vehicle.GetAttributeValue<string>(PluginConfig.VehicleInfleetId), receiver.GetAttributeValue<string>(PluginConfig.EmployeeInfleetDriverId), now);
            }
            catch (InfleetUnavailableException error) { tracing?.Trace("HandoverChecklist entregador não identificado: {0}", error.Message); }
            if (previous.Kind == PreviousDriverKind.SameDriver) return "ignorado:mesmo-motorista";
            var giver = previous.Kind == PreviousDriverKind.Found ? EmployeeByInfleetId(system, previous.InfleetDriverId) : null;
            if (giver != null && giver.Id == receiver.Id) return "ignorado:mesmo-motorista";

            // Cria e atribui antes de cancelar: no step assíncrono cada chamada é uma transação, então uma
            // criação que falha não pode deixar o veículo sem checklist aberto, e jobs concorrentes não
            // cancelam o checklist recém-criado um do outro.
            // Exige exatamente um padrão ativo só quando a troca vai gerar checklist; próprio sem filtro que case usa o padrão.
            var padrao = ChecklistFactory.DefaultTemplate(templates);
            template = template ?? padrao;
            var extra = new Dictionary<string, object>
            {
                ["new_trocadetectadaem"] = target.GetAttributeValue<DateTime?>(PluginConfig.EmployeeCurrentVehicleSince) ?? now
            };
            if (giver != null) extra["new_entreguepor"] = new EntityReference(PluginConfig.EmployeeTable, giver.Id);
            var id = ChecklistFactory.CreateChecklist(system, vehicle, template, ChecklistFactory.Troca, now, context.InitiatingUserId, VehicleHandover.UniqueKey(vehicle.Id, receiver.Id, now), extra);
            ChecklistFactory.AssignDriver(system, id, receiver.Id);
            ChecklistFactory.CancelOpenForHandover(system, vehicle.Id, now, id);
            return "criado:" + id.ToString("D");
        }

        private static bool RecentHandoverExists(IOrganizationService system, Guid vehicleId, Guid receiverId, DateTime now)
        {
            var query = new QueryExpression(ChecklistFactory.ChecklistTable) { ColumnSet = new ColumnSet("new_chaveunica"), TopCount = 1 };
            query.Criteria.AddCondition("new_origem", ConditionOperator.Equal, ChecklistFactory.Troca);
            query.Criteria.AddCondition("new_veiculo", ConditionOperator.Equal, vehicleId);
            query.Criteria.AddCondition("new_chaveunica", ConditionOperator.Like, VehicleHandover.UniqueKeyPrefix(vehicleId, receiverId) + "%");
            query.Criteria.AddCondition("new_solicitadoem", ConditionOperator.GreaterThan, now.AddHours(-VehicleHandover.DedupeHours));
            return system.RetrieveMultiple(query).Entities.Count > 0;
        }

        private static Entity EmployeeByInfleetId(IOrganizationService system, string infleetDriverId)
        {
            if (string.IsNullOrWhiteSpace(infleetDriverId)) return null;
            var query = new QueryExpression(PluginConfig.EmployeeTable) { ColumnSet = new ColumnSet(PluginConfig.EmployeeName) };
            query.Criteria.AddCondition(PluginConfig.EmployeeInfleetDriverId, ConditionOperator.Equal, infleetDriverId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var matches = system.RetrieveMultiple(query).Entities;
            return matches.Count == 1 ? matches[0] : null;
        }
    }
}
