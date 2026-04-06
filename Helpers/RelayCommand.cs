using System.Windows.Input;

namespace RadcKioskLauncher.Helpers;

public class RelayCommand(Action execute, Func<bool>? canExecute = null) : ICommand
{
    private readonly Action _execute = execute;
    private readonly Func<bool>? _canExecute = canExecute;

    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;

    public void Execute(object? parameter) => _execute();

    public void NotifyCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}

public class RelayCommand<T>(Action<T?> execute, Func<T?, bool>? canExecute = null) : ICommand
{
    private readonly Action<T?> _execute = execute;
    private readonly Func<T?, bool>? _canExecute = canExecute;

    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter) => _canExecute?.Invoke((T?)parameter) ?? true;

    public void Execute(object? parameter) => _execute((T?)parameter);

    public void NotifyCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
