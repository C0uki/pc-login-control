// =====================================================
// KioskModule — React Native for Windows ネイティブモジュール (C#)
//   JS 側 src/native/KioskModule.ts に対応。
//
//   提供機能:
//     ・タスクマネージャー無効化/再有効化 (レジストリ HKCU)
//     ・Windows スタートアップ登録 (レジストリ HKCU\...\Run)
//     ・低レベルキーボードフックによるショートカット遮断
//       (Win / Alt+Tab / Alt+F4 / Ctrl+Esc / Ctrl+Shift+Esc)
//     ・ウィンドウの最小化（ログイン後のバックグラウンド移行）
//     ・端末名の取得
//
//   ※ Ctrl+Alt+Del（Secure Attention Sequence）は OS 仕様上
//     アプリからは遮断できません（グループポリシー/資格情報プロバイダー領域）。
//   ※ レジストリ操作は管理者権限（アプリのマニフェストで requireAdministrator）
//     を前提とします。
//
//   組み込み手順は windows-native/README.md を参照。
// =====================================================

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.ReactNative.Managed;
using Microsoft.Win32;

namespace PCLoginControl
{
    [ReactModule("KioskModule")]
    public sealed class KioskModule
    {
        // ---------- 公開メソッド ----------

        [ReactMethod("enableKioskMode")]
        public void EnableKioskMode(IReactPromise<bool> promise)
        {
            try
            {
                SetTaskManagerDisabled(true);
                RegisterStartupInternal();
                InstallKeyboardHook();
                promise.Resolve(true);
            }
            catch (Exception ex)
            {
                promise.Reject(new ReactError { Message = "enableKioskMode 失敗: " + ex.Message });
            }
        }

        [ReactMethod("disableKioskMode")]
        public void DisableKioskMode(IReactPromise<bool> promise)
        {
            try
            {
                SetTaskManagerDisabled(false);
                RemoveKeyboardHook();
                promise.Resolve(true);
            }
            catch (Exception ex)
            {
                promise.Reject(new ReactError { Message = "disableKioskMode 失敗: " + ex.Message });
            }
        }

        [ReactMethod("minimizeToBackground")]
        public void MinimizeToBackground(IReactPromise<bool> promise)
        {
            try
            {
                var hwnd = Process.GetCurrentProcess().MainWindowHandle;
                if (hwnd != IntPtr.Zero)
                {
                    ShowWindow(hwnd, SW_MINIMIZE);
                }
                promise.Resolve(true);
            }
            catch (Exception ex)
            {
                promise.Reject(new ReactError { Message = "minimizeToBackground 失敗: " + ex.Message });
            }
        }

        [ReactMethod("registerStartup")]
        public void RegisterStartup(IReactPromise<bool> promise)
        {
            try
            {
                RegisterStartupInternal();
                promise.Resolve(true);
            }
            catch (Exception ex)
            {
                promise.Reject(new ReactError { Message = "registerStartup 失敗: " + ex.Message });
            }
        }

        [ReactMethod("getDeviceName")]
        public void GetDeviceName(IReactPromise<string> promise)
        {
            try
            {
                promise.Resolve(Environment.MachineName);
            }
            catch (Exception ex)
            {
                promise.Reject(new ReactError { Message = ex.Message });
            }
        }

        // ---------- レジストリ操作 ----------

        private static void SetTaskManagerDisabled(bool disabled)
        {
            using var key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Policies\System");
            key?.SetValue("DisableTaskMgr", disabled ? 1 : 0, RegistryValueKind.DWord);
        }

        private static void RegisterStartupInternal()
        {
            var exePath = Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return;

            using var key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run");
            key?.SetValue("PC_Login_Control", exePath, RegistryValueKind.String);
        }

        // ---------- 低レベルキーボードフック ----------

        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;

        private const int VK_TAB = 0x09;
        private const int VK_ESCAPE = 0x1B;
        private const int VK_F4 = 0x73;
        private const int VK_LWIN = 0x5B;
        private const int VK_RWIN = 0x5C;
        private const int VK_SHIFT = 0x10;
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12; // Alt

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        private static IntPtr _hookId = IntPtr.Zero;
        // GC で回収されないよう静的参照を保持
        private static readonly LowLevelKeyboardProc _proc = HookCallback;

        private static void InstallKeyboardHook()
        {
            if (_hookId != IntPtr.Zero) return;
            using var curProcess = Process.GetCurrentProcess();
            using var curModule = curProcess.MainModule;
            _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule?.ModuleName), 0);
        }

        private static void RemoveKeyboardHook()
        {
            if (_hookId == IntPtr.Zero) return;
            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
            {
                int vkCode = Marshal.ReadInt32(lParam);
                bool alt = IsDown(VK_MENU);
                bool ctrl = IsDown(VK_CONTROL);
                bool shift = IsDown(VK_SHIFT);

                bool block =
                    vkCode == VK_LWIN || vkCode == VK_RWIN ||          // Windows キー
                    (alt && vkCode == VK_TAB) ||                       // Alt+Tab
                    (alt && vkCode == VK_ESCAPE) ||                    // Alt+Esc
                    (alt && vkCode == VK_F4) ||                        // Alt+F4
                    (ctrl && vkCode == VK_ESCAPE) ||                   // Ctrl+Esc (スタートメニュー)
                    (ctrl && shift && vkCode == VK_ESCAPE);            // Ctrl+Shift+Esc (タスクマネージャー)

                if (block)
                {
                    return (IntPtr)1; // イベントを握りつぶす
                }
            }
            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        private static bool IsDown(int vk) => (GetAsyncKeyState(vk) & 0x8000) != 0;

        // ---------- P/Invoke ----------

        private const int SW_MINIMIZE = 6;

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string? lpModuleName);
    }
}
