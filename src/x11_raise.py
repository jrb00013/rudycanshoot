#!/usr/bin/env python3
"""Bring an X11 window to the front: x11_raise.py <window-id>.

Sends the EWMH _NET_ACTIVE_WINDOW request to the root window, which is what
xdotool/wmctrl do, using libX11 through ctypes so neither tool is needed.
Exit 0 on success, 1 on any failure.
"""
import ctypes
import ctypes.util
import sys
import time

ClientMessage = 33
SubstructureRedirectMask = 1 << 20
SubstructureNotifyMask = 1 << 19


class XClientMessageEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int),
        ("data", ctypes.c_long * 5),
    ]


class XEvent(ctypes.Union):
    _fields_ = [("xclient", XClientMessageEvent), ("pad", ctypes.c_long * 24)]


def main() -> int:
    if len(sys.argv) != 2:
        return 1
    win = int(sys.argv[1], 0)
    path = ctypes.util.find_library("X11")
    if not path:
        return 1
    x = ctypes.CDLL(path)
    x.XOpenDisplay.restype = ctypes.c_void_p
    x.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x.XDefaultRootWindow.restype = ctypes.c_ulong
    x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    x.XInternAtom.restype = ctypes.c_ulong
    x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long,
                             ctypes.POINTER(XEvent)]
    x.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    x.XFlush.argtypes = [ctypes.c_void_p]
    x.XCloseDisplay.argtypes = [ctypes.c_void_p]

    dpy = x.XOpenDisplay(None)
    if not dpy:
        return 1
    root = x.XDefaultRootWindow(dpy)
    ev = XEvent()
    ev.xclient.type = ClientMessage
    ev.xclient.send_event = 1
    ev.xclient.display = dpy
    ev.xclient.window = win
    ev.xclient.message_type = x.XInternAtom(dpy, b"_NET_ACTIVE_WINDOW", 0)
    ev.xclient.format = 32
    ev.xclient.data[0] = 2  # source indication: pager / tool
    ev.xclient.data[1] = 0  # CurrentTime
    ok = x.XSendEvent(dpy, root, 0, SubstructureRedirectMask | SubstructureNotifyMask, ctypes.byref(ev))
    x.XRaiseWindow(dpy, win)
    x.XFlush(dpy)
    x.XCloseDisplay(dpy)
    time.sleep(0.4)  # let the compositor repaint before the grab
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
