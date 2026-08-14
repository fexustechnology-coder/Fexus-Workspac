# =============================================================================
# FEXUS LOCAL PC AGENT — WIN32 GUI AUTOMATION
# =============================================================================
# A single, FIXED script — never arbitrary PowerShell from the LLM or the
# user. Node calls this with a specific -Action and validated parameters
# as separate process arguments (never string-interpolated into a shell
# command), so there is no path from a voice command to arbitrary code
# execution here, only to one of the fixed actions below.
# =============================================================================

param(
  [Parameter(Mandatory=$true)][string]$Action,
  [int]$X,
  [int]$Y,
  [string]$Text,
  [string]$Key,
  [string]$Button = "Left"
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class FexusWin32 {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
}
"@

Add-Type -AssemblyName System.Windows.Forms

# Win32 mouse_event flags — the real, documented constants, not invented.
$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010

switch ($Action) {
  "MoveMouse" {
    [FexusWin32]::SetCursorPos($X, $Y) | Out-Null
    Write-Output "OK"
  }

  "ClickMouse" {
    if ($Button -eq "Right") {
      [FexusWin32]::mouse_event($MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 40
      [FexusWin32]::mouse_event($MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
    } else {
      [FexusWin32]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 40
      [FexusWin32]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    }
    Write-Output "OK"
  }

  "GetCursorPos" {
    $p = New-Object FexusWin32+POINT
    [FexusWin32]::GetCursorPos([ref]$p) | Out-Null
    Write-Output "$($p.X),$($p.Y)"
  }

  "GetScreenSize" {
    $width = [FexusWin32]::GetSystemMetrics(0)  # SM_CXSCREEN
    $height = [FexusWin32]::GetSystemMetrics(1) # SM_CYSCREEN
    Write-Output "$width,$height"
  }

  "GetActiveWindowTitle" {
    $hwnd = [FexusWin32]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder(256)
    [FexusWin32]::GetWindowText($hwnd, $sb, 256) | Out-Null
    Write-Output $sb.ToString()
  }

  "CaptureScreen" {
    # Real screen capture — System.Drawing's Graphics.CopyFromScreen(),
    # a standard, documented .NET technique (not a fake/placeholder
    # image). Encodes as base64 PNG on stdout so the calling Node
    # process never needs to touch a temp file on disk.
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $base64 = [Convert]::ToBase64String($stream.ToArray())
    Write-Output $base64
    $graphics.Dispose()
    $bitmap.Dispose()
    $stream.Dispose()
  }

  "TypeText" {
    # $Text arrives already SendKeys-escaped by local-agent/gui.js before
    # this script is invoked — this script does not re-interpret it.
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Write-Output "OK"
  }

  "PressKey" {
    [System.Windows.Forms.SendKeys]::SendWait($Key)
    Write-Output "OK"
  }

  default {
    Write-Error "Unknown action: $Action"
    exit 1
  }
}
