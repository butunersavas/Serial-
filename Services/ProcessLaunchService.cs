using System.Diagnostics;
using RadcKioskLauncher.Models;

namespace RadcKioskLauncher.Services;

public class ProcessLaunchService(ILogService logService)
{
    public bool Launch(KioskAppItem app, out string message)
    {
        var itemType = app.Type.ToLowerInvariant();
        if (!PathValidationService.IsValidPath(app.Path, itemType))
        {
            message = "Geçersiz uygulama yolu.";
            return false;
        }

        try
        {
            var processStartInfo = BuildStartInfo(app.Path, app.Arguments, app.WorkingDirectory, itemType);
            Process.Start(processStartInfo);
            message = $"{app.Title} başlatıldı.";
            logService.Info(message);
            return true;
        }
        catch (Exception ex)
        {
            message = $"{app.Title} başlatılamadı.";
            logService.Error(message, ex);
            return false;
        }
    }

    public bool LaunchSystemTool(SystemToolItem tool, out string message)
    {
        if (!PathValidationService.IsValidPath(tool.Command, tool.Type))
        {
            message = "Geçersiz sistem aracı komutu.";
            return false;
        }

        try
        {
            var psi = BuildStartInfo(tool.Command, tool.Arguments, null, tool.Type.ToLowerInvariant());
            Process.Start(psi);
            message = $"{tool.Title} açıldı.";
            logService.Info(message);
            return true;
        }
        catch (Exception ex)
        {
            message = $"{tool.Title} açılamadı.";
            logService.Error(message, ex);
            return false;
        }
    }

    private static ProcessStartInfo BuildStartInfo(string pathOrCommand, string? args, string? workingDir, string type)
    {
        if (type == "settings")
        {
            return new ProcessStartInfo("explorer.exe", $"{pathOrCommand} {args}".Trim()) { UseShellExecute = true };
        }

        if (type == "control")
        {
            return new ProcessStartInfo("control.exe", $"{pathOrCommand} {args}".Trim()) { UseShellExecute = true };
        }

        return new ProcessStartInfo
        {
            FileName = pathOrCommand,
            Arguments = args ?? string.Empty,
            WorkingDirectory = string.IsNullOrWhiteSpace(workingDir)
                ? Path.GetDirectoryName(pathOrCommand) ?? Environment.SystemDirectory
                : workingDir,
            UseShellExecute = true
        };
    }
}
