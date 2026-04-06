using RadcKioskLauncher.Models;

namespace RadcKioskLauncher.Services;

public interface IConfigService
{
    string ConfigPath { get; }
    AppConfig Load();
    void Save(AppConfig config);
    (bool IsValid, string Message) Validate(AppConfig config);
}
