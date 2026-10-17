"""Builds the ResponseCompass pitch deck as .pptx and a matching .pdf from one spec.

The architecture diagram uses native PowerPoint shapes; every arrow is a connector glued
to connection sites on its two nodes (a:stCxn / a:endCxn), so moving a node in PowerPoint
keeps the arrow attached. The PDF is drawn from the same geometry with reportlab; for a
pixel-exact PDF, export the .pptx from PowerPoint ("Save as PDF").

Run: PYTHONPATH=.cache/pylib python3 docs/submission/build/build-deck.py
"""
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT_PPTX = ROOT / "ResponseCompass-deck.pptx"
OUT_PDF = ROOT / "ResponseCompass-deck.pdf"

W, H = 13.333, 7.5
NAVY, INK, MUTED, TEAL, TEAL_SOFT, AMBER, LINE, BG, WHITE = (
    "16213E", "1F2937", "5B6474", "0F8B8D", "E3F4F4", "D98A1C", "C9CED8", "F7F8FA", "FFFFFF")
FONT = "Inter"

# ---------------------------------------------------------------------------
# Slide spec. Coordinates are inches from the top-left corner.
# ---------------------------------------------------------------------------

def title(text, sub=None):
    items = [("text", dict(x=0.6, y=0.45, w=12.1, h=0.8, text=text, size=32, bold=True, color=NAVY))]
    if sub:
        items.append(("text", dict(x=0.6, y=1.15, w=12.1, h=0.5, text=sub, size=16, color=MUTED)))
    return items


def bullets(x, y, w, h, lines, size=19):
    return [("bullets", dict(x=x, y=y, w=w, h=h, lines=lines, size=size))]


def image(name, x, y, w=None, h=None):
    return [("image", dict(path=str(ASSETS / name), x=x, y=y, w=w, h=h))]


# Architecture diagram: nodes (id, label, sublabel, x, y, w, h, kind) and directed edges.
NODES = [
    ("clock", "Simulation clock", "persistent, pausable", 0.45, 1.75, 2.05, 0.72, "code"),
    ("sched", "Scheduler", "one-shot, restart-safe", 0.45, 2.95, 2.05, 0.72, "code"),
    ("planner", "Event planner", "AMD Token Factory", 3.1, 1.75, 2.05, 0.72, "model"),
    ("fallback", "Fallback planner", "deterministic, API-free", 3.1, 2.95, 2.05, 0.72, "code"),
    ("validator", "Validator", "schema + facts", 5.75, 2.35, 2.05, 0.72, "code"),
    ("state", "Canonical state", "persistent store, audit trail", 5.5, 3.65, 2.55, 0.95, "store"),
    ("override", "Central command", "override pending dispatch", 9.0, 2.35, 2.55, 0.72, "human"),
    ("ui", "Live Floor & Analytics", "UI, fixed snapshots", 9.0, 3.79, 2.55, 0.72, "code"),
    ("resolution", "Resolution engine", "hidden skill → outcome", 9.0, 5.2, 2.55, 0.72, "code"),
    ("context", "Context engine", "eligibility, travel, history", 5.75, 5.2, 2.05, 0.72, "code"),
    ("compass", "Compass", "AMD Token Factory: ranks", 3.1, 4.85, 2.05, 0.72, "model"),
    ("baselines", "Baselines", "nearest + naive score", 3.1, 6.0, 2.05, 0.72, "code"),
    ("dispatch", "Dispatch", "ranked offer queue", 0.45, 5.4, 2.05, 0.72, "code"),
    ("responders", "Responders", "accept or reject", 0.45, 4.2, 2.05, 0.72, "human"),
]
EDGES = [
    ("clock", "sched"), ("sched", "planner"), ("sched", "fallback"),
    ("planner", "validator"), ("fallback", "validator"), ("validator", "state"),
    ("override", "state"), ("state", "ui"), ("resolution", "state"),
    ("state", "context"), ("context", "compass"), ("context", "baselines"),
    ("compass", "dispatch"), ("baselines", "dispatch"), ("dispatch", "responders"),
    ("responders", "state"),
]
NODE_STYLE = {  # fill, border, title colour, sub colour
    "code": (WHITE, NAVY, NAVY, MUTED),
    "model": (TEAL, TEAL, WHITE, "E6FFFF"),
    "store": (NAVY, NAVY, WHITE, "C9D3EA"),
    "human": (WHITE, AMBER, INK, MUTED),
}


