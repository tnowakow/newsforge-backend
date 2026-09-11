#!/usr/bin/env python3
"""Generate 5 layout-variant proof HTMLs (Letter, 8.5x11 inner spread = 17x11 page
in a 2-up spread view; we render a single 17in x 11in canvas at 144px/in).
Each variant is specified WITHOUT a birthday roster and WITHOUT a director headshot.
Placeholder photos are neutral SVG gradients (no client data).
"""
import os, json

OUT = os.path.dirname(__file__)
W, H = 2448, 1584  # 17in x 11in @ 144dpi

INK = "#2b2a28"
PAPER = "#faf7f2"
NAVY = "#1f3a5f"
CORAL = "#c65b4e"
SKY = "#dfe8ef"
CREAM = "#f3ead8"
SUN = "#e8c66b"
BERRY = "#8a3b52"
LEAF = "#7d9471"
RULE = "#d8d2c6"

def photo(w, h, tint1, tint2, label=""):
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<defs><linearGradient id="g{w}{h}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{tint1}"/><stop offset="1" stop-color="{tint2}"/></linearGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g{w}{h})"/>'
            f'<rect x="0" y="{h-2}" width="{w}" height="2" fill="rgba(0,0,0,0.15)"/>'
            f'</svg>')

def box(x, y, w, h, bg, radius=0):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
            f'background:{bg};border-radius:{radius}px;"></div>')

def head(x, y, w, text, size=30, color=INK, weight=800, font="Source Sans 3"):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;'
            f'font-family:\'Source Sans 3\',sans-serif;font-size:{size}px;font-weight:{weight};'
            f'color:{color};line-height:1.05;letter-spacing:-0.01em;">{text}</div>')

def para(x, y, w, lines, size=17, color=INK, lead="EB Garamond", gap=6):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;'
            f'font-family:\'{lead}\',Georgia,serif;font-size:{size}px;color:{color};'
            f'line-height:1.42;">{lines}</div>')

def rule(x, y, w, color=RULE):
    return f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:1px;background:{color};"></div>'

def footer_band(x, y, w, h, items):
    cells = "".join(
        f'<div style="flex:1;padding:14px 20px;border-right:1px solid rgba(255,255,255,0.25);">'
        f'<div style="font-family:\'Source Sans 3\',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.75;">{k}</div>'
        f'<div style="font-family:\'EB Garamond\',serif;font-size:19px;margin-top:4px;">{v}</div></div>'
        for k, v in items)
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;'
            f'background:{NAVY};color:#f5f1e8;display:flex;align-items:center;">{cells}</div>')

def rail(x, y, w, h, title, rows, bg, titlecolor):
    rr = "".join(
        f'<div style="display:flex;justify-content:space-between;padding:9px 16px;border-bottom:1px solid rgba(0,0,0,0.08);">'
        f'<span style="font-family:\'EB Garamond\',serif;font-size:18px;">{a}</span>'
        f'<span style="font-family:\'Source Sans 3\',sans-serif;font-size:15px;font-weight:700;opacity:0.8;">{b}</span></div>'
        for a, b in rows)
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};overflow:hidden;">'
            f'<div style="padding:16px 16px 10px;font-family:\'Source Sans 3\',sans-serif;font-size:14px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:{titlecolor};">{title}</div>{rr}</div>')

PAGE = {"width": W, "height": H}

