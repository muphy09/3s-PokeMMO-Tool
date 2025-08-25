// Program.cs — LiveRouteOCR (snapshot + periodic rebroadcast; emits confidence)

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
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Tesseract;

class LiveRouteOCR
{
    // ---------- Win32 ----------
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    // ---------- Paths ----------
    static string AppDataDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PokemmoLive");
    static string LogPath => Path.Combine(AppDataDir, "ocr.log");
    static string LastCapPath => Path.Combine(AppDataDir, "last-capture.png");
    static string LastPrePath => Path.Combine(AppDataDir, "last-pre.png");
    static string StableTessDir => Path.Combine(AppDataDir, "tessdata"); // we will copy eng.traineddata here and always use this

    // ---------- WS ----------
    static readonly int[] DefaultPorts = { 8765, 8766, 8767, 8768, 8769, 8770, 8780 };
    static readonly List<HttpListener> Servers = new();
    static readonly ConcurrentDictionary<WebSocket, byte> Clients = new();

    // Snapshot state for new/reconnected clients
    static readonly object SnapshotLock = new();
    static volatile string LastEmit = "";   // last route/token we sent (e.g., "Victory Road" or "NO_ROUTE")
    static volatile string LastRaw  = "";   // last raw OCR text
    static volatile int LastConfPct = 0;    // 0-100 confidence we last emitted
    // Use primitive for 'volatile' compatibility to avoid CS0677
    static long LastBroadcastTicks = 0; // DateTime.UtcNow.Ticks of last broadcast

    // ---------- ROI (% of client area) ----------
    struct Roi
    {
        public double Left, Top, Width, Height;
        public Rectangle ToRectangle(int w, int h)
        {
            int x  = Math.Max(0, (int)(w * Left));
            int y  = Math.Max(0, (int)(h * Top));
            int rw = Math.Max(120, (int)(w * Width));
            int rh = Math.Max(70,  (int)(h * Height));
            return new Rectangle(x, y, Math.Min(rw, w - x), Math.Min(rh, h - y));
        }
    }

    // ---------- Location extraction ----------
    static readonly Regex LocationCandidate = new(
        @"\b(?:
             Route\s*\d+ |
             (?:
                (?!B(?:i|l)?\b)
                [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*
                \s(?:Road|City|Town|Forest|Cave|Woods|Island|Lake|River|Tower|Desert|Marsh|Park|Bridge|Harbor|Port|Path|Trail|Tunnel|Mountain|League|Hall|Dojo|Manor|Lab|Gate|Safari|Garden|Plaza|Valley|Meadow|Ranch|Ruins)
             )
           )\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.IgnorePatternWhitespace);

    static async Task Main(string[] args)
    {
        Directory.CreateDirectory(AppDataDir);
        Directory.CreateDirectory(StableTessDir);
        Log("=== LiveRouteOCR boot ===");

        var roi = new Roi {
            Left   = GetArg(args, "--left",  0.010),
            Top    = GetArg(args, "--top",   0.012),
            Width  = GetArg(args, "--width", 0.355),
            Height = GetArg(args, "--height",0.150)
        };
        Log($"ROI: L={roi.Left:P0} T={roi.Top:P0} W={roi.Width:P0} H={roi.Height:P0}");

        // WebSocket listeners
        StartServers(ParsePorts(args));

        // Always send an initial NO_ROUTE so the app gets a payload immediately
        BroadcastAll("NO_ROUTE", "", 0);

        // Resolve tessdata, copy into a stable dir, and init Tesseract from there
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
                if (!File.Exists(dst) || new FileInfo(dst).Length == 0)
                {
                    File.Copy(src, dst, overwrite: true);
                }
            }
            catch (Exception ex)
            {
                Log("Copy tessdata failed: " + ex.Message);
            }
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
        catch (Exception ex)
        {
            Log("Tesseract init failed: " + ex.Message);
        }

