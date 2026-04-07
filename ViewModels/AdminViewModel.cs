using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using Microsoft.Win32;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Models;
using RadcKioskLauncher.Services;

namespace RadcKioskLauncher.ViewModels;

public class AdminViewModel : ObservableObject
{
    private readonly IConfigService _configService;
    private readonly ILogService _logService;
    private readonly ProcessLaunchService _launchService;
    private readonly Action _closeAction;
    private readonly AppConfig _config;
    private string _status = "Admin mode hazır.";
    private KioskAppItem? _selectedApp;

    public AdminViewModel(IConfigService configService, ILogService logService, ProcessLaunchService launchService, AppConfig config, Action closeAction)
    {
        _configService = configService;
        _logService = logService;
        _launchService = launchService;
        _config = config;
        _closeAction = closeAction;

        Applications = config.Applications;
        Categories = config.Categories;
        SystemTools = config.SystemTools;

        AddAppCommand = new RelayCommand(AddApp);
        RemoveAppCommand = new RelayCommand(RemoveSelectedApp, () => SelectedApp is not null);
        MoveUpCommand = new RelayCommand(MoveUp, () => CanMove(-1));
        MoveDownCommand = new RelayCommand(MoveDown, () => CanMove(1));
        ValidateConfigCommand = new RelayCommand(ValidateConfig);
        ReloadCommand = new RelayCommand(ReloadLauncher);
        RefreshScreenCommand = new RelayCommand(() => Status = "Ekran yenilendi.");
        OpenLogsCommand = new RelayCommand(OpenLogs);
        CloseAdminModeCommand = new RelayCommand(() => _closeAction());
        SaveCommand = new RelayCommand(Save);
        AddCategoryCommand = new RelayCommand(AddCategory);
        EditIconCommand = new RelayCommand(EditIcon, () => SelectedApp is not null);
        LaunchToolCommand = new RelayCommand<SystemToolItem>(LaunchTool);
        RebootCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/r /t 0"));
        LogoutCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/l"));
    }

    public ObservableCollection<KioskAppItem> Applications { get; }
    public ObservableCollection<SystemToolItem> SystemTools { get; }
    public ObservableCollection<string> Categories { get; }

    public ICommand AddAppCommand { get; }
    public ICommand RemoveAppCommand { get; }
    public ICommand MoveUpCommand { get; }
    public ICommand MoveDownCommand { get; }
    public ICommand ValidateConfigCommand { get; }
    public ICommand ReloadCommand { get; }
    public ICommand RefreshScreenCommand { get; }
    public ICommand OpenLogsCommand { get; }
    public ICommand CloseAdminModeCommand { get; }
    public ICommand SaveCommand { get; }
    public ICommand AddCategoryCommand { get; }
    public ICommand EditIconCommand { get; }
    public ICommand LaunchToolCommand { get; }
    public ICommand RebootCommand { get; }
    public ICommand LogoutCommand { get; }

    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }

    public KioskAppItem? SelectedApp
    {
        get => _selectedApp;
        set
        {
            if (SetProperty(ref _selectedApp, value))
            {
                NotifyButtons();
            }
        }
    }

    private void AddApp()
    {
        var dialog = new OpenFileDialog
        {
            Title = "Uygulama seç",
            Filter = "Uygulamalar (*.exe;*.lnk)|*.exe;*.lnk"
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        var extension = Path.GetExtension(dialog.FileName).ToLowerInvariant();
        var app = new KioskAppItem
        {
            Id = Guid.NewGuid().ToString("N"),
            Title = Path.GetFileNameWithoutExtension(dialog.FileName),
            Type = extension == ".lnk" ? "lnk" : "exe",
            Path = dialog.FileName,
            WorkingDirectory = Path.GetDirectoryName(dialog.FileName) ?? string.Empty,
            Visible = true,
            Category = Categories.FirstOrDefault() ?? "General"
        };

        Applications.Add(app);
        SelectedApp = app;
        Status = "Whitelist uygulaması eklendi.";
    }

    private void RemoveSelectedApp()
    {
        if (SelectedApp is null)
        {
            return;
        }

        Applications.Remove(SelectedApp);
        Status = "Whitelist uygulaması silindi.";
    }

    private bool CanMove(int direction)
    {
        if (SelectedApp is null)
        {
            return false;
        }

        var idx = Applications.IndexOf(SelectedApp);
        var target = idx + direction;
        return idx >= 0 && target >= 0 && target < Applications.Count;
    }

    private void MoveUp() => Move(-1);
    private void MoveDown() => Move(1);

    private void Move(int direction)
    {
        if (SelectedApp is null)
        {
            return;
        }

        var idx = Applications.IndexOf(SelectedApp);
        var target = idx + direction;
        if (target < 0 || target >= Applications.Count)
        {
            return;
        }

        Applications.Move(idx, target);
        Status = "Sıralama güncellendi.";
    }

    private void ValidateConfig()
    {
        var result = _configService.Validate(_config);
        Status = result.IsValid ? "Config doğrulandı." : $"Config hatalı: {result.Message}";
    }

    private void Save()
    {
        _configService.Save(_config);
        Status = "Config kaydedildi.";
    }

    private void ReloadLauncher()
    {
        Save();
        System.Windows.Application.Current.Shutdown(KioskExitCodes.ManualRestartRequested);
    }

    private void OpenLogs()
    {
        var item = new KioskAppItem
        {
            Title = "Logs",
            Type = "exe",
            Path = @"C:\Windows\explorer.exe",
            Arguments = _logService.LogDirectory
        };

        _launchService.Launch(item, out var message);
        Status = message;
    }

    private void AddCategory()
    {
        var newCategory = $"Category-{Categories.Count + 1}";
        Categories.Add(newCategory);
        Status = $"Kategori eklendi: {newCategory}";
    }

    private void EditIcon()
    {
        if (SelectedApp is null)
        {
            return;
        }

        var dialog = new OpenFileDialog { Filter = "Icon/Png (*.ico;*.png)|*.ico;*.png" };
        if (dialog.ShowDialog() != true)
        {
            return;
        }

        SelectedApp.IconPath = dialog.FileName;
        Status = "İkon güncellendi.";
    }

    private void LaunchTool(SystemToolItem? tool)
    {
        if (tool is null)
        {
            return;
        }

        _launchService.LaunchSystemTool(tool, out var message);
        Status = message;
    }

    private void NotifyButtons()
    {
        (RemoveAppCommand as RelayCommand)?.NotifyCanExecuteChanged();
        (MoveUpCommand as RelayCommand)?.NotifyCanExecuteChanged();
        (MoveDownCommand as RelayCommand)?.NotifyCanExecuteChanged();
        (EditIconCommand as RelayCommand)?.NotifyCanExecuteChanged();
    }
}
