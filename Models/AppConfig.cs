using System.Collections.ObjectModel;

namespace RadcKioskLauncher.Models;

public class AppConfig
{
    public string Theme { get; set; } = "dark";
    public string Title { get; set; } = "RADC Kiosk";
    public string Language { get; set; } = "tr-TR";
    public bool ShowDeviceIp { get; set; } = true;
    public bool ShowNetworkStatus { get; set; } = true;
    public bool RequireWindowsAdminAuthInAdminMode { get; set; }
    public string AdminPinHash { get; set; } = string.Empty;
    public string AdminPin { get; set; } = string.Empty;
    public ObservableCollection<KioskAppItem> Applications { get; set; } = [];
    public ObservableCollection<SystemToolItem> SystemTools { get; set; } = [];
    public ObservableCollection<string> Categories { get; set; } = [];
}
