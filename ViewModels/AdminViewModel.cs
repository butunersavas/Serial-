using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using Microsoft.Win32;
using RadcKioskLauncher.Helpers;
using RadcKioskLauncher.Models;
using RadcKioskLauncher.Resources;
using RadcKioskLauncher.Services;

namespace RadcKioskLauncher.ViewModels;

public class AdminViewModel : ObservableObject
{
    private readonly IConfigService _configService;
    private readonly ILogService _logService;
    private readonly ProcessLaunchService _launchService;
    private readonly Action _closeAction;
    private readonly AppConfig _config;
    private string _status = TextResources.T("AdminModeReady");
    private KioskAppItem? _selectedApp;
    private SystemToolTemplate? _selectedToolTemplate;

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

        AvailableSystemTools =
        [
            new SystemToolTemplate("Aygıtlar ve Yazıcılar", "control", "control printers"),
            new SystemToolTemplate("Programlar ve Özellikler", "control", "appwiz.cpl"),
            new SystemToolTemplate("Ağ Bağlantıları", "control", "ncpa.cpl"),
            new SystemToolTemplate("Hizmetler", "control", "services.msc"),
            new SystemToolTemplate("Olay Görüntüleyici", "control", "eventvwr.msc"),
            new SystemToolTemplate("Windows Update", "settings", "ms-settings:windowsupdate"),
            new SystemToolTemplate("Ağ Ayarları", "settings", "ms-settings:network"),
            new SystemToolTemplate("Yazıcılar", "settings", "ms-settings:printers"),
            new SystemToolTemplate("Uygulamalar", "settings", "ms-settings:appsfeatures")
        ];

        SelectedToolTemplate = AvailableSystemTools.FirstOrDefault();

        AddExeCommand = new RelayCommand(() => AddApp("exe"));
        AddLnkCommand = new RelayCommand(() => AddApp("lnk"));
        AddFolderCommand = new RelayCommand(AddFolder);
        RemoveAppCommand = new RelayCommand(RemoveSelectedApp, () => SelectedApp is not null);
        MoveUpCommand = new RelayCommand(MoveUp, () => CanMove(-1));
        MoveDownCommand = new RelayCommand(MoveDown, () => CanMove(1));
        ValidateConfigCommand = new RelayCommand(ValidateConfig);
        ReloadCommand = new RelayCommand(ReloadLauncher);
        RefreshScreenCommand = new RelayCommand(() => Status = TextResources.T("ScreenRefreshed"));
        OpenLogsCommand = new RelayCommand(OpenLogs);
        CloseAdminModeCommand = new RelayCommand(() => _closeAction());
        SaveCommand = new RelayCommand(Save);
        AddCategoryCommand = new RelayCommand(AddCategory);
        EditIconCommand = new RelayCommand(EditIcon, () => SelectedApp is not null);
        LaunchToolCommand = new RelayCommand<SystemToolItem>(LaunchTool);
        AddSystemToolCommand = new RelayCommand(AddSystemTool, () => SelectedToolTemplate is not null);
        RebootCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/r /t 0"));
        LogoutCommand = new RelayCommand(() => System.Diagnostics.Process.Start("shutdown", "/l"));
    }

    public ObservableCollection<KioskAppItem> Applications { get; }
    public ObservableCollection<SystemToolItem> SystemTools { get; }
    public ObservableCollection<string> Categories { get; }
    public ObservableCollection<SystemToolTemplate> AvailableSystemTools { get; }

    public ICommand AddExeCommand { get; }
    public ICommand AddLnkCommand { get; }
    public ICommand AddFolderCommand { get; }
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
    public ICommand AddSystemToolCommand { get; }
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

    public SystemToolTemplate? SelectedToolTemplate
    {
        get => _selectedToolTemplate;
        set
        {
            if (SetProperty(ref _selectedToolTemplate, value))
            {
                (AddSystemToolCommand as RelayCommand)?.NotifyCanExecuteChanged();
            }
        }
    }

    private void AddApp(string type)
    {
        var filter = type == "lnk" ? "Kısayol (*.lnk)|*.lnk" : "Uygulama (*.exe)|*.exe";
        var dialog = new OpenFileDialog
        {
            Title = type == "lnk" ? "Kısayol seç" : "Uygulama seç",
            Filter = filter
        };

        if (dialog.ShowDialog() != true)
        {
            return;
        }

        var app = CreateAppItem(type, dialog.FileName);
        Applications.Add(app);
        SelectedApp = app;
        Status = TextResources.T("AppAdded");
    }

    private void AddFolder()
    {
        var dialog = new OpenFolderDialog { Title = "Klasör seç" };
        if (dialog.ShowDialog() != true)
        {
            return;
        }

        var app = CreateAppItem("folder", dialog.FolderName);
        Applications.Add(app);
        SelectedApp = app;
        Status = TextResources.T("AppAdded");
    }

    private KioskAppItem CreateAppItem(string type, string fullPath)
    {
        return new KioskAppItem
        {
            Id = Guid.NewGuid().ToString("N"),
            Title = Path.GetFileNameWithoutExtension(fullPath),
            Type = type,
            Path = fullPath,
            WorkingDirectory = type == "folder" ? fullPath : Path.GetDirectoryName(fullPath) ?? string.Empty,
            Visible = true,
            Category = Categories.FirstOrDefault() ?? "Genel"
        };
    }

    private void AddSystemTool()
    {
        if (SelectedToolTemplate is null)
        {
            return;
        }

        if (SystemTools.Any(t => t.Title.Equals(SelectedToolTemplate.Title, StringComparison.OrdinalIgnoreCase)))
        {
            Status = "Bu sistem aracı zaten listede.";
            return;
        }

        SystemTools.Add(new SystemToolItem
        {
            Title = SelectedToolTemplate.Title,
            Type = SelectedToolTemplate.Type,
            Command = SelectedToolTemplate.Command,
            RequiresAdmin = true
        });

        Status = "Sistem aracı eklendi.";
    }

    private void RemoveSelectedApp()
    {
        if (SelectedApp is null)
        {
            return;
        }

        Applications.Remove(SelectedApp);
        Status = TextResources.T("AppRemoved");
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
        Status = TextResources.T("SortUpdated");
    }

    private void ValidateConfig()
    {
        var result = _configService.Validate(_config);
        Status = result.IsValid ? TextResources.T("ConfigValidated") : $"Yapılandırma hatalı: {result.Message}";
    }

    private void Save()
    {
        _configService.Save(_config);
        Status = TextResources.T("ConfigSaved");
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
            Title = "Kayıtlar",
            Type = "exe",
            Path = @"C:\Windows\explorer.exe",
            Arguments = _logService.LogDirectory
        };

        _launchService.Launch(item, out var message, out _);
        Status = message;
    }

    private void AddCategory()
    {
        var newCategory = $"Kategori-{Categories.Count + 1}";
        Categories.Add(newCategory);
        Status = $"Kategori eklendi: {newCategory}";
    }

    private void EditIcon()
    {
        if (SelectedApp is null)
        {
            return;
        }

        var dialog = new OpenFileDialog { Filter = "Simge/Görsel (*.ico;*.png)|*.ico;*.png" };
        if (dialog.ShowDialog() != true)
        {
            return;
        }

        SelectedApp.IconPath = dialog.FileName;
        Status = TextResources.T("IconUpdated");
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

public class SystemToolTemplate(string title, string type, string command)
{
    public string Title { get; } = title;
    public string Type { get; } = type;
    public string Command { get; } = command;
}
