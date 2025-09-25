#if !WINDOWS
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

partial class LiveRouteOCR
{
    #pragma warning disable CA1416

    const string X11 = "libX11.so.6";
    const int ZPixmap = 2;
    const int Success = 0;
    const long AllPlanes = -1;
    const int IsUnmapped = 0;
    const int IsViewable = 2;

    [StructLayout(LayoutKind.Sequential)]
    struct XWindowAttributes
    {
        public int x, y;
        public int width, height;
        public int border_width, depth;
        public IntPtr visual;
        public IntPtr root;
        public int @class;
        public int bit_gravity;
        public int win_gravity;
        public int backing_store;
        public uint backing_planes;
        public uint backing_pixel;
        public int save_under;
        public IntPtr colormap;
        public int map_installed;
        public int map_state;
        public long all_event_masks;
        public long your_event_mask;
        public long do_not_propagate_mask;
        public int override_redirect;
        public IntPtr screen;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct XClassHint
    {
        public IntPtr res_name;
        public IntPtr res_class;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct XImage
    {
        public int width;
        public int height;
        public int xoffset;
        public int format;
        public IntPtr data;
        public int byte_order;
        public int bitmap_unit;
        public int bitmap_bit_order;
        public int bitmap_pad;
        public int depth;
        public int bytes_per_line;
        public int bits_per_pixel;
        public UIntPtr red_mask;
        public UIntPtr green_mask;
        public UIntPtr blue_mask;
        public IntPtr obdata;
        public IntPtr funcs;
    }

    [DllImport(X11)] static extern IntPtr XOpenDisplay(IntPtr display);
    [DllImport(X11)] static extern int XCloseDisplay(IntPtr display);
    [DllImport(X11)] static extern IntPtr XDefaultRootWindow(IntPtr display);
    [DllImport(X11)] static extern int XQueryTree(IntPtr display, IntPtr w, out IntPtr root_return, out IntPtr parent_return, out IntPtr children_return, out uint nchildren_return);
    [DllImport(X11)] static extern int XFree(IntPtr data);
    [DllImport(X11)] static extern int XGetWindowAttributes(IntPtr display, IntPtr window, out XWindowAttributes attributes);
    [DllImport(X11)] static extern int XFetchName(IntPtr display, IntPtr window, out IntPtr window_name);
    [DllImport(X11)] static extern int XGetClassHint(IntPtr display, IntPtr window, ref XClassHint class_hint);
    [DllImport(X11)] static extern IntPtr XInternAtom(IntPtr display, string atom_name, bool only_if_exists);
    [DllImport(X11)] static extern int XGetWindowProperty(IntPtr display, IntPtr window, IntPtr property, IntPtr long_offset, IntPtr long_length, bool delete, IntPtr req_type, out IntPtr actual_type_return, out int actual_format_return, out IntPtr nitems_return, out IntPtr bytes_after_return, out IntPtr prop_return);
    [DllImport(X11)] static extern int XTranslateCoordinates(IntPtr display, IntPtr src_w, IntPtr dest_w, int src_x, int src_y, out int dest_x_return, out int dest_y_return, out IntPtr child_return);
    [DllImport(X11)] static extern IntPtr XGetImage(IntPtr display, IntPtr drawable, int x, int y, uint width, uint height, long plane_mask, int format);
    [DllImport(X11)] static extern int XDestroyImage(IntPtr image);

    static bool TryGetWindowAttributes(IntPtr hWnd, out XWindowAttributes attrs)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero)
        {
            attrs = default;
            return false;
        }
        try
        {
            var ok = XGetWindowAttributes(display, hWnd, out attrs) != 0;
            return ok;
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static bool TryGetWindowAttributes(IntPtr display, IntPtr hWnd, out XWindowAttributes attrs)
    {
        if (display == IntPtr.Zero)
        {
            attrs = default;
            return false;
        }
        return XGetWindowAttributes(display, hWnd, out attrs) != 0;
    }

    static bool IsWindowVisible(IntPtr hWnd) => TryGetWindowAttributes(hWnd, out var attrs) && attrs.map_state == IsViewable;

    static bool IsWindow(IntPtr hWnd) => TryGetWindowAttributes(hWnd, out _);

    static bool GetClientRect(IntPtr hWnd, out RECT rc)
    {
        if (!TryGetWindowAttributes(hWnd, out var attrs))
        {
            rc = default;
            return false;
        }
        rc = new RECT { Left = 0, Top = 0, Right = attrs.width, Bottom = attrs.height };
        return true;
    }

    static void ClientToScreen(IntPtr hWnd, ref POINT pt)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero)
        {
            pt.X = 0;
            pt.Y = 0;
            return;
        }
        try
        {
            int destX, destY;
            IntPtr child;
            if (XTranslateCoordinates(display, hWnd, XDefaultRootWindow(display), pt.X, pt.Y, out destX, out destY, out child) != 0)
            {
                pt.X = destX;
                pt.Y = destY;
            }
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static void GetWindowThreadProcessId(IntPtr hWnd, out uint pid)
    {
        pid = 0;
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return;
        try
        {
            pid = GetWindowPid(display, hWnd);
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static uint GetWindowPid(IntPtr display, IntPtr window)
    {
        uint pid = 0;
        if (display == IntPtr.Zero) return pid;
        var atom = XInternAtom(display, "_NET_WM_PID", true);
        if (atom == IntPtr.Zero) return pid;
        IntPtr actualType;
        int actualFormat;
        IntPtr nitems;
        IntPtr bytesAfter;
        IntPtr prop;
        if (XGetWindowProperty(display, window, atom, IntPtr.Zero, new IntPtr(1), false, IntPtr.Zero, out actualType, out actualFormat, out nitems, out bytesAfter, out prop) == Success)
        {
            try
            {
                if (actualFormat == 32 && nitems != IntPtr.Zero && prop != IntPtr.Zero)
                {
                    pid = (uint)Marshal.ReadInt32(prop);
                }
            }
            finally
            {
                if (prop != IntPtr.Zero) XFree(prop);
            }
        }
        return pid;
    }

    static string GetTitle(IntPtr hWnd)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return string.Empty;
        try
        {
            var title = GetWindowTitle(display, hWnd);
            return title;
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static string GetClass(IntPtr hWnd)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return string.Empty;
        try
        {
            var cls = GetWindowClass(display, hWnd);
            return cls;
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static string GetWindowTitle(IntPtr display, IntPtr hWnd)
    {
        if (display == IntPtr.Zero) return string.Empty;
        if (XFetchName(display, hWnd, out var namePtr) != 0 && namePtr != IntPtr.Zero)
        {
            try { return Marshal.PtrToStringAnsi(namePtr) ?? string.Empty; }
            finally { XFree(namePtr); }
        }
        return string.Empty;
    }

    static string GetWindowClass(IntPtr display, IntPtr hWnd)
    {
        if (display == IntPtr.Zero) return string.Empty;
        var hint = new XClassHint();
        if (XGetClassHint(display, hWnd, ref hint) != 0)
        {
            try
            {
                if (hint.res_class != IntPtr.Zero)
                    return Marshal.PtrToStringAnsi(hint.res_class) ?? string.Empty;
            }
            finally
            {
                if (hint.res_name != IntPtr.Zero) XFree(hint.res_name);
                if (hint.res_class != IntPtr.Zero) XFree(hint.res_class);
            }
        }
        return string.Empty;
    }

    static IEnumerable<WindowInfo> EnumerateTopLevelWindows()
    {
        var results = new List<WindowInfo>();
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return results;
        try
        {
            IntPtr root = XDefaultRootWindow(display);
            if (root == IntPtr.Zero) return results;
            if (XQueryTree(display, root, out _, out _, out var childrenPtr, out uint count) == 0) return results;
            try
            {
                for (int i = 0; i < count; i++)
                {
                    var win = Marshal.ReadIntPtr(childrenPtr, i * IntPtr.Size);
                    if (!TryGetWindowAttributes(display, win, out var attrs)) continue;
                    if (attrs.map_state != IsViewable) continue;
                    var title = GetWindowTitle(display, win).Trim();
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    uint pid = GetWindowPid(display, win);
                    results.Add(new WindowInfo { Handle = win, Pid = (int)pid, Title = title });
                }
            }
            finally
            {
                if (childrenPtr != IntPtr.Zero) XFree(childrenPtr);
            }
        }
        finally
        {
            XCloseDisplay(display);
        }
        return results;
    }

    static bool IsPokeMMOWindow(IntPtr h)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return false;
        try
        {
            return IsPokeMMOWindow(display, h);
        }
        finally
        {
            XCloseDisplay(display);
        }
    }

    static bool IsPokeMMOWindow(IntPtr display, IntPtr h)
    {
        if (!TryGetWindowAttributes(display, h, out _)) return false;
        var title = RemoveDiacritics(GetWindowTitle(display, h)).Trim();
        if (!string.IsNullOrEmpty(title) && title.IndexOf("pokemmo", StringComparison.OrdinalIgnoreCase) >= 0)
            return true;
        var cls = GetWindowClass(display, h);
        if (!string.IsNullOrEmpty(cls) && cls.StartsWith("GLFW", StringComparison.OrdinalIgnoreCase))
            return true;
        return false;
    }

    static IntPtr FindPokeMMO(int? targetPid)
    {
        int? pidHint = targetPid ?? (CachedPid > 0 ? CachedPid : (int?)null);

        if (CachedHwnd != IntPtr.Zero && IsWindow(CachedHwnd))
        {
            GetWindowThreadProcessId(CachedHwnd, out uint cachedPid);
            if ((pidHint == null || cachedPid == pidHint) && IsPokeMMOWindow(CachedHwnd))
                return CachedHwnd;
        }

        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return IntPtr.Zero;
        try
        {
            IntPtr root = XDefaultRootWindow(display);
            if (root == IntPtr.Zero) return IntPtr.Zero;
            if (XQueryTree(display, root, out _, out _, out var childrenPtr, out uint count) == 0)
                return IntPtr.Zero;
            try
            {
                var windows = new List<IntPtr>();
                for (int i = 0; i < count; i++)
                    windows.Add(Marshal.ReadIntPtr(childrenPtr, i * IntPtr.Size));
                windows.Reverse();
                foreach (var win in windows)
                {
                    if (!TryGetWindowAttributes(display, win, out var attrs)) continue;
                    if (attrs.map_state != IsViewable) continue;
                    uint pid = GetWindowPid(display, win);
                    if (pidHint.HasValue && pid != pidHint.Value) continue;
                    if (IsPokeMMOWindow(display, win))
                        return CacheHandle(win, pid > 0 ? (int)pid : 0);
                }
            }
            finally
            {
                if (childrenPtr != IntPtr.Zero) XFree(childrenPtr);
            }
        }
        finally
        {
            XCloseDisplay(display);
        }
        return IntPtr.Zero;
    }

    static bool LinuxCaptureRegion(IntPtr hWnd, POINT origin, Rectangle rect, Bitmap target)
    {
        var display = XOpenDisplay(IntPtr.Zero);
        if (display == IntPtr.Zero) return false;
        try
        {
            var root = XDefaultRootWindow(display);
            if (root == IntPtr.Zero) return false;
            int absX = origin.X + rect.Left;
            int absY = origin.Y + rect.Top;
            IntPtr imagePtr = XGetImage(display, root, absX, absY, (uint)rect.Width, (uint)rect.Height, AllPlanes, ZPixmap);
            if (imagePtr == IntPtr.Zero) return false;
            try
            {
                var img = Marshal.PtrToStructure<XImage>(imagePtr);
                int bytesPerPixel = Math.Max(1, img.bits_per_pixel / 8);
                int srcStride = img.bytes_per_line;
                var rectSize = new Rectangle(0, 0, target.Width, target.Height);
                var data = target.LockBits(rectSize, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                try
                {
                    unsafe
                    {
                        byte* srcBase = (byte*)img.data;
                        byte* dstBase = (byte*)data.Scan0;
                        for (int y = 0; y < rect.Height; y++)
                        {
                            byte* srcRow = srcBase + y * srcStride;
                            byte* dstRow = dstBase + y * data.Stride;
                            for (int x = 0; x < rect.Width; x++)
                            {
                                int srcIndex = x * bytesPerPixel;
                                byte b = srcRow[srcIndex + 0];
                                byte g = bytesPerPixel > 1 ? srcRow[srcIndex + 1] : b;
                                byte r = bytesPerPixel > 2 ? srcRow[srcIndex + 2] : b;
                                int dstIndex = x * 3;
                                dstRow[dstIndex + 0] = b;
                                dstRow[dstIndex + 1] = g;
                                dstRow[dstIndex + 2] = r;
                            }
                        }
                    }
                }
                finally
                {
                    target.UnlockBits(data);
                }
                return true;
            }
            finally
            {
                XDestroyImage(imagePtr);
            }
        }
        finally
        {
            XCloseDisplay(display);
        }
    }
    #pragma warning restore CA1416
}

#endif
