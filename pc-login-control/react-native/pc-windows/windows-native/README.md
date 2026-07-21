# ネイティブモジュール (KioskModule.cs) の組み込み

`KioskModule.cs` は React Native for Windows のネイティブ（C#）モジュールです。
`react-native run-windows` でネイティブプロジェクトを生成したあと、以下の手順で組み込みます。

## 前提

- `pc-windows` ディレクトリで一度 RNW プロジェクトを初期化していること
  （下記「セットアップ」参照）。生成された `windows/PCLoginControl/` に
  C# アプリのプロジェクト（`PCLoginControl.csproj`）が存在します。

## 手順

1. `KioskModule.cs` を C# アプリプロジェクトへコピー

   ```
   windows/PCLoginControl/KioskModule.cs
   ```

   （名前空間 `PCLoginControl` は生成されたアプリの `RootNamespace` に合わせてください）

2. 属性付きモジュールが自動登録されることを確認

   `windows/PCLoginControl/ReactPackageProvider.cs`（または `App.xaml.cs` の
   `PackageProviders`）で、attributed module が読み込まれるようになっています。
   RNW の autolink 構成では `[ReactModule]` を付けたクラスは
   `AddAttributedModules()` により自動検出されます。手動登録が必要な場合は
   次を追加してください。

   ```csharp
   public void CreatePackage(IReactPackageBuilder packageBuilder)
   {
       packageBuilder.AddAttributedModules();   // ← これがあれば KioskModule も登録される
   }
   ```

3. 管理者権限マニフェスト

   タスクマネージャー無効化・スタートアップ登録（レジストリ書き込み）には
   管理者権限が必要です。アプリの `app.manifest` に以下を設定します。

   ```xml
   <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
   ```

4. 全画面 / 常時最前面（キオスク）

   ウィンドウ側の設定（`App.xaml.cs` / `MainPage`）で、起動時に
   最大化・タイトルバー非表示・TopMost を設定してください。
   JS の `KioskModule.minimizeToBackground()` はログイン成功後に
   ウィンドウを最小化します。

## 制限事項（Electron 版と同じ）

| 項目 | 内容 |
|------|------|
| Ctrl+Alt+Del | OS の Secure Attention Sequence のため、アプリからは遮断不可 |
| 管理者権限 | レジストリ操作には管理者実行が必要 |
| ログ漏れ | 強制終了・電源断時のログアウト記録は保証されない |
| キーフック | 低レベルフックは UI スレッドのメッセージループ稼働が前提 |
