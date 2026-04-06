using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Models;
using RadcKioskLauncher.Services;

namespace RadcKioskLauncher.ViewModels;

public class MainViewModel : ObservableObject
{
    private readonly IConfigService _configService;
    private readonly ILogService _logService;
    private readonly ProcessLaunchService _launchService;
    private readonly AdminAuthService _adminAuthService;
    private AppConfig _config = new();
    private string _statusMessage = "Hazır";
    private string _clock = DateTime.Now.ToString("HH:mm:ss");
    private string _deviceName = Environment.MachineName;
    private bool _showAdminMode;
    private int _cornerTapCounter;
    private DateTime _lastCornerTap = DateTime.MinValue;

    public MainViewModel(IConfigService configService, ILogService logService, ProcessLaunchService launchService, AdminAuthService adminAuthService)
    {
        _configService = configService;
        _logService = logService;
        _launchService = launchService;
        _adminAuthService = adminAuthService;

        LaunchAppCommand = new RelayCommand<KioskAppItem>(LaunchApp);
        LaunchSystemToolCommand = new RelayCommand<SystemToolItem>(LaunchSystemTool);
        RefreshCommand = new RelayCommand(LoadConfig);
        HiddenCornerTapCommand = new RelayCommand(RegisterHiddenTap);
        ShowAdminLoginCommand = new RelayCommand(TryOpenAdminMode);
        RestartCommand = new RelayCommand(() => ExitRequested?.Invoke(this, KioskExitCodes.ManualRestartRequested));
        LogoutCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/l"));
        RebootCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/r /t 0"));

        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        timer.Tick += (_, _) => Clock = DateTime.Now.ToString("HH:mm:ss");
        timer.Start();

        LoadConfig();
    }

    public event EventHandler<int>? ExitRequested;

    public ObservableCollection<KioskAppItem> Apps { get; } = [];
    public ObservableCollection<SystemToolItem> SystemTools { get; } = [];

    public ICommand LaunchAppCommand { get; }
    public ICommand LaunchSystemToolCommand { get; }
    public ICommand RefreshCommand { get; }
    public ICommand HiddenCornerTapCommand { get; }
    public ICommand ShowAdminLoginCommand { get; }
    public ICommand RestartCommand { get; }
    public ICommand LogoutCommand { get; }
    public ICommand RebootCommand { get; }

    public string Title => _config.Title;

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public string Clock
    {
        get => _clock;
        set => SetProperty(ref _clock, value);
    }

    public string DeviceName
    {
        get => _deviceName;
        set => SetProperty(ref _deviceName, value);
    }

    public bool ShowAdminMode
    {
        get => _showAdminMode;
        set => SetProperty(ref _showAdminMode, value);
    }

    public AdminViewModel? AdminViewModel { get; private set; }

    public void HandleKeyGesture(Key key, ModifierKeys modifiers)
    {
        if (key == Key.F12 && modifiers.HasFlag(ModifierKeys.Control) && modifiers.HasFlag(ModifierKeys.Shift))
        {
            TryOpenAdminMode();
        }
    }

    private void LoadConfig()
    {
        _config = _configService.Load();
        Apps.Clear();

        foreach (var app in _config.Applications.Where(a => a.Visible))
        {
            Apps.Add(app);
        }

        SystemTools.Clear();
        foreach (var tool in _config.SystemTools)
        {
            SystemTools.Add(tool);
        }

        AdminViewModel = new AdminViewModel(_configService, _logService, _launchService, _config, CloseAdminMode);
        RaisePropertyChanged(nameof(AdminViewModel));
        RaisePropertyChanged(nameof(Title));
        StatusMessage = "Konfigürasyon yüklendi.";
    }

    private void LaunchApp(KioskAppItem? app)
    {
        if (app is null) return;

        if (app.RequiresAdmin)
        {
            StatusMessage = "Bu uygulama yönetici yetkisi gerektirir.";
        }

        if (_launchService.Launch(app, out var message))
        {
            StatusMessage = message;
            return;
        }

        StatusMessage = message;
    }

    private void LaunchSystemTool(SystemToolItem? tool)
    {
        if (tool is null) return;

        if (tool.RequiresAdmin)
        {
            StatusMessage = "Bu araç yönetici yetkisi gerektirir.";
        }

        if (_launchService.LaunchSystemTool(tool, out var message))
        {
            StatusMessage = message;
            return;
        }

        StatusMessage = message;
    }

    private void RegisterHiddenTap()
    {
        if (DateTime.UtcNow - _lastCornerTap > TimeSpan.FromSeconds(4))
        {
            _cornerTapCounter = 0;
        }

        _cornerTapCounter++;
        _lastCornerTap = DateTime.UtcNow;

        if (_cornerTapCounter >= 5)
        {
            _cornerTapCounter = 0;
            TryOpenAdminMode();
        }
    }

    private void TryOpenAdminMode()
    {
        var pinDialog = new Views.PinDialog();
        if (pinDialog.ShowDialog() != true)
        {
            return;
        }

        if (!_adminAuthService.VerifyPin(pinDialog.Pin, _config.AdminPinHash))
        {
            StatusMessage = "PIN doğrulanamadı.";
            return;
        }

        if (_config.RequireWindowsAdminAuthInAdminMode)
        {
            var credsDialog = new Views.WindowsAuthDialog();
            if (credsDialog.ShowDialog() != true)
            {
                return;
            }

            if (!_adminAuthService.VerifyWindowsAdminCredentials(credsDialog.Username, credsDialog.Password, out var error))
            {
                StatusMessage = $"Windows admin doğrulaması başarısız: {error}";
                return;
            }
        }

        ShowAdminMode = true;
        StatusMessage = "Admin mode aktif.";
    }

    private void CloseAdminMode()
    {
        ShowAdminMode = false;
        LoadConfig();
    }
}
