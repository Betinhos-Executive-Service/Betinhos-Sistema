using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Troca de motorista da reserva. Pré-operação: zera a visualização na mesma gravação. Pós-operação síncrona
    /// (depois do compartilhamento): grava o aviso ao motorista. Falha aqui derruba a gravação de propósito: serviço
    /// programado sem aviso é o defeito que esta tabela existe para eliminar.
    /// </summary>
    public sealed class DriverNoticePlugin : IPlugin
    {
        private const int PreOperation = 20;

        public void Execute(IServiceProvider serviceProvider)
        {
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

            try
            {
                var target = (Entity)context.InputParameters[PluginConfig.TargetParameterName];
                var pre = context.PreEntityImages.Contains(PluginConfig.PreImageAlias) ? context.PreEntityImages[PluginConfig.PreImageAlias] : null;
                if (context.MessageName != PluginConfig.CreateMessage && pre == null)
                {
                    throw new InvalidPluginExecutionException(
                        "[DRIVER_NOTICE_CONFIG] Pré-imagem 'pre' ausente no step do aviso ao motorista.");
                }

                if (context.Stage == PreOperation)
                {
                    DriverNoticeRules.ResetOnDriverChange(target, pre);
                    return;
                }

                var writer = new DriverNoticeWriter(factory.CreateOrganizationService(null), tracing);
                foreach (var notice in DriverNoticeRules.Plan(target, pre))
                {
                    writer.Write(notice, context.CorrelationId, context.PrimaryEntityId, target, pre);
                }
            }
            catch (InvalidPluginExecutionException error)
            {
                PluginErrorTrace.Write(tracing, context, error);
                throw;
            }
            catch (Exception error)
            {
                PluginErrorTrace.Write(tracing, context, error);
                var message = new InvalidPluginExecutionException(
                    "[DRIVER_NOTICE_FAILED] Não foi possível registrar o aviso ao motorista. Salve de novo em instantes.");
                throw new InvalidPluginExecutionException(PluginErrorMessage.ForUser(message, context.CorrelationId), error);
            }
        }
    }
}
