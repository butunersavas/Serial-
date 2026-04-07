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

    public string ConfigPath => @"C:\ProgramData\RadcKiosk\config.json";

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
                     ?? throw new InvalidOperationException("Config deserialize edilemedi.");

        var validation = Validate(config);
        if (!validation.IsValid)
        {
            throw new InvalidDataException($"Config validation hatası: {validation.Message}");
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

        logService.Info("Config kaydedildi.");
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

    private static AppConfig CreateDefault() => new()
    {
        Title = "RADC Kiosk Launcher",
        Language = "tr-TR",
        ShowDeviceIp = true,
        ShowNetworkStatus = true,
        RequireWindowsAdminAuthInAdminMode = false,
        AdminPinHash = Helpers.SecurityHelper.ComputeSha256("1234"),
        Categories = ["Work Resources", "Sistem"],
        Applications =
        [
            new KioskAppItem
            {
                Id = "serendip-yonetim",
                Title = "Serendip Yonetim",
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
        ],
        SystemTools =
        [
            new SystemToolItem
            {
                Title = "Programlar ve Özellikler",
                Type = "control",
                Command = "appwiz.cpl",
                RequiresAdmin = true
            }
        ]
    };
}
