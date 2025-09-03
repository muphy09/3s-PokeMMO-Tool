// Program.cs — LiveRouteOCR (snapshot + periodic rebroadcast; emits confidence)
// Adds OCR aggressiveness modes and supports TARGET_PID and CAPTURE_ZOOM from settings.json or env.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using ImgFormat = System.Drawing.Imaging.ImageFormat; // avoid clash with Tesseract.ImageFormat
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Tesseract;

class LiveRouteOCR
{
    // ---------- Win32 ----------
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    static IntPtr CachedHwnd = IntPtr.Zero;
    static int CachedPid = 0;

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    // ---------- Paths ----------
    static string AppDataDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PokemmoLive");
    static string RouteLogPath => Path.Combine(AppDataDir, "ocr-route.log");
    static string WindowLogPath => Path.Combine(AppDataDir, "ocr-window.log");
    static string BattleLogPath => Path.Combine(AppDataDir, "ocr-battle.log");
    static string RouteCapPath => Path.Combine(AppDataDir, "last-route-capture.png");
    static string RoutePrePath => Path.Combine(AppDataDir, "last-route-pre.png");
    static string BattleCapPath => Path.Combine(AppDataDir, "last-battle-capture.png");
    static string BattlePrePath => Path.Combine(AppDataDir, "last-battle-pre.png");
    static string StableTessDir => Path.Combine(AppDataDir, "tessdata");
    static string SettingsPath => Path.Combine(AppDataDir, "settings.json");

    // ---------- WS ----------
    static readonly int[] DefaultPorts = { 8765, 8766, 8767, 8768, 8769, 8770, 8780 };
    static readonly List<HttpListener> Servers = new();

    class ChannelData
    {
        public readonly object LockObj = new();
        public readonly ConcurrentDictionary<WebSocket, byte> Clients = new();
        public string LastEmit = "";
        public string LastRaw = "";
        public int LastConfPct = 0;
        public long LastBroadcastTicks = 0;
        public readonly string Kind;
        public readonly string NoToken;
        public ChannelData(string kind, string noToken) { Kind = kind; NoToken = noToken; }
    }

    static readonly ChannelData LiveChan = new("route", "NO_ROUTE");
    static readonly ChannelData BattleChan = new("mon", "NO_MON");

    // ---------- ROI (% of client area) ----------
    struct Roi
    {
        public double Left, Top, Width, Height;
        public Rectangle ToRectangle(int w, int h)
        {
            int x = Math.Max(0, (int)(w * Left));
            int y = Math.Max(0, (int)(h * Top));
            int rw = Math.Max(120, (int)(w * Width));
            int rh = Math.Max(70, (int)(h * Height));
            return new Rectangle(x, y, Math.Min(rw, w - x), Math.Min(rh, h - y));
        }
    }

    // ---------- Settings ----------
    class HelperSettings
    {
        public int? targetPid { get; set; }
        public double? captureZoom { get; set; }
        public string? ocrAggressiveness { get; set; } // fast | balanced | max | auto
    }

    static HelperSettings LoadSettings()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            if (File.Exists(SettingsPath))
            {
                var txt = File.ReadAllText(SettingsPath);
                var cfg = JsonSerializer.Deserialize<HelperSettings>(txt, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new HelperSettings();
                return cfg;
            }
        }
        catch (Exception ex) { Log("settings.json read failed: " + ex.Message); }

