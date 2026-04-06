namespace RadcKioskLauncher.Services;

public static class PathValidationService
{
    private static readonly HashSet<string> AllowedTypes = ["exe", "lnk", "control", "settings"];

    public static bool IsAllowedType(string? type) =>
        !string.IsNullOrWhiteSpace(type) && AllowedTypes.Contains(type.Trim().ToLowerInvariant());

    public static bool IsValidPath(string? pathOrCommand, string type)
    {
        if (string.IsNullOrWhiteSpace(pathOrCommand))
        {
            return false;
        }

        if (type is "control" or "settings")
        {
            return !ContainsTraversal(pathOrCommand);
        }

        if (ContainsTraversal(pathOrCommand))
        {
            return false;
        }

        return Path.IsPathRooted(pathOrCommand);
    }

    private static bool ContainsTraversal(string value) =>
        value.Contains("..", StringComparison.Ordinal) || value.Contains('"');
}
