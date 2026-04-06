using System.Text;

namespace RadcKioskLauncher.Services;

public class LogService : ILogService
{
    private readonly object _sync = new();
    private readonly string _logFilePath;

    public string LogDirectory { get; }

    public LogService()
    {
        LogDirectory = @"C:\ProgramData\RadcKiosk\logs";
        Directory.CreateDirectory(LogDirectory);
        _logFilePath = Path.Combine(LogDirectory, $"launcher-{DateTime.UtcNow:yyyyMMdd}.log");
    }

    public void Info(string message) => Write("INFO", message);
    public void Warning(string message) => Write("WARN", message);
    public void Error(string message, Exception? ex = null) =>
        Write("ERROR", ex is null ? message : $"{message}{Environment.NewLine}{ex.Message}");

    private void Write(string level, string message)
    {
        lock (_sync)
        {
            File.AppendAllText(
                _logFilePath,
                $"{DateTime.UtcNow:O} [{level}] {message}{Environment.NewLine}",
                Encoding.UTF8);
        }
    }
}
