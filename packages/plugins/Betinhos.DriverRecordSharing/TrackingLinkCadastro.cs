using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Credencial de cadastro (cr40f_linkcadastro de serviço inteiro) que acompanha o link de acompanhamento:
    // o Worker guarda só o hash e chama o flow cadastro-passageiro-link com ele. O token é descartado aqui.
    // Regras de geração/revogação espelham Cr40f.Cadastro.Plugin (assemblies separados, por isso a cópia).
    public static class TrackingLinkCadastro
    {
        public const string Table = "cr40f_linkcadastro";
        private const string Reservation = "cr40f_reserva";
        private const string Passenger = "cr40f_passageiro";
        private const string TokenHash = "cr40f_tokenhash";
        private const string ExpiresAt = "cr40f_expiraem";
        private const string Status = "cr40f_status";
        private const string Sends = "cr40f_envios";
        private const string Name = "cr40f_name";
        public const int StatusActive = 1;
        public const int StatusPartiallyUsed = 2;
        public const int StatusRevoked = 4;

        public sealed class Created
        {
            public Guid Id { get; set; }
            public string Hash { get; set; }
        }

        // Cria o link de serviço inteiro; os anteriores só saem depois que o Worker confirma (RevokeWholeService). `tokenBytes` só existe para teste.
        public static Created Create(IOrganizationService system, Guid serviceId, DateTime expiresUtc, Func<byte[]> tokenBytes = null)
        {
            var hash = Sha256Hex(Base64Url((tokenBytes ?? RandomBytes)()));
            var link = new Entity(Table)
            {
                [Name] = "Link de acompanhamento até " + expiresUtc.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture) + " UTC",
                [Reservation] = new EntityReference(PluginConfig.ServiceTable, serviceId),
                [TokenHash] = hash,
                [ExpiresAt] = expiresUtc,
                [Status] = new OptionSetValue(StatusActive),
                [Sends] = 0
            };
            return new Created { Id = system.Create(link), Hash = hash };
        }

        // Marca Revogado os links ativos (1/2) sem passageiro, isto é, de serviço inteiro. Link de um passageiro só fica.
        public static void RevokeWholeService(IOrganizationService system, Guid serviceId, Guid? keep = null)
        {
            var query = new QueryExpression(Table) { ColumnSet = new ColumnSet(Status, Passenger) };
            query.Criteria.AddCondition(Reservation, ConditionOperator.Equal, serviceId);
            query.Criteria.AddCondition(Status, ConditionOperator.In, StatusActive, StatusPartiallyUsed);
            foreach (var link in system.RetrieveMultiple(query).Entities)
            {
                if (link.Id != keep && link.GetAttributeValue<EntityReference>(Passenger) == null) Revoke(system, link.Id);
            }
        }

        public static void Revoke(IOrganizationService system, Guid linkId)
        {
            system.Update(new Entity(Table, linkId) { [Status] = new OptionSetValue(StatusRevoked) });
        }

        // Alinha a expiração do link de cadastro à que o Worker devolveu.
        public static void SetExpiry(IOrganizationService system, Guid linkId, DateTime expiresUtc)
        {
            system.Update(new Entity(Table, linkId) { [ExpiresAt] = expiresUtc });
        }

        public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        // SHA-256 do token (UTF-8) em hex minúsculo; o Worker calcula igual.
        public static string Sha256Hex(string token)
        {
            using (var sha = SHA256.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(token)).Select(b => b.ToString("x2")));
        }

        private static byte[] RandomBytes()
        {
            var bytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return bytes;
        }
    }
}
