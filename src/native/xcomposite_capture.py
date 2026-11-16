#!/usr/bin/env python3
"""Capture one X11 window's real pixels via XComposite redirection.

Why this exists: under Xwayland (WSLg's Weston-based compositor is the
motivating case), the X11 *root* window's framebuffer is a stub -- actual
drawing happens via the Wayland protocol, not the X server's root pixmap.
XGetImage/XShmGetImage on the root window returns solid black even while
real windows are visibly open and rendering. This is why scrot/xwd/ffmpeg
x11grab against the root window all fail silently in that environment.

XComposite redirects one window's rendering into its own off-screen
pixmap, which Xwayland DOES populate correctly for the X11 windows it
manages (this is the same mechanism `import -window <id>` / `maim -i <id>`
rely on, just without needing those binaries installed). Root-window
capture is NOT fixed by this -- this script only ever captures a single
named window, never the whole virtual screen.
"""
import sys

def main(window_id_hex: str, out_path: str) -> None:
    from Xlib import X, display
    from Xlib.ext import composite
    from PIL import Image

    d = display.Display()
    win = d.create_resource_object("window", int(window_id_hex, 0))

    if not d.has_extension("Composite"):
        print("ERROR: X server has no Composite extension", file=sys.stderr)
        sys.exit(1)

    composite.redirect_window(win, composite.RedirectAutomatic)
    d.sync()

    geom = win.get_geometry()
    w, h = geom.width, geom.height
    if w <= 0 or h <= 0:
        print(f"ERROR: window has no area ({w}x{h})", file=sys.stderr)
        sys.exit(1)

    pixmap = composite.name_window_pixmap(win)
    raw = pixmap.get_image(0, 0, w, h, X.ZPixmap, 0xFFFFFFFF)

    img = Image.frombytes("RGB", (w, h), raw.data, "raw", "BGRX")
    img.save(out_path)
    print(f"{w}x{h}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: xcomposite_capture.py <window_id_hex> <out_path>", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
