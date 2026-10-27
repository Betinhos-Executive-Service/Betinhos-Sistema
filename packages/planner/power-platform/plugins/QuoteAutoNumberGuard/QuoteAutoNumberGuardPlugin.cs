using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.Planner.AutoNumberGuard
{
    /// <summary>
    /// Step: Create de cr40f_pedidodecotacao, PreValidation (10), síncrono.
    /// </summary>
    public sealed class QuoteAutoNumberGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName != "Create" || !(context.InputParameters["Target"] is Entity target))
            {
                return;
            }

            var removed = QuoteNumberSanitizer.Sanitize(target);
            if (removed.Count == 0) return;

            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            foreach (var item in removed)
            {
                tracing?.Trace("{0} ajustado pela guarda da numeração automática. Valor recebido: '{1}'.", item.Key, item.Value ?? "<null>");
            }
        }
    }
}
