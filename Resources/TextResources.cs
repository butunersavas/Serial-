using System.Globalization;

namespace RadcKioskLauncher.Resources;

public static class TextResources
{
    // NOTE: Basit resource altyapısı; tr-TR varsayılan, en-US opsiyonel.
    private static readonly Dictionary<string, Dictionary<string, string>> Localized = new(StringComparer.OrdinalIgnoreCase)
    {
        ["tr-TR"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Ready"] = "Hazır",
            ["ConfigLoaded"] = "Konfigürasyon yüklendi.",
            ["Refresh"] = "Yenile",
            ["AdminTooltip"] = "Yönetici Girişi",
            ["NetworkConnected"] = "Ağ: Bağlı",
            ["NetworkDisconnected"] = "Ağ: Yok",
            ["NetworkUnknown"] = "Ağ: Bilinmiyor",
            ["PinFailed"] = "PIN doğrulanamadı.",
            ["AdminEnabled"] = "Yönetici paneli açıldı.",
            ["AdminRequired"] = "Bu öğe yönetici yetkisi gerektirir.",
            ["AuthFailed"] = "Windows yönetici doğrulaması başarısız",
            ["AdminModeReady"] = "Yönetici paneli hazır.",
            ["AppAdded"] = "Uygulama eklendi.",
            ["AppRemoved"] = "Uygulama silindi.",
            ["SortUpdated"] = "Sıralama güncellendi.",
            ["ConfigValidated"] = "Config doğrulandı.",
            ["ConfigSaved"] = "Config kaydedildi.",
            ["ScreenRefreshed"] = "Kiosk ekranı yenilendi.",
            ["IconUpdated"] = "İkon güncellendi.",
            ["CategoryAdded"] = "Kategori eklendi",
            ["AdminPanelTitle"] = "Yönetici Paneli",
            ["KioskLoadErrorTitle"] = "Kiosk başlatılamadı",
            ["KioskLoadErrorLine1"] = "Konfigürasyon dosyası geçersiz veya eksik.",
            ["KioskLoadErrorLine2"] = "Lütfen sistem yöneticinize başvurun."
        },
        ["en-US"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Ready"] = "Ready",
            ["Refresh"] = "Refresh"
        }
    };

    public static string Culture { get; private set; } = "tr-TR";

    public static void SetCulture(string? language)
    {
        Culture = string.IsNullOrWhiteSpace(language) ? "tr-TR" : language;
        if (!Localized.ContainsKey(Culture))
        {
            Culture = "tr-TR";
        }

        var cultureInfo = new CultureInfo(Culture);
        CultureInfo.DefaultThreadCurrentCulture = cultureInfo;
        CultureInfo.DefaultThreadCurrentUICulture = cultureInfo;
    }

    public static string T(string key)
    {
        if (Localized.TryGetValue(Culture, out var map) && map.TryGetValue(key, out var localizedValue))
        {
            return localizedValue;
        }

        return Localized["tr-TR"].TryGetValue(key, out var fallback) ? fallback : key;
    }
}