def diagram():
    return [("diagram", dict(nodes=NODES, edges=EDGES)),
            ("legend", dict(x=9.0, y=6.3))]


SLIDES = [
    dict(kind="cover", items=[
        ("rect", dict(x=0, y=0, w=W, h=H, fill=BG)),
        ("rect", dict(x=0.6, y=2.0, w=0.12, h=2.6, fill=TEAL)),
        ("text", dict(x=1.0, y=1.95, w=7.4, h=1.1, text="ResponseCompass", size=50, bold=True, color=NAVY)),
        ("text", dict(x=1.0, y=3.2, w=7.4, h=0.5, text="The right responder. The right fix.", size=24, color=TEAL, bold=True)),
        ("text", dict(x=1.0, y=3.75, w=7.4, h=0.5, text="Learned from every past repair.", size=24, color=MUTED)),
        ("text", dict(x=1.0, y=5.3, w=7.4, h=0.8, text="An AI dispatch agent for operations control rooms, built on AMD Token Factory.", size=16, color=INK)),
        *image("live-floor.png", 8.75, 1.65, w=4.2),
        ("text", dict(x=8.75, y=4.15, w=4.2, h=0.4, text="Live Floor, simulated plant e8-aura-p1", size=11, color=MUTED)),
    ], notes="ResponseCompass is a dispatch agent for operations control rooms, built on AMD Token Factory. "
             "The tagline is the product vision: responder ranking is built today; recommending the fix from "
             "past repairs is the next step (last slide). Say so when presenting this slide."),

    dict(items=[*title("The problem"), *bullets(0.6, 1.6, 12.1, 4.8, [
        "When equipment fails, **closest** or **free** may be an incomplete answer.",
        "The nearest technician may never have fixed this kind of fault.",
        "A poor match can mean downtime, a reopened issue or another trip.",
        "Who fixes what, and how, lives in people's heads and old tickets.",
    ], size=24)], notes="Proximity is easy to compute and easy to defend, but it ignores fit. What matters is who is "
                        "likely to resolve this class of issue on the first attempt, given where everyone is and what they "
                        "are already doing."),

    dict(items=[*title("What ResponseCompass does"), *bullets(0.6, 1.55, 5.6, 5.4, [
        "For every new issue, Compass **ranks the eligible responders** and explains the tradeoffs.",
        "Offers go out automatically; responders accept or reject; complex work can get a second responder.",
        "Central command can override a pending dispatch; every step is audited.",
        "Each issue carries a **response action**; recommending fixes from past repairs is **planned**.",
    ], size=18), *image("live-floor.png", 6.5, 1.6, w=6.35)],
        notes="Compass does not replace the operator. It proposes a ranked shortlist with reasons, and the system "
              "dispatches automatically with a human able to step in."),

    dict(items=[*title("Code owns the facts. Models only rank.",
                       "Application code owns time, facts, eligibility, baselines and every mutation; models only propose."),
                *diagram()],
         notes="The ranker receives application-owned evidence and ranks only the eligible candidates it is given. "
               "The planner proposes synthetic incidents; code validates every proposal and owns all mutations. "
               "If a model is slow, rate-limited or returns invalid output, the deterministic fallback takes over, "
               "so dispatch continues."),

    dict(items=[*title("Honest by design"), *bullets(0.6, 1.6, 12.1, 5.2, [
        "Each responder's **true skill is hidden** simulation truth: no model, UI or analytics sees it.",
        "Outcomes are simulated from that hidden skill, independently of what the model claims.",
        "Two transparent baselines (nearest, naive score) run alongside; disagreements are flagged.",
        "Analytics show denominators, suppress thin samples and are not an employee leaderboard.",
        "Excluded from ranking: pay, seniority, demographics, fatigue, HR data.",
    ], size=21)], notes="We wanted the demo to be able to show Compass being wrong as well as right. Hidden truth plus "
                        "baselines make its choices inspectable. Disagreement alone does not prove better outcomes."),

    dict(items=[*title("Built on AMD Token Factory"), *bullets(0.6, 1.6, 7.4, 5.2, [
        "OpenAI-compatible API, JSON output; our validators are the contract.",
        "Default model **MiMo-V2.6-Flash**; ranking and event planner can use different models.",
        "Local budget: 10 requests/min, 2 concurrent; bounded 429 retries; circuit breaker.",
        "Recorded MiMo check: **9/10** valid rankings, **10/10** valid event plans.",
        "Ranking deadline 90 s; model calls never hold the simulation clock.",
    ], size=18), *image("settings-models.png", 8.55, 1.5, h=5.4)],
        notes="We measured several Token Factory models on the same scenario and chose the default per role from "
              "the data. These are small-sample validity results (10 samples, 60 s ranking / 30 s planner timeouts), "
              "not outcome accuracy or uptime guarantees; the ranking deadline was later raised to 90 s including "
              "one repair. Retries: at most two, only on HTTP 429. Five consecutive service failures open the "
              "breaker; one probe after 60 s. Rankings run in a background lane, so the clock keeps moving."),

    dict(items=[*title("A real MiMo ranking, end to end", "ISS-3642, captured live on AMD Token Factory (MiMo-V2.6-Flash)"),
                *bullets(0.6, 1.9, 4.6, 5.0, [
        "Nearest responder: **Optr375**, 0.8 min away, thin history on this fault.",
        "Compass ranked **Engr370** first: deepest evidence, 92% success, 2 min away.",
        "Offer accepted; resolved first time in **11.2 min**.",
        "Every step, and the action taken, is in the issue's audit trail.",
    ], size=17), *image("compass-record.png", 5.45, 1.85, w=7.45)],
        notes="This record was captured live on AMD Token Factory with MiMo-V2.6-Flash on 2026-10-17 (simulated time "
              "6 October). Both baselines picked someone else: nearest chose Optr375, the naive score chose Tech363. "
              "One good outcome is not proof of better performance; the disagreement is recorded so it can be reviewed. "
              "In that capture, 7 of 11 live rankings returned valid output; the rest fell back deterministically."),

    dict(items=[*title("A month of operations"), *bullets(0.6, 1.6, 5.3, 5.2, [
        "e8-aura-p1: **3,531 issues**, 1 September to 6 October (simulated).",
        "September: **2,978 raised / 2,998 resolved** events.",
        "Day, week and month views; Compass-vs-baseline records.",
        "Seven-day detail retention: live state served in **56 ms** in a local check.",
    ], size=18), *image("analytics-month.png", 6.2, 1.6, w=6.65)],
        notes="This history was generated with the app's own engine, offline and deterministically, so every record "
              "is one the app itself would produce. Retention archives older detail without changing any analytics "
              "number. The month extension used deterministic fallbacks; it is not an AMD-only benchmark or a "
              "controlled comparison of model and baseline outcomes. Latency is one local measurement, not a "
              "guarantee."),

    dict(items=[*title("Engineering quality"), *bullets(0.6, 1.6, 12.1, 5.2, [
        "Live and Offline are one app; Offline makes no API calls and is fully reproducible.",
        "**277** hermetic unit and integration tests and **51** Chromium end-to-end tests.",
        "Deterministic seeded simulation; restart-safe scheduler; atomic, crash-safe persistence.",
        "Runs on Node.js 22 or Docker; no external services besides the model API.",
    ], size=21)], notes="Everything that matters is tested without spending API credits; the browser tests force "
                        "provider failures to prove the fallbacks."),

    dict(items=[*title("What's next"), *bullets(0.6, 1.6, 12.1, 3.6, [
        "**Recommended fixes:** rank response actions retrieved from comparable past resolutions.",
        "Learn from outcomes: feed accepted and successful fixes back into the evidence.",
        "Connect to real maintenance and ticketing systems in place of the simulated floor.",
        "Long-run storage: compact the remaining growing history for year-long runs.",
    ], size=21),
        ("rect", dict(x=0.6, y=5.55, w=12.1, h=1.1, fill=NAVY)),
        ("text", dict(x=0.9, y=5.72, w=11.5, h=0.8, text="The right responder. The right fix.", size=30, bold=True, color=WHITE, align="center")),
    ], notes="The dispatch half is built and measured. The next step uses the same boundary for actions: code "
             "retrieves comparable past resolutions, and the model ranks and explains the fix."),
]

