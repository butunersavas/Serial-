using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Windows.Input;
using System.Windows.Threading;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Models;
using RadcKioskLauncher.Resources;
using RadcKioskLauncher.Services;

namespace RadcKioskLauncher.ViewModels;

public class MainViewModel : ObservableObject
{
    private readonly IConfigService _configService;
    private readonly ILogService _logService;
    private readonly ProcessLaunchService _launchService;
    private readonly AdminAuthService _adminAuthService;
    private AppConfig _config = new();
    private string _statusMessage = TextResources.T("Ready");
    private string _deviceAndIp = Environment.MachineName;
    private bool _showAdminMode;
    private DateTime _adminHoldStart = DateTime.MinValue;
    private bool _showPinOverlay;
    private string _pinErrorMessage = string.Empty;

    public MainViewModel(IConfigService configService, ILogService logService, ProcessLaunchService launchService, AdminAuthService adminAuthService)
    {
        _configService = configService;
        _logService = logService;
        _launchService = launchService;
        _adminAuthService = adminAuthService;

        LaunchAppCommand = new RelayCommand<KioskAppItem>(LaunchApp);
        LaunchSystemToolCommand = new RelayCommand<SystemToolItem>(LaunchSystemTool);
        RefreshCommand = new RelayCommand(LoadConfig);
        HiddenCornerTapCommand = new RelayCommand(RequestAdminPin);
        ShowAdminLoginCommand = new RelayCommand(RequestAdminPin);
        RestartCommand = new RelayCommand(() => ExitRequested?.Invoke(this, KioskExitCodes.ManualRestartRequested));
        LogoutCommand = new RelayCommand(() => Process.Start("shutdown", "/l"));
        RebootCommand = new RelayCommand(() => Process.Start("shutdown", "/r /t 0"));

        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        timer.Tick += (_, _) => UpdateHeaderFields();
        timer.Start();

        LoadConfig();
    }

    public event EventHandler<int>? ExitRequested;
    public event EventHandler<Process>? ExternalAppLaunched;

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

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public string DeviceAndIp
    {
        get => _deviceAndIp;
        set => SetProperty(ref _deviceAndIp, value);
    }

    public bool ShowAdminMode
    {
        get => _showAdminMode;
        set => SetProperty(ref _showAdminMode, value);
    }

    public bool ShowPinOverlay
    {
        get => _showPinOverlay;
        set => SetProperty(ref _showPinOverlay, value);
    }

    public string PinErrorMessage
    {
        get => _pinErrorMessage;
        set => SetProperty(ref _pinErrorMessage, value);
    }

    public string RefreshButtonText => TextResources.T("Refresh");
    public string AdminEntryTooltip => TextResources.T("AdminTooltip");
    public AdminViewModel? AdminViewModel { get; private set; }

    public void HandleKeyGesture(Key key, ModifierKeys modifiers)
    {
        if (key == Key.F12 && modifiers.HasFlag(ModifierKeys.Control) && modifiers.HasFlag(ModifierKeys.Shift))
        {
            RequestAdminPin();
        }
    }

    public void StartAdminPressHold() => _adminHoldStart = DateTime.UtcNow;

    public void EndAdminPressHold()
    {
        if (_adminHoldStart == DateTime.MinValue)
        {
            return;
        }

        var heldFor = DateTime.UtcNow - _adminHoldStart;
        _adminHoldStart = DateTime.MinValue;

        if (heldFor >= TimeSpan.FromSeconds(5))
        {
            RequestAdminPin();
        }
    }

    public void RequestAdminPin()
    {
        PinErrorMessage = string.Empty;
        ShowPinOverlay = true;
    }

    public void CancelAdminPin()
    {
        ShowPinOverlay = false;
        PinErrorMessage = string.Empty;
    }

    public void SubmitAdminPin(string pin)
    {
        if (!_adminAuthService.VerifyPin(pin, _config.AdminPinHash, _config.AdminPin))
        {
            PinErrorMessage = TextResources.T("PinFailed");
            StatusMessage = TextResources.T("PinFailed");
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
                StatusMessage = $"{TextResources.T("AuthFailed")}: {error}";
                return;
            }
        }

        ShowPinOverlay = false;
        PinErrorMessage = string.Empty;
        ShowAdminMode = true;
        StatusMessage = TextResources.T("AdminEnabled");
    }

    private void LoadConfig()
    {
        _config = _configService.Load();
        TextResources.SetCulture(_config.Language);
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
        RaisePropertyChanged(nameof(RefreshButtonText));
        RaisePropertyChanged(nameof(AdminEntryTooltip));
        UpdateHeaderFields();
        StatusMessage = TextResources.T("ConfigLoaded");
    }

    private void LaunchApp(KioskAppItem? app)
    {
        if (app is null) return;

        if (app.RequiresAdmin)
        {
            StatusMessage = TextResources.T("AdminRequired");
        }

        if (_launchService.Launch(app, out var message, out var process))
        {
            StatusMessage = message;
            if (process is not null)
            {
                ExternalAppLaunched?.Invoke(this, process);
            }

            return;
        }

        StatusMessage = message;
    }

    private void LaunchSystemTool(SystemToolItem? tool)
    {
        if (tool is null) return;
        _launchService.LaunchSystemTool(tool, out var message);
        StatusMessage = message;
    }

    private void CloseAdminMode()
    {
        ShowAdminMode = false;
        LoadConfig();
    }

    private void UpdateHeaderFields()
    {
        var ip = ResolveDeviceIpV4();
        var ipText = ip ?? TextResources.T("IpUnavailable");
        DeviceAndIp = _config.ShowDeviceIp
            ? $"{Environment.MachineName} | {ipText}"
            : Environment.MachineName;
    }

    private static string? ResolveDeviceIpV4()
    {
        var interfaces = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up)
            .Where(n => n.NetworkInterfaceType != NetworkInterfaceType.Loopback && n.NetworkInterfaceType != NetworkInterfaceType.Tunnel)
            .Where(n => !n.Description.Contains("virtual", StringComparison.OrdinalIgnoreCase));

        foreach (var ni in interfaces)
        {
            var candidate = ni.GetIPProperties().UnicastAddresses
                .Select(u => u.Address)
                .FirstOrDefault(ip => ip.AddressFamily == AddressFamily.InterNetwork && !ip.ToString().StartsWith("169.254."));

            if (candidate is not null)
            {
                return candidate.ToString();
            }
        }

        return null;
    }
}
