using System.Collections.ObjectModel;

namespace RadcKioskLauncher.Models;

public class AppConfig
{
    public string Theme { get; set; } = "dark";
    public string Title { get; set; } = "RADC Kiosk";
    public bool RequireWindowsAdminAuthInAdminMode { get; set; }
    public string AdminPinHash { get; set; } = string.Empty;
    public ObservableCollection<KioskAppItem> Applications { get; set; } = [];
    public ObservableCollection<SystemToolItem> SystemTools { get; set; } = [];
    public ObservableCollection<string> Categories { get; set; } = [];
}
