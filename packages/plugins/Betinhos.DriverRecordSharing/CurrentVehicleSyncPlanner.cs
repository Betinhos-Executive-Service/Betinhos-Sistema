using System;
using System.Collections.Generic;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Decide, sem I/O, quais carros cadastrar e quais funcionários trocam de carro atual.
    public static class CurrentVehicleSyncPlanner
    {
        public sealed class DriverVehicle
        {
            public DriverVehicle(string infleetDriverId, InfleetVehicleInfo vehicle) { InfleetDriverId = infleetDriverId; Vehicle = vehicle; }
            public string InfleetDriverId { get; }
            public InfleetVehicleInfo Vehicle { get; }
        }

        public sealed class Employee
        {
            public Employee(Guid id, string infleetDriverId, bool isThirdParty, Guid? currentVehicleId, bool currentVehicleFromInfleet = false)
            {
                Id = id; InfleetDriverId = infleetDriverId; IsThirdParty = isThirdParty; CurrentVehicleId = currentVehicleId;
                CurrentVehicleFromInfleet = currentVehicleFromInfleet;
            }
            public Guid Id { get; }
            public string InfleetDriverId { get; }
            public bool IsThirdParty { get; }
            public Guid? CurrentVehicleId { get; }
            public bool CurrentVehicleFromInfleet { get; }
        }

        public sealed class Change
        {
            public Change(Guid employeeId, string plate) { EmployeeId = employeeId; Plate = plate; }
            public Guid EmployeeId { get; }
            public string Plate { get; }
        }

        public sealed class SyncPlan
        {
            public SyncPlan(IReadOnlyList<InfleetVehicleInfo> toRegister, IReadOnlyList<Change> changes, int ignoredThirdParty, int unchanged, IReadOnlyList<Guid> clears)
            {
                ToRegister = toRegister; Changes = changes; IgnoredThirdParty = ignoredThirdParty; Unchanged = unchanged; Clears = clears;
            }
            public IReadOnlyList<InfleetVehicleInfo> ToRegister { get; }
            public IReadOnlyList<Change> Changes { get; }
            public int IgnoredThirdParty { get; }
            public int Unchanged { get; }
            // Funcionários cujo carro atual veio da Infleet e que a Infleet agora mostra sem veículo.
            public IReadOnlyList<Guid> Clears { get; }
        }

        public static SyncPlan Plan(IEnumerable<DriverVehicle> infleet, IEnumerable<Employee> employees, IDictionary<string, Guid> fleetByPlate)
        {
            var byDriver = (employees ?? Enumerable.Empty<Employee>())
                .Where(e => !string.IsNullOrWhiteSpace(e.InfleetDriverId))
                .GroupBy(e => e.InfleetDriverId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            var toRegister = new Dictionary<string, InfleetVehicleInfo>(StringComparer.OrdinalIgnoreCase);
            var changes = new List<Change>();
            var clears = new List<Guid>();
            int ignored = 0, unchanged = 0;

            foreach (var item in infleet ?? Enumerable.Empty<DriverVehicle>())
            {
                if (item == null || !byDriver.TryGetValue(item.InfleetDriverId ?? "", out var employee)) continue;
                if (employee.IsThirdParty) { ignored++; continue; }
                if (item.Vehicle == null)
                {
                    // Só desfaz o que a própria Infleet definiu; carro escolhido à mão fica.
                    if (employee.CurrentVehicleId.HasValue && employee.CurrentVehicleFromInfleet) clears.Add(employee.Id);
                    continue;
                }
                var plate = ServiceVehicleResolver.NormalizePlate(item.Vehicle.Plate);
                if (plate.Length == 0) continue;
                if (fleetByPlate.TryGetValue(plate, out var vehicleId))
                {
                    if (employee.CurrentVehicleId == vehicleId) { unchanged++; continue; }
                }
                else if (!toRegister.ContainsKey(plate))
                {
                    toRegister[plate] = item.Vehicle;
                }
                changes.Add(new Change(employee.Id, plate));
            }
            return new SyncPlan(toRegister.Values.ToList(), changes, ignored, unchanged, clears);
        }
    }
}
