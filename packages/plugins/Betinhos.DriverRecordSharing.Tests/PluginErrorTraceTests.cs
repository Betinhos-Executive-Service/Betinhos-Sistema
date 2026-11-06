using System;
using System.Collections.Generic;
using System.Reflection;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PluginErrorTraceTests
    {
        [Fact]
        public void WritesStructuredErrorToTracingWithoutOrganizationService()
        {
            var tracing = new FakeTracingService();
            var context = new FakeContext
            {
                CorrelationId = Guid.Parse("3b1fbab4-d547-4b5d-a677-e71b07aac271"),
                MessageName = "new_RegistrarTrocaDeCarro",
                PrimaryEntityName = "cr40f_trocasdecarro",
                PrimaryEntityId = Guid.Parse("52facbfa-83c1-f111-aaaf-7ced8da8e635"),
                UserId = Guid.NewGuid(),
                InitiatingUserId = Guid.NewGuid()
            };
            var fault = new FaultException<OrganizationServiceFault>(
                new OrganizationServiceFault { ErrorCode = -2147220891, Message = "[POSSESSION_OVERLAP] Este motorista possui outra posse no mesmo período." },
                "fault");

            Write(tracing, context, fault);

            var line = Assert.Single(tracing.Lines);
            Assert.StartsWith("OperationalLog ", line);
            Assert.Contains("\"correlationId\":\"3b1fbab4d5474b5da677e71b07aac271\"", line);
            Assert.Contains("\"action\":\"new_RegistrarTrocaDeCarro:cr40f_trocasdecarro\"", line);
            Assert.Contains("\"errorCode\":\"-2147220891\"", line);
            Assert.Contains("POSSESSION_OVERLAP", line);
            Assert.Contains("\"primaryEntityId\":\"52facbfa-83c1-f111-aaaf-7ced8da8e635\"", line);
            Assert.DoesNotContain("OperationalLogWriter failed", line);
        }

        [Fact]
        public void NeverThrowsWhenTracingIsMissing()
        {
            Write(null, new FakeContext { MessageName = "new_ConfirmarTrocaMotorista" }, new InvalidPluginExecutionException("[EXCHANGE_STATUS_INVALID] x"));
        }

        [Fact]
        public void EscapesQuotesAndLineBreaksInMessage()
        {
            var tracing = new FakeTracingService();

            Write(tracing, new FakeContext { MessageName = "m" }, new Exception("linha1\r\n\"aspas\""));

            var line = Assert.Single(tracing.Lines);
            Assert.Contains("linha1\\r\\n\\\"aspas\\\"", line);
            Assert.DoesNotContain("\r\n", line.Substring(line.IndexOf("\"message\"", StringComparison.Ordinal), 40));
        }

        private static void Write(ITracingService tracing, IPluginExecutionContext context, Exception exception)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType(
                "Betinhos.DriverRecordSharing.PluginErrorTrace",
                throwOnError: true);
            type.GetMethod("Write", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                .Invoke(null, new object[] { tracing, context, exception });
        }

        private sealed class FakeTracingService : ITracingService
        {
            public List<string> Lines { get; } = new List<string>();

            public void Trace(string format, params object[] args)
            {
                Lines.Add(args == null || args.Length == 0 ? format : string.Format(format, args));
            }
        }

        private sealed class FakeContext : IPluginExecutionContext
        {
            public int Mode { get; set; }
            public int IsolationMode { get; set; }
            public int Depth { get; set; } = 1;
            public string MessageName { get; set; }
            public string PrimaryEntityName { get; set; }
            public Guid? RequestId { get; set; }
            public string SecondaryEntityName { get; set; }
            public ParameterCollection InputParameters { get; set; } = new ParameterCollection();
            public ParameterCollection OutputParameters { get; set; } = new ParameterCollection();
            public ParameterCollection SharedVariables { get; set; } = new ParameterCollection();
            public Guid UserId { get; set; }
            public Guid InitiatingUserId { get; set; }
            public Guid BusinessUnitId { get; set; }
            public Guid OrganizationId { get; set; }
            public string OrganizationName { get; set; }
            public Guid PrimaryEntityId { get; set; }
            public EntityImageCollection PreEntityImages { get; set; } = new EntityImageCollection();
            public EntityImageCollection PostEntityImages { get; set; } = new EntityImageCollection();
            public EntityReference OwningExtension { get; set; }
            public Guid CorrelationId { get; set; }
            public bool IsExecutingOffline { get; set; }
            public bool IsOfflinePlayback { get; set; }
            public bool IsInTransaction { get; set; } = true;
            public Guid OperationId { get; set; }
            public DateTime OperationCreatedOn { get; set; }
            public int Stage { get; set; } = 30;
            public IPluginExecutionContext ParentContext { get; set; }
        }
    }
}
