using System.Windows;
using System.Windows.Input;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Services;
using RadcKioskLauncher.ViewModels;

namespace RadcKioskLauncher;

public partial class MainWindow : Window
{
    private readonly MainViewModel _vm;

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
}