# ---------------------------------------------------------------------------
# Helpers shared by both renderers
# ---------------------------------------------------------------------------

def runs_of(text):
    """Splits **bold** markup into (text, bold) runs."""
    parts = text.split("**")
    return [(part, i % 2 == 1) for i, part in enumerate(parts) if part]


def node_map():
    return {n[0]: dict(id=n[0], label=n[1], sub=n[2], x=n[3], y=n[4], w=n[5], h=n[6], kind=n[7]) for n in NODES}


def sites(node):
    """Connection sites of a rectangle in PowerPoint order: top, left, bottom, right."""
    x, y, w, h = node["x"], node["y"], node["w"], node["h"]
    return [(x + w / 2, y), (x, y + h / 2), (x + w / 2, y + h), (x + w, y + h / 2)]


def pick_sites(a, b):
    ax, ay = a["x"] + a["w"] / 2, a["y"] + a["h"] / 2
    bx, by = b["x"] + b["w"] / 2, b["y"] + b["h"] / 2
    dx, dy = bx - ax, by - ay
    if abs(dx) >= abs(dy) * 1.2:
        return (3, 1) if dx > 0 else (1, 3)
    return (2, 0) if dy > 0 else (0, 2)


def image_size(path, w, h):
    from PIL import Image
    with Image.open(path) as img:
        iw, ih = img.size
    if w and not h:
        h = w * ih / iw
    elif h and not w:
        w = h * iw / ih
    return w, h

