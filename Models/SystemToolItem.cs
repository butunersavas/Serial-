namespace RadcKioskLauncher.Models;

public class SystemToolItem
{
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = "control";
    public string Command { get; set; } = string.Empty;
    public string Arguments { get; set; } = string.Empty;
    public bool RequiresAdmin { get; set; }
}
