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
        if (string.IsNullOrWhiteSpace(pathOrCommand))
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

        if (normalizedType == "folder")
        {
            return Path.IsPathRooted(value) && Directory.Exists(value);
        }

        return Path.IsPathRooted(value);
    }

    private static bool ContainsTraversal(string value) =>
        value.Contains("..", StringComparison.Ordinal) || value.Contains('"');
}
