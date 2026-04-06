using System.Windows;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Services;

namespace RadcKioskLauncher;

public partial class App : Application
{
    public static ILogService LogService { get; } = new LogService();

    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            LogService.Error("Unhandled UI exception", args.Exception);
            MessageBox.Show("Beklenmeyen bir hata oluştu. Uygulama güvenli biçimde kapanacak.", "RADC Kiosk", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(KioskExitCodes.UnhandledException);
            args.Handled = true;
        };

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            if (args.ExceptionObject is Exception ex)
            {
                LogService.Error("Unhandled domain exception", ex);
            }
        };

        base.OnStartup(e);
    }
}
