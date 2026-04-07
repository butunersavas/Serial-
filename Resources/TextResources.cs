using System.Globalization;

namespace RadcKioskLauncher.Resources;

public static class TextResources
{
    private static readonly Dictionary<string, Dictionary<string, string>> Localized = new(StringComparer.OrdinalIgnoreCase)
    {
        ["tr-TR"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Ready"] = "Hazır",
            ["ConfigLoaded"] = "Yapılandırma yüklendi.",
            ["Refresh"] = "Yenile",
            ["AdminTooltip"] = "Yönetici Girişi",
            ["IpUnavailable"] = "IP Yok",
            ["PinFailed"] = "PIN doğrulanamadı.",
            ["AdminEnabled"] = "Yönetici paneli açıldı.",
            ["AdminRequired"] = "Bu öğe yönetici yetkisi gerektirir.",
            ["AuthFailed"] = "Windows yönetici doğrulaması başarısız",
            ["AdminModeReady"] = "Yönetici paneli hazır.",
            ["AppAdded"] = "Uygulama eklendi.",
            ["AppRemoved"] = "Öğe silindi.",
            ["SortUpdated"] = "Sıralama güncellendi.",
            ["ConfigValidated"] = "Yapılandırma doğrulandı.",
            ["ConfigSaved"] = "Yapılandırma kaydedildi.",
            ["ScreenRefreshed"] = "Kiosk ekranı yenilendi.",
            ["IconUpdated"] = "Simge güncellendi.",
            ["CategoryAdded"] = "Kategori eklendi",
            ["AdminPanelTitle"] = "Yönetici Paneli",
            ["KioskLoadErrorTitle"] = "Kiosk başlatılamadı",
            ["KioskLoadErrorLine1"] = "Yapılandırma dosyası geçersiz veya eksik.",
            ["KioskLoadErrorLine2"] = "Lütfen sistem yöneticinize başvurun."
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
