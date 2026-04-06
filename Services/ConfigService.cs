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
        }

        return (true, "OK");
    }

    private static AppConfig CreateDefault() => new()
    {
        Title = "RADC Kiosk Launcher",
        RequireWindowsAdminAuthInAdminMode = false,
        AdminPinHash = Helpers.SecurityHelper.ComputeSha256("1234"),
        Categories = ["General", "System"],
        Applications =
        [
            new KioskAppItem
            {
                Id = "notepad",
                Title = "Notepad",
                Type = "exe",
                Path = @"C:\Windows\System32\notepad.exe",
                Category = "General",
                Visible = true
            }
        ],
        SystemTools =
        [
            new SystemToolItem
            {
                Title = "Programs and Features",
                Type = "control",
                Command = "appwiz.cpl",
                RequiresAdmin = true
            }
        ]
    };
}
