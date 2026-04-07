using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
using RadcKioskLauncher.Helpers;

namespace RadcKioskLauncher.Services;

public partial class AdminAuthService
{
    private const int Logon32LogonInteractive = 2;
    private const int Logon32ProviderDefault = 0;

    [LibraryImport("advapi32.dll", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool LogonUser(
        string lpszUsername,
        string? lpszDomain,
        string lpszPassword,
        int dwLogonType,
        int dwLogonProvider,
        out SafeAccessTokenHandle phToken);

    // NOTE: Hash öncelikli; geçiş süreci için plain pin fallback desteklenir.
    public bool VerifyPin(string enteredPin, string expectedHash, string? expectedPlainPin = null)
    {
        if (!string.IsNullOrWhiteSpace(expectedHash) && SecurityHelper.VerifyPin(enteredPin, expectedHash))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(expectedPlainPin) && enteredPin == expectedPlainPin;
    }

    public bool IsCurrentUserAdministrator()
    {
        var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    public bool VerifyWindowsAdminCredentials(string username, string password, out string error)
    {
        error = string.Empty;
        string? domain = null;
        var user = username;

        if (username.Contains('\\'))
        {
            var parts = username.Split('\\', 2);
            domain = parts[0];
            user = parts[1];
        }

        if (!LogonUser(user, domain, password, Logon32LogonInteractive, Logon32ProviderDefault, out var token))
        {
            error = new Win32Exception(Marshal.GetLastWin32Error()).Message;
            return false;
        }

        using (token)
        {
            var identity = new WindowsIdentity(token.DangerousGetHandle());
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
    }
}
