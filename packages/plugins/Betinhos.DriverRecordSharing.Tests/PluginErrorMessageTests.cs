using System;
using System.Reflection;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PluginErrorMessageTests
    {
        [Fact]
        public void BusinessErrorKeepsSafeMessageAndCorrelation()
        {
            var correlation = Guid.NewGuid();
            var result = ForUser(
                new InvalidPluginExecutionException("Motorista da devolução não possui posse de veículo aberta."),
                correlation);

            Assert.Contains("[POSSESSION_NOT_OPEN]", result);
            Assert.Contains("não possui posse", result);
            Assert.Contains(correlation.ToString("N"), result);
        }

        [Fact]
        public void ConcurrentShareBecomesRetryable503()
        {
            var correlation = Guid.NewGuid();
            var fault = new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault { ErrorCode = unchecked((int)0x80048105), Message = "More than one concurrent Share requests detected" },
                "fault");

            var result = ToPluginException(fault, correlation);

            Assert.Equal(PluginHttpStatusCode.ServiceUnavailable, HttpStatus(result));
            Assert.StartsWith("[SHARE_CONCURRENT]", result.Message);
            Assert.Contains(correlation.ToString("N"), result.Message);
        }

        [Fact]
        public void OtherFaultKeepsDefaultStatus()
        {
            var fault = new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault { ErrorCode = -2147220891, Message = "[POSSESSION_OVERLAP] Este motorista possui outra posse no mesmo período." },
                "fault");

            var result = ToPluginException(fault, Guid.NewGuid());

            Assert.Equal(HttpStatus(new InvalidPluginExecutionException("x")), HttpStatus(result));
            Assert.StartsWith("[POSSESSION_OVERLAP]", result.Message);
        }

        [Fact]
        public void ConcurrentShareInsideInnerFaultIsDetected()
        {
            var fault = new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault
                {
                    ErrorCode = -2147220891,
                    Message = "fault",
                    InnerFault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80048105), Message = "share" }
                },
                "fault");

            var result = ToPluginException(new InvalidOperationException("wrap", fault), Guid.NewGuid());

            Assert.Equal(PluginHttpStatusCode.ServiceUnavailable, HttpStatus(result));
        }

        [Fact]
        public void NestedPluginConcurrentShareStaysRetryable()
        {
            var fault = new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault { ErrorCode = -2147220891, Message = "[SHARE_CONCURRENT] Outra gravação está liberando o mesmo cadastro agora; tente de novo. Ref: abc" },
                "fault");

            var result = ToPluginException(fault, Guid.NewGuid());

            Assert.Equal(PluginHttpStatusCode.ServiceUnavailable, HttpStatus(result));
            Assert.StartsWith("[SHARE_CONCURRENT]", result.Message);
        }

        [Fact]
        public void MetadataErrorDoesNotLeakSchemaDetails()
        {
            var result = ForUser(
                new Exception("entity doesn't contain attribute cr40f_segredo and NameMapping Logical"),
                Guid.NewGuid());

            Assert.Contains("[EXCHANGE_INTERNAL_ERROR]", result);
            Assert.DoesNotContain("cr40f_segredo", result);
            Assert.DoesNotContain("NameMapping", result);
        }

        [Fact]
        public void IdentityErrorDoesNotLeakPersonOrEmail()
        {
            var result = ForUser(
                new InvalidPluginExecutionException("Existe email pessoa@empresa.com no funcionário Nome Completo, mas não existe systemuser ativo."),
                Guid.NewGuid());

            Assert.Contains("[IDENTITY_NOT_MAPPED]", result);
            Assert.DoesNotContain("pessoa@empresa.com", result);
            Assert.DoesNotContain("Nome Completo", result);
        }

        [Fact]
        public void ExplicitCodeFromInnerExceptionIsKeptWithoutDomainKeywords()
        {
            var result = ForUser(
                new Exception("Falha inesperada.", new InvalidPluginExecutionException("[SERVICE_SYNC_FAILED] Falha ao sincronizar a reserva.")),
                Guid.NewGuid());

            Assert.Contains("[SERVICE_SYNC_FAILED]", result);
            Assert.Contains("Falha ao sincronizar a reserva.", result);
            Assert.DoesNotContain("EXCHANGE_INTERNAL_ERROR", result);
        }

        [Fact]
        public void ExplicitCodeWithTechnicalDetailsStaysMasked()
        {
            var result = ForUser(
                new InvalidPluginExecutionException("[SERVICE_SYNC_FAILED] SQL timeout em cr40f_segredo"),
                Guid.NewGuid());

            Assert.Contains("[EXCHANGE_INTERNAL_ERROR]", result);
            Assert.DoesNotContain("cr40f_segredo", result);
        }

        private static InvalidPluginExecutionException ToPluginException(Exception exception, Guid correlationId)
        {
            return (InvalidPluginExecutionException)Invoke("ToPluginException", exception, correlationId);
        }

        // O SDK guarda o status HTTP numa propriedade não pública.
        private static PluginHttpStatusCode HttpStatus(InvalidPluginExecutionException exception)
        {
            var value = typeof(InvalidPluginExecutionException)
                .GetProperty("HttpStatus", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                .GetValue(exception);
            return (PluginHttpStatusCode)value;
        }

        private static string ForUser(Exception exception, Guid correlationId)
        {
            return (string)Invoke("ForUser", exception, correlationId);
        }

        private static object Invoke(string method, Exception exception, Guid correlationId)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.PluginErrorMessage",
                throwOnError: true);
            return type.GetMethod(method, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                .Invoke(null, new object[] { exception, correlationId });
        }
    }
}
