using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using System.Web.Script.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.ExpenseUpload.Tests
{
    public class ExpenseUploadTests
    {
        [Fact] public void ClaimIsIdempotentForSameRunAndRejectsAnotherRun()
        {
            var service = new Store();
            Assert.True(Call(service, "claim", "run-1"));
            Assert.True(Call(service, "claim", "run-1"));
            Assert.False(Call(service, "claim", "run-2"));
            Assert.All(service.Versions, value => Assert.False(String.IsNullOrEmpty(value)));
        }
        [Fact] public void StaleAttemptCannotCompleteNewAttempt()
        {
            var service = new Store();
            service.Row["new_uploadattemptid"] = Guid.NewGuid().ToString();
            Assert.False(Call(service, "complete", "run-1"));
            Assert.Empty(service.Versions);
        }
        [Fact] public void WrongRunCannotCompleteClaimedFile()
        {
            var service = new Store(); Call(service, "claim", "run-1");
            Assert.False(Call(service, "complete", "run-2"));
            Assert.Equal(100000004, service.Row.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        }
        [Fact] public void MissingExpectedAttachmentKeepsExpenseSending()
        {
            var service = new Store(); service.Parent["new_uploadexpectedcount"] = 2;
            Call(service, "claim", "run-1"); Call(service, "complete", "run-1");
            Assert.Equal(100000001, service.Parent.GetAttributeValue<OptionSetValue>("cr40f_statusanexo").Value);
        }
        [Fact] public void CompletePersistsLinkAndMarksExpenseComplete()
        {
            var service = new Store(); Call(service, "claim", "run-1");
            Assert.True(Call(service, "complete", "run-1"));
            Assert.Equal("https://example.com/qa", service.Row.GetAttributeValue<string>("cr40f_urlsharepoint"));
            Assert.Equal(100000002, service.Parent.GetAttributeValue<OptionSetValue>("cr40f_statusanexo").Value);
        }
        [Fact] public void OptimisticConcurrencyRejectsCompetingClaim()
        {
            var service = new Store { Conflict = true };
            Assert.Throws<FaultException<OrganizationServiceFault>>(() => Call(service, "claim", "run-1"));
            Assert.Equal(100000000, service.Row.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
        }
        [Fact] public void ExplicitCancelClosesOnlyUnclaimedAttempts()
        {
            var pending = new Store();
            Assert.True(Call(pending, "cancelUnclaimed", ""));
            Assert.False(Call(pending, "claim", "run-late"));
            var processing = new Store(); Call(processing, "claim", "run-1");
            Assert.False(Call(processing, "cancelUnclaimed", ""));
            Assert.True(Call(processing, "complete", "run-1"));
        }

        [Fact] public void FailurePreservesCauseWithoutSecretsOrContent()
        {
            var service = new Store(); Call(service, "claim", "run-1");
            Call(service, "fail", "run-1", "CreateFile: BadRequest https://example.com?" + "sig=secret mail@example.com Bearer secret " + new string('A', 180));
            var error = service.Row.GetAttributeValue<string>("new_uploaderror");
            Assert.Contains("CreateFile: BadRequest", error);
            Assert.DoesNotContain("secret", error); Assert.DoesNotContain("mail@example.com", error); Assert.DoesNotContain(new string('A', 128), error);
        }
        [Fact] public void LostCompleteResponseCannotTurnSentAttachmentIntoFailure()
        {
            var service = new Store(); Call(service, "claim", "run-1"); Call(service, "complete", "run-1");
            Assert.False(Call(service, "fail", "run-1", "Resposta expirada"));
            Assert.Equal(100000001, service.Row.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
            Assert.Equal(100000002, service.Parent.GetAttributeValue<OptionSetValue>("cr40f_statusanexo").Value);
        }
        static bool Call(Store service, string action, string run, string error = "")
        {
            var serializer = new JavaScriptSerializer();
            var context = new RemoteExecutionContext { MessageName = "new_ExpenseUploadTransition", UserId = Guid.NewGuid() };
            context.InputParameters["new_Command"] = serializer.Serialize(new { action, attachmentId = service.Row.Id, attemptId = service.Attempt, runId = run, shareLink = "https://example.com/qa", fileId = "qa-file", error });
            new ExpenseUploadCommand().Execute(new Services(context, service));
            return (bool)serializer.Deserialize<Dictionary<string, object>>((string)context.OutputParameters["new_Result"])["applied"];
        }
        class Services : IServiceProvider, IOrganizationServiceFactory
        {
            readonly RemoteExecutionContext context; readonly Store service;
            public Services(RemoteExecutionContext context, Store service) { this.context = context; this.service = service; }
            public object GetService(Type type) => type == typeof(IPluginExecutionContext) ? (object)context : this;
            public IOrganizationService CreateOrganizationService(Guid? userId) { Assert.NotNull(userId); return service; }
        }
        class Store : IOrganizationService
        {
            public readonly Guid Attempt = Guid.NewGuid();
            public readonly Entity Row = new Entity("cr40f_anexodespesaoperacional", Guid.NewGuid()) { RowVersion = "1" };
            public readonly Entity Parent = new Entity("cr40f_despesaoperacional", Guid.NewGuid()) { RowVersion = "1" };
            public readonly List<string> Versions = new List<string>();
            public bool Conflict;
            public Store() { Row["new_uploadattemptid"] = Attempt.ToString(); Row["cr40f_status"] = new OptionSetValue(100000000); Row["cr40f_despesa"] = Parent.ToEntityReference(); Row["cr40f_nomearquivo"] = "qa.jpg"; Row["cr40f_mimetype"] = "image/jpeg"; Parent["new_uploadexpectedcount"] = 1; }
            public Entity Retrieve(string name, Guid id, ColumnSet columns) { var row = name == Row.LogicalName ? Row : Parent; var copy = new Entity(row.LogicalName, row.Id) { RowVersion = row.RowVersion }; foreach (var value in row.Attributes) copy[value.Key] = value.Value; return copy; }
            public EntityCollection RetrieveMultiple(QueryBase query) => new EntityCollection(new List<Entity> { Row });
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                var update = (UpdateRequest)request;
                Assert.Equal(ConcurrencyBehavior.IfRowVersionMatches, update.ConcurrencyBehavior);
                var row = update.Target.LogicalName == Row.LogicalName ? Row : Parent;
                if (Conflict || row.RowVersion != update.Target.RowVersion) throw new FaultException<OrganizationServiceFault>(new OrganizationServiceFault { ErrorCode = -2147088254 }, "concurrency");
                Versions.Add(update.Target.RowVersion);
                foreach (var value in update.Target.Attributes) row[value.Key] = value.Value;
                row.RowVersion = (Int32.Parse(row.RowVersion) + 1).ToString();
                return new UpdateResponse();
            }
            public Guid Create(Entity entity) => throw new NotSupportedException();
            public void Update(Entity entity) => throw new NotSupportedException();
            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string name, Guid id, Relationship relationship, EntityReferenceCollection entities) => throw new NotSupportedException();
            public void Disassociate(string name, Guid id, Relationship relationship, EntityReferenceCollection entities) => throw new NotSupportedException();
        }
    }
}
