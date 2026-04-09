using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using RadcKioskLauncher.Models;

namespace RadcKioskLauncher.Services;

public class ConfigService(ILogService logService) : IConfigService
{
    private readonly JsonSerializerOptions _serializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public string ConfigPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RadcKiosk", "config.json");

    public AppConfig Load()
    {
        var dir = Path.GetDirectoryName(ConfigPath)!;
        Directory.CreateDirectory(dir);

        if (!File.Exists(ConfigPath))
        {
            var defaultConfig = CreateDefault();
            Save(defaultConfig);
            return defaultConfig;
        }

        var json = File.ReadAllText(ConfigPath);
        var config = JsonSerializer.Deserialize<AppConfig>(json, _serializerOptions)
                     ?? throw new InvalidOperationException("Yapılandırma çözümlenemedi.");

        var validation = Validate(config);
        if (!validation.IsValid)
        {
            throw new InvalidDataException($"Yapılandırma doğrulama hatası: {validation.Message}");
        }

        return config;
    }

    public void Save(AppConfig config)
    {
        var validation = Validate(config);
        if (!validation.IsValid)
        {
            throw new InvalidDataException(validation.Message);
        }

        var dir = Path.GetDirectoryName(ConfigPath)!;
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(config, _serializerOptions);
        File.WriteAllText(ConfigPath, json);

        logService.Info("Yapılandırma kaydedildi.");
    }

    public (bool IsValid, string Message) Validate(AppConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.Language))
        {
            return (false, "language boş olamaz.");
        }

        if (string.IsNullOrWhiteSpace(config.AdminPinHash) && string.IsNullOrWhiteSpace(config.AdminPin))
        {
            return (false, "adminPinHash veya adminPin zorunludur.");
        }

        foreach (var app in config.Applications)
        {
            if (string.IsNullOrWhiteSpace(app.Id) || string.IsNullOrWhiteSpace(app.Title))
            {
                return (false, "Uygulama id/title boş olamaz.");
            }

            if (!PathValidationService.IsAllowedType(app.Type))
            {
                return (false, $"Geçersiz app type: {app.Type}");
            }

            if (!PathValidationService.IsValidPath(app.Path, app.Type))
            {
                return (false, $"Geçersiz app path: {app.Path}");
            }
        }

        foreach (var tool in config.SystemTools)
        {
            if (!PathValidationService.IsAllowedType(tool.Type))
            {
                return (false, $"Geçersiz tool type: {tool.Type}");
            }

            if (string.IsNullOrWhiteSpace(tool.Title) || string.IsNullOrWhiteSpace(tool.Command))
            {
                return (false, "SystemTool title/command boş olamaz.");
            }

            if (!PathValidationService.IsValidPath(tool.Command, tool.Type))
            {
                return (false, $"Geçersiz system tool command: {tool.Command}");
            }
        }

        return (true, "OK");
    }

    private static AppConfig CreateDefault()
    {
        var applications = DiscoverWorkResourcesApps();

        if (applications.Count == 0)
        {
            applications =
            [
                new KioskAppItem
                {
                    Id = "serendip-yonetim",
                    Title = "Serendip Yönetim",
                    Type = "lnk",
                    Path = @"C:\Work Resources\Serendip Yonetim (Work Resources).lnk",
                    Category = "Work Resources",
                    Visible = true
                },
                new KioskAppItem
                {
                    Id = "excel-work-resource",
                    Title = "Excel",
                    Type = "lnk",
                    Path = @"C:\Work Resources\Excel (Work Resources).lnk",
                    Category = "Work Resources",
                    Visible = true
                }
            ];
        }

        return new AppConfig
        {
            Title = "RADC Kiosk Launcher",
            Language = "tr-TR",
            ShowDeviceIp = true,
            ShowNetworkStatus = true,
            RequireWindowsAdminAuthInAdminMode = false,
            AdminPinHash = Helpers.SecurityHelper.ComputeSha256("1234"),
            Categories = ["Work Resources", "Sistem"],
            Applications = applications,
            SystemTools =
            [
                new SystemToolItem { Title = "Aygıtlar ve Yazıcılar", Type = "control", Command = "control printers", RequiresAdmin = true },
                new SystemToolItem { Title = "Programlar ve Özellikler", Type = "control", Command = "appwiz.cpl", RequiresAdmin = true },
                new SystemToolItem { Title = "Ağ Bağlantıları", Type = "control", Command = "ncpa.cpl", RequiresAdmin = true },
                new SystemToolItem { Title = "Hizmetler", Type = "control", Command = "services.msc", RequiresAdmin = true },
                new SystemToolItem { Title = "Olay Görüntüleyici", Type = "control", Command = "eventvwr.msc", RequiresAdmin = true },
                new SystemToolItem { Title = "Windows Update", Type = "settings", Command = "ms-settings:windowsupdate", RequiresAdmin = false }
            ]
        };
    }

    private static ObservableCollection<KioskAppItem> DiscoverWorkResourcesApps()
    {
        var result = new ObservableCollection<KioskAppItem>();
        var workResourcesPath = @"C:\Work Resources";

        if (!Directory.Exists(workResourcesPath))
        {
            return result;
        }

        var links = Directory.GetFiles(workResourcesPath, "*.lnk", SearchOption.TopDirectoryOnly)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .Take(12);

        foreach (var link in links)
        {
            result.Add(new KioskAppItem
            {
                Id = Path.GetFileNameWithoutExtension(link).ToLowerInvariant().Replace(' ', '-'),
                Title = Path.GetFileNameWithoutExtension(link),
                Type = "lnk",
                Path = link,
                WorkingDirectory = workResourcesPath,
                Category = "Work Resources",
                Visible = true
            });
        }

        return result;
    }
}