# ---------------------------------------------------------------------------
# PowerPoint renderer
# ---------------------------------------------------------------------------

def rgb(hex_):
    return RGBColor.from_string(hex_)


def set_font(run, size, bold=False, color=INK):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = rgb(color)


def pptx_text(slide, spec):
    box = slide.shapes.add_textbox(Inches(spec["x"]), Inches(spec["y"]), Inches(spec["w"]), Inches(spec["h"]))
    frame = box.text_frame
    frame.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(frame, side, 0)
    para = frame.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER if spec.get("align") == "center" else PP_ALIGN.LEFT
    for text, bold in runs_of(spec["text"]):
        set_font(para.add_run(), spec["size"], bold or spec.get("bold", False), spec.get("color", INK))
        para.runs[-1].text = text


def pptx_bullets(slide, spec):
    box = slide.shapes.add_textbox(Inches(spec["x"]), Inches(spec["y"]), Inches(spec["w"]), Inches(spec["h"]))
    frame = box.text_frame
    frame.word_wrap = True
    for i, line in enumerate(spec["lines"]):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.space_after = Pt(spec["size"] * 0.8)
        bullet = para.add_run()
        bullet.text = "▸  "
        set_font(bullet, spec["size"], True, TEAL)
        for text, bold in runs_of(line):
            run = para.add_run()
            run.text = text
            set_font(run, spec["size"], bold, NAVY if bold else INK)


def pptx_rect(slide, spec):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(spec["x"]), Inches(spec["y"]), Inches(spec["w"]), Inches(spec["h"]))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(spec["fill"])
    shape.line.fill.background()
    shape.shadow.inherit = False


def add_arrowhead(connector):
    ln = connector.line._get_or_add_ln()
    tail = etree.SubElement(ln, qn("a:tailEnd"))
    tail.set("type", "triangle")
    tail.set("w", "med")
    tail.set("len", "med")


def pptx_diagram(slide, spec):
    shapes = {}
    for node in node_map().values():
        fill, border, title_color, sub_color = NODE_STYLE[node["kind"]]
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(node["x"]), Inches(node["y"]), Inches(node["w"]), Inches(node["h"]))
        shape.adjustments[0] = 0.18
        shape.name = f"Node: {node['label']}"
        shape.shadow.inherit = False
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)
        shape.line.color.rgb = rgb(border)
        shape.line.width = Pt(1.5)
        frame = shape.text_frame
        frame.word_wrap = True
        frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        for side in ("margin_left", "margin_right"):
            setattr(frame, side, Inches(0.06))
        frame.margin_top = frame.margin_bottom = Inches(0.02)
        head = frame.paragraphs[0]
        head.alignment = PP_ALIGN.CENTER
        run = head.add_run()
        run.text = node["label"]
        set_font(run, 13, True, title_color)
        sub = frame.add_paragraph()
        sub.alignment = PP_ALIGN.CENTER
        run = sub.add_run()
        run.text = node["sub"]
        set_font(run, 9.5, False, sub_color)
        shapes[node["id"]] = shape
    nodes = node_map()
    for a, b in spec["edges"]:
        start, end = pick_sites(nodes[a], nodes[b])
        connector = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, 0, 0, 0, 0)
        connector.begin_connect(shapes[a], start)
        connector.end_connect(shapes[b], end)
        connector.name = f"Arrow: {nodes[a]['label']} to {nodes[b]['label']}"
        connector.line.color.rgb = rgb(MUTED)
        connector.line.width = Pt(1.5)
        add_arrowhead(connector)


