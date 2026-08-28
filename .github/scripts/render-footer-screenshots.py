import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ANSI_PATTERN = re.compile(r"\x1b\[([0-9;]*)m")
BACKGROUND = "#111318"
DEFAULT_TEXT = "#c8ccd4"
FONT_PATH = next(
    path
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
    )
    if Path(path).exists()
)
STATE_TITLES = {
    "idle": "Idle",
    "active": "Active run",
    "complete": "Completed run",
}


def parse_segments(line: str):
    color = DEFAULT_TEXT
    position = 0
    for match in ANSI_PATTERN.finditer(line):
        if match.start() > position:
            yield line[position : match.start()], color

        codes = [int(code) for code in match.group(1).split(";") if code]
        if not codes or codes == [0]:
            color = DEFAULT_TEXT
        elif len(codes) >= 5 and codes[:2] == [38, 2]:
            color = f"#{codes[2]:02x}{codes[3]:02x}{codes[4]:02x}"
        position = match.end()

    if position < len(line):
        yield line[position:], color


def render_state(output_directory: Path, state: str, lines: list[str], pi_version: str):
    font = ImageFont.truetype(FONT_PATH, 18)
    title_font = ImageFont.truetype(FONT_PATH, 16)
    padding = 20
    width = 1100
    line_height = 29
    body_top = 82
    height = body_top + len(lines) * line_height + padding

    image = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.text(
        (padding, padding),
        f"Pi {pi_version} — pi-timer — {STATE_TITLES[state]}",
        font=title_font,
        fill="#9ca3af",
    )
    draw.line((padding, 60, width - padding, 60), fill="#5f7480", width=1)

    for row, line in enumerate(lines):
        x = padding
        y = body_top + row * line_height
        for text, color in parse_segments(line):
            draw.text((x, y), text, font=font, fill=color)
            x += draw.textlength(text, font=font)

    image.save(output_directory / f"footer-{state}.png", format="PNG", optimize=True)


def main():
    output_directory = Path(sys.argv[1] if len(sys.argv) > 1 else ".artifacts/footer")
    data = json.loads((output_directory / "footer-states.json").read_text())
    for state, lines in data["states"].items():
        render_state(output_directory, state, lines, data["piVersion"])


if __name__ == "__main__":
    main()
