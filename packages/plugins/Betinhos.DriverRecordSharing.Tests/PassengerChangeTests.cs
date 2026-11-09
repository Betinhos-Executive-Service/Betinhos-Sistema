using System.Reflection;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class PassengerChangeTests
    {
        private const string Name = "cr40f_nomedopassageiro";
        private const string Phone = "cr40f_telefone";

        [Fact]
        public void SameValuesRewrittenAreNotAChange()
        {
            var target = Passenger("Daniel Ribeiro da Silva", "(12) 90000-0002");
            var preImage = Passenger("Daniel Ribeiro da Silva", "(12) 90000-0002");

            Assert.False(HasTextChange(target, preImage));
        }

        [Fact]
        public void EmptyAndNullAreTheSameValue()
        {
            var target = Passenger("Daniel Ribeiro da Silva", "");
            var preImage = new Entity("cr40f_bancodedados") { [Name] = "Daniel Ribeiro da Silva" };

            Assert.False(HasTextChange(target, preImage));
        }

        [Fact]
        public void PhoneChangeIsAChange()
        {
            var target = Passenger("Daniel Ribeiro da Silva", "(12) 90000-0002");
            var preImage = Passenger("Daniel Ribeiro da Silva", null);

            Assert.True(HasTextChange(target, preImage));
        }

        [Fact]
        public void WithoutPreImageAnyTrackedAttributeCounts()
        {
            Assert.True(HasTextChange(Passenger("Daniel Ribeiro da Silva", "(12) 90000-0002"), null));
            Assert.False(HasTextChange(new Entity("cr40f_bancodedados") { ["cr40f_email"] = "x@y.com" }, null));
        }

        private static Entity Passenger(string name, string phone) =>
            new Entity("cr40f_bancodedados") { [Name] = name, [Phone] = phone };

        private static bool HasTextChange(Entity target, Entity preImage) =>
            (bool)typeof(ServiceDriverSharePlugin)
                .GetMethod("HasTextChange", BindingFlags.Static | BindingFlags.NonPublic)
                .Invoke(null, new object[] { target, preImage, new[] { Name, Phone } });
    }
}
