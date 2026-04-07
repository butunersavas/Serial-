using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Services;
using RadcKioskLauncher.ViewModels;

namespace RadcKioskLauncher;

public partial class MainWindow : Window
{
    private readonly MainViewModel _vm;

    private const int SwShow = 5;

    [LibraryImport("user32.dll")]
    private static partial bool SetForegroundWindow(nint hWnd);

    [LibraryImport("user32.dll")]
    private static partial bool ShowWindow(nint hWnd, int nCmdShow);

    public MainWindow()
    {
        InitializeComponent();

        var logService = App.LogService;
        var configService = new ConfigService(logService);
        var launchService = new ProcessLaunchService(logService);
        var adminAuthService = new AdminAuthService();

        try
        {
            _vm = new MainViewModel(configService, logService, launchService, adminAuthService);
            _vm.ExitRequested += (_, code) => Application.Current.Shutdown(code);
            _vm.ExternalAppLaunched += (_, process) => HandleExternalLaunch(process);
            DataContext = _vm;
        }
        catch
        {
            DataContext = null;
            Content = new Views.SafeErrorView();
            Application.Current.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            Loaded += (_, _) => Application.Current.Shutdown(KioskExitCodes.ConfigLoadFailure);
        }
    }

    protected override void OnPreviewKeyDown(KeyEventArgs e)
    {
        base.OnPreviewKeyDown(e);
        _vm?.HandleKeyGesture(e.Key, Keyboard.Modifiers);
    }

    private void AdminTrigger_OnMouseDown(object sender, MouseButtonEventArgs e) => _vm?.StartAdminPressHold();
    private void AdminTrigger_OnMouseUp(object sender, MouseButtonEventArgs e) => _vm?.EndAdminPressHold();

    private async void HandleExternalLaunch(Process process)
    {
        Topmost = false;
        WindowState = WindowState.Minimized;
        Hide();

        await Task.Run(() => BringProcessToFront(process));

        process.EnableRaisingEvents = true;
        process.Exited += (_, _) => Dispatcher.Invoke(() =>
        {
            Show();
            WindowState = WindowState.Maximized;
            Activate();
            Topmost = true;
        });
    }

    private static void BringProcessToFront(Process process)
    {
        try
        {
            process.WaitForInputIdle(5000);
        }
        catch
        {
            // NOTE: Bazı uygulamalar input idle üretmez, akış devam eder.
        }

        for (var i = 0; i < 20; i++)
        {
            process.Refresh();
            if (process.MainWindowHandle != nint.Zero)
            {
                ShowWindow(process.MainWindowHandle, SwShow);
                SetForegroundWindow(process.MainWindowHandle);
                return;
            }

            Thread.Sleep(200);
        }
    }
}
