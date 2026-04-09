using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Services;
using RadcKioskLauncher.ViewModels;

namespace RadcKioskLauncher;

public partial class MainWindow : Window
{
    private readonly MainViewModel? _vm;

    private const int SwShow = 5;

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(nint hWnd);

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(nint hWnd, int nCmdShow);

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

    private void AdminPinBox_OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            AdminPinSubmit_OnClick(sender, e);
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Escape)
        {
            AdminPinCancel_OnClick(sender, e);
            e.Handled = true;
        }
    }

    private void AdminPinCancel_OnClick(object sender, RoutedEventArgs e)
    {
        AdminPinBox.Password = string.Empty;

        if (!TryInvokeViewModelMember(
                new[] { "CancelAdminPin", "CloseAdminPin", "HideAdminPinDialog", "HideAdminDialog" }))
        {
            _vm?.CancelAdminPin();
        }
    }

    private void AdminPinSubmit_OnClick(object sender, RoutedEventArgs e)
    {
        var enteredPin = AdminPinBox.Password;

        if (!TryInvokeViewModelMember(
                new[] { "SubmitAdminPin", "ConfirmAdminPin", "VerifyAdminPin", "OpenAdminPanel" },
                enteredPin))
        {
            _vm?.SubmitAdminPin(enteredPin);
        }

        if (_vm is { ShowPinOverlay: false })
        {
            AdminPinBox.Password = string.Empty;
        }
    }

    private bool TryInvokeViewModelMember(string[] orderedNames, params object?[]? args)
    {
        if (_vm is null)
        {
            return false;
        }

        var vmType = _vm.GetType();
        var invocationArgs = args ?? [];

        foreach (var name in orderedNames)
        {
            var method = vmType.GetMethod(name, BindingFlags.Instance | BindingFlags.Public);
            if (method is not null)
            {
                var parameters = method.GetParameters();
                if (parameters.Length == invocationArgs.Length)
                {
                    method.Invoke(_vm, invocationArgs);
                    return true;
                }
            }

            var prop = vmType.GetProperty(name, BindingFlags.Instance | BindingFlags.Public);
            if (prop?.GetValue(_vm) is ICommand cmd && cmd.CanExecute(null))
            {
                cmd.Execute(null);
                return true;
            }
        }

        return false;
    }

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
            // Bazı uygulamalar input idle üretmez.
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

    private static void HideFromAltTab()
    {
        // Geçici olarak devre dışı.
    }
}
