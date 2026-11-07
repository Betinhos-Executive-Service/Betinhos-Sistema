using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Grava o aviso (outbox) na transação da reserva. Roda com o serviço de sistema: quem salva a reserva não
    /// precisa de privilégio na tabela de avisos, e o flow só entrega o que ficou gravado aqui.
    /// </summary>
    internal sealed class DriverNoticeWriter
    {
        private readonly IOrganizationService _system;
        private readonly ITracingService _tracing;

        public DriverNoticeWriter(IOrganizationService system, ITracingService tracing)
        {
            _system = system;
            _tracing = tracing;
        }

        public void Write(PlannedDriverNotice notice, Guid correlationId, Guid serviceId, Entity target, Entity pre)
        {
            var key = $"{correlationId:N}:{serviceId:N}:{notice.Driver.Id:N}:{notice.Kind}";

            // Sem pré-imagem é Create: reserva recém-criada não tem aviso anterior para consultar.
            var serviceHasNotices = pre != null;
            if (serviceHasNotices && Exists(key))
            {
                _tracing.Trace("DriverNoticeWriter skip duplicate key={0}", key);
                return;
            }

            if (serviceHasNotices && notice.Kind == DriverNoticeKind.Novo)
            {
                CancelUnseenForOtherDrivers(serviceId, notice.Driver.Id);
            }

            var code = DriverNoticeRules.Final<string>(target, pre, PluginConfig.ServiceCode);
            var row = new Entity(PluginConfig.DriverNoticeTable)
            {
                [PluginConfig.DriverNoticeName] = $"{notice.Kind} - {(string.IsNullOrWhiteSpace(code) ? serviceId.ToString("N") : code)}",
                [PluginConfig.DriverNoticeService] = new EntityReference(PluginConfig.ServiceTable, serviceId),
                [PluginConfig.DriverNoticeEmployee] = new EntityReference(PluginConfig.EmployeeTable, notice.Driver.Id),
                [PluginConfig.DriverNoticeKindColumn] = new OptionSetValue((int)notice.Kind),
                [PluginConfig.DriverNoticeSituation] = new OptionSetValue(HasApp(notice.Driver.Id) ? PluginConfig.DriverNoticePending : PluginConfig.DriverNoticeNoApp),
                [PluginConfig.DriverNoticeKey] = key
            };
            if (notice.Kind == DriverNoticeKind.Novo)
            {
                row[PluginConfig.DriverNoticeDeadline] = DriverNoticeRules.Deadline(
                    DateTime.UtcNow,
                    DriverNoticeRules.Final<DateTime?>(target, pre, PluginConfig.ServiceStartDate));
            }

            _system.Create(row);
            _tracing.Trace("DriverNoticeWriter created kind={0} service={1} driver={2}", notice.Kind, serviceId, notice.Driver.Id);
        }

        private bool Exists(string key)
        {
            var query = new QueryExpression(PluginConfig.DriverNoticeTable) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(PluginConfig.DriverNoticeKey, ConditionOperator.Equal, key);
            return _system.RetrieveMultiple(query).Entities.Count > 0;
        }

        private bool HasApp(Guid employeeId)
        {
            var employee = _system.Retrieve(PluginConfig.EmployeeTable, employeeId, new ColumnSet(PluginConfig.EmployeeMicrosoftEmail));
            return !string.IsNullOrWhiteSpace(employee.GetAttributeValue<string>(PluginConfig.EmployeeMicrosoftEmail));
        }

        private void CancelUnseenForOtherDrivers(Guid serviceId, Guid driverId)
        {
            var query = new QueryExpression(PluginConfig.DriverNoticeTable) { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition(PluginConfig.DriverNoticeService, ConditionOperator.Equal, serviceId);
            query.Criteria.AddCondition(PluginConfig.DriverNoticeKindColumn, ConditionOperator.Equal, (int)DriverNoticeKind.Novo);
            query.Criteria.AddCondition(PluginConfig.DriverNoticeEmployee, ConditionOperator.NotEqual, driverId);
            query.Criteria.AddCondition(
                PluginConfig.DriverNoticeSituation,
                ConditionOperator.In,
                PluginConfig.DriverNoticePending,
                PluginConfig.DriverNoticeSent,
                PluginConfig.DriverNoticeFailed,
                PluginConfig.DriverNoticeNoApp);

            foreach (var row in _system.RetrieveMultiple(query).Entities)
            {
                _system.Update(new Entity(PluginConfig.DriverNoticeTable, row.Id)
                {
                    [PluginConfig.DriverNoticeSituation] = new OptionSetValue(PluginConfig.DriverNoticeCanceled)
                });
            }
        }
    }
}
