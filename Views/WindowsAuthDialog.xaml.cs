using System.Windows;

namespace RadcKioskLauncher.Views;

public partial class WindowsAuthDialog : Window
{
    public string Username { get; private set; } = string.Empty;
    public string Password { get; private set; } = string.Empty;

    public WindowsAuthDialog()
    {
        InitializeComponent();
        UserBox.Focus();
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        Username = UserBox.Text;
        Password = PasswordBox.Password;
        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
