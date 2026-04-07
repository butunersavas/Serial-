# RadcKioskLauncher (.NET 8 WPF)

Windows 11 IoT Enterprise LTSC için shell replacement kiosk launcher örneği.

## Yeni Özellikler (Bu Revizyon)
- Varsayılan `tr-TR` dil yapısı ve merkezi metin kaynağı (`Resources/TextResources.cs`).
- Üst bar sadeleştirildi: `CihazAdı | IPv4` + opsiyonel ağ durumu.
- Gizli yönetici girişi alanı (5 saniye basılı tutma + tooltip: **Yönetici Girişi**).
- PIN tabanlı admin doğrulama (`adminPinHash` + geçiş için `adminPin` fallback).
- Admin panel launcher içinde overlay olarak çalışır (ayrı pencere açılmaz).
- Uygulama kartı tıklanınca launcher kendini gizler, başlatılan uygulamayı foreground'a getirir; süreç kapanınca launcher geri gelir ve tekrar topmost olur.
- `folder` tipi desteklendi.
- Windows araçlarında whitelist sıkılaştırıldı (`control` ve `ms-settings` için güvenli liste).
- Alt+Tab görünürlüğünü azaltmak için launcher taskbar dışına alındı (`ShowInTaskbar=false`).
- Örnek config Notepad yerine Work Resources `.lnk` kayıtlarını içerir.

## Özellikler
- Explorer yerine shell çalışacak şekilde tasarlanmış **tam ekran / bordersız / topmost** WPF launcher.
- MVVM + katmanlı yapı: `Models`, `Services`, `ViewModels`, `Views`, `Helpers`.
- Config tabanlı whitelist uygulama çalıştırma (`exe`, `lnk`, `folder`, `control`, `settings`).
- Hidden Admin Mode (`Ctrl+Shift+F12` veya üst bardaki gizli alan) + PIN doğrulama + opsiyonel Windows admin kimlik doğrulaması.
- Config bozulursa stack trace göstermeyen güvenli hata ekranı.
- Log dizini: `C:\ProgramData\RadcKiosk\logs`.

## Dizinler
- Config: `C:\ProgramData\RadcKiosk\config.json`
- Logs: `C:\ProgramData\RadcKiosk\logs`
- Örnek config: `Samples/config.sample.json`

## Build
```powershell
dotnet restore
dotnet build
```

## Single file self-contained publish (.NET 8, win-x64)
```powershell
dotnet publish -c Release -p:PublishProfile=Properties/PublishProfiles/win-x64-singlefile.pubxml
```

## Config Şeması (özet)
```json
{
  "language": "tr-TR",
  "adminPinHash": "...",
  "adminPin": "",
  "showDeviceIp": true,
  "showNetworkStatus": true,
  "applications": [],
  "systemTools": []
}
```

## Güvenlik Notları
- Uygulama sadece config whitelist içindeki uygulama/araçları başlatır.
- Path validation: traversal (`..`, `"`) içeren girişler reddedilir.
- `control`/`settings` açılışları sadece whitelist komutları kabul eder.
- Admin Mode dışında yönetim butonları görünmez.
- Ham exception detayları UI'da gösterilmez, log'a yazılır.
