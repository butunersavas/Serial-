namespace RadcKioskLauncher.Services;

public interface ILogService
{
    string LogDirectory { get; }
    void Info(string message);
    void Warning(string message);
    void Error(string message, Exception? ex = null);
}
