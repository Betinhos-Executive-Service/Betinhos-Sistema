using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    public enum DriverNoticeKind
    {
        Novo = 100000000,
        Retirado = 100000001,
        Cancelado = 100000002
    }

    public sealed class PlannedDriverNotice
    {
        public PlannedDriverNotice(DriverNoticeKind kind, EntityReference driver)
        {
            Kind = kind;
            Driver = driver;
        }

        public DriverNoticeKind Kind { get; }
        public EntityReference Driver { get; }
    }

    /// <summary>
    /// Regras da troca de motorista: o que muda na própria gravação (visualização e "Foi Programado") e quais
    /// avisos nascem dela. Comparar Target com a pré-imagem substitui a leitura da audit pelos flows, que perdia
    /// a linha do motorista quando outra gravação entrava logo depois.
    /// </summary>
    public static class DriverNoticeRules
    {
        private static readonly TimeSpan ViewWindow = TimeSpan.FromMinutes(30);
        private static readonly TimeSpan ImminentDeparture = TimeSpan.FromHours(2);

        public static bool DriverChanged(Entity target, Entity pre)
        {
            return target.Contains(PluginConfig.ServiceDriverLookup) &&
                target.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup)?.Id !=
                pre?.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup)?.Id;
        }

        /// <summary>Pré-operação: entra no Target para sair na mesma gravação, sem Update extra.</summary>
        public static void ResetOnDriverChange(Entity target, Entity pre)
        {
            if (!DriverChanged(target, pre)) return;

            target[PluginConfig.ServiceDriverViewedAt] = null;

            // Em serviço ligado a troca de carro quem projeta o "Foi Programado" é o ciclo da troca.
            var exchange = Final<EntityReference>(target, pre, PluginConfig.ServiceExchangeLookup);
            if (exchange == null)
            {
                target[PluginConfig.ServiceProgrammedFlag] = FinalStatus(target, pre) == PluginConfig.ServiceStatusProgrammed;
            }
        }

        /// <param name="isCanceledEmployee">
        /// Diz se o motorista é o funcionário "Cancelado" (a operação cancela trocando o motorista por ele). Só é
        /// chamado quando a resposta decide algum aviso. Esse funcionário nunca recebe aviso.
        /// </param>
        public static IReadOnlyList<PlannedDriverNotice> Plan(Entity target, Entity pre, Func<EntityReference, bool> isCanceledEmployee)
        {
            var notices = new List<PlannedDriverNotice>();
            var driverChanged = DriverChanged(target, pre);
            var previousDriver = pre?.GetAttributeValue<EntityReference>(PluginConfig.ServiceDriverLookup);
            var previousStatus = pre?.GetAttributeValue<OptionSetValue>(PluginConfig.ServiceStatus)?.Value;
            var finalDriver = Final<EntityReference>(target, pre, PluginConfig.ServiceDriverLookup);
            var finalStatus = FinalStatus(target, pre);

            if (finalStatus == PluginConfig.ServiceStatusProgrammed &&
                finalDriver != null &&
                (driverChanged || previousStatus != PluginConfig.ServiceStatusProgrammed) &&
                !isCanceledEmployee(finalDriver))
            {
                notices.Add(new PlannedDriverNotice(DriverNoticeKind.Novo, finalDriver));
            }

            // Serviço programado que deixa de existir para o motorista anterior: cancelado pelo status ou pela troca
            // para o funcionário "Cancelado", em qualquer ordem. Cancelado com ressalvas fica de fora (decisão do Renan).
            if (previousDriver != null &&
                previousStatus == PluginConfig.ServiceStatusProgrammed &&
                (driverChanged || finalStatus == PluginConfig.ServiceStatusCanceled) &&
                !isCanceledEmployee(previousDriver))
            {
                if (finalStatus == PluginConfig.ServiceStatusCanceled || (finalDriver != null && isCanceledEmployee(finalDriver)))
                {
                    notices.Add(new PlannedDriverNotice(DriverNoticeKind.Cancelado, previousDriver));
                }
                else
                {
                    notices.Add(new PlannedDriverNotice(DriverNoticeKind.Retirado, previousDriver));
                }
            }

            return notices;
        }

        public static bool IsCanceledEmployeeName(string fullName)
        {
            return string.Equals(fullName?.Trim(), PluginConfig.EmployeeCanceledName, StringComparison.Ordinal);
        }

        /// <summary>Prazo para o motorista visualizar: saída em menos de 2 h (ou já passada) vence agora.</summary>
        public static DateTime Deadline(DateTime now, DateTime? departure)
        {
            return departure.HasValue && departure.Value < now.Add(ImminentDeparture) ? now : now.Add(ViewWindow);
        }

        public static T Final<T>(Entity target, Entity pre, string attribute)
        {
            return target.Contains(attribute) ? target.GetAttributeValue<T>(attribute) : pre == null ? default(T) : pre.GetAttributeValue<T>(attribute);
        }

        private static int? FinalStatus(Entity target, Entity pre)
        {
            return Final<OptionSetValue>(target, pre, PluginConfig.ServiceStatus)?.Value;
        }
    }
}