        return new HelperSettings();
    }

    // ---------- Location extraction ----------
    static readonly Regex LocationCandidate = new(
        @"\b(?:Route\s*\d+|(?!B(?:i|l)?\b)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    static async Task Main(string[] args)
    {
        Directory.CreateDirectory(AppDataDir);
        Directory.CreateDirectory(StableTessDir);
        Log("=== LiveRouteOCR boot ===");

        var roi = new Roi
        {
            Left = GetArg(args, "--left", 0.010),
            Top = GetArg(args, "--top", 0.012),
            Width = GetArg(args, "--width", 0.335),
            Height = GetArg(args, "--height", 0.140)
        };
        Log($"ROI base: L={roi.Left:P0} T={roi.Top:P0} W={roi.Width:P0} H={roi.Height:P0}");
        var battleRoi = new Roi { Left = 0.25, Top = 0.13, Width = 0.25, Height = 0.3 };
        Log($"Battle ROI: L={battleRoi.Left:P0} T={battleRoi.Top:P0} W={battleRoi.Width:P0} H={battleRoi.Height:P0}");

        // Settings & env
        var cfg = LoadSettings();
        int? TargetPid = ParseIntEnv("TARGET_PID") ?? cfg.targetPid;
        double CaptureZoom = ParseDoubleEnv("CAPTURE_ZOOM") ?? cfg.captureZoom ?? 1.5;
        CaptureZoom = Math.Clamp(CaptureZoom, 1.0, 2.0);

        string mode = (Environment.GetEnvironmentVariable("OCR_AGGRESSIVENESS") ?? cfg.ocrAggressiveness ?? "balanced")
                        .Trim().ToLowerInvariant();
        if (mode != "fast" && mode != "balanced" && mode != "max" && mode != "auto") mode = "balanced";
        Log($"Settings: TARGET_PID={(TargetPid?.ToString() ?? "auto")} CAPTURE_ZOOM={CaptureZoom:0.##} OCR_AGGRESSIVENESS={mode}");

        // WS listeners
        StartServers(ParsePorts(args));
        Broadcast(LiveChan, LiveChan.NoToken, "", 0);
        Broadcast(BattleChan, BattleChan.NoToken, "", 0);

        // tessdata
        var sourceTess = FindTessdataSource();
        if (string.IsNullOrEmpty(sourceTess) || !File.Exists(Path.Combine(sourceTess, "eng.traineddata")))
        {
            Log("FATAL: eng.traineddata not found in any known location.");
        }
        else
        {
            try
            {
                Directory.CreateDirectory(StableTessDir);
                var src = Path.Combine(sourceTess, "eng.traineddata");
                var dst = Path.Combine(StableTessDir, "eng.traineddata");
                if (!File.Exists(dst) || new FileInfo(dst).Length == 0) File.Copy(src, dst, overwrite: true);
            }
            catch (Exception ex) { Log("Copy tessdata failed: " + ex.Message); }
        }
        Log($"Using tessdata at: {StableTessDir}");

        TesseractEngine? engine = null;
        try
        {
            engine = new TesseractEngine(StableTessDir, "eng", EngineMode.LstmOnly);
            engine.DefaultPageSegMode = PageSegMode.SingleBlock;
            engine.SetVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:-'/#");
            engine.SetVariable("load_system_dawg", "F");
            engine.SetVariable("load_freq_dawg", "F");
            engine.SetVariable("preserve_interword_spaces", "1");
            Log("Tesseract engine initialized.");
        }
        catch (Exception ex) { Log("Tesseract init failed: " + ex.Message); }

        var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, __) => cts.Cancel();
        _ = Task.Run(() => PeriodicRebroadcastLoop(LiveChan, cts.Token));
        _ = Task.Run(() => PeriodicRebroadcastLoop(BattleChan, cts.Token));

        var tRoute = OcrLoop(engine, roi, mode, TargetPid, CaptureZoom, cts.Token);
        var tBattle = BattleLoop(engine, battleRoi, mode, TargetPid, CaptureZoom, cts.Token);
        await Task.WhenAll(tRoute, tBattle);
    }

    static string FindTessdataSource()
    {
        var envDir = Environment.GetEnvironmentVariable("POKEMMO_TESSDATA_DIR");
        if (!string.IsNullOrWhiteSpace(envDir) && File.Exists(Path.Combine(envDir, "eng.traineddata"))) return envDir;

        var exeDir = AppContext.BaseDirectory;
        var direct = Path.Combine(exeDir, "tessdata");
        if (File.Exists(Path.Combine(direct, "eng.traineddata"))) return direct;

        var exeParent = Directory.GetParent(exeDir)?.FullName ?? exeDir;
        foreach (var sub in new[] { "resources\\tessdata", "resources\\LiveRouteOCR\\tessdata", "resources\\app\\tessdata" })
        {
            string p = Path.Combine(exeParent, sub);
            if (File.Exists(Path.Combine(p, "eng.traineddata"))) return p;
        }

        var cwd = Path.Combine(Environment.CurrentDirectory, "tessdata");
        if (File.Exists(Path.Combine(cwd, "eng.traineddata"))) return cwd;

        if (File.Exists(Path.Combine(StableTessDir, "eng.traineddata"))) return StableTessDir;

        return "";
    }

    // ---------- WebSocket ----------
    static void StartServers(IEnumerable<int> ports)
    {
        foreach (var p in ports)
        {
            try
            {
                var h = new HttpListener();
                h.Prefixes.Add($"http://127.0.0.1:{p}/live/");
                h.Prefixes.Add($"http://localhost:{p}/live/");
                h.Prefixes.Add($"http://127.0.0.1:{p}/battle/");
                h.Prefixes.Add($"http://localhost:{p}/battle/");
                h.Start();
                Servers.Add(h);
                _ = Task.Run(() => AcceptLoop(h));
                Log($"WebSocket: ws://127.0.0.1:{p}/live and /battle");
            }
            catch (Exception ex) { Log($"Port {p} failed: {ex.Message}"); }
        }
        if (Servers.Count == 0)
        {
            Console.WriteLine("No WS ports available. Try --port=8799 or run as admin.");
            Environment.Exit(1);
        }
    }

    static async Task AcceptLoop(HttpListener s)
    {
        while (s.IsListening)
        {
            HttpListenerContext? ctx = null;
            try
            {
                ctx = await s.GetContextAsync();
                if (ctx.Request.IsWebSocketRequest)
                {
                    var wsctx = await ctx.AcceptWebSocketAsync(null);
                    var path = ctx.Request.Url?.AbsolutePath.ToLowerInvariant() ?? "";
                    var ch = path.Contains("battle") ? BattleChan : LiveChan;
                    Log($"WS client connected [{ch.Kind}]");
                    var ws = wsctx.WebSocket;
                    ch.Clients.TryAdd(ws, 1);

                    string emit, raw; int conf;
                    lock (ch.LockObj) { emit = ch.LastEmit; raw = ch.LastRaw; conf = ch.LastConfPct; }
                    if (!string.IsNullOrWhiteSpace(emit))
                    {
                        try { SendAllFormats(ws, ch, emit, raw, conf); Log($"SNAPSHOT -> client: {emit}"); } catch { }
                    }
                    else
                    {
                        try { SendAllFormats(ws, ch, ch.NoToken, "", 0); } catch { }
                    }

                    _ = Task.Run(() => WsPump(ch, ws));
                }
                else { ctx.Response.StatusCode = 426; ctx.Response.Close(); }
            }
            catch { try { ctx?.Response.Abort(); } catch { } }
        }
    }

    static async Task WsPump(ChannelData ch, WebSocket ws)
    {
        var buf = new byte[2];
        try
        {
            while (ws.State == WebSocketState.Open)
                await ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
        }
        catch { }
        finally
        {
            ch.Clients.TryRemove(ws, out _);
            try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            ws.Dispose();
        }
    }

    static void Broadcast(ChannelData ch, string token, string raw, int confPct)
    {
        lock (ch.LockObj)
        {
            ch.LastEmit = token;
            ch.LastRaw = raw ?? "";
            ch.LastConfPct = Math.Clamp(confPct, 0, 100);
            ch.LastBroadcastTicks = DateTime.UtcNow.Ticks;
        }

        foreach (var ws in ch.Clients.Keys)
        {
            if (ws.State != WebSocketState.Open) { ch.Clients.TryRemove(ws, out _); continue; }
            try { SendAllFormats(ws, ch, token, raw, confPct); }
            catch { ch.Clients.TryRemove(ws, out _); }
        }
    }

    static void SendAllFormats(WebSocket ws, ChannelData ch, string token, string raw, int confPct)
    {
        var plain = token;
        var piped = (token == ch.NoToken) ? ch.NoToken : $"{ch.Kind.ToUpper()}|{token}";
        var key = ch.Kind == "route" ? "route" : "mon";
        var jsonSimple = $"{{\"{key}\":\"{Escape(token)}\"}}";
        var jsonRich = $"{{\"type\":\"{ch.Kind}\",\"text\":\"{Escape(token)}\",\"raw\":\"{Escape(raw ?? "")}\",\"conf\":{confPct}}}";

        var payloads = new[] { plain, piped, jsonSimple, jsonRich };
        foreach (var msg in payloads)
        {
            var data = Encoding.UTF8.GetBytes(msg);
            ws.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Text, true, CancellationToken.None).Wait(100);
        }
    }

    static string Escape(string s) => s
        .Replace("\\", "\\\\")
        .Replace("\"", "\\\"")
        .Replace("\r", "")
        .Replace("\n", "\\n");

    static async Task PeriodicRebroadcastLoop(ChannelData ch, CancellationToken ct)
    {
        const int intervalMs = 2000;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(intervalMs, ct);
                string emit, raw; int conf; long lastTicks;
                lock (ch.LockObj) { emit = ch.LastEmit; raw = ch.LastRaw; conf = ch.LastConfPct; lastTicks = ch.LastBroadcastTicks; }
                if (string.IsNullOrWhiteSpace(emit)) continue;

                if ((DateTime.UtcNow - new DateTime(lastTicks, DateTimeKind.Utc)).TotalSeconds >= 1)
                {
                    foreach (var ws in ch.Clients.Keys)
                    {
                        if (ws.State != WebSocketState.Open) { ch.Clients.TryRemove(ws, out _); continue; }
                        try { SendAllFormats(ws, ch, emit, raw, conf); } catch { ch.Clients.TryRemove(ws, out _); }
                    }
                    lock (ch.LockObj) { ch.LastBroadcastTicks = DateTime.UtcNow.Ticks; }
                    Log($"REBROADCAST[{ch.Kind}]: {emit} ({conf}%)");
                }
            }
            catch (TaskCanceledException) { }
            catch (Exception ex) { Log("Periodic loop error: " + ex.Message); }
        }
    }

    // ---------- Loop ----------
    static async Task OcrLoop(TesseractEngine? engine, Roi roi, string mode, int? TargetPid, double CaptureZoom, CancellationToken ct)
    {
        int missStreak = 0;
        string lastEmitLocal = "";
        int lastConfLocal = 0;

        int autoDepth = 1; // 0=fast, 1=balanced, 2=max
        int stableHighConfHits = 0;
        int consecutiveMisses = 0;

        IntPtr hWnd = IntPtr.Zero;
        IntPtr lastLoggedHandle = IntPtr.Zero;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (hWnd != IntPtr.Zero && !IsWindow(hWnd))
                {
                    LogBattle("PokeMMO window handle invalid; reacquiring.");
                    hWnd = IntPtr.Zero;
                }
                if (hWnd == IntPtr.Zero)
                {
                    hWnd = FindPokeMMO(TargetPid);
                    if (hWnd != lastLoggedHandle)
                    {
                        if (hWnd == IntPtr.Zero) LogBattle("PokeMMO window not found.");
                        else LogBattle($"Acquired PokeMMO window: 0x{hWnd.ToInt64():X}");
                        lastLoggedHandle = hWnd;
                    }
                    if (hWnd == IntPtr.Zero) { await Task.Delay(500, ct); continue; }
                }

                if (!GetClientRect(hWnd, out var rc))
                {
                    LogBattle("GetClientRect failed; will retry.");
                    await Task.Delay(400, ct);
                    continue;
                }
                if (!IsWindowVisible(hWnd))
                {
                    LogBattle("PokeMMO window not visible; waiting.");
                    await Task.Delay(400, ct);
                    continue;
                }
                var pt = new POINT { X = 0, Y = 0 }; ClientToScreen(hWnd, ref pt);
                int cw = Math.Max(1, rc.Right - rc.Left), ch = Math.Max(1, rc.Bottom - rc.Top);

                var rBase = roi.ToRectangle(cw, ch);
                var r = ZoomRectangle(rBase, cw, ch, CaptureZoom);
                int sx = pt.X + r.Left, sy = pt.Y + r.Top;

                using var crop = new Bitmap(r.Width, r.Height, PixelFormat.Format24bppRgb);
                using (var g = Graphics.FromImage(crop)) g.CopyFromScreen(sx, sy, 0, 0, crop.Size, CopyPixelOperation.SourceCopy);
                try
                {
                    using var fs = new FileStream(RouteCapPath, FileMode.Create, FileAccess.Write, FileShare.Read);
                    crop.Save(fs, ImgFormat.Png);
                }
                catch (Exception ex) { Log($"Capture save failed: {ex.Message}"); }
                Log($"Saved capture: {RouteCapPath}");

                // Build pass plan
                var plan = BuildPassPlan(crop, mode, autoDepth);

                string location = "";
                string rawUsed = "";
                float conf = 0f;

                // Keep one preprocessed image for preview even if we miss
                Bitmap? prePreview = null;

                if (engine != null)
                {
                    foreach (var pass in plan)
                    {
                        using var srcForPass = pass.Masked ? MaskLeftColumn(crop, pass.KeepPct) : (Bitmap)crop.Clone();
                        using var pre = Preprocess(srcForPass, pass.Threshold, pass.Upsample);

                        // keep the *last* tried pre as a preview if nothing else hits
                        prePreview?.Dispose();
                        prePreview = (Bitmap)pre.Clone();

                        using var pix = PixFromBitmap(pre);
                        using var page = engine.Process(pix, pass.Psm);

                        var raw = (page.GetText() ?? "").Trim();
                        var loc = ExtractLocation(raw);

                        if (!string.IsNullOrEmpty(loc))
                        {
                            location = loc;
                            conf = page.GetMeanConfidence();
                            rawUsed = raw;

                            // on hit, save THIS pre as last-pre
                            using (var fs = new FileStream(RoutePrePath, FileMode.Create, FileAccess.Write, FileShare.Read))
                                pre.Save(fs, ImgFormat.Png);
                            Log($"Saved preprocessed: {RoutePrePath}");

                            Log($"HIT: mode={mode}{(mode == "auto" ? $"/{autoDepth}" : "")} mask={(pass.Masked ? "Y" : "N")} keep={pass.KeepPct:F2} up={pass.Upsample}x th={pass.Threshold} psm={pass.Psm} conf={(int)(conf * 100)} raw='{OneLine(raw)}' loc='{location}'");
                            break;
                        }
                    }
                }

                // If no hit, still save the last tried pre image for the UI preview
                if (string.IsNullOrEmpty(location) && prePreview != null)
                {
                    try
                    {
                        using var fs = new FileStream(RoutePrePath, FileMode.Create, FileAccess.Write, FileShare.Read);
                        prePreview.Save(fs, ImgFormat.Png);
                        Log($"Saved preprocessed (miss): {RoutePrePath}");
                    }
                    catch { }
                    prePreview.Dispose(); prePreview = null;
                }

                bool has = !string.IsNullOrWhiteSpace(location);

                if (has)
                {
                    missStreak = 0;
                    consecutiveMisses = 0;

                    int confPct = Math.Clamp((int)Math.Round(conf * 100), 0, 100);
                    if (confPct >= 85) stableHighConfHits++;
                    else stableHighConfHits = 0;

                    if (mode == "auto" && stableHighConfHits >= 6 && autoDepth > 0)
                    {
                        autoDepth--;
                        stableHighConfHits = 0;
                        Log($"AUTO: relaxing depth -> {autoDepth}");
                    }

                    var clean = Regex.Replace(location, @"\s+", " ").Trim();
                    if (!string.Equals(clean, lastEmitLocal, StringComparison.OrdinalIgnoreCase) || confPct != lastConfLocal)
                    {
                        Broadcast(LiveChan, clean, rawUsed, confPct);
                        lastEmitLocal = clean;
                        lastConfLocal = confPct;
                        Log($"SENT ROUTE: {clean} ({confPct}%)");
                    }
                }
                else
                {
                    missStreak++;
                    consecutiveMisses++;

                    if (mode == "auto" && consecutiveMisses >= 3 && autoDepth < 2)
                    {
                        autoDepth++;
                        consecutiveMisses = 0;
                        stableHighConfHits = 0;
                        Log($"AUTO: escalating depth -> {autoDepth}");
                    }

                    if (missStreak >= 3 && !string.Equals(lastEmitLocal, "NO_ROUTE", StringComparison.Ordinal))
                    {
                        Broadcast(LiveChan, LiveChan.NoToken, "", 0);
                        lastEmitLocal = "NO_ROUTE";
                        lastConfLocal = 0;
                        Log("SENT NO_ROUTE");
                        missStreak = 3;
                    }

                    if (missStreak >= 6)
                    {
                        Log("Miss streak; attempting to reacquire window.");
                        hWnd = IntPtr.Zero;
                    }
                }

                int delay = 600;
                if (mode == "fast") delay = 700;
                else if (mode == "max") delay = 450;
                else if (mode == "auto") delay = (autoDepth == 0 ? 700 : autoDepth == 1 ? 550 : 450);

                await Task.Delay(delay, ct);
            }
            catch (TaskCanceledException) { }
            catch (Exception ex) { Log("Loop error: " + ex.Message); await Task.Delay(800, ct); }
        }
    }

    static async Task BattleLoop(TesseractEngine? engine, Roi roi, string mode, int? TargetPid, double CaptureZoom, CancellationToken ct)
    {
        int missStreak = 0;
        string lastEmitLocal = "";
        IntPtr hWnd = IntPtr.Zero;
        IntPtr lastLoggedHandle = IntPtr.Zero;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (hWnd != IntPtr.Zero && !IsWindow(hWnd))
                {
                    LogBattle("PokeMMO window handle invalid; reacquiring.");
                    hWnd = IntPtr.Zero;
                }
                if (hWnd == IntPtr.Zero)
                {
                    hWnd = FindPokeMMO(TargetPid);
                    if (hWnd != lastLoggedHandle)
                    {
                        if (hWnd == IntPtr.Zero) LogBattle("PokeMMO window not found.");
                        else LogBattle($"Acquired PokeMMO window: 0x{hWnd.ToInt64():X}");
                        lastLoggedHandle = hWnd;
                    }
                    if (hWnd == IntPtr.Zero) { await Task.Delay(500, ct); continue; }
                }

                if (!GetClientRect(hWnd, out var rc))
                {
                    LogBattle("GetClientRect failed; will retry.");
                    await Task.Delay(400, ct);
                    continue;
                }
                if (!IsWindowVisible(hWnd))
                {
                    LogBattle("PokeMMO window not visible; waiting.");
                    await Task.Delay(400, ct);
                    continue;
                }
                var pt = new POINT { X = 0, Y = 0 }; ClientToScreen(hWnd, ref pt);
                int cw = Math.Max(1, rc.Right - rc.Left), ch = Math.Max(1, rc.Bottom - rc.Top);
                var rBase = roi.ToRectangle(cw, ch);
                var r = ZoomRectangle(rBase, cw, ch, CaptureZoom);
                int sx = pt.X + r.Left, sy = pt.Y + r.Top;
                using var crop = new Bitmap(r.Width, r.Height, PixelFormat.Format24bppRgb);
                using (var g = Graphics.FromImage(crop)) g.CopyFromScreen(sx, sy, 0, 0, crop.Size, CopyPixelOperation.SourceCopy);
                try
                {
                    using var fs = new FileStream(BattleCapPath, FileMode.Create, FileAccess.Write, FileShare.Read);
                    crop.Save(fs, ImgFormat.Png);
                }
                catch (Exception ex) { LogBattle($"Capture save failed: {ex.Message}"); }
                LogBattle($"Saved capture: {BattleCapPath}");

                var nameList = new List<string>();
                string rawUsed = "";
                float conf = 0f;
                Bitmap? prePreview = null;
                Bitmap? bestPre = null;
                if (engine != null)
                {
                    using var filtered = MaskBattleHud(crop);
                    foreach (var pass in BuildPassPlan(filtered, mode, 1))
                    {
                        using var srcForPass = pass.Masked ? MaskLeftColumn(filtered, pass.KeepPct) : (Bitmap)filtered.Clone();
                        using var pre = Preprocess(srcForPass, pass.Threshold, pass.Upsample);
                        prePreview?.Dispose();
                        prePreview = (Bitmap)pre.Clone();
                        using var pix = PixFromBitmap(pre);
                        using var page = engine.Process(pix, pass.Psm);
                        var raw = (page.GetText() ?? "").Trim();
                        var cleanedAll = Regex.Replace(raw, "[^A-Za-z0-9'\\- \\r\\n]", " ").Trim();
                        var nameMatches = Regex.Matches(
                            cleanedAll,
                            "([A-Za-z][A-Za-z0-9.'\\-]*(?:\\s+(?!Lv\\.?\\b)[A-Za-z][A-Za-z0-9.'\\-]*)*)\\s+Lv\\.?\\s*\\d+",
                            RegexOptions.IgnoreCase
                        );
                        foreach (Match m in nameMatches)
                        {
                            var n = m.Groups[1].Value.Trim();
                            if (!string.IsNullOrWhiteSpace(n) && !nameList.Contains(n, StringComparer.OrdinalIgnoreCase))
                                nameList.Add(n);
                        }

                        if (nameList.Count == 0)
                        {
                            foreach (var line in cleanedAll.Split('\n'))
                            {
                                var n = Regex.Replace(line, "\\bLv\\.?\\s*\\d+.*$", "", RegexOptions.IgnoreCase).Trim();
                                if (Regex.IsMatch(n, "[A-Za-z]") && !nameList.Contains(n, StringComparer.OrdinalIgnoreCase))
                                    nameList.Add(n);
                            }
                        }

                        if (nameList.Count > 0)
                        {
                            conf = page.GetMeanConfidence();
                            rawUsed = raw;
                            bestPre?.Dispose();
                            bestPre = (Bitmap)pre.Clone();
                            break;
                        }
                    }
                }
                if (nameList.Count == 0 && prePreview != null)
                {
                    try
                    {
                        using var fs = new FileStream(BattlePrePath, FileMode.Create, FileAccess.Write, FileShare.Read);
                        prePreview.Save(fs, ImgFormat.Png);
                        LogBattle($"Saved preprocessed (miss): {BattlePrePath}");
                    }
                    catch { }
                    prePreview.Dispose(); prePreview = null;
                }
                else if (bestPre != null)
                {
                    try
                    {
                        using var fs = new FileStream(BattlePrePath, FileMode.Create, FileAccess.Write, FileShare.Read);
                        bestPre.Save(fs, ImgFormat.Png);
                        LogBattle($"Saved preprocessed: {BattlePrePath}");
                    }
                    catch { }
                    bestPre.Dispose();
                }

                var name = string.Join("\n", nameList);
                bool has = nameList.Count > 0;
                if (has)
                {
                    missStreak = 0;
                    int confPct = Math.Clamp((int)Math.Round(conf * 100), 0, 100);
                    Broadcast(BattleChan, name, rawUsed, confPct);
                    lastEmitLocal = name;
                    LogBattle($"SENT BATTLE: {name} ({confPct}%)");
                }
                else
                {
                    missStreak++;
                    if (missStreak >= 3 && lastEmitLocal != BattleChan.NoToken)
                    {
                        Broadcast(BattleChan, BattleChan.NoToken, "", 0);
                        lastEmitLocal = BattleChan.NoToken;
                        LogBattle("SENT NO_MON");
                    }
                }
                await Task.Delay(has ? 120 : 250, ct);
            }
            catch (TaskCanceledException) { }
            catch (Exception ex) { LogBattle("Battle loop error: " + ex.Message); await Task.Delay(500, ct); }
        }
    }

    struct OcrPass
    {
        public bool Masked;
        public double KeepPct;
        public int Threshold;
        public int Upsample;
        public PageSegMode Psm;
    }

    static List<OcrPass> BuildPassPlan(Bitmap crop, string mode, int autoDepth)
    {
        var plan = new List<OcrPass>();

        int depth = mode switch
        {
            "fast" => 0,
            "max" => 2,
            "auto" => autoDepth,
            _ => 1
        };

        int[][] thresholds = new[]
        {
            new[] { 190, 170 },
            new[] { 200, 185, 170, 155 },
            new[] { 210, 195, 180, 165, 150 }
        };

        int[][] upsets = new[]
        {
            new[] { 2 },
            new[] { 3, 2 },
            new[] { 4, 3, 2 }
        };

        PageSegMode[][] psms = new[]
        {
            new[] { PageSegMode.SingleBlock, PageSegMode.SingleLine },
            new[] { PageSegMode.SingleBlock, PageSegMode.SingleLine },
            new[] { PageSegMode.SingleBlock, PageSegMode.SingleLine, PageSegMode.SparseText }
        };

        foreach (var masked in new[] { false, true })
        {
            foreach (var up in upsets[depth])
            {
                foreach (var th in thresholds[depth])
                {
                    foreach (var p in psms[depth])
                    {
                        plan.Add(new OcrPass
                        {
                            Masked = masked,
                            KeepPct = masked ? 0.90 : 1.0,
                            Threshold = th,
                            Upsample = up,
                            Psm = p
                        });
                    }
                }
            }
        }

        return plan;
    }

    static Bitmap Preprocess(Bitmap src, int threshold, int upsample)
    {
        var gray = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(gray)) g.DrawImage(src, 0, 0);
        for (int y = 0; y < gray.Height; y++)
            for (int x = 0; x < gray.Width; x++)
            {
                var c = gray.GetPixel(x, y);
                byte v = (byte)(0.299 * c.R + 0.587 * c.G + 0.114 * c.B);
                gray.SetPixel(x, y, Color.FromArgb(v, v, v));
            }

        int upX = Math.Max(1, upsample);
        var up = new Bitmap(gray.Width * upX, gray.Height * upX, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(up))
        {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
            g.DrawImage(gray, new Rectangle(0, 0, up.Width, up.Height),
                        new Rectangle(0, 0, gray.Width, gray.Height), GraphicsUnit.Pixel);
        }
        gray.Dispose();

        var bin = new Bitmap(up.Width, up.Height, PixelFormat.Format24bppRgb);
        for (int y = 0; y < up.Height; y++)
            for (int x = 0; x < up.Width; x++)
            {
                var c = up.GetPixel(x, y);
                int v = (c.R + c.G + c.B) / 3;
                byte o = (byte)(v > threshold ? 255 : 0);
                bin.SetPixel(x, y, Color.FromArgb(o, o, o));
            }
        up.Dispose();
        return bin;
    }

    static Bitmap MaskBattleHud(Bitmap src)
    {
        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
        int levelStart = (int)(src.Width * 0.7);
        // Mask out the bottom portion where party icons are shown. These icons cause
        // Tesseract to occasionally recognise stray characters (like "E") when more
        // than one Pokémon is on screen.  Keeping only the upper portion with the name
        // bars improves OCR reliability.
        // The party icons sit roughly halfway down the capture and can introduce
        // stray characters ("E", "L" etc.) when more than one Pokémon is present.
        // Crop a bit higher to ensure these icons are fully masked out.
        int iconStartY = (int)(src.Height * 0.5);
        using (var g = Graphics.FromImage(outBmp))
        {
            g.DrawImage(src, 0, 0);
            // Hide level/HP portions on the right
            g.FillRectangle(Brushes.White, levelStart, 0, src.Width - levelStart, src.Height);
            // Hide party icon area at the bottom
            g.FillRectangle(Brushes.White, 0, iconStartY, src.Width, src.Height - iconStartY);
        }
        for (int y = 0; y < outBmp.Height; y++)
            for (int x = 0; x < levelStart; x++)
            {
                var c = outBmp.GetPixel(x, y);
                if (c.G > c.R + 40 && c.G > c.B + 40)
                    outBmp.SetPixel(x, y, Color.White);
            }
        return outBmp;
    }

    static Bitmap MaskLeftColumn(Bitmap src, double keepPct)
    {
        int keepW = Math.Max(1, (int)(src.Width * keepPct));
        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(outBmp);
        g.Clear(Color.White);
        g.DrawImage(src,
            new Rectangle(0, 0, keepW, src.Height),
            new Rectangle(0, 0, keepW, src.Height),
            GraphicsUnit.Pixel);
        return outBmp;
    }

    static Pix PixFromBitmap(Bitmap bmp)
    {
        using var ms = new MemoryStream();
        bmp.Save(ms, ImgFormat.Png);
        return Pix.LoadFromMemory(ms.ToArray());
    }

    static string ExtractLocation(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";

        var s = Regex.Replace(raw, @"\s+", " ").Trim();
        s = Regex.Replace(s, @"^[^A-Za-z]*([A-Za-z].*)$", "$1");

        var m = LocationCandidate.Match(s);
        if (!m.Success) return "";

        var val = m.Value;

        val = Regex.Replace(val, @"^(?:B|Bi|Bl)\s+(?=[A-Z])", "", RegexOptions.IgnoreCase);
        val = Regex.Replace(val, @"\bCh\.\s*\d+\b", "", RegexOptions.IgnoreCase).Trim();

        var cut = Regex.Match(val, @"^(.*?(Road|City|Town|Forest|Cave|Woods|Island|Lake|River|Tower|Desert|Marsh|Park|Bridge|Harbor|Port|Path|Trail|Tunnel|Mountain|League))",
                              RegexOptions.IgnoreCase);
        if (cut.Success) val = cut.Groups[1].Value;

        TextInfo ti = CultureInfo.InvariantCulture.TextInfo;
        val = ti.ToTitleCase(val.ToLowerInvariant());
        val = Regex.Replace(val, @"^(?:B|Bl|Bi)\s+(?=[A-Z])", "", RegexOptions.IgnoreCase);

        var lower = val.ToLowerInvariant();
        if (Regex.IsMatch(lower, @"\b(mon|kemon|okemon)\s+league\b")) val = "Pokemon League";
        if (Regex.IsMatch(lower, @"\b(ictory|ctory)\s+road\b")) val = "Victory Road";

        return val.Trim();
    }

    // ---------- Window helpers ----------
    static IntPtr FindPokeMMO(int? targetPid)
    {
        int? pidHint = targetPid ?? (CachedPid > 0 ? CachedPid : (int?)null);

        if (CachedHwnd != IntPtr.Zero && IsWindow(CachedHwnd))
        {
            uint wpid; GetWindowThreadProcessId(CachedHwnd, out wpid);
            if ((pidHint == null || wpid == (uint)pidHint) && IsPokeMMOWindow(CachedHwnd))
                return CachedHwnd;
        }

        if (pidHint is int pid && pid > 0)
        {
            try
            {
                var p = Process.GetProcessById(pid);
                if (p != null)
                {
                    if (p.MainWindowHandle != IntPtr.Zero && IsPokeMMOWindow(p.MainWindowHandle))
                        return CacheHandle(p.MainWindowHandle, pid);
                    IntPtr found = IntPtr.Zero;
                    EnumWindows((h, l) =>
                    {
                        uint wpid; GetWindowThreadProcessId(h, out wpid);
                        if (wpid == (uint)pid && IsWindowVisible(h) && IsPokeMMOWindow(h)) { found = h; return false; }
                        return true;
                    }, IntPtr.Zero);
                    if (found != IntPtr.Zero) return CacheHandle(found, pid);
                }
            }
            catch { }
        }
        else
        {
            foreach (var p in Process.GetProcessesByName("pokemmo"))
            {
                try
                {
                    if (p.MainWindowHandle != IntPtr.Zero && IsPokeMMOWindow(p.MainWindowHandle))
                        return CacheHandle(p.MainWindowHandle, p.Id);
                    IntPtr found = IntPtr.Zero;
                    EnumWindows((h, l) =>
                    {
                        uint wpid; GetWindowThreadProcessId(h, out wpid);
                        if (wpid == (uint)p.Id && IsWindowVisible(h) && IsPokeMMOWindow(h)) { found = h; return false; }
                        return true;
                    }, IntPtr.Zero);
                    if (found != IntPtr.Zero) return CacheHandle(found, p.Id);
                }
                catch { }
            }
        }

        IntPtr foundEnum = IntPtr.Zero;
        EnumWindows((win, l) =>
        {
            if (!IsWindowVisible(win)) return true;
            if (IsPokeMMOWindow(win)) { foundEnum = win; return false; }
            return true;
        }, IntPtr.Zero);
        if (foundEnum != IntPtr.Zero)
        {
            uint wpid; GetWindowThreadProcessId(foundEnum, out wpid);
            return CacheHandle(foundEnum, (int)wpid);
        }
        DumpAllWindows();
        return IntPtr.Zero;
    }
    static IntPtr CacheHandle(IntPtr h, int pid)
    {
        CachedHwnd = h;
        CachedPid = pid;
        LogWindow($"LOCK 0x{h.ToInt64():X} pid={pid} title='{OneLine(GetTitle(h))}' class='{GetClass(h)}'");
        return h;
    }
    static bool IsPokeMMOWindow(IntPtr h)
    {
        if (h == IntPtr.Zero) return false;

        var cls = GetClass(h);
        if (!cls.StartsWith("GLFW", StringComparison.OrdinalIgnoreCase))
            return false;

        // Prefer title heuristics when possible
        var title = GetTitle(h).Trim();
        var normTitle = RemoveDiacritics(title);
        if (System.Text.RegularExpressions.Regex.IsMatch(normTitle, "^pok.*mmo$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))

        // Fallback: check associated process
        uint pid; GetWindowThreadProcessId(h, out pid);
        try
        {
            var p = Process.GetProcessById((int)pid);
            var procName = p.ProcessName;
            if (procName.Equals("pokemmo", StringComparison.OrdinalIgnoreCase) ||
                procName.Equals("javaw", StringComparison.OrdinalIgnoreCase))
                return true;
            try
            {
                var modPath = p.MainModule?.FileName;
                if (!string.IsNullOrEmpty(modPath))
                {
                    var exe = Path.GetFileName(modPath);
                    if (exe.Equals("pokemmo.exe", StringComparison.OrdinalIgnoreCase) ||
                        exe.Equals("javaw.exe", StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            catch { }
        }
        catch { }

        return false;
    }
    static string GetTitle(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, sb.Capacity); return sb.ToString(); }
    static string GetClass(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, sb.Capacity); return sb.ToString(); }

static string RemoveDiacritics(string text)
    {
        var normalized = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        return sb.ToString();
    }
    
    static Rectangle ZoomRectangle(Rectangle baseRect, int cw, int ch, double zoom)
    {
        zoom = Math.Clamp(zoom, 1.0, 2.0);
        double cx = baseRect.Left + baseRect.Width / 2.0;
        double cy = baseRect.Top + baseRect.Height / 2.0;

        int newW = (int)Math.Round(baseRect.Width * zoom);
        int newH = (int)Math.Round(baseRect.Height * zoom);

        newW = Math.Min(newW, cw);
        newH = Math.Min(newH, ch);

        int left = (int)Math.Round(cx - newW / 2.0);
        int top = (int)Math.Round(cy - newH / 2.0);

        left = Math.Max(0, Math.Min(left, cw - newW));
        top = Math.Max(0, Math.Min(top, ch - newH));

        return new Rectangle(left, top, newW, newH);
    }

    // ---------- Utilities ----------
    static IEnumerable<int> ParsePorts(string[] args)
    {
        foreach (var a in args)
            if (a.StartsWith("--port=", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(a.Substring(7), out var p))
                return new[] { p };

        foreach (var a in args)
            if (a.StartsWith("--ports=", StringComparison.OrdinalIgnoreCase))
            {
                var list = new List<int>();
                foreach (var tok in a.Substring(8).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    if (int.TryParse(tok, out var q)) list.Add(q);
                if (list.Count > 0) return list;
            }
        return DefaultPorts;
    }

    static double? ParseDoubleEnv(string key)
    {
        try
        {
            var s = Environment.GetEnvironmentVariable(key);
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
        }
        catch { }
        return null;
    }

    static int? ParseIntEnv(string key)
    {
        try
        {
            var s = Environment.GetEnvironmentVariable(key);
            if (string.IsNullOrWhiteSpace(s)) return null;
            if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d)) return d;
        }
        catch { }
        return null;
    }

    static double GetArg(string[] args, string key, double def)
    {
        foreach (var a in args)
            if (a.StartsWith(key + "=", StringComparison.OrdinalIgnoreCase) &&
                double.TryParse(a[(key.Length + 1)..], NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                return d;
        return def;
    }

    static void Log(string s) => LogTo(RouteLogPath, s);
    static void LogBattle(string s) => LogTo(BattleLogPath, s);
    static void LogWindow(string s) => LogTo(WindowLogPath, s);

    static void LogTo(string path, string s)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            File.AppendAllText(path, $"[{DateTime.Now:HH:mm:ss}] {s}{Environment.NewLine}");
        }
        catch { }
        Console.WriteLine(s);
    }

    static string OneLine(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        s = s.Replace("\r", " ").Replace("\n", " ");
        return s.Length > 120 ? s.Substring(0, 120) + "…" : s;
    }
    
    static void DumpAllWindows()
    {
        LogWindow("=== Window enumeration ===");
        EnumWindows((h, l) =>
        {
            uint pid; GetWindowThreadProcessId(h, out pid);
            var title = GetTitle(h);
            var cls = GetClass(h);
            LogWindow($"0x{h.ToInt64():X} pid={pid} vis={(IsWindowVisible(h) ? "Y" : "N")} title='{OneLine(title)}' class='{cls}'");
            return true;
        }, IntPtr.Zero);
    }
}
