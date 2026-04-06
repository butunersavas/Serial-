using System.Windows;

namespace RadcKioskLauncher.Views;

public partial class PinDialog : Window
{
    public string Pin { get; private set; } = string.Empty;

    public PinDialog()
    {
        InitializeComponent();
        PinBox.Focus();
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        Pin = PinBox.Password;
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
