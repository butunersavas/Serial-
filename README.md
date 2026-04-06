# RadcKioskLauncher (.NET 8 WPF)

Windows 11 IoT Enterprise LTSC için shell replacement kiosk launcher örneği.

## Özellikler
- Explorer yerine shell çalışacak şekilde tasarlanmış **tam ekran / bordersız / topmost** WPF launcher.
- MVVM + katmanlı yapı: `Models`, `Services`, `ViewModels`, `Views`, `Helpers`.
- Config tabanlı whitelist uygulama çalıştırma (`exe`, `lnk`, `control`, `settings`).
- RemoteApp senaryolarını bozmamak için `.lnk` açılışı `UseShellExecute=true` ile desteklenir.
- Hidden Admin Mode (köşe tıklama veya `Ctrl+Shift+F12`) + PIN doğrulama + opsiyonel Windows admin kimlik doğrulaması.
- Config bozulursa stack trace göstermeyen güvenli hata ekranı.
- Log dizini: `C:\ProgramData\RadcKiosk\logs`.

## Dizinler
- Config: `C:\ProgramData\RadcKiosk\config.json`
- Logs: `C:\ProgramData\RadcKiosk\logs`

Örnek config: `Samples/config.sample.json`

## Build
```powershell
dotnet restore
dotnet build
```

## Single file self-contained publish (.NET 8, win-x64)
```powershell
dotnet publish -c Release -p:PublishProfile=Properties/PublishProfiles/win-x64-singlefile.pubxml
```

Çıktı:
`bin\Release\publish\win-x64-singlefile\RadcKioskLauncher.exe`

## Shell Launcher entegrasyon notları
> Not: Aşağıdaki komutlar yönetici PowerShell ile çalıştırılmalıdır.

1. Shell Launcher özelliğini etkinleştirin:
```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Client-EmbeddedShellLauncher -All
```

2. Shell Launcher sınıfını kullanarak shell ataması yapın (WMI/CIM):
```powershell
$namespace = 'root\\standardcimv2\\embedded'
$className = 'WESL_UserSetting'

# SID: BUILTIN\Administrators
$adminSid = 'S-1-5-32-544'

# Varsayılan shell (admin dışı tüm hesaplar)
$defaultShell = 'C:\\Program Files\\RadcKiosk\\RadcKioskLauncher.exe'

# Admin shell
$explorerShell = 'explorer.exe'

# Existing mappings temizleme (opsiyonel)
Get-CimInstance -Namespace $namespace -ClassName $className | Remove-CimInstance -ErrorAction SilentlyContinue

# Default mapping (null SID)
Invoke-CimMethod -Namespace $namespace -ClassName $className -MethodName SetDefaultShell -Arguments @{
    Shell = $defaultShell
    DefaultAction = 0 # RestartShell
}

# Administrators mapping
Invoke-CimMethod -Namespace $namespace -ClassName $className -MethodName SetCustomShell -Arguments @{
    Sid = $adminSid
    Shell = $explorerShell
    DefaultAction = 0 # RestartShell
}
```

3. Cihazı yeniden başlatın.

### Beklenen davranış
- **BUILTIN\Administrators** grubunda shell = `explorer.exe`
- Diğer kullanıcılarda shell = `RadcKioskLauncher.exe`
- Launcher kapanırsa exit code üretir (ör. config hatası 20, unhandled exception 30, restart isteği 40).
- `DefaultAction = RestartShell` olduğunda Shell Launcher launcher'ı yeniden başlatır.

## Güvenlik notları
- Uygulama sadece config whitelist içindeki uygulama/araçları başlatır.
- Path validation: traversal (`..`, `"`) içeren girişler reddedilir.
- Admin Mode dışında yönetim butonları görünmez.
- `requiresAdmin=true` öğelerde kullanıcıya uyarı mesajı verilir.
- Ham exception detayları UI'da gösterilmez, log'a yazılır.
