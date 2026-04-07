namespace RadcKioskLauncher.Services;

public static class PathValidationService
{
    private static readonly HashSet<string> AllowedTypes = ["exe", "lnk", "folder", "control", "settings"];
    private static readonly HashSet<string> AllowedControlCommands =
    [
        "control printers",
        "appwiz.cpl",
        "ncpa.cpl",
        "services.msc",
        "eventvwr.msc"
    ];

    private static readonly HashSet<string> AllowedSettingsPages =
    [
        "ms-settings:windowsupdate",
        "ms-settings:network",
        "ms-settings:printers",
        "ms-settings:appsfeatures"
    ];

    public static bool IsAllowedType(string? type) =>
        !string.IsNullOrWhiteSpace(type) && AllowedTypes.Contains(type.Trim().ToLowerInvariant());

    public static bool IsValidPath(string? pathOrCommand, string type)
    {
        if (string.IsNullOrWhiteSpace(pathOrCommand) || string.IsNullOrWhiteSpace(type))
        {
            return false;
        }

        var normalizedType = type.Trim().ToLowerInvariant();
        var value = pathOrCommand.Trim();

        if (normalizedType == "control")
        {
            return !ContainsTraversal(value) && AllowedControlCommands.Contains(value.ToLowerInvariant());
        }

        if (normalizedType == "settings")
        {
            return !ContainsTraversal(value) && AllowedSettingsPages.Contains(value.ToLowerInvariant());
        }

        if (ContainsTraversal(value))
        {
            return false;
        }

        if (!TryNormalizePath(value, out var fullPath))
        {
            return false;
        }

        if (normalizedType == "folder")
        {
            return Directory.Exists(fullPath);
        }

        if (normalizedType == "exe")
        {
            return fullPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(fullPath);
        }

        if (normalizedType == "lnk")
        {
            return fullPath.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && File.Exists(fullPath);
        }

        return false;
    }

    private static bool TryNormalizePath(string value, out string fullPath)
    {
        fullPath = string.Empty;

        try
        {
            if (!Path.IsPathRooted(value))
            {
                return false;
            }

            fullPath = Path.GetFullPath(value);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool ContainsTraversal(string value) =>
        value.Contains("..", StringComparison.Ordinal) || value.Contains('"');
}
