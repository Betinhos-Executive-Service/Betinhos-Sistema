using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class DataverseAccessHelperTests
    {
        private static readonly EntityReference Service = new EntityReference("cr40f_reservadeveculos", Guid.NewGuid());
        private static readonly EntityReference OwnerDriver = new EntityReference("systemuser", Guid.NewGuid());
        private static readonly EntityReference OtherDriver = new EntityReference("systemuser", Guid.NewGuid());

        [Fact]
        public void RevokeAccess_SkipsOwner_EvenWithExplicitShare()
        {
            var service = new SharingService(owner: OwnerDriver);
            service.Shares[OwnerDriver.Id] = AccessRights.ReadAccess | AccessRights.WriteAccess;

            Invoke(service, "RevokeAccess", Service, OwnerDriver);

            Assert.DoesNotContain(service.Executed, request => request is RevokeAccessRequest);
        }

        [Fact]
        public void RevokeAccess_RevokesSharedNonOwner()
        {
            var service = new SharingService(owner: OwnerDriver);
            service.Shares[OtherDriver.Id] = AccessRights.ReadAccess;

            Invoke(service, "RevokeAccess", Service, OtherDriver);

            var revoke = Assert.Single(service.Executed.OfType<RevokeAccessRequest>());
            Assert.Equal(OtherDriver.Id, revoke.Revokee.Id);
        }

        [Fact]
        public void EnsureAccess_SkipsOwner()
        {
            var service = new SharingService(owner: OwnerDriver);

            Invoke(service, "EnsureAccess", Service, OwnerDriver, AccessRights.ReadAccess);

            Assert.DoesNotContain(service.Executed, request => request is GrantAccessRequest || request is ModifyAccessRequest);
        }

        [Fact]
        public void EnsureAccess_GrantsNonOwner()
        {
            var service = new SharingService(owner: OwnerDriver);

            Invoke(service, "EnsureAccess", Service, OtherDriver, AccessRights.ReadAccess);

            var grant = Assert.Single(service.Executed.OfType<GrantAccessRequest>());
            Assert.Equal(OtherDriver.Id, grant.PrincipalAccess.Principal.Id);
        }

        private static void Invoke(IOrganizationService service, string method, params object[] args)
        {
            var type = typeof(ServiceDriverSharePlugin).Assembly.GetType("Betinhos.DriverRecordSharing.DataverseAccessHelper", throwOnError: true);
            var instance = Activator.CreateInstance(
                type,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                args: new object[] { service, new NullTracingService() },
                culture: null);
            try
            {
                type.GetMethod(method, BindingFlags.Instance | BindingFlags.Public).Invoke(instance, args);
            }
            catch (TargetInvocationException ex)
            {
                throw ex.InnerException;
            }
        }

        private sealed class NullTracingService : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }

        // Simula o Dataverse: compartilhamentos explicitos por usuario e um dono fixo do registro.
        private sealed class SharingService : IOrganizationService
        {
            private readonly EntityReference _owner;

            public SharingService(EntityReference owner)
            {
                _owner = owner;
            }

            public Dictionary<Guid, AccessRights> Shares { get; } = new Dictionary<Guid, AccessRights>();

            public List<OrganizationRequest> Executed { get; } = new List<OrganizationRequest>();

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
            {
                var record = new Entity(entityName, id);
                record["ownerid"] = _owner;
                return record;
            }

            public OrganizationResponse Execute(OrganizationRequest request)
            {
                switch (request)
                {
                    case RetrieveSharedPrincipalsAndAccessRequest _:
                        var response = new RetrieveSharedPrincipalsAndAccessResponse();
                        response.Results["PrincipalAccesses"] = Shares
                            .Select(item => new PrincipalAccess
                            {
                                Principal = new EntityReference("systemuser", item.Key),
                                AccessMask = item.Value
                            })
                            .ToArray();
                        return response;
                    case RetrievePrincipalAccessRequest access:
                        var effective = new RetrievePrincipalAccessResponse();
                        effective.Results["AccessRights"] = Shares.TryGetValue(access.Principal.Id, out var rights)
                            ? rights
                            : AccessRights.None;
                        return effective;
                    case GrantAccessRequest grant:
                        Executed.Add(grant);
                        Shares[grant.PrincipalAccess.Principal.Id] = grant.PrincipalAccess.AccessMask;
                        return new GrantAccessResponse();
                    case ModifyAccessRequest modify:
                        Executed.Add(modify);
                        Shares[modify.PrincipalAccess.Principal.Id] = modify.PrincipalAccess.AccessMask;
                        return new ModifyAccessResponse();
                    case RevokeAccessRequest revoke:
                        Executed.Add(revoke);
                        if (revoke.Revokee.Id == _owner.Id)
                        {
                            throw new InvalidOperationException("Only owner can revoke access to the owner.");
                        }

                        Shares.Remove(revoke.Revokee.Id);
                        return new RevokeAccessResponse();
                    default:
                        throw new NotSupportedException(request.RequestName);
                }
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();

            public void Update(Entity entity) => throw new NotSupportedException();

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();

            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();

            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();

            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