def pptx_legend(slide, spec):
    entries = [("Application code", "code"), ("AMD model", "model"), ("People", "human")]
    x = spec["x"]
    for i, (label, kind) in enumerate(entries):
        fill, border, _, _ = NODE_STYLE[kind]
        y = spec["y"] + i * 0.3
        swatch = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(0.32), Inches(0.2))
        swatch.fill.solid()
        swatch.fill.fore_color.rgb = rgb(fill)
        swatch.line.color.rgb = rgb(border)
        swatch.shadow.inherit = False
        pptx_text(slide, dict(x=x + 0.42, y=y - 0.03, w=2.5, h=0.28, text=label, size=11, color=MUTED))


def build_pptx():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(W), Inches(H)
    blank = prs.slide_layouts[6]
    for number, spec in enumerate(SLIDES, start=1):
        slide = prs.slides.add_slide(blank)
        background = slide.background.fill
        background.solid()
        background.fore_color.rgb = rgb(BG if spec.get("kind") == "cover" else WHITE)
        for kind, item in spec["items"]:
            if kind == "text": pptx_text(slide, item)
            elif kind == "bullets": pptx_bullets(slide, item)
            elif kind == "rect": pptx_rect(slide, item)
            elif kind == "image":
                w, h = image_size(item["path"], item["w"], item["h"])
                pic = slide.shapes.add_picture(item["path"], Inches(item["x"]), Inches(item["y"]), Inches(w), Inches(h))
                pic.line.color.rgb = rgb(LINE)
                pic.line.width = Pt(0.75)
            elif kind == "diagram": pptx_diagram(slide, item)
            elif kind == "legend": pptx_legend(slide, item)
        if spec.get("kind") != "cover":
            pptx_text(slide, dict(x=11.6, y=7.0, w=1.2, h=0.3, text=str(number), size=11, color=MUTED, align="center"))
        slide.notes_slide.notes_text_frame.text = spec["notes"]
    prs.save(OUT_PPTX)

# ---------------------------------------------------------------------------
# PDF renderer (same geometry)
# ---------------------------------------------------------------------------

