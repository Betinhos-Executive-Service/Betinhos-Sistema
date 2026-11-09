using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.AutoNumberGuard
{
    /// <summary>
    /// Steps: Create de cada tabela em ReservaIdSanitizer.GuardedAttributes, PreValidation (10), síncrono.
    /// </summary>
    public sealed class ReservaAutoNumberGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName != "Create" || !(context.InputParameters["Target"] is Entity target))
            {
                return;
            }

            if (ReservaIdSanitizer.Sanitize(target, out var removedValue))
            {
                var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
                tracing?.Trace("Numeração automática: valor enviado removido. Valor recebido: '{0}'.", removedValue ?? "<null>");
            }
        }
    }
}