def doc(title, body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<style>@font-face src none; body{{margin:0;background:#3a3a3a;}}
.spread{{width:{W}px;height:{H}px;position:relative;background:{PAPER};overflow:hidden;}}
</style></head><body><div class="spread">{body}</div></body></html>"""

# ---------------------------------------------------------------- sparse (anchor 14)
def sparse():
    b = []
    b.append(box(0, 0, W, H, PAPER))
    b.append(rule(96, 150, W-192))
    b.append(head(96, 64, 700, "A QUIET SUMMER AT PORTER ONE", 44, NAVY))
    b.append(para(96, 180, 520,
        "The weeks slowed as the courtyard orchard began its late blush. "
        "Residents gathered in the east conservatory for long-morning coffee, "
        "while the garden path was re-staked after the first warm rain.", 19))
    b.append(para(96, 340, 520,
        "A handful of notes from the month: the new reading circle finished its "
        "first novel together, two residents completed their watercolor course, "
        "and the kitchen began its first seasonal pastry series on Saturday.", 19))
    # hero rail photo on the right, full height
    b.append(photo(760, 1180, "#c9d6c4", "#8fa789", ).replace('<svg', '<svg style="position:absolute;left:1580px;top:200px;"'))
    b.append(head(96, 1180, 520, "From the garden", 22, CORAL))
    b.append(para(96, 1230, 520,
        "Lettuce starts were set in the raised beds and the climbing beans were "
        "given fresh stakes. Expect the first salad boxes to reach tables by late July.", 18))
    b.append(footer_band(0, H-150, W, 150, [
        ("VISITING HOURS", "Daily 8:00–8:00"),
        ("CHAPLAIN", "Wed & Sat 10:00"),
        ("KITCHEN NOTES", "Saturday pastry series"),
        ("FAMILY CONTACT", "Front desk, ext. 100"),
    ]))
    return doc("sparse-editorial", "".join(b))

# ---------------------------------------------------------------- medium (anchor 02)
def medium():
    b = []
    b.append(box(0, 0, W, H, PAPER))
    b.append(rule(96, 150, W-192))
    b.append(head(96, 58, 900, "PORTER ONE — SUMMER ISSUE", 40, NAVY))
    # left column: 2 feature stories
    b.append(head(96, 190, 430, "Conservatory mornings become the week's anchor", 24, INK))
    b.append(para(96, 260, 430,
        "Coffee service moved into the east conservatory on a trial basis, and the "
        "quiet of the space has drawn a steady crowd before nine. Staff are adding a "
        "second pour-over station and a small shelf of resident-owned paperbacks.", 17))
    b.append(head(96, 480, 430, "Watercolor course completes its first cohort", 24, INK))
    b.append(para(96, 550, 430,
        "Six residents finished their final studies this month, and a small exhibit "
        "runs in the lobby through the end of the season. The class returns in "
        "September with a new set of reference materials.", 17))
    # middle column: photo stack
    b.append(photo(520, 330, "#d7c9b4", "#a8927a").replace('<svg', '<svg style="position:absolute;left:580px;top:190px;"'))
    b.append(photo(520, 330, "#c9d6c4", "#8fa789").replace('<svg', '<svg style="position:absolute;left:580px;top:550px;"'))
    b.append(photo(520, 330, "#dfe8ef", "#9fb6c9").replace('<svg', '<svg style="position:absolute;left:580px;top:910px;"'))
    # right: dated events rail (no birthdays)
    b.append(rail(1180, 190, 460, 980, "On the calendar", [
        ("Thu 18", "Patio concert, 5:00"),
        ("Fri 19", "Arts & crafts, 1:30"),
        ("Sat 20", "Family brunch, 11:00"),
        ("Mon 22", "Movie matinee, 2:00"),
        ("Wed 24", "Walking club, 9:30"),
        ("Thu 25", "Book circle, 4:00"),
        ("Fri 26", "Serenity circle, 3:30"),
        ("Sat 27", "Guest speaker, 12:00"),
        ("Mon 29", "Yoga on the lawn, 10:00"),
        ("Wed 31", "Season close, 5:00"),
    ], CREAM, CORAL))
    b.append(footer_band(0, H-150, W, 150, [
        ("CHAPLAIN", "Wed & Sat 10:00"),
        ("VISITING", "Daily 8:00–8:00"),
        ("KITCHEN", "Saturday pastry series"),
        ("FAMILY", "Front desk, ext. 100"),
    ]))
    return doc("medium-panel", "".join(b))

# ---------------------------------------------------------------- dense (anchor 11)
def dense():
    b = []
    b.append(box(0, 0, W, H, PAPER))
    # 6-photo mosaic in the center band
    cols = [
        (96, 200, "#d7c9b4", "#a8927a"),
        (460, 200, "#c9d6c4", "#8fa789"),
        (824, 200, "#dfe8ef", "#9fb6c9"),
        (1188, 200, "#e8d9c5", "#c0a17e"),
        (1552, 200, "#d9cfc0", "#a89a86"),
        (1916, 200, "#e6d9dc", "#b58f97"),
    ]
    for x, y, t1, t2 in cols:
        b.append(photo(320, 300, t1, t2).replace('<svg', f'<svg style="position:absolute;left:{x}px;top:{y}px;"'))
    # 3 feature stories across the lower half
    stories = [
        ("Reading circle finishes its first novel", "The twelve-person circle finished its first book together and is already voting on the next. The class now meets on Thursday afternoons in the east conservatory."),
        ("Garden path re-staked after the rains", "The garden volunteers completed the re-staking of the east path, and the first salad boxes will reach tables by late July. Expect the new raised beds to be in service by mid-season."),
        ("Kitchen begins its seasonal pastry series", "The kitchen launched its Saturday pastry series this month, with a short list rotating each week. Residents can reserve a table at the front desk the day before."),
    ]
    xs = [96, 900, 1608]
    for i, (t, p) in enumerate(stories):
        b.append(head(xs[i], 560, 700, t, 24, INK))
        b.append(para(xs[i], 630, 700, p, 17))
    # lower: 3 narrow info panels + dated rail (no birthdays)
    b.append(box(96, 830, 460, 420, SKY))
    b.append(head(116, 850, 420, "VISITING & CHAPEL", 18, NAVY))
    b.append(para(116, 900, 420, "Chapel Wed & Sat 10:00. Family visits daily 8:00–8:00, no appointment required. The front desk can arrange a walk-through at any time.", 16))
    b.append(box(620, 830, 460, 420, CREAM))
    b.append(head(640, 850, 420, "ON THE CALENDAR", 18, CORAL))
    for i, row in enumerate([("Thu 18", "Patio concert 5:00"), ("Sat 20", "Family brunch 11:00"), ("Mon 22", "Movie matinee 2:00"), ("Wed 24", "Walking club 9:30")]):
        b.append(head(640, 900 + i*40, 240, row[0], 15, INK, 700))
        b.append(head(860, 900 + i*40, 220, row[1], 15, INK, 400, "EB Garamond"))
    b.append(box(1144, 830, 460, 420, "#efe7da"))
    b.append(head(1164, 850, 420, "KITCHEN NOTES", 18, BERRY))
    b.append(para(1164, 900, 420, "Saturday pastry series now open. The short list rotates weekly; reserve a table the day before at the front desk. Seasonal menus continue on the first and third Sundays.", 16))
    b.append(footer_band(0, H-150, W, 150, [
        ("VISITING HOURS", "Daily 8:00–8:00"),
        ("CHAPLAIN", "Wed & Sat 10:00"),
        ("KITCHEN NOTES", "Saturday pastry series"),
        ("FAMILY CONTACT", "Front desk, ext. 100"),
    ]))
    return doc("dense-grid", "".join(b))

# ---------------------------------------------------------------- long-copy (anchor 18)
def longcopy():
    b = []
    b.append(box(0, 0, W, H, PAPER))
    b.append(rule(96, 150, W-192))
    b.append(head(96, 58, 1200, "A LONGER LOOK AT THE SUMMER SO FAR", 40, NAVY))
    b.append(para(96, 190, 1050,
        "The season has moved at a different pace than last year's. The mornings in "
        "the east conservatory have drawn a steady crowd before nine, and the coffee "
        "service that began as a trial has become a fixture. Residents who joined in "
        "the first week have brought friends; those who arrived later have settled "
        "into a rhythm of their own. The quiet of the space — which is what most "
        "of them came for — has not been lost, even as the room fills.", 19, INK))
    b.append(photo(620, 500, "#d7c9b4", "#a8927a").replace('<svg', '<svg style="position:absolute;left:1250px;top:190px;"'))
    b.append(head(96, 660, 1050, "What changed, and what held", 26, INK))
    b.append(para(96, 730, 1050,
        "The garden path was re-staked after the first warm rain, and the climbing "
        "beans got fresh stakes. The reading circle finished its first novel together "
        "and is already voting on the next. The watercolor class completed its first "
        "cohort, and a small exhibit runs in the lobby through the end of the season. "
        "The kitchen began its first seasonal pastry series on Saturday, with a short "
        "list rotating each week. None of these things are large; together they make "
        "the week feel more full, which is the point.", 19))
    b.append(para(96, 980, 1050,
        "Visiting patterns have shifted as well. The long midday visits that marked "
        "the early spring have given way to shorter, more frequent ones — an hour on "
        "a weekday, a longer stay on a weekend. The front desk has adjusted its "
        "scheduling to match, and the family contact line has been extended into the "
        "evening on Thursdays, which is the night most people call.", 19))
    b.append(footer_band(0, H-150, W, 150, [
        ("VISITING HOURS", "Daily 8:00–8:00"),
        ("CHAPLAIN", "Wed & Sat 10:00"),
        ("KITCHEN NOTES", "Saturday pastry series"),
        ("FAMILY CONTACT", "Front desk, ext. 100"),
    ]))
    return doc("long-copy-feature", "".join(b))

# ---------------------------------------------------------------- photo-heavy (anchor 05)
def photoheavy():
    b = []
    b.append(box(0, 0, W, H, PAPER))
    b.append(head(96, 60, 900, "PORTER ONE — PHOTO ISSUE", 36, NAVY))
    b.append(para(96, 130, 500,
        "A look at the season through the residents' own cameras and the staff "
        "photo file. No captions, no schedules — just the week, frame by frame.", 17))
    # 12-tile mosaic
    grid = [
        (96, 220, 560, 400, "#d7c9b4", "#a8927a"),
        (700, 220, 380, 400, "#c9d6c4", "#8fa789"),
        (1124, 220, 380, 400, "#dfe8ef", "#9fb6c9"),
        (1548, 220, 380, 400, "#e8d9c5", "#c0a17e"),
        (1972, 220, 380, 400, "#d9cfc0", "#a89a86"),
        (96, 660, 380, 400, "#e6d9dc", "#b58f97"),
        (520, 660, 380, 400, "#cfd8c8", "#8a9c7e"),
        (944, 660, 380, 400, "#d7c9b4", "#a8927a"),
        (1368, 660, 380, 400, "#dfe8ef", "#9fb6c9"),
        (1792, 660, 560, 400, "#e8d9c5", "#c0a17e"),
    ]
    for x, y, w, h, t1, t2 in grid:
        b.append(photo(w, h, t1, t2).replace('<svg', f'<svg style="position:absolute;left:{x}px;top:{y}px;"'))
    # bottom: one full-width photo + small caption strip
    b.append(photo(2256, 340, "#c9d6c4", "#7d9471").replace('<svg', '<svg style="position:absolute;left:96px;top:1100px;"'))
    b.append(para(96, 1460, 1100,
        "The courtyard orchard in late June. The staff photo file continues to "
        "rotate each week; ask the front desk to see the current set.", 16, INK))
    return doc("photo-heavy", "".join(b))

os.makedirs(OUT, exist_ok=True)
for name, fn in [("sparse-editorial", sparse), ("medium-panel", medium),
                 ("dense-grid", dense), ("long-copy-feature", longcopy),
                 ("photo-heavy", photoheavy)]:
    path = os.path.join(OUT, f"{name}.html")
    with open(path, "w") as f:
        f.write(fn())
    print("wrote", path)
