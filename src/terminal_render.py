#!/usr/bin/env python3
"""
Render terminal command output as a high-quality styled PNG.

Renders at 3× then downsamples with LANCZOS for clean antialiased text.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Font discovery ─────────────────────────────────────────────────────────────

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
    "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
]

FONT_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/ubuntu/UbuntuMono-B.ttf",
    "/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf",
]


def find_font(candidates, size):
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


# ── Theme ──────────────────────────────────────────────────────────────────────

THEME = {
    # window chrome
    "window_bg":   (24,  24,  27),   # zinc-900 ish
    "title_bar":   (36,  36,  40),   # slightly lighter
    "title_sep":   (58,  58,  64),   # 1px separator line
    "title_text":  (160, 160, 170),
    # dot colors — macOS Sonoma accurate
    "dot_red":     (255,  96,  86),
    "dot_yellow":  (255, 189,  46),
    "dot_green":   ( 39, 201,  63),
    "dot_shadow":  (0, 0, 0, 40),
    # content
    "bg":          ( 22,  22,  26),   # code area — slightly darker than bar
    "text":        (212, 212, 216),   # zinc-300
    "prompt_sign": ( 80, 210, 130),   # green dollar sign
    "prompt_cmd":  (230, 230, 235),   # bright white for the command text
    "dim":         ( 90,  90,  98),   # comments / dim text
    "error":       (248,  81,  73),
    "warn":        (230, 180,  50),
    "exit_ok":     ( 80, 210, 130),
    "exit_fail":   (248,  81,  73),
    # outer shadow
    "shadow":      (  0,   0,   0),
}

# ── ANSI color codes ───────────────────────────────────────────────────────────
# VS Code Dark+ palette — accurate, high contrast

ANSI_FG = {
    30:  (  1,   1,   1),   # black
    31:  (205,  49,  49),   # red
    32:  ( 13, 188, 121),   # green
    33:  (229, 229,  16),   # yellow
    34:  ( 36, 114, 200),   # blue
    35:  (188,  63, 188),   # magenta
    36:  ( 17, 168, 205),   # cyan
    37:  (229, 229, 229),   # white
    90:  (102, 102, 102),   # bright black
    91:  (241,  76,  76),   # bright red
    92:  ( 35, 209, 139),   # bright green
    93:  (245, 245,  67),   # bright yellow
    94:  ( 59, 142, 234),   # bright blue
    95:  (214, 112, 214),   # bright magenta
    96:  ( 41, 184, 219),   # bright cyan
    97:  (229, 229, 229),   # bright white
}

ANSI_BG = {k - 10: v for k, v in ANSI_FG.items()}   # 40–47, 100–107

ANSI_RE = re.compile(r"\x1b\[([0-9;]*)m")


def strip_ansi(text):
    return ANSI_RE.sub("", text)


def parse_ansi_spans(line):
    """Parse a line into [(text, fg_color, bg_color, bold)] spans."""
    spans = []
    fg = None
    bg = None
    bold = False
    last = 0
    for m in ANSI_RE.finditer(line):
        if m.start() > last:
            spans.append((line[last:m.start()], fg, bg, bold))
        raw = m.group(1)
        codes = [int(c) for c in raw.split(";") if c] if raw else [0]
        i = 0
        while i < len(codes):
            c = codes[i]
            if c == 0:
                fg = bg = None
                bold = False
            elif c == 1:
                bold = True
            elif c == 22:
                bold = False
            elif 30 <= c <= 37 or 90 <= c <= 97:
                fg = ANSI_FG.get(c)
            elif 40 <= c <= 47 or 100 <= c <= 107:
                bg = ANSI_BG.get(c - 10)
            elif c == 38 and i + 2 < len(codes) and codes[i + 1] == 5:
                # 256-color fg
                idx = codes[i + 2]
                fg = _256color(idx)
                i += 2
            elif c == 48 and i + 2 < len(codes) and codes[i + 1] == 5:
                idx = codes[i + 2]
                bg = _256color(idx)
                i += 2
            elif c == 38 and i + 4 < len(codes) and codes[i + 1] == 2:
                fg = (codes[i + 2], codes[i + 3], codes[i + 4])
                i += 4
            elif c == 48 and i + 4 < len(codes) and codes[i + 1] == 2:
                bg = (codes[i + 2], codes[i + 3], codes[i + 4])
                i += 4
            i += 1
        last = m.end()
    if last < len(line):
        spans.append((line[last:], fg, bg, bold))
    return spans


def _256color(idx):
    if idx < 16:
        basic = [
            (0,0,0),(128,0,0),(0,128,0),(128,128,0),
            (0,0,128),(128,0,128),(0,128,128),(192,192,192),
            (128,128,128),(255,0,0),(0,255,0),(255,255,0),
            (0,0,255),(255,0,255),(0,255,255),(255,255,255),
        ]
        return basic[idx]
    if idx < 232:
        idx -= 16
        b = idx % 6; idx //= 6
        g = idx % 6; r = idx // 6
        def v(x): return 0 if x == 0 else 55 + x * 40
        return (v(r), v(g), v(b))
    gray = 8 + (idx - 232) * 10
    return (gray, gray, gray)


# ── Command execution ──────────────────────────────────────────────────────────

def run_command(cmd, timeout=30):
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout,
        )
        out = result.stdout
        if result.stderr:
            out += result.stderr
        return out, result.returncode
    except subprocess.TimeoutExpired:
        return f"[timed out after {timeout}s]", 124
    except Exception as e:
        return f"[error: {e}]", 1


# ── Rendering ──────────────────────────────────────────────────────────────────

SCALE = 3        # supersampling factor — render at 3× then downsample


def render(lines, title="Terminal", cmd_line=None, font_size=14,
           max_cols=220, max_rows=600, padding=20, exit_code=None):
    """
    Render lines of terminal text to a PIL Image.
    All coordinates are in logical pixels; actual canvas is SCALE× larger.
    """
    # Logical sizes
    TITLE_H   = 42       # title bar height
    DOT_R     = 7        # traffic light radius
    DOT_PAD   = 18       # left padding to first dot
    DOT_SPACE = 20       # centre-to-centre
    SEP_H     = 1        # separator line height
    LINE_H    = int(font_size * 1.55)   # generous line height
    MIN_W     = 620

    # Scale-up sizes for rendering
    S = SCALE
    sf = font_size * S
    font      = find_font(FONT_CANDIDATES,      sf)
    font_bold = find_font(FONT_BOLD_CANDIDATES, sf)

    # Measure character cell using a reference string
    _probe = Image.new("RGB", (1, 1))
    _d = ImageDraw.Draw(_probe)
    ref_bbox = _d.textbbox((0, 0), "W" * 10, font=font)
    char_w_s = (ref_bbox[2] - ref_bbox[0]) / 10   # width at scale
    ref_h    = _d.textbbox((0, 0), "Wgy", font=font)
    char_h_s = ref_h[3] - ref_h[1]                # height at scale (incl. descenders)

    # Figure out canvas width from longest line
    lines = lines[:max_rows]
    stripped = [strip_ansi(l).rstrip() for l in lines]
    max_chars = max((len(l) for l in stripped), default=40)
    max_chars = min(max_chars, max_cols)

    pad_s      = padding * S
    content_w  = max(int(max_chars * char_w_s) + pad_s * 2, MIN_W * S)
    content_h  = len(lines) * (LINE_H * S) + pad_s * 2
    title_h_s  = TITLE_H * S
    sep_h_s    = SEP_H * S

    canvas_w = content_w
    canvas_h = title_h_s + sep_h_s + content_h

    img  = Image.new("RGB", (canvas_w, canvas_h), THEME["bg"])
    draw = ImageDraw.Draw(img)

    # ── Title bar ────────────────────────────────────────────────────────────
    draw.rectangle([0, 0, canvas_w - 1, title_h_s - 1], fill=THEME["title_bar"])

    # Separator line
    draw.rectangle(
        [0, title_h_s, canvas_w - 1, title_h_s + sep_h_s - 1],
        fill=THEME["title_sep"]
    )

    dot_y_s    = title_h_s // 2
    dot_r_s    = DOT_R * S
    dot_pad_s  = DOT_PAD * S
    dot_gap_s  = DOT_SPACE * S

    for i, color_key in enumerate(["dot_red", "dot_yellow", "dot_green"]):
        cx = dot_pad_s + i * dot_gap_s
        r  = dot_r_s
        # Inner colour
        draw.ellipse([cx - r, dot_y_s - r, cx + r, dot_y_s + r],
                     fill=THEME[color_key])
        # 1-pixel dark ring for depth
        draw.ellipse([cx - r, dot_y_s - r, cx + r, dot_y_s + r],
                     outline=(0, 0, 0, 60))

    # Title text — truncate if too long
    title_text = title or "Terminal"
    max_title_px = canvas_w - (dot_pad_s + 3 * dot_gap_s + dot_r_s) * 2
    title_font = find_font(FONT_BOLD_CANDIDATES, sf - S)   # slightly smaller bold
    while title_text:
        tbbox = draw.textbbox((0, 0), title_text, font=title_font)
        tw = tbbox[2] - tbbox[0]
        th = tbbox[3] - tbbox[1]
        if tw <= max_title_px or len(title_text) < 4:
            break
        title_text = title_text[:-4] + "…"

    tx = (canvas_w - tw) // 2
    ty = dot_y_s - th // 2
    draw.text((tx, ty), title_text, font=title_font, fill=THEME["title_text"])

    # ── Content area ─────────────────────────────────────────────────────────
    y = title_h_s + sep_h_s + pad_s
    line_h_s = LINE_H * S

    for line_idx, line in enumerate(lines):
        # Special treatment for the command line (first line, starts with $ )
        is_cmd_line = (line_idx == 0 and line.startswith("$ "))

        spans = parse_ansi_spans(line)
        x = pad_s

        if is_cmd_line:
            # Render the prompt sign in green, rest in bright white
            dollar, rest = ("$ ", line[2:]) if line.startswith("$ ") else ("", line)
            if dollar:
                draw.text((x, y), dollar, font=font_bold, fill=THEME["prompt_sign"])
                bb = draw.textbbox((x, y), dollar, font=font_bold)
                x = bb[2]
            draw.text((x, y), rest, font=font_bold, fill=THEME["prompt_cmd"])
            y += line_h_s
            continue

        # Normal line — render span by span
        for text, fg, bg, bold in spans:
            if not text:
                continue
            f = font_bold if bold else font
            fill = fg or THEME["text"]

            if bg:
                bb = draw.textbbox((x, y), text, font=f)
                draw.rectangle([bb[0], y, bb[2], y + char_h_s], fill=bg)

            draw.text((x, y), text, font=f, fill=fill)
            bb = draw.textbbox((x, y), text, font=f)
            x = bb[2]

        y += line_h_s

    # ── Exit code badge ───────────────────────────────────────────────────────
    if exit_code is not None and exit_code != 0:
        badge_text = f" exit {exit_code} "
        badge_font = find_font(FONT_BOLD_CANDIDATES, int(sf * 0.75))
        bb = draw.textbbox((0, 0), badge_text, font=badge_font)
        bw, bh = bb[2] - bb[0] + S * 4, bb[3] - bb[1] + S * 4
        bx = canvas_w - bw - pad_s // 2
        by = title_h_s + sep_h_s + S * 6
        draw.rounded_rectangle([bx, by, bx + bw, by + bh],
                                radius=S * 4, fill=THEME["error"])
        draw.text((bx + S * 2, by + S * 2), badge_text,
                  font=badge_font, fill=(255, 255, 255))

    # ── Downsample 3× → 1× with LANCZOS ─────────────────────────────────────
    out_w = canvas_w // S
    out_h = canvas_h // S
    result = img.resize((out_w, out_h), Image.LANCZOS)

    # ── Subtle outer shadow (post-downsample) ────────────────────────────────
    shadow_size = 6
    shadow = Image.new("RGB", (out_w + shadow_size * 2, out_h + shadow_size * 2),
                       (14, 14, 16))
    shadow.paste(result, (shadow_size, shadow_size))

    return shadow


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cmd",       help="Shell command to run and capture")
    parser.add_argument("--input",     help="Read output from a file instead")
    parser.add_argument("--title",     default="", help="Title bar label")
    parser.add_argument("--output",    required=True, help="Output PNG path")
    parser.add_argument("--font-size", type=int, default=14,
                        help="Logical font size in points (default 14)")
    parser.add_argument("--timeout",   type=int, default=30)
    args = parser.parse_args()

    if args.cmd:
        title = args.title or f"$ {args.cmd}"
        raw_output, rc = run_command(args.cmd, args.timeout)
        prefix = f"$ {args.cmd}\n"
        full_text = prefix + raw_output.rstrip()
    elif args.input:
        title = args.title or Path(args.input).stem
        full_text = Path(args.input).read_text(errors="replace").rstrip()
        rc = None
    else:
        title = args.title or "Terminal"
        full_text = sys.stdin.read().rstrip()
        rc = None

    # Expand tabs and strip non-printable control chars (except ANSI escapes)
    clean = []
    for line in full_text.splitlines():
        # Expand tabs to 8-space stops
        line = line.expandtabs(8)
        # Remove control chars other than ESC (used in ANSI sequences)
        line = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1a\x1c-\x1f\x7f]', '', line)
        clean.append(line)
    lines = clean
    img = render(lines, title=title, font_size=args.font_size,
                 exit_code=rc if args.cmd else None)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    img.save(args.output, "PNG", optimize=True)
    print(args.output)


if __name__ == "__main__":
    main()
