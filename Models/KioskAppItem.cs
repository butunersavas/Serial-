namespace RadcKioskLauncher.Models;

public class KioskAppItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = string.Empty;
    public string IconPath { get; set; } = string.Empty;
    public string Type { get; set; } = "exe";
    public string Path { get; set; } = string.Empty;
    public string Arguments { get; set; } = string.Empty;
    public string WorkingDirectory { get; set; } = string.Empty;
    public bool Visible { get; set; } = true;
    public bool RequiresAdmin { get; set; }
    public string Category { get; set; } = "Genel";
}
