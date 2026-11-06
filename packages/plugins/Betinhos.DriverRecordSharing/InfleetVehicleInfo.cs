namespace Betinhos.DriverRecordSharing
{
    public sealed class InfleetVehicleInfo
    {
        public InfleetVehicleInfo(string id, string plate, string brand, string model, string year, string modelYear, string ownershipType)
        {
            Id = id; Plate = plate; Brand = brand; Model = model; Year = year; ModelYear = modelYear; OwnershipType = ownershipType;
        }

        public string Id { get; }
        public string Plate { get; }
        public string Brand { get; }
        public string Model { get; }
        public string Year { get; }
        public string ModelYear { get; }
        public string OwnershipType { get; }
    }
}
