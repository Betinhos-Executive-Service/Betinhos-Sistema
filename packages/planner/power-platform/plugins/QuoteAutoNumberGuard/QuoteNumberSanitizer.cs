using System.Collections.Generic;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace Betinhos.Planner.AutoNumberGuard
{
    /// <summary>
    /// Protege as colunas de numeração automática de cr40f_pedidodecotacao no Create.
    /// Mesmo princípio do Betinhos.AutoNumberGuard da Geral: removendo o valor do Target,
    /// o Dataverse gera o próximo número da sequência.
    /// </summary>
    public static class QuoteNumberSanitizer
    {
        public const string EntityName = "cr40f_pedidodecotacao";
        public const string NumberAttribute = "cr40f_numerodacotacao";
        public const string TitleAttribute = "cr40f_titulo";
        public const string DefaultTitle = "Pedido de cotação";

        // Valores que o MCP do Dataverse injeta no nome primário quando o payload não o envia ("G", "MB", "PY"...).
        private static readonly Regex InjectedPrimaryName = new Regex(@"^[A-Z]{1,2}$", RegexOptions.CultureInvariant);

        /// <summary>Retorna os valores removidos (coluna -> valor recebido).</summary>
        public static IDictionary<string, object> Sanitize(Entity target)
        {
            var removed = new Dictionary<string, object>();
            if (target == null || target.LogicalName != EntityName) return removed;

            // Número da cotação é sempre da sequência: o MCP chegou a enviar "COT-1025" deduzido da última
            // cotação, e o próximo Create nativo recebeu o mesmo número (duplicado em PROD em 05/10/2026).
            if (target.Attributes.Contains(NumberAttribute))
            {
                removed[NumberAttribute] = target[NumberAttribute];
                target.Attributes.Remove(NumberAttribute);
            }

            // Título é texto livre do Planner; só é trocado quando vazio ou com letras injetadas pelo MCP.
            // Não removemos: a sequência própria do título geraria um "COT-xxxx" diferente do número da cotação.
            if (target.Attributes.Contains(TitleAttribute))
            {
                var title = target[TitleAttribute] as string;
                if (string.IsNullOrWhiteSpace(title) || InjectedPrimaryName.IsMatch(title))
                {
                    removed[TitleAttribute] = target[TitleAttribute];
                    target[TitleAttribute] = DefaultTitle;
                }
            }

            return removed;
        }
    }
}