def build_pdf():
    pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    pt = 72
    c = canvas.Canvas(str(OUT_PDF), pagesize=(W * pt, H * pt))
    Y = lambda y: (H - y) * pt  # noqa: E731

    def color(hex_): return HexColor("#" + hex_)

    def wrap_runs(runs, size, width):
        """Greedy word wrap over (text, bold) runs; returns lines of runs."""
        import re
        lines, line, used = [], [], 0.0
        for text, bold in runs:
            font = "Bold" if bold else "Body"
            for token in re.findall(r"\S+\s*|\s+", text.replace("\n", " ")):
                tw = pdfmetrics.stringWidth(token, font, size)
                if used + pdfmetrics.stringWidth(token.rstrip(), font, size) > width and line:
                    lines.append(line); line, used = [], 0.0
                    token = token.lstrip()
                    if not token:
                        continue
                    tw = pdfmetrics.stringWidth(token, font, size)
                line.append((token, bold)); used += tw
        if line: lines.append(line)
        return lines

    def draw_runs(x, y, runs, size, base_color, bold_color=None, base_bold=False):
        for token, bold in runs:
            font = "Bold" if (bold or base_bold) else "Body"
            c.setFont(font, size)
            c.setFillColor(color(bold_color if bold and bold_color else base_color))
            c.drawString(x, y, token)
            x += pdfmetrics.stringWidth(token, font, size)

    def text(item):
        size = item["size"]
        runs = runs_of(item["text"])
        lines = wrap_runs([(t, b or item.get("bold", False)) for t, b in runs], size, item["w"] * pt)
        y = Y(item["y"]) - size
        for line in lines:
            width = sum(pdfmetrics.stringWidth(t, "Bold" if b else "Body", size) for t, b in line)
            x = item["x"] * pt + ((item["w"] * pt - width) / 2 if item.get("align") == "center" else 0)
            draw_runs(x, y, line, size, item.get("color", INK), base_bold=item.get("bold", False))
            y -= size * 1.25

    def bullet_list(item):
        size = item["size"]
        y = Y(item["y"]) - size
        indent = pdfmetrics.stringWidth("▸  ", "Bold", size)
        for line in item["lines"]:
            c.setFont("Bold", size); c.setFillColor(color(TEAL)); c.drawString(item["x"] * pt, y, "▸")
            for row in wrap_runs(runs_of(line), size, item["w"] * pt - indent):
                draw_runs(item["x"] * pt + indent, y, row, size, INK, NAVY)
                y -= size * 1.25
            y -= size * 0.8

    def rect(item):
        c.setFillColor(color(item["fill"])); c.setStrokeColor(color(item["fill"]))
        c.rect(item["x"] * pt, Y(item["y"] + item["h"]), item["w"] * pt, item["h"] * pt, fill=1, stroke=0)

    def picture(item):
        w, h = image_size(item["path"], item["w"], item["h"])
        c.drawImage(ImageReader(item["path"]), item["x"] * pt, Y(item["y"] + h), w * pt, h * pt)
        c.setStrokeColor(color(LINE)); c.setLineWidth(0.75)
        c.rect(item["x"] * pt, Y(item["y"] + h), w * pt, h * pt, fill=0, stroke=1)

    def arrow(x1, y1, x2, y2):
        import math
        c.setStrokeColor(color(MUTED)); c.setFillColor(color(MUTED)); c.setLineWidth(1.5)
        c.line(x1, y1, x2, y2)
        angle = math.atan2(y2 - y1, x2 - x1)
        size = 8
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - size * math.cos(angle - 0.4), y2 - size * math.sin(angle - 0.4))
        p.lineTo(x2 - size * math.cos(angle + 0.4), y2 - size * math.sin(angle + 0.4))
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def diagram(item):
        nodes = node_map()
        for a, b in item["edges"]:
            s, e = pick_sites(nodes[a], nodes[b])
            (x1, y1), (x2, y2) = sites(nodes[a])[s], sites(nodes[b])[e]
            arrow(x1 * pt, Y(y1), x2 * pt, Y(y2))
        for node in nodes.values():
            fill, border, title_color, sub_color = NODE_STYLE[node["kind"]]
            c.setFillColor(color(fill)); c.setStrokeColor(color(border)); c.setLineWidth(1.5)
            c.roundRect(node["x"] * pt, Y(node["y"] + node["h"]), node["w"] * pt, node["h"] * pt, 7, fill=1, stroke=1)
            cx = (node["x"] + node["w"] / 2) * pt
            cy = Y(node["y"] + node["h"] / 2)
            c.setFillColor(color(title_color)); c.setFont("Bold", 12.5)
            c.drawCentredString(cx, cy + 2, node["label"])
            c.setFillColor(color(sub_color)); c.setFont("Body", 9)
            c.drawCentredString(cx, cy - 11, node["sub"])

    def legend(item):
        for i, (label, kind) in enumerate([("Application code", "code"), ("AMD model", "model"), ("People", "human")]):
            fill, border, _, _ = NODE_STYLE[kind]
            y = item["y"] + i * 0.3
            c.setFillColor(color(fill)); c.setStrokeColor(color(border)); c.setLineWidth(1)
            c.roundRect(item["x"] * pt, Y(y + 0.2), 0.32 * pt, 0.2 * pt, 3, fill=1, stroke=1)
            text(dict(x=item["x"] + 0.42, y=y - 0.03, w=2.5, h=0.28, text=label, size=11, color=MUTED))

    for number, spec in enumerate(SLIDES, start=1):
        c.setFillColor(color(BG if spec.get("kind") == "cover" else WHITE))
        c.rect(0, 0, W * pt, H * pt, fill=1, stroke=0)
        for kind, item in spec["items"]:
            {"text": text, "bullets": bullet_list, "rect": rect, "image": picture, "diagram": diagram, "legend": legend}[kind](item)
        if spec.get("kind") != "cover":
            text(dict(x=11.6, y=7.0, w=1.2, h=0.3, text=str(number), size=11, color=MUTED, align="center"))
        c.showPage()
    c.save()


if __name__ == "__main__":
    build_pptx()
    build_pdf()
    print(f"wrote {OUT_PPTX.relative_to(ROOT.parents[1])} and {OUT_PDF.relative_to(ROOT.parents[1])}")
