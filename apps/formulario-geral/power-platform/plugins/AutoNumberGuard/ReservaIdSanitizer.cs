using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Betinhos.AutoNumberGuard
{
    /// <summary>
    /// Garante que a coluna de numeração automática (nome principal) seja sempre gerada pelo Dataverse no Create.
    /// Qualquer valor enviado é removido do Target: letras injetadas pelo MCP do Dataverse, GUIDs de flows,
    /// vazio, nulo e também números no formato válido deduzidos pelo cliente (ex.: "OS-9699"), que
    /// colidiriam com o próximo número da sequência.
    /// </summary>
    public static class ReservaIdSanitizer
    {
        public const string EntityName = "cr40f_reservadeveculos";
        public const string ServicePassengerEntityName = "cr40f_servicosporpassageiro";
        public const string MaintenanceEntityName = "cr40f_manutencoes";
        public const string IdAttribute = "cr40f_id";

        /// <summary>Tabela protegida → coluna de numeração automática (nome principal).</summary>
        public static readonly IReadOnlyDictionary<string, string> GuardedAttributes = new Dictionary<string, string>
        {
            [EntityName] = IdAttribute,
            [ServicePassengerEntityName] = IdAttribute,
            [MaintenanceEntityName] = IdAttribute,
            ["cr40f_composicaodeprecos"] = "cr40f_id",
            ["cr40f_financeiro"] = "cr40f_idfinanceiro",
            ["cr40f_pagantes"] = "cr40f_id",
            ["cr40f_trocasdecarro"] = "cr40f_id",
            ["new_possedeveiculo"] = "new_id",
            ["new_marketing"] = "new_id",
            ["new_centraldenotificacoes"] = "new_id",
        };

        public static bool Sanitize(Entity target, out string removedValue)
        {
            removedValue = null;

            if (target == null
                || !GuardedAttributes.TryGetValue(target.LogicalName, out var attribute)
                || !target.Attributes.Contains(attribute))
            {
                return false;
            }

            removedValue = target[attribute] as string;
            target.Attributes.Remove(attribute);
            return true;
        }
    }
}
