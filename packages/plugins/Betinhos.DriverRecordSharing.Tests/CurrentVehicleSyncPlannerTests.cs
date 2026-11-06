using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class CurrentVehicleSyncPlannerTests
    {
        private static readonly Guid Joao = Guid.NewGuid();
        private static readonly Guid Terceiro = Guid.NewGuid();
        private static readonly Guid Rti = Guid.NewGuid();
        private static readonly Guid Ruh = Guid.NewGuid();

        private static InfleetVehicleInfo V(string plate) => new InfleetVehicleInfo("id-" + plate, plate, "B", "M", "2022", "2022", "OWNED");

        private static CurrentVehicleSyncPlanner.SyncPlan Plan(Guid? joaoCurrent, params CurrentVehicleSyncPlanner.DriverVehicle[] infleet) =>
            Plan(joaoCurrent, false, infleet);

        private static CurrentVehicleSyncPlanner.SyncPlan Plan(Guid? joaoCurrent, bool joaoFromInfleet, params CurrentVehicleSyncPlanner.DriverVehicle[] infleet) =>
            CurrentVehicleSyncPlanner.Plan(
                infleet,
                new[]
                {
                    new CurrentVehicleSyncPlanner.Employee(Joao, "d-joao", false, joaoCurrent, joaoFromInfleet),
                    new CurrentVehicleSyncPlanner.Employee(Terceiro, "d-terc", true, Rti, true)
                },
                new Dictionary<string, Guid> { ["RTI7G00"] = Rti, ["RUH7G45"] = Ruh });

        [Fact]
        public void ChangedVehicle_IsUpdated()
        {
            var plan = Plan(Ruh, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("RTI-7G00")));

            var change = Assert.Single(plan.Changes);
            Assert.Equal(Joao, change.EmployeeId);
            Assert.Equal("RTI7G00", change.Plate);
            Assert.Empty(plan.ToRegister);
        }

        [Fact]
        public void SameVehicle_IsUnchanged()
        {
            var plan = Plan(Rti, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("RTI7G00")));

            Assert.Empty(plan.Changes);
            Assert.Equal(1, plan.Unchanged);
        }

        [Fact]
        public void UnknownPlate_IsRegisteredOnceAndAssigned()
        {
            var plan = Plan(null,
                new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", V("ABC1D23")),
                new CurrentVehicleSyncPlanner.DriverVehicle("d-sem-cadastro", V("abc-1d23")));

            Assert.Equal(new[] { "ABC1D23" }, plan.ToRegister.Select(v => ServiceVehicleResolver.NormalizePlate(v.Plate)));
            Assert.Equal("ABC1D23", Assert.Single(plan.Changes).Plate);
        }

        [Fact]
        public void ThirdPartyEmployee_IsNeverChanged()
        {
            var plan = Plan(null, new CurrentVehicleSyncPlanner.DriverVehicle("d-terc", V("RTI7G00")));

            Assert.Empty(plan.Changes);
            Assert.Equal(1, plan.IgnoredThirdParty);
        }

        [Fact]
        public void DriverWithoutVehicleOrEmployee_IsSkipped()
        {
            var plan = Plan(Rti,
                new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", null),
                new CurrentVehicleSyncPlanner.DriverVehicle("d-ninguem", V("RUH7G45")));

            Assert.Empty(plan.Changes);
            Assert.Empty(plan.ToRegister);
            Assert.Empty(plan.Clears);
        }

        [Fact]
        public void DriverWithoutVehicle_ClearsVehicleSetByInfleet()
        {
            var plan = Plan(Rti, true, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", null));

            Assert.Equal(Joao, Assert.Single(plan.Clears));
            Assert.Empty(plan.Changes);
        }

        [Fact]
        public void DriverWithoutVehicle_AndNoCurrentVehicle_ClearsNothing()
        {
            var plan = Plan(null, true, new CurrentVehicleSyncPlanner.DriverVehicle("d-joao", null));

            Assert.Empty(plan.Clears);
        }

        [Fact]
        public void ThirdPartyWithoutVehicle_IsNeverCleared()
        {
            var plan = Plan(null, new CurrentVehicleSyncPlanner.DriverVehicle("d-terc", null));

            Assert.Empty(plan.Clears);
            Assert.Equal(1, plan.IgnoredThirdParty);
        }

        [Fact]
        public void DriverMissingFromInfleet_IsNotCleared()
        {
            var plan = Plan(Rti, true, new CurrentVehicleSyncPlanner.DriverVehicle("d-outro", null));

            Assert.Empty(plan.Clears);
        }
    }
}
