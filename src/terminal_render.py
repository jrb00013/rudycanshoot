#!/usr/bin/env python3
"""
Render terminal command output as a styled PNG.

Usage:
  python3 terminal_render.py --cmd "v4l2-ctl --list-devices" --output out.png
  python3 terminal_render.py --input output.txt --title "boson test" --output out.png

Produces a dark-background terminal screenshot image with a colored title bar.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
    "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
]

THEME = {
    "bg": (30, 30, 30),
    "bar": (45, 45, 45),
    "bar_text": (200, 200, 200),
    "prompt": (80, 200, 120),
    "text": (220, 220, 220),
    "error": (255, 100, 100),
    "warn": (255, 200, 80),
    "comment": (128, 128, 128),
    "dot_red": (255, 90, 90),
    "dot_yellow": (255, 200, 60),
    "dot_green": (80, 200, 80),
}

ANSI_COLOR_MAP = {
    30: (0, 0, 0), 31: (205, 49, 49), 32: (13, 188, 121),
    33: (229, 229, 16), 34: (36, 114, 200), 35: (188, 63, 188),
    36: (17, 168, 205), 37: (229, 229, 229),
    90: (102, 102, 102), 91: (241, 76, 76), 92: (35, 209, 139),
    93: (245, 245, 67), 94: (59, 142, 234), 95: (214, 112, 214),
    96: (41, 184, 219), 97: (229, 229, 229),
}

ANSI_RE = re.compile(r"\x1b\[([0-9;]*)m")


def load_font(size=14):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def strip_ansi(text):
    return ANSI_RE.sub("", text)


def parse_ansi_spans(line):
    """Parse a line into [(text, color)] spans."""
    spans = []
    current_color = None
    last = 0
    for m in ANSI_RE.finditer(line):
        if m.start() > last:
            spans.append((line[last:m.start()], current_color))
        codes = [int(c) for c in m.group(1).split(";") if c] if m.group(1) else [0]
        for code in codes:
            if code == 0:
                current_color = None
            elif code in ANSI_COLOR_MAP:
                current_color = ANSI_COLOR_MAP[code]
        last = m.end()
    if last < len(line):
        spans.append((line[last:], current_color))
    return spans


def run_command(cmd, timeout=30):
    """Run a shell command, return (stdout+stderr, exit_code)."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = result.stdout
        if result.stderr:
            output += result.stderr
        return output, result.returncode
    except subprocess.TimeoutExpired:
        return f"[command timed out after {timeout}s]", 124
    except Exception as e:
        return f"[error: {e}]", 1


def render(lines, title="", prompt="", font_size=14, max_cols=200, max_rows=500, padding=16):
    font = load_font(font_size)

    # Measure a single character (monospace)
    sample = Image.new("RGB", (1, 1))
    d = ImageDraw.Draw(sample)
    bbox = d.textbbox((0, 0), "M", font=font)
    char_w = bbox[2] - bbox[0]
    char_h = bbox[3] - bbox[1] + 3  # line spacing

    title_bar_h = char_h + 16
    dot_r = 6
    dot_y = title_bar_h // 2

    # Truncate
    lines = lines[:max_rows]
    stripped = [strip_ansi(l).rstrip() for l in lines]
    max_line_len = max((len(l) for l in stripped), default=40)
    max_line_len = min(max_line_len, max_cols)

    content_w = max(max_line_len * char_w + padding * 2, 500)
    content_h = len(lines) * char_h + padding * 2

    img_w = content_w
    img_h = title_bar_h + content_h

    img = Image.new("RGB", (img_w, img_h), THEME["bg"])
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle([0, 0, img_w, title_bar_h], fill=THEME["bar"])

    # Traffic light dots
    for i, color_key in enumerate(["dot_red", "dot_yellow", "dot_green"]):
        cx = padding + i * (dot_r * 2 + 6)
        draw.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r], fill=THEME[color_key])

    # Title text
    title_text = title or "Terminal"
    tbbox = draw.textbbox((0, 0), title_text, font=font)
    title_x = (img_w - (tbbox[2] - tbbox[0])) // 2
    draw.text((title_x, dot_y - (tbbox[3] - tbbox[1]) // 2), title_text, font=font, fill=THEME["bar_text"])

    # Content
    y = title_bar_h + padding
    for line in lines:
        spans = parse_ansi_spans(line)
        x = padding
        for text, color in spans:
            if not text:
                continue
            fill = color or THEME["text"]
            draw.text((x, y), text, font=font, fill=fill)
            tbbox = draw.textbbox((x, y), text, font=font)
            x = tbbox[2]
        y += char_h

    return img


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cmd", help="Shell command to run and capture")
    parser.add_argument("--input", help="Read output from a file instead of running a command")
    parser.add_argument("--title", default="", help="Title bar label")
    parser.add_argument("--prompt", default="", help="Prompt prefix to prepend in title")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument("--font-size", type=int, default=13)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    if args.cmd:
        title = args.title or f"$ {args.cmd}"
        raw_output, rc = run_command(args.cmd, args.timeout)
        prefix = f"$ {args.cmd}\n"
        full_text = prefix + raw_output
        if rc != 0:
            full_text += f"\n[exit {rc}]"
    elif args.input:
        title = args.title or Path(args.input).stem
        full_text = Path(args.input).read_text(errors="replace")
    else:
        title = args.title or "stdin"
        full_text = sys.stdin.read()

    lines = full_text.splitlines()
    img = render(lines, title=title, font_size=args.font_size)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    img.save(args.output, "PNG")
    print(args.output)


if __name__ == "__main__":
    main()
