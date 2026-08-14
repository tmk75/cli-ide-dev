using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("IntelliDev")]
[assembly: AssemblyProduct("IntelliDev")]
[assembly: AssemblyVersion("1.0.1.0")]
[assembly: AssemblyFileVersion("1.0.1.0")]

internal static class Program
{
    private const string AppId = "TMK75.IntelliDev.Launcher";

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appID);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [STAThread]
    private static int Main()
    {
        try
        {
            SetCurrentProcessExplicitAppUserModelID(AppId);

            string root = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
            if (string.IsNullOrEmpty(root))
            {
                ShowError("Could not resolve the IntelliDev folder.");
                return 1;
            }

            string script = Path.Combine(root, "open-web.ps1");
            if (!File.Exists(script))
            {
                ShowError("open-web.ps1 was not found next to IntelliDev.exe.");
                return 1;
            }

            var psi = new ProcessStartInfo
            {
                FileName = Path.Combine(
                    Environment.SystemDirectory,
                    "WindowsPowerShell",
                    "v1.0",
                    "powershell.exe"),
                Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            Process.Start(psi);
            return 0;
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            return 1;
        }
    }

    private static void ShowError(string text)
    {
        MessageBox(IntPtr.Zero, text, "IntelliDev", 0x00000010);
    }
}
