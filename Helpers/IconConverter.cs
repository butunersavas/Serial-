using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.IO;

namespace RadcKioskLauncher.Helpers;

public class IconConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var path = value as string;
        try
        {
            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
            {
                return new BitmapImage(new Uri(path, UriKind.Absolute));
            }
        }
        catch
        {
            // ignore and fallback
        }

        return CreateFallbackImage();
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;

    private static ImageSource CreateFallbackImage()
    {
        var drawingGroup = new DrawingGroup();

        drawingGroup.Children.Add(new GeometryDrawing(
            Brushes.DimGray,
            null,
            new RectangleGeometry(new Rect(0, 0, 64, 64), 8, 8)));

        drawingGroup.Children.Add(new GeometryDrawing(
            Brushes.WhiteSmoke,
            new Pen(Brushes.WhiteSmoke, 2),
            Geometry.Parse("M18,22 L46,22 M18,32 L46,32 M18,42 L34,42")));

        drawingGroup.Freeze();
        return new DrawingImage(drawingGroup);
    }
}
