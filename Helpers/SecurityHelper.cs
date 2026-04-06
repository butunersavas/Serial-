using System.Security.Cryptography;
using System.Text;

namespace RadcKioskLauncher.Helpers;

public static class SecurityHelper
{
    public static string ComputeSha256(string value)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(hash);
    }

    public static bool VerifyPin(string enteredPin, string expectedHash) =>
        string.Equals(ComputeSha256(enteredPin), expectedHash, StringComparison.OrdinalIgnoreCase);
}