        // Re-broadcast task (helps after tab swaps)
        var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, __) => cts.Cancel();
        _ = Task.Run(() => PeriodicRebroadcastLoop(cts.Token));

        await OcrLoop(engine, roi, cts.Token);
    }

    // --- locate tessdata in self-contained bundle layouts and normal layouts
    static string FindTessdataSource()
    {
        // 1) next to EXE
        var exeDir = AppContext.BaseDirectory;
        var direct = Path.Combine(exeDir, "tessdata");
        if (File.Exists(Path.Combine(direct, "eng.traineddata"))) return direct;

        // 2) common "resources/<appname or live-helper>/tessdata" in single-file extraction
        var exeParent = Directory.GetParent(exeDir)?.FullName ?? exeDir;
        foreach (var sub in new[] { "resources\\tessdata", "resources\\live-helper\\tessdata", "resources\\app\\tessdata" })
        {
            string p = Path.Combine(exeParent, sub);
            if (File.Exists(Path.Combine(p, "eng.traineddata"))) return p;
        }

        // 3) current working dir
        var cwd = Path.Combine(Environment.CurrentDirectory, "tessdata");
        if (File.Exists(Path.Combine(cwd, "eng.traineddata"))) return cwd;

        // 4) already-copied stable location (return it so the caller still logs it)
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
                h.Start();
                Servers.Add(h);
                _ = Task.Run(() => AcceptLoop(h));
                Log($"WebSocket: ws://127.0.0.1:{p}/live");
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
                    Log("WS client connected");
                    var ws = wsctx.WebSocket;
                    Clients.TryAdd(ws, 1);

                    // send snapshot right away (if we already emitted something)
                    string emit, raw; int conf;
                    lock (SnapshotLock) { emit = LastEmit; raw = LastRaw; conf = LastConfPct; }
                    if (!string.IsNullOrWhiteSpace(emit))
                    {
                        try { SendAllFormats(ws, emit, raw, conf); Log($"SNAPSHOT -> client: {emit}"); } catch { }
                    }
                    else
                    {
                        // ensure client sees *something* immediately
                        try { SendAllFormats(ws, "NO_ROUTE", "", 0); } catch { }
                    }

                    _ = Task.Run(() => WsPump(ws));
                }
                else { ctx.Response.StatusCode = 426; ctx.Response.Close(); }
            }
            catch { try { ctx?.Response.Abort(); } catch { } }
        }
    }

    static async Task WsPump(WebSocket ws)
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
            Clients.TryRemove(ws, out _);
            try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            ws.Dispose();
        }
    }

    static void BroadcastAll(string routeOrToken, string raw, int confPct)
    {
        lock (SnapshotLock)
        {
            LastEmit = routeOrToken;
            LastRaw  = raw ?? "";
            LastConfPct = Math.Clamp(confPct, 0, 100);
            LastBroadcastTicks = DateTime.UtcNow.Ticks;
        }

        foreach (var ws in Clients.Keys)
        {
            if (ws.State != WebSocketState.Open) { Clients.TryRemove(ws, out _); continue; }
            try { SendAllFormats(ws, routeOrToken, raw, confPct); }
            catch { Clients.TryRemove(ws, out _); }
        }
    }

    static void SendAllFormats(WebSocket ws, string routeOrToken, string raw, int confPct)
    {
        var plain      = routeOrToken; // "Victory Road" or "NO_ROUTE"
        var piped      = (routeOrToken == "NO_ROUTE") ? "NO_ROUTE" : $"ROUTE|{routeOrToken}";
        var jsonSimple = $"{{\"route\":\"{Escape(routeOrToken)}\"}}";
        var jsonRich   = $"{{\"type\":\"{(routeOrToken=="NO_ROUTE"?"no_route":"route")}\",\"text\":\"{Escape(routeOrToken)}\",\"raw\":\"{Escape(raw ?? "")}\",\"conf\":{confPct}}}";

        var payloads = new[] { plain, piped, jsonSimple, jsonRich };
        foreach (var msg in payloads)
        {
            var data = Encoding.UTF8.GetBytes(msg);
            ws.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Text, true, CancellationToken.None).Wait(100);
        }
    }

    static string Escape(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    static async Task PeriodicRebroadcastLoop(CancellationToken ct)
    {
        const int intervalMs = 8000;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(intervalMs, ct);
                string emit, raw; int conf; long lastTicks;
                lock (SnapshotLock) { emit = LastEmit; raw = LastRaw; conf = LastConfPct; lastTicks = LastBroadcastTicks; }
                if (string.IsNullOrWhiteSpace(emit)) continue;

                if ((DateTime.UtcNow - new DateTime(lastTicks, DateTimeKind.Utc)).TotalSeconds >= 7)
                {
                    foreach (var ws in Clients.Keys)
                    {
                        if (ws.State != WebSocketState.Open) { Clients.TryRemove(ws, out _); continue; }
                        try { SendAllFormats(ws, emit, raw, conf); } catch { Clients.TryRemove(ws, out _); }
                    }
                    lock (SnapshotLock) { LastBroadcastTicks = DateTime.UtcNow.Ticks; }
                    Log($"REBROADCAST: {emit} ({conf}%)");
                }
            }
            catch (TaskCanceledException) { }
            catch (Exception ex) { Log("Periodic loop error: " + ex.Message); }
        }
    }

    // ---------- Loop ----------
    static async Task OcrLoop(TesseractEngine? engine, Roi roi, CancellationToken ct)
    {
        int missStreak = 0;
        string lastEmitLocal = "";
        int lastConfLocal = 0;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var hWnd = FindPokeMMO();
                if (hWnd == IntPtr.Zero) { await Task.Delay(900, ct); continue; }

                if (!GetClientRect(hWnd, out var rc)) { await Task.Delay(700, ct); continue; }
                var pt = new POINT { X = 0, Y = 0 }; ClientToScreen(hWnd, ref pt);
                int cw = Math.Max(1, rc.Right - rc.Left), ch = Math.Max(1, rc.Bottom - rc.Top);

                var r = roi.ToRectangle(cw, ch);
                int sx = pt.X + r.Left, sy = pt.Y + r.Top;

                using var crop = new Bitmap(r.Width, r.Height, PixelFormat.Format24bppRgb);
                using (var g = Graphics.FromImage(crop)) g.CopyFromScreen(sx, sy, 0, 0, crop.Size, CopyPixelOperation.SourceCopy);
                crop.Save(LastCapPath, ImgFormat.Png);

                using var masked = MaskLeftColumn(crop, keepPct: 0.42);

                string raw1 = "", raw2 = "", location = "";
                float  conf = 0f;

                if (engine != null)
                {
                    using (var pre1 = Preprocess(masked, 190))
                    using (var pix1 = PixFromBitmap(pre1))
                    using (var page1 = engine.Process(pix1, PageSegMode.SingleBlock))
                    {
                        raw1 = (page1.GetText() ?? "").Trim();
                        location = ExtractLocation(raw1);
                        conf = page1.GetMeanConfidence();
                        pre1.Save(LastPrePath, ImgFormat.Png);
                    }

                    if (string.IsNullOrEmpty(location))
                    {
                        using var pre2 = Preprocess(masked, 165);
                        using var pix2 = PixFromBitmap(pre2);
                        using var page2 = engine.Process(pix2, PageSegMode.SingleBlock);
                        raw2 = (page2.GetText() ?? "").Trim();
                        var loc2 = ExtractLocation(raw2);
                        if (!string.IsNullOrEmpty(loc2)) { location = loc2; conf = page2.GetMeanConfidence(); }
                    }
                }

                bool HasText(string s) => !string.IsNullOrWhiteSpace(s);

                if (HasText(location))
                {
                    missStreak = 0;
                    var clean = Regex.Replace(location, @"\s+", " ").Trim();
                    int confPct = Math.Clamp((int)Math.Round(conf * 100), 0, 100);

                    if (!string.Equals(clean, lastEmitLocal, StringComparison.OrdinalIgnoreCase) || confPct != lastConfLocal)
                    {
                        BroadcastAll(clean, string.IsNullOrWhiteSpace(raw2) ? raw1 : raw2, confPct);
                        lastEmitLocal = clean;
                        lastConfLocal = confPct;
                        Log($"SENT ROUTE: {clean} ({confPct}%)");
                    }
                }
                else
                {
                    missStreak++;
                    if (missStreak >= 3 && !string.Equals(lastEmitLocal, "NO_ROUTE", StringComparison.Ordinal))
                    {
                        BroadcastAll("NO_ROUTE", string.IsNullOrWhiteSpace(raw2) ? raw1 : raw2, 0);
                        lastEmitLocal = "NO_ROUTE";
                        lastConfLocal = 0;
                        Log("SENT NO_ROUTE");
                        missStreak = 3;
                    }
                }

                await Task.Delay(600, ct);
            }
            catch (TaskCanceledException) { }
            catch (Exception ex) { Log("Loop error: " + ex.Message); await Task.Delay(800, ct); }
        }
    }

    // ---------- OCR utils ----------
    static Bitmap Preprocess(Bitmap src, int threshold)
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

        var up = new Bitmap(gray.Width * 2, gray.Height * 2, PixelFormat.Format24bppRgb);
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

    static Bitmap MaskLeftColumn(Bitmap src, double keepPct)
    {
        int keepW = Math.Max(1, (int)(src.Width * keepPct));
        var outBmp = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
        using var g = Graphics.FromImage(outBmp);
        g.Clear(Color.White);

        // Copy only the left HUD band (avoid clipping the leftmost letters)
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

    // ---------- Extraction ----------
    static string ExtractLocation(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";

        var s = Regex.Replace(raw, @"\s+", " ").Trim();
        s = Regex.Replace(s, @"^[^A-Za-z]*([A-Za-z].*)$", "$1");

        var m = LocationCandidate.Match(s);
        if (!m.Success) return "";

        var val = m.Value;

        // Remove map-icon artifacts like "B ", "Bi ", "Bl "
        val = Regex.Replace(val, @"^(?:B|Bi|Bl)\s+(?=[A-Z])", "", RegexOptions.IgnoreCase);

        // Remove channel suffix (Ch. 1, Ch. 2, etc.)
        val = Regex.Replace(val, @"\bCh\.\s*\d+\b", "", RegexOptions.IgnoreCase).Trim();

        // Cut off after key location nouns
        var cut = Regex.Match(val, @"^(.*?(Road|City|Town|Forest|Cave|Woods|Island|Lake|River|Tower|Desert|Marsh|Park|Bridge|Harbor|Port|Path|Trail|Tunnel|Mountain|League))",
                              RegexOptions.IgnoreCase);
        if (cut.Success) val = cut.Groups[1].Value;

        TextInfo ti = CultureInfo.InvariantCulture.TextInfo;
        val = ti.ToTitleCase(val.ToLowerInvariant());

        // Final safeguard
        val = Regex.Replace(val, @"^(?:B|Bl|Bi)\s+(?=[A-Z])", "", RegexOptions.IgnoreCase);

        // Ultra-common autocorrects if first letters were clipped
        var lower = val.ToLowerInvariant();
        if (Regex.IsMatch(lower, @"\b(mon|kemon|okemon)\s+league\b")) val = "Pokemon League";
        if (Regex.IsMatch(lower, @"\b(ictory|ctory)\s+road\b"))       val = "Victory Road";

        return val.Trim();
    }

    // ---------- Window helpers ----------
    static IntPtr FindPokeMMO()
    {
        var h = GetForegroundWindow();
        var title = GetTitle(h); var cls = GetClass(h);
        if (cls.StartsWith("GLFW", StringComparison.OrdinalIgnoreCase) &&
            title.IndexOf("pok", StringComparison.OrdinalIgnoreCase) >= 0)
            return h;

        var byClass = FindWindow("GLFW30", null);
        return byClass;
    }
    static string GetTitle(IntPtr h){ var sb=new StringBuilder(256); GetWindowText(h,sb,sb.Capacity); return sb.ToString(); }
    static string GetClass (IntPtr h){ var sb=new StringBuilder(256); GetClassName (h,sb,sb.Capacity); return sb.ToString(); }

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

    static double GetArg(string[] args, string key, double def)
    {
        foreach (var a in args)
            if (a.StartsWith(key + "=", StringComparison.OrdinalIgnoreCase) &&
                double.TryParse(a[(key.Length + 1)..], NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                return d;
        return def;
    }

    static void Log(string s)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            File.AppendAllText(LogPath, $"[{DateTime.Now:HH:mm:ss}] {s}{Environment.NewLine}");
        }
        catch { /* best-effort logging */ }
        Console.WriteLine(s);
    }

    static string OneLine(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        s = s.Replace("\r", " ").Replace("\n", " ");
        return s.Length > 120 ? s.Substring(0, 120) + "…" : s;
    }
}
