#!/usr/bin/env python3
"""
Build hand-laid SVG diagrams for the MarketsUI architecture guide.

Run:  python3 build.py
Outputs:  ./fig-NN-*.svg  (15 files)

Design language (kept intentionally tight):
  • One primary accent per diagram.  Everything else is neutral.
  • 8 px grid.  Everything aligns.
  • Typography: 16/13/11/10 px;  weights 600 / 500 / 400.
  • Shapes: card, pill, cluster, cylinder, note, arrow.
  • Two arrow styles: solid (depends-on) and dashed (uses/optional).
"""

from __future__ import annotations
import base64
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable
import math
import textwrap

OUT_DIR  = Path(__file__).parent
ICON_DIR = OUT_DIR / "icons"


@lru_cache(maxsize=64)
def _icon_b64(name: str) -> str | None:
    """Read icons/<name>.png and return a base64 data URI body."""
    p = ICON_DIR / f"{name}.png"
    if not p.exists():
        return None
    return base64.b64encode(p.read_bytes()).decode("ascii")

# ─── Palette ───────────────────────────────────────────────────────────────
INK        = "#1b2944"   # text primary
INK_SOFT   = "#38475f"   # text secondary
INK_MUTED  = "#5b6b8a"   # text muted
INK_FAINT  = "#8a99b3"   # text faint
RULE       = "#d8dfeb"   # default border
RULE_SOFT  = "#e6ebf3"
SURFACE    = "#ffffff"
SURFACE_2  = "#f7f9fc"
SURFACE_3  = "#eef2f9"

# Semantic accents (one per layer / topic)
BLUE       = "#2952cc"   # primary brand / foundation
BLUE_SOFT  = "#e6efff"
PURPLE     = "#7c3aed"; PURPLE_SOFT = "#f1ebff"   # runtime
TEAL       = "#0e9282"; TEAL_SOFT   = "#dff5f0"   # services
AMBER      = "#c2870c"; AMBER_SOFT  = "#fff2d1"   # hosts / providers
GREEN      = "#0f8a5f"; GREEN_SOFT  = "#dff5ea"   # widgets
INDIGO     = "#4f5bd5"; INDIGO_SOFT = "#e9ebff"   # tools
ORANGE     = "#c0532c"; ORANGE_SOFT = "#ffe7d6"   # apps

FONT_FAMILY = '"Inter", "Segoe UI", "Helvetica Neue", system-ui, Arial, sans-serif'
FONT_MONO   = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace'


# ─── Primitives ────────────────────────────────────────────────────────────

@dataclass
class Canvas:
    """An SVG document under construction."""
    w: int
    h: int
    children: list[str]

    def add(self, s: str) -> None:
        self.children.append(s)

    def render(self) -> str:
        # Common defs: drop-shadow filter, arrow markers
        defs = f"""
<defs>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#1b2944" flood-opacity="0.08"/>
  </filter>
  <marker id="arrow"          markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L8,5 L0,10 L2,5 Z" fill="{INK_SOFT}"/>
  </marker>
  <marker id="arrow-soft"     markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L8,5 L0,10 L2,5 Z" fill="{INK_MUTED}"/>
  </marker>
  <marker id="arrow-accent"   markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L8,5 L0,10 L2,5 Z" fill="{BLUE}"/>
  </marker>
</defs>
""".strip()
        body = "\n".join(self.children)
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" font-family='{FONT_FAMILY}' style='background:transparent'>
{defs}
{body}
</svg>
"""


def _esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def text(c: Canvas, x: float, y: float, s: str, *,
         size: int = 13, weight: int = 400, fill: str = INK,
         anchor: str = "start", family: str = FONT_FAMILY,
         italic: bool = False, dy: float = 0):
    style = f'font-size:{size}px;font-weight:{weight};fill:{fill};text-anchor:{anchor};font-family:{family}'
    if italic:
        style += ";font-style:italic"
    # Use single-quoted attribute so double-quoted font-family names are OK.
    c.add(f"<text x='{x}' y='{y + dy}' style='{style}'>{_esc(s)}</text>")


def multi_text(c: Canvas, x: float, y: float, lines: Iterable[str], *,
               size: int = 12, weight: int = 400, fill: str = INK_SOFT,
               leading: float = 1.45, anchor: str = "start",
               family: str = FONT_FAMILY):
    for i, line in enumerate(lines):
        text(c, x, y + i * size * leading, line, size=size, weight=weight,
             fill=fill, anchor=anchor, family=family)


def card(c: Canvas, x: float, y: float, w: float, h: float, *,
         fill: str = SURFACE, stroke: str = RULE, rx: float = 8,
         shadow: bool = True, dash: str | None = None,
         stroke_width: float = 1.0):
    f = ' filter="url(#shadow)"' if shadow else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    c.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" ry="{rx}" '
          f'fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"{d}{f}/>')


def banded_card(c: Canvas, x: float, y: float, w: float, h: float, *,
                accent: str, title: str, subtitle: str | None = None,
                body_lines: list[str] | None = None,
                fill: str = SURFACE, body_color: str = INK_SOFT,
                title_color: str = INK):
    """Card with a thin accent band on the left and structured text."""
    card(c, x, y, w, h, fill=fill, stroke=RULE)
    # Left accent band
    c.add(f'<rect x="{x}" y="{y}" width="3" height="{h}" rx="1.5" ry="1.5" fill="{accent}"/>')
    pad_l = 16
    text(c, x + pad_l, y + 22, title, size=14, weight=600, fill=title_color)
    cursor_y = y + 22
    if subtitle:
        text(c, x + pad_l, y + 40, subtitle, size=11, weight=500, fill=INK_MUTED)
        cursor_y = y + 40
    if body_lines:
        multi_text(c, x + pad_l, cursor_y + 22, body_lines,
                   size=11, fill=body_color, leading=1.55)


def pill(c: Canvas, x: float, y: float, w: float, h: float, *,
         fill: str, stroke: str = "none", label: str,
         label_color: str = INK, size: int = 12, weight: int = 500):
    sw = 1 if stroke != "none" else 0
    sa = f' stroke="{stroke}" stroke-width="{sw}"' if stroke != "none" else ""
    c.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" ry="{h/2}" fill="{fill}"{sa}/>')
    text(c, x + w / 2, y + h / 2 + size * 0.35, label, size=size, weight=weight,
         fill=label_color, anchor="middle")


def cluster(c: Canvas, x: float, y: float, w: float, h: float, *,
            label: str, accent: str = INK_FAINT, fill: str = "none"):
    card(c, x, y, w, h, fill=fill, stroke=accent, shadow=False, dash="4 4")
    # Inset label badge
    label_w = max(80, 12 + len(label) * 7)
    label_h = 22
    c.add(f'<rect x="{x + 12}" y="{y - label_h / 2}" width="{label_w}" height="{label_h}" rx="11" ry="11" fill="{SURFACE}" stroke="{accent}"/>')
    text(c, x + 12 + label_w / 2, y + 4, label, size=11, weight=600, fill=accent, anchor="middle")


def cylinder(c: Canvas, x: float, y: float, w: float, h: float, *,
             label: str, accent: str = INK_MUTED, fill: str = SURFACE):
    rx = w / 2
    ry = 8
    # top ellipse, side rectangle, bottom ellipse
    c.add(f'<path d="M{x} {y + ry} a{rx},{ry} 0 0 0 {w},0 v{h - 2*ry} a{rx},{ry} 0 0 1 -{w},0 z" '
          f'fill="{fill}" stroke="{accent}"/>')
    c.add(f'<ellipse cx="{x + rx}" cy="{y + ry}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{accent}"/>')
    text(c, x + rx, y + h / 2 + 4, label, size=11, weight=600, fill=INK, anchor="middle")


def note(c: Canvas, x: float, y: float, w: float, h: float, *,
         lines: list[str], accent: str = AMBER, fill: str = AMBER_SOFT):
    fold = 14
    path = (f"M{x} {y} H{x + w - fold} L{x + w} {y + fold} V{y + h} H{x} Z")
    c.add(f'<path d="{path}" fill="{fill}" stroke="{accent}" stroke-width="0.8"/>')
    c.add(f'<path d="M{x + w - fold} {y} V{y + fold} H{x + w}" fill="none" stroke="{accent}" stroke-width="0.8"/>')
    multi_text(c, x + 12, y + 18, lines, size=11, fill=INK_SOFT, leading=1.5)


def arrow(c: Canvas, x1: float, y1: float, x2: float, y2: float, *,
          style: str = "solid", color: str = INK_SOFT,
          marker: str = "arrow", label: str | None = None,
          label_offset: tuple[float, float] = (0, -6),
          curved: bool = False, curvature: float = 0.3):
    dash = ' stroke-dasharray="5 4"' if style == "dashed" else ""
    if curved:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        dx, dy = x2 - x1, y2 - y1
        nx, ny = -dy, dx
        norm = math.hypot(nx, ny) or 1
        cx, cy = mx + nx / norm * curvature * math.hypot(dx, dy), my + ny / norm * curvature * math.hypot(dx, dy)
        path = f"M{x1},{y1} Q{cx},{cy} {x2},{y2}"
        c.add(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.4"{dash} marker-end="url(#{marker})"/>')
    else:
        c.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.4"{dash} marker-end="url(#{marker})"/>')
    if label:
        ox, oy = label_offset
        mx, my = (x1 + x2) / 2 + ox, (y1 + y2) / 2 + oy
        # Label background for readability
        # measure rough width
        label_w = 8 + len(label) * 6.5
        c.add(f'<rect x="{mx - label_w / 2}" y="{my - 9}" width="{label_w}" height="14" rx="3" ry="3" fill="{SURFACE}" stroke="{RULE_SOFT}"/>')
        text(c, mx, my + 2, label, size=10, weight=500, fill=INK_MUTED, anchor="middle")


def chip(c: Canvas, x: float, y: float, w: float, h: float, *,
         accent: str, label: str, sublabel: str | None = None,
         fill: str = SURFACE, icon_name: str | None = None,
         icon_size: int = 28):
    card(c, x, y, w, h, fill=fill, stroke=RULE, shadow=False, rx=6)
    c.add(f'<rect x="{x}" y="{y}" width="3" height="{h}" rx="1.5" ry="1.5" fill="{accent}"/>')
    pad_l = 12
    if icon_name and _icon_b64(icon_name):
        icon(c, x + 12, y + (h - icon_size) / 2, icon_size, icon_name)
        pad_l = 12 + icon_size + 10
    if sublabel:
        text(c, x + pad_l, y + 19, label, size=12, weight=600, fill=INK)
        text(c, x + pad_l, y + 34, sublabel, size=10, weight=400, fill=INK_MUTED)
    else:
        text(c, x + pad_l, y + h / 2 + 4, label, size=12, weight=500, fill=INK)


def icon(c: Canvas, x: float, y: float, size: float, name: str):
    """Embed an icons/<name>.png inline (base64)."""
    b64 = _icon_b64(name)
    if not b64:
        return
    c.add(f'<image x="{x}" y="{y}" width="{size}" height="{size}" '
          f'preserveAspectRatio="xMidYMid meet" '
          f'href="data:image/png;base64,{b64}"/>')


def icon_tile(c: Canvas, x: float, y: float, w: float, h: float, *,
              icon_name: str, label: str, sublabel: str | None = None,
              accent: str = INK_FAINT, icon_size: int = 56,
              fill: str = SURFACE):
    """Vertical card: icon on top, label below."""
    card(c, x, y, w, h, fill=fill, stroke=RULE, rx=10)
    if icon_name and _icon_b64(icon_name):
        icon(c, x + (w - icon_size) / 2, y + 14, icon_size, icon_name)
        text_y = y + 14 + icon_size + 18
    else:
        text_y = y + 32
    text(c, x + w / 2, text_y, label, size=12, weight=600, fill=INK, anchor="middle")
    if sublabel:
        text(c, x + w / 2, text_y + 14, sublabel, size=10, weight=400,
             fill=INK_MUTED, anchor="middle")
    if accent != INK_FAINT:
        c.add(f'<rect x="{x}" y="{y + h - 3}" width="{w}" height="3" rx="1.5" ry="1.5" fill="{accent}"/>')


def title_block(c: Canvas, x: float, y: float, *, title: str, subtitle: str = "",
                accent: str = BLUE):
    text(c, x, y, title, size=18, weight=600, fill=INK)
    if subtitle:
        text(c, x, y + 22, subtitle, size=12, weight=400, fill=INK_MUTED)
    # accent rule under the title
    c.add(f'<rect x="{x}" y="{y + (32 if subtitle else 8)}" width="48" height="3" rx="1.5" ry="1.5" fill="{accent}"/>')


# ─── Diagram builders ──────────────────────────────────────────────────────

def fig_01_layer_model() -> str:
    """7 horizontal layer bands, each with accent + name + contents pills."""
    W, H = 900, 720
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="The Layer Model",
                subtitle="A package may import only from its own layer or layers below it.",
                accent=BLUE)

    layers = [
        ("Apps",          ORANGE, ["demo-react", "demo-angular", "demo-configservice-react",
                                   "markets-ui-react-reference", "basic-starui-app", "stomp-view-server"]),
        ("Tools / dev UIs", INDIGO, ["config-browser-react", "config-browser-angular",
                                     "workspace-setup-react", "config-editor-ui"]),
        ("Widgets & shells", GREEN, ["markets-grid", "grid-react", "widgets-react",
                                     "widgets-angular", "app-shell-react"]),
        ("Hosts / providers / SDK", AMBER, ["host-wrapper-react", "host-wrapper-angular",
                                           "config-service-react", "config-service-angular",
                                           "data-services-react", "data-services-angular",
                                           "widget-sdk"]),
        ("Services & platform", TEAL, ["core", "config-service", "data-services",
                                       "component-host", "openfin-platform"]),
        ("Runtime", PURPLE, ["runtime-port", "runtime-browser", "runtime-openfin"]),
        ("Foundation", BLUE, ["shared-types", "design-system", "icons-svg",
                              "ui (shadcn)", "vite-workspace-aliases"]),
    ]
    band_h = 76
    top = 110
    pad = 40
    for i, (name, accent, pkgs) in enumerate(layers):
        y = top + i * (band_h + 8)
        # Outer band
        card(c, pad, y, W - 2 * pad, band_h, fill=SURFACE, stroke=RULE, shadow=False)
        # Accent left strip
        c.add(f'<rect x="{pad}" y="{y}" width="6" height="{band_h}" rx="3" ry="3" fill="{accent}"/>')
        # Layer index
        text(c, pad + 24, y + 28, f"Layer {6 - i}", size=11, weight=600, fill=INK_FAINT)
        text(c, pad + 24, y + 46, name, size=14, weight=600, fill=INK)
        # Pills row
        px = pad + 220
        py = y + band_h / 2 - 13
        for p in pkgs:
            pw = 14 + len(p) * 7.2
            pill(c, px, py, pw, 26, fill=SURFACE_3, stroke=RULE_SOFT, label=p, label_color=INK_SOFT)
            px += pw + 8
            if px + 120 > W - pad:
                py += 18
                px = pad + 220
    # Down arrow on the right showing dependency direction
    ax = W - pad - 14
    for i in range(len(layers) - 1):
        y1 = top + i * (band_h + 8) + band_h - 2
        y2 = top + (i + 1) * (band_h + 8) + 2
        arrow(c, ax, y1, ax, y2, color=INK_FAINT, marker="arrow-soft")

    # Legend
    text(c, pad, H - 24, "Arrows show import direction (each layer may import only from those below).",
         size=11, fill=INK_MUTED, italic=True)
    return c.render()


def fig_02_framework_matrix() -> str:
    """3-column matrix: vanilla/React/Angular × 6 role rows."""
    W, H = 980, 660
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="Framework Matrix",
                subtitle="Three columns (peer-dep), six role rows.", accent=BLUE)
    col_x = [40 + 200, 40 + 200 + 230, 40 + 200 + 460]  # vanilla, react, angular
    col_w = 220
    col_accent = [BLUE, INDIGO, GREEN]
    col_names = [("shared/", "peer: vanilla TS"),
                 ("react/", "peer: react"),
                 ("angular/", "peer: @angular/*")]
    # Column headers
    for i, (name, sub) in enumerate(col_names):
        x = col_x[i]
        card(c, x, 110, col_w, 50, fill=SURFACE, stroke=RULE)
        c.add(f'<rect x="{x}" y="{110}" width="4" height="50" rx="2" ry="2" fill="{col_accent[i]}"/>')
        text(c, x + 14, 134, name, size=13, weight=600, fill=INK)
        text(c, x + 14, 150, sub, size=10, weight=400, fill=INK_MUTED)
    # Row labels + cells
    rows = [
        ("Foundation",
         ["shared-types", "design-system", "icons-svg", "vite-workspace-aliases"],
         ["ui (shadcn)", "— singleton (no -react suffix)"],
         ["—", "DS-themed PrimeNG", "via downstream tools"]),
        ("Runtime",
         ["runtime-port (interface)", "runtime-browser", "runtime-openfin"],
         ["— uses port interface"],
         ["— uses port interface"]),
        ("Services / Platform",
         ["core", "config-service", "data-services", "component-host", "openfin-platform"],
         ["widget-sdk (singleton)"],
         ["— uses shared"]),
        ("Hosts / Providers",
         ["— no shared host"],
         ["host-wrapper-react", "config-service-react", "data-services-react", "app-shell-react"],
         ["host-wrapper-angular", "config-service-angular", "data-services-angular"]),
        ("Widgets & Shells",
         ["— none"],
         ["markets-grid", "grid-react", "widgets-react (+ hosted/)"],
         ["widgets-angular", "(DockConfigurator +", " DataProviderEditor only)"]),
        ("Tools / Dev UIs",
         ["— none"],
         ["config-browser-react", "config-editor-ui", "workspace-setup-react"],
         ["config-browser-angular"]),
    ]
    row_y = 180
    row_h = 70
    for i, (label, cv, cr, ca) in enumerate(rows):
        y = row_y + i * (row_h + 8)
        # Row label
        card(c, 40, y, 156, row_h, fill=SURFACE_2, stroke=RULE, shadow=False)
        text(c, 56, y + 28, label, size=12, weight=600, fill=INK)
        # Cells
        for col_i, items in enumerate([cv, cr, ca]):
            x = col_x[col_i]
            tint_fills = [SURFACE, SURFACE, SURFACE]
            card(c, x, y, col_w, row_h, fill=tint_fills[col_i], stroke=RULE, shadow=False)
            empty = len(items) == 1 and items[0].startswith("—")
            color = INK_FAINT if empty else INK_SOFT
            for k, line in enumerate(items):
                text(c, x + 14, y + 22 + k * 14, line, size=11,
                     fill=color, weight=400)
    return c.render()


def fig_03_package_graph() -> str:
    """Focused dependency view — show the 5 architectural rules, not 25 packages.

    Reads like a class diagram:  highlighted relationships only,  selected
    representative packages.  The complete list lives in the layer-model
    diagram (figure 1).
    """
    W, H = 1100, 720
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="Five Architectural Rules",
                subtitle="The dependencies you have to internalise.  Full package list — see Figure 1.",
                accent=BLUE)

    # ── Rule 1: Runtime port abstraction ──────────────────────────────────
    banded_card(c, 40,  120, 510, 170, accent=PURPLE,
                title="① runtime-port is the seam",
                body_lines=[
                    "runtime-port (interface)",
                    "   ↑ implements         ↑ implements",
                    "runtime-browser     runtime-openfin",
                    "",
                    "Every host wrapper / app shell / hosted-view hook",
                    "talks to the interface — never to fin.* directly.",
                ])

    # ── Rule 2: Only two packages may import @openfin/core ────────────────
    banded_card(c, 580, 120, 480, 170, accent=AMBER,
                title="② @openfin/core is firewalled",
                body_lines=[
                    "Only runtime-openfin and openfin-platform",
                    "may import @openfin/core.",
                    "",
                    "Every other package that needs OpenFin lifecycle",
                    "goes through the RuntimePort interface.",
                    "(Rationale: keep the platform browser-runnable.)",
                ])

    # ── Rule 3: core is vanilla TS ────────────────────────────────────────
    banded_card(c, 40, 320, 510, 170, accent=TEAL,
                title="③ core is vanilla TS",
                body_lines=[
                    "@starui/core never imports a framework adapter.",
                    "",
                    "      grid-react   →   core           (React side)",
                    "    widgets-angular   →   core        (Angular side)",
                    "",
                    "Both consume the same GridPlatform / ProfileManager",
                    "/ ExpressionEngine.  No React in core.",
                ])

    # ── Rule 4: providers wrap services ───────────────────────────────────
    banded_card(c, 580, 320, 480, 170, accent=ORANGE,
                title="④ providers wrap services",
                body_lines=[
                    "config-service-react   ──┐",
                    "config-service-angular ──┤── wrap ──→  config-service",
                    "data-services-react    ──┤",
                    "data-services-angular  ──┘",
                    "",
                    "Hosts get framework-shaped API; services stay vanilla.",
                ])

    # ── Rule 5: apps consume everything ───────────────────────────────────
    banded_card(c, 40, 520, W - 80, 160, accent=INDIGO,
                title="⑤ apps consume packages — never the reverse",
                body_lines=[
                    "apps/demo-react · apps/demo-angular · apps/demo-configservice-react",
                    "apps/markets-ui-react-reference · apps/demo-apps/basic-starui-app · apps/stomp-view-server",
                    "",
                    "No package may import from apps/.  Apps are the leaves of the dependency tree.",
                    "When in doubt about where new code belongs, ask: \"is this a leaf, or is it reusable?\"",
                ])

    return c.render()


def fig_04_runtime_port() -> str:
    """Interface in the middle, two impls below, consumers above."""
    W, H = 880, 560
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="RuntimePort — one interface, two implementations",
                subtitle="The single seam between OpenFin and a plain browser.",
                accent=PURPLE)

    # Consumers (top)
    cluster(c, 60, 110, W - 120, 84, label="Consumers", accent=INK_FAINT)
    consumers = [
        ("<HostWrapper> / useHost()", "@starui/host-wrapper-react",   "react"),
        ("HostService",               "@starui/host-wrapper-angular", "angular"),
        ("useHostedView() + hooks",   "@starui/widgets-react/hosted", "react"),
    ]
    cx_positions = [120, 380, 620]
    for i, (label, sub, ico) in enumerate(consumers):
        x = cx_positions[i]
        chip(c, x, 135, 200, 48, accent=PURPLE, label=label,
             sublabel=sub, fill=SURFACE, icon_name=ico, icon_size=24)

    # Interface (middle)
    iface_y = 240
    iface_x = (W - 540) / 2
    card(c, iface_x, iface_y, 540, 96, fill=PURPLE_SOFT, stroke=PURPLE)
    text(c, W / 2, iface_y + 22, "@starui/runtime-port", size=13, weight=600,
         fill=PURPLE, anchor="middle")
    text(c, W / 2, iface_y + 40, "interface RuntimePort", size=12, weight=500,
         fill=INK, anchor="middle", family=FONT_MONO)
    multi_text(c, iface_x + 16, iface_y + 60,
               ["• resolveIdentity()  · openSurface(spec)",
                "• getTheme · setTheme · onThemeChanged",
                "• onWindowShown · onWindowClosing · onCustomDataChanged · onWorkspaceSave"],
               size=10, family=FONT_MONO, fill=INK_SOFT, leading=1.45)

    # Implementations (bottom)
    impls_y = 380
    impl_w = 380
    impl_h = 130
    imps = [
        ("BrowserRuntime", BLUE, BLUE_SOFT, "javascript",
         ["URL ?params for identity",
          "prefers-color-scheme + localStorage",
          "BroadcastChannel('starui:theme')",
          "window.open() for popouts"]),
        ("OpenFinRuntime", AMBER, AMBER_SOFT, "switch",
         ["fin.me.getOptions().customData",
          "IAB 'theme-changed' bridge",
          "workspace-saved / window-shown",
          "applySavedViewTitle() guard"]),
    ]
    xs = [60, 60 + impl_w + 60]
    for i, (name, accent, fill, ico, lines) in enumerate(imps):
        x = xs[i]
        banded_card(c, x, impls_y, impl_w, impl_h, accent=accent,
                    title=name, body_lines=lines, fill=SURFACE)
        # Icon top-right of the impl card
        icon(c, x + impl_w - 56, impls_y + 14, 40, ico)
    # Arrows: impls -> iface (implements) — start near top edge of impl card,
    # end at bottom edge of interface card. Labels go OUT to the side so they
    # don't sit on top of the interface body text.
    impl_top_l = (xs[0] + impl_w / 2, impls_y)
    impl_top_r = (xs[1] + impl_w / 2, impls_y)
    iface_btm  = (W / 2, iface_y + 96)
    arrow(c, impl_top_l[0], impl_top_l[1], iface_btm[0] - 60, iface_btm[1],
          color=INK_MUTED, marker="arrow-soft", curved=True, curvature=0.08,
          label="implements", label_offset=(-110, -20))
    arrow(c, impl_top_r[0], impl_top_r[1], iface_btm[0] + 60, iface_btm[1],
          color=INK_MUTED, marker="arrow-soft", curved=True, curvature=-0.08,
          label="implements", label_offset=(110, -20))
    # Arrows: consumers -> iface (top edge)
    for x in cx_positions:
        arrow(c, x + 100, 184, W / 2 + (x + 100 - W / 2) * 0.15, iface_y,
              color=INK_FAINT, marker="arrow-soft")

    return c.render()


def fig_05_config_service() -> str:
    """Swimlanes: consumers, provider, core, backends — with iconography."""
    W, H = 1020, 680
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="ConfigService — dual-mode (Dexie + REST)",
                subtitle="Every piece of user state lives in one of six tables.",
                accent=TEAL)

    text(c, 40, 100, "Consumers", size=11, weight=600, fill=INK_FAINT)
    text(c, 40, 210, "Provider",  size=11, weight=600, fill=INK_FAINT)
    text(c, 40, 318, "ConfigManager + ConfigClient", size=11, weight=600, fill=INK_FAINT)
    text(c, 40, 510, "Backends",  size=11, weight=600, fill=INK_FAINT)

    # Consumers (with React/Angular icons)
    consumers = [
        ("<MarketsGrid>",          "via storage prop",       "react"),
        ("<ConfigBrowserPanel>",   "admin UI (React/Ang.)",  "react"),
        ("<WorkspaceSetup>",       "dock + registry",        "react"),
        ("Roles / Permissions",    "UserProfile · AppReg.",  "users"),
    ]
    cw = 232
    for i, (name, sub, ico) in enumerate(consumers):
        x = 40 + i * (cw + 12)
        chip(c, x, 112, cw, 56, accent=BLUE, label=name, sublabel=sub, icon_name=ico)

    # Provider
    card(c, 40, 220, W - 80, 64, fill=AMBER_SOFT, stroke=AMBER)
    icon(c, 60, 230, 44, "typescript")
    text(c, 116, 244, "<ConfigServiceProvider>  /  provideConfigService()",
         size=13, weight=600, fill=INK, family=FONT_MONO)
    text(c, 116, 264, "Builds ConfigManager, runs migrateLegacyProfilesIfNeeded(), wires storage factory.",
         size=11, fill=INK_SOFT)

    # Core
    card(c, 40, 328, W - 80, 162, fill=TEAL_SOFT, stroke=TEAL)
    inner = [
        ("ConfigManager",                 ["createConfigManager(...)",
                                            "Dexie schema + audit",
                                            "optimistic lock"], "server"),
        ("ConfigClient",                  ["LocalConfigClient",
                                            "RestConfigClient",
                                            "createConfigClient() dispatcher"], "switch"),
        ("createConfigServiceStorage()",  ["StorageAdapterFactory",
                                            "1 AppConfigRow per gridId",
                                            "all profiles in payload"], "storage"),
    ]
    iw = (W - 80 - 60) / 3
    for i, (n, body, ico) in enumerate(inner):
        x = 60 + i * (iw + 15)
        card(c, x, 344, iw, 128, fill=SURFACE, stroke=TEAL, shadow=False)
        c.add(f'<rect x="{x}" y="{344}" width="3" height="128" rx="1.5" ry="1.5" fill="{TEAL}"/>')
        icon(c, x + 14, 354, 30, ico)
        text(c, x + 52, 374, n, size=12, weight=600, fill=INK)
        multi_text(c, x + 14, 400, body, size=10.5, fill=INK_SOFT, leading=1.55)

    # Backends (with database icons)
    bx1, by, bw, bh = 220, 524, 240, 130
    card(c, bx1, by, bw, bh, fill=SURFACE, stroke=RULE, rx=10)
    icon(c, bx1 + (bw - 64) / 2, by + 14, 64, "database")
    text(c, bx1 + bw / 2, by + 100, "Dexie / IndexedDB", size=12, weight=600, fill=INK, anchor="middle")
    text(c, bx1 + bw / 2, by + 116, "local + offline cache",  size=10, fill=INK_MUTED, anchor="middle")
    c.add(f'<rect x="{bx1}" y="{by + bh - 3}" width="{bw}" height="3" rx="1.5" ry="1.5" fill="{BLUE}"/>')

    bx2 = 540
    card(c, bx2, by, bw, bh, fill=SURFACE, stroke=RULE, rx=10)
    icon(c, bx2 + (bw - 64) / 2, by + 14, 64, "api-gateway")
    text(c, bx2 + bw / 2, by + 100, "REST API",       size=12, weight=600, fill=INK, anchor="middle")
    text(c, bx2 + bw / 2, by + 116, "production server", size=10, fill=INK_MUTED, anchor="middle")
    c.add(f'<rect x="{bx2}" y="{by + bh - 3}" width="{bw}" height="3" rx="1.5" ry="1.5" fill="{ORANGE}"/>')

    # Arrows top → bottom
    for i in range(4):
        x = 40 + i * (cw + 12) + cw / 2
        arrow(c, x, 168, x, 220, color=INK_FAINT, marker="arrow-soft")
    arrow(c, W / 2, 284, W / 2, 328, color=INK_FAINT, marker="arrow-soft")
    arrow(c, 340, 472, 340, 524, color=INK_FAINT, marker="arrow-soft",
          label="LocalConfigClient", label_offset=(0, -8))
    arrow(c, 660, 472, 660, 524, color=INK_FAINT, marker="arrow-soft",
          label="RestConfigClient",  label_offset=(0, -8))
    return c.render()


def fig_06_profile_bundle() -> str:
    """Schema-style: one row, named fields, payload zoomed in."""
    W, H = 900, 620
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="How MarketsGrid profiles are stored",
                subtitle="A single AppConfigRow holds the whole profile set.",
                accent=GREEN)

    # MarketsGrid pill (top-left)
    chip(c, 40, 110, 320, 56, accent=GREEN,
         label="<MarketsGrid gridId='bond-blotter-v1'>",
         sublabel="ProfileManager · load / save / clone")

    # AppConfigRow (right)
    row_x = 40
    row_y = 200
    row_w = W - 80
    row_h = 200
    card(c, row_x, row_y, row_w, row_h, fill=SURFACE, stroke=RULE)
    c.add(f'<rect x="{row_x}" y="{row_y}" width="6" height="{row_h}" rx="3" ry="3" fill="{GREEN}"/>')
    text(c, row_x + 16, row_y + 22, "AppConfigRow", size=13, weight=600, fill=INK)
    text(c, row_x + 16, row_y + 38, "in ConfigManager / Dexie / REST", size=10, fill=INK_MUTED)

    # Fields table
    fields = [
        ("componentType", "markets-grid-profile-set"),
        ("configId",       "<instanceId>"),
        ("appId / userId", "<hostApp>  /  dev1  (single-user pin)"),
        ("payload",        "{ profiles: ProfileSnapshot[ ], activeId }"),
        ("__v",            "optimistic-lock version (++ each save)"),
    ]
    fy = row_y + 60
    for k, v in fields:
        text(c, row_x + 30,  fy + 4, k, size=11, weight=600, fill=INK_SOFT, family=FONT_MONO)
        text(c, row_x + 200, fy + 4, v, size=11, fill=INK, family=FONT_MONO)
        c.add(f'<line x1="{row_x + 24}" y1="{fy + 14}" x2="{row_x + row_w - 24}" y2="{fy + 14}" stroke="{RULE_SOFT}"/>')
        fy += 22

    # Snapshot detail (below)
    snap_y = 440
    snap_h = 150
    card(c, row_x, snap_y, row_w, snap_h, fill=GREEN_SOFT, stroke=GREEN)
    text(c, row_x + 16, snap_y + 22, "Each ProfileSnapshot in payload.profiles",
         size=12, weight=600, fill=INK)
    modules = ["general-settings", "column-templates", "column-customization",
               "calculated-columns", "column-groups", "conditional-styling",
               "saved-filters", "toolbar-visibility", "grid-state"]
    mx = row_x + 16
    my = snap_y + 50
    for m in modules:
        mw = 22 + len(m) * 7
        pill(c, mx, my, mw, 26, fill=SURFACE, stroke=GREEN, label=m, label_color=INK_SOFT)
        mx += mw + 8
        if mx + 200 > row_x + row_w:
            mx = row_x + 16
            my += 36
    text(c, row_x + 16, snap_y + snap_h - 16,
         "Each module entry carries its own schemaVersion + state shape (migrate runs on deserialize).",
         size=10.5, fill=INK_MUTED, italic=True)

    # Connecting arrow
    arrow(c, 200, 166, 200, 200, color=INK_FAINT, marker="arrow-soft",
          label="serializeAll() →")
    arrow(c, W / 2, 400, W / 2, 440, color=INK_FAINT, marker="arrow-soft",
          label="payload.profiles[ i ]")
    return c.render()


def fig_07_data_services() -> str:
    """3 widgets on left, SharedWorker box in middle, network on right.
    With real iconography for widgets / server / broker / REST."""
    W, H = 1040, 660
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="DataServices — one connection per provider",
                subtitle="A SharedWorker multiplexes many widget subscribers onto one upstream.",
                accent=ORANGE)

    # Left lane: consumers
    cluster(c, 40, 110, 290, 480, label="Main thread", accent=BLUE)
    widgets = [
        ("MarketsGrid #1", "useProviderStream(...)", "react"),
        ("MarketsGrid #2", "useProviderStream(...)", "react"),
        ("Chart widget",    "useProviderStream(...)", "react"),
        ("useAppData()",    "template binders",       "react"),
    ]
    for i, (n, s, ico) in enumerate(widgets):
        chip(c, 60, 140 + i * 76, 250, 56, accent=BLUE, label=n, sublabel=s,
             icon_name=ico)
    # SDK box at bottom of left lane
    card(c, 60, 460, 250, 110, fill=SURFACE_2, stroke=RULE, shadow=False)
    icon(c, 70, 478, 36, "typescript")
    text(c, 116, 492, "DataServicesProvider", size=12, weight=600, fill=INK)
    text(c, 116, 508, "React hooks / Angular inject*", size=10, fill=INK_MUTED)
    text(c, 70,  540, "(SharedWorkerDataServicesClient", size=10, fill=INK_SOFT, family=FONT_MONO)
    text(c, 70,  554, "  over a MessagePort)",            size=10, fill=INK_SOFT, family=FONT_MONO)

    # Middle: SharedWorker
    cluster(c, 380, 110, 360, 480, label="SharedWorker", accent=ORANGE)
    # Hub with icon
    card(c, 400, 140, 320, 110, fill=SURFACE, stroke=RULE)
    c.add(f'<rect x="400" y="140" width="3" height="110" rx="1.5" ry="1.5" fill="{ORANGE}"/>')
    icon(c, 412, 152, 36, "server")
    text(c, 458, 168, "SharedWorker Hub", size=13, weight=600, fill=INK)
    multi_text(c, 458, 192,
               ["per-(providerId) RowCache",
                "BroadcastManager fan-out",
                "1Hz stats sampler · singleFlight dedup"],
               size=10.5, fill=INK_SOFT, leading=1.45)

    # Stores
    card(c, 400, 270, 320, 56, fill=SURFACE, stroke=RULE)
    c.add(f'<rect x="400" y="270" width="3" height="56" rx="1.5" ry="1.5" fill="{AMBER}"/>')
    icon(c, 412, 280, 32, "storage")
    text(c, 456, 296, "WorkerAppDataStore", size=12, weight=600, fill=INK)
    text(c, 456, 312, "persists via ConfigManager", size=10, fill=INK_MUTED)

    card(c, 400, 340, 320, 56, fill=SURFACE, stroke=RULE)
    c.add(f'<rect x="400" y="340" width="3" height="56" rx="1.5" ry="1.5" fill="{AMBER}"/>')
    icon(c, 412, 350, 32, "rack")
    text(c, 456, 366, "provider registry", size=12, weight=600, fill=INK)
    text(c, 456, 382, "registerProvider · startProvider", size=10, fill=INK_MUTED)

    # Transports
    banded_card(c, 400, 415, 320, 160, accent=AMBER, title="Transports",
                body_lines=["startStomp · probeStomp",
                            "startRest · probeRest",
                            "startMock (universe / position / trade)"])

    # Right: network
    cluster(c, 790, 110, 220, 480, label="Network", accent=TEAL)
    # STOMP broker tile
    card(c, 810, 170, 180, 130, fill=SURFACE, stroke=RULE, rx=10)
    icon(c, 810 + (180 - 56) / 2, 188, 56, "activemq")
    text(c, 900, 268, "STOMP broker", size=12, weight=600, fill=INK, anchor="middle")
    text(c, 900, 284, "stomp-view-server", size=10, fill=INK_MUTED, anchor="middle")

    # REST tile
    card(c, 810, 340, 180, 130, fill=SURFACE, stroke=RULE, rx=10)
    icon(c, 810 + (180 - 56) / 2, 358, 56, "api-gateway")
    text(c, 900, 438, "REST endpoints", size=12, weight=600, fill=INK, anchor="middle")
    text(c, 900, 454, "HTTP API",        size=10, fill=INK_MUTED, anchor="middle")

    # Arrows
    for i in range(4):
        y = 168 + i * 76
        arrow(c, 310, y, 400, y, color=INK_FAINT, marker="arrow-soft")
    # SDK → hub
    arrow(c, 310, 515, 400, 195, color=INK_SOFT, marker="arrow",
          curved=True, curvature=0.10, label="MessagePort", label_offset=(0, -30))
    # Hub → stores (dashed = uses)
    arrow(c, 560, 250, 560, 270, color=INK_FAINT, marker="arrow-soft", style="dashed")
    arrow(c, 560, 326, 560, 340, color=INK_FAINT, marker="arrow-soft", style="dashed")
    arrow(c, 560, 396, 560, 415, color=INK_FAINT, marker="arrow-soft")
    # Transports → network
    arrow(c, 720, 470, 810, 235, color=INK_FAINT, marker="arrow-soft",
          curved=True, curvature=-0.10)
    arrow(c, 720, 470, 810, 405, color=INK_FAINT, marker="arrow-soft",
          curved=True, curvature=0.05)
    return c.render()


def fig_08_template_resolution() -> str:
    """Two-stage pipeline: brace (main) → bracket (worker)."""
    W, H = 1000, 540
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="Template resolution — {{name.key}}  then  [token]",
                subtitle="Two stages: AppData lookup on the main thread, per-attach IDs in the worker.",
                accent=AMBER)

    # Source (top)
    card(c, 40, 110, W - 80, 80, fill=SURFACE_2, stroke=RULE)
    text(c, 56, 132, "User-authored provider config", size=11, weight=600, fill=INK_MUTED)
    multi_text(c, 56, 152, [
        "listenerTopic:  /topic/positions/{{user.id}}/[clientTag]",
        "requestBody:    {\"corr\":\"[clientTag]\",\"tag\":\"[corr]\"}",
        "websocketUrl:   wss://{{infra.host}}:{{infra.port}}",
    ], size=11, fill=INK_SOFT, family=FONT_MONO)

    # Stage 1 (left)
    stage_y = 230
    stage_w = 440
    stage_h = 200
    banded_card(c, 40, stage_y, stage_w, stage_h, accent=BLUE,
                title="① Main thread — useResolvedCfg",
                body_lines=[
                    "resolveCfg(cfg, lookup)",
                    "• deep-walks every string in the config",
                    "• replaces {{name.key}}  →  AppData[name][key]",
                    "• AppData mutation → hook re-attaches",
                    "",
                    "When step 1 finishes:",
                    "  braces gone, [brackets] remain.",
                ])

    # Stage 2 (right)
    banded_card(c, 520, stage_y, stage_w, stage_h, accent=ORANGE,
                title="② SharedWorker — startProvider",
                body_lines=[
                    "resolveBracketCfg(cfg, cache)",
                    "• fresh BracketCache per startProvider",
                    "• [name] → 12-char alphanumeric ID",
                    "• same [name] resolves identically across",
                    "  every field of one config",
                    "• stop + re-attach mints a fresh value",
                ])

    # Arrow between stages
    arrow(c, 480, stage_y + stage_h / 2, 520, stage_y + stage_h / 2,
          color=INK_SOFT, label="cfg →")

    # Footer note
    note(c, 40, 460, W - 80, 60,
         lines=["Grammar:  /[A-Za-z_][A-Za-z0-9_-]*/  — non-matching tokens (JSON arrays like [1,2,3]) are left untouched."],
         accent=AMBER)

    return c.render()


def fig_09_profile_lifecycle() -> str:
    """4-node state machine + the switch-while-dirty path.  Right-angle paths."""
    W, H = 1000, 660
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="Profile lifecycle",
                subtitle="Explicit Save only.  The Save button is the single write path.",
                accent=GREEN)

    # ── Main row of 4 states ──────────────────────────────────────────────
    sw, sh = 180, 140
    top_y = 140
    cx_list = [50, 280, 510, 740]   # left edges
    cx_mid  = [x + sw / 2 for x in cx_list]
    states = [
        ("BOOT",   "load bundle row\napply snapshot\nresolve activeId",        BLUE),
        ("CLEAN",  "live == persisted\nno DirtyDot\nno beforeunload",          GREEN),
        ("DIRTY",  "isDirty flips\nDirtyBus broadcasts\nSave button armed",    AMBER),
        ("SAVING", "captureGridStateInto\nserializeAll → row\n__v++",          TEAL),
    ]
    for i, (name, body, accent) in enumerate(states):
        banded_card(c, cx_list[i], top_y, sw, sh, accent=accent,
                    title=name, body_lines=body.split("\n"))

    arrow_y = top_y + sh / 2
    label_y = top_y - 8           # labels sit above the cards
    arrow(c, cx_list[0] + sw, arrow_y, cx_list[1], arrow_y,
          color=INK_SOFT, marker="arrow")
    arrow(c, cx_list[1] + sw, arrow_y, cx_list[2], arrow_y,
          color=INK_SOFT, marker="arrow",
          label="state mutation", label_offset=(0, label_y - arrow_y))
    arrow(c, cx_list[2] + sw, arrow_y, cx_list[3], arrow_y,
          color=INK_SOFT, marker="arrow",
          label="click SAVE", label_offset=(0, label_y - arrow_y))

    # ── SWITCH dialog card (lower middle) ─────────────────────────────────
    sw_x = cx_list[2]
    sw_y = 380
    sw_h = 130
    banded_card(c, sw_x, sw_y, sw, sw_h, accent=AMBER,
                title="SWITCH (while dirty)",
                subtitle="shadcn AlertDialog",
                body_lines=["Save & switch", "Discard changes", "Cancel"])

    # ── DIRTY → SWITCH (straight down) ────────────────────────────────────
    arrow(c, cx_mid[2], top_y + sh, sw_x + sw / 2, sw_y,
          color=INK_SOFT, marker="arrow",
          label="pick different profile", label_offset=(0, 0))

    def label_box(x: float, y: float, s: str, fill=SURFACE, ink=INK_MUTED):
        w_lbl = 14 + len(s) * 6.6
        c.add(f'<rect x="{x - w_lbl / 2}" y="{y - 10}" width="{w_lbl}" height="16" rx="3" ry="3" fill="{fill}" stroke="{RULE_SOFT}"/>')
        text(c, x, y + 2, s, size=10, weight=500, fill=ink, anchor="middle")

    def path(d: str, stroke: str, marker: str = "arrow-soft", width: float = 1.4):
        c.add(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{width}" '
              f'marker-end="url(#{marker})"/>')

    # ── SAVING → CLEAN (success loop):  U-shape underneath everything ────
    u_y = 620
    path(f"M{cx_mid[3]} {top_y + sh} "
         f"V{u_y} "
         f"H{cx_mid[1]} "
         f"V{top_y + sh + 6}",
         stroke=GREEN)
    label_box((cx_mid[3] + cx_mid[1]) / 2, u_y - 4, "profile:saved", ink=GREEN)

    # ── Save & switch: SWITCH right edge → SAVING bottom ─────────────────
    bend_y = sw_y + sw_h + 30
    path(f"M{sw_x + sw} {sw_y + sw_h / 2} "
         f"H{cx_mid[3] + 90} "
         f"V{bend_y - 60} "
         f"H{cx_mid[3]} "
         f"V{top_y + sh + 6}",
         stroke=INK_SOFT)
    label_box(cx_mid[3] + 95, sw_y + sw_h / 2 - 12, "Save & switch")

    # ── Discard: SWITCH left edge → CLEAN bottom ─────────────────────────
    path(f"M{sw_x} {sw_y + sw_h / 2} "
         f"H{cx_mid[1] - 90} "
         f"V{bend_y - 60} "
         f"H{cx_mid[1]} "
         f"V{top_y + sh + 6}",
         stroke="#a0526b")
    label_box(cx_mid[1] - 95, sw_y + sw_h / 2 - 12, "Discard", ink="#a0526b")

    # Cancel → DIRTY (small arrow from top of SWITCH back up — implicit
    # close, drawn faint to avoid clutter)
    return c.render()


def fig_10_marketsgrid_composition() -> str:
    """Three nested layers: widget → customizer → core."""
    W, H = 1080, 700
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="<MarketsGrid> composition",
                subtitle="One React component that composes three packages.",
                accent=GREEN)

    # Outer: markets-grid cluster
    cluster(c, 50, 120, W - 100, 540,
            label="@starui/markets-grid (the widget root)", accent=GREEN)
    # React badge on the outer cluster
    icon(c, W - 100, 110, 32, "react")

    # Chrome row (3 columns × 2 rows)
    chrome = [
        ("PrimaryToolbar",    "caption · brush · profile · save · settings"),
        ("FiltersToolbar",    "saved-filter pills, add / edit / trash"),
        ("FormattingToolbar", "poppable / DraggableFloat panel"),
        ("SettingsSheet",     "9 module panels (Poppable)"),
        ("ProfileSelector",   "create / clone / rename / delete"),
        ("HelpPanel",         "Excel + expressions reference"),
    ]
    chrome_x0 = 70
    chrome_y0 = 160
    chip_w, chip_h = 310, 56
    gap_x, gap_y = 16, 12
    for i, (n, sub) in enumerate(chrome):
        x = chrome_x0 + (i % 3) * (chip_w + gap_x)
        y = chrome_y0 + (i // 3) * (chip_h + gap_y)
        chip(c, x, y, chip_w, chip_h, accent=GREEN, label=n, sublabel=sub)

    # Inner: grid-react cluster
    inner_y = chrome_y0 + 2 * (chip_h + gap_y) + 18
    cluster(c, 90, inner_y, W - 180, 180, label="@starui/grid-react", accent=AMBER)
    inner_cards = [
        ("9 registered modules", [
            "general-settings · column-templates",
            "column-customization · calculated-columns",
            "column-groups · conditional-styling",
            "saved-filters · toolbar-visibility · grid-state",
        ]),
        ("Editor primitives", [
            "Cockpit SettingsPanel · StyleEditor",
            "FormatterPicker · format-editor",
            "ExpressionEditor (Monaco) · PopoutPortal",
            "Poppable · local shadcn primitives",
        ]),
    ]
    inner_card_w = (W - 180 - 80) / 2
    for i, (n, lines) in enumerate(inner_cards):
        x = 110 + i * (inner_card_w + 20)
        banded_card(c, x, inner_y + 30, inner_card_w, 140,
                    accent=AMBER, title=n, body_lines=lines)

    # Innermost: core cluster
    core_y = inner_y + 200
    cluster(c, 200, core_y, W - 400, 90, label="@starui/core (vanilla TS)", accent=TEAL)
    core_w = (W - 400 - 60) / 2
    chip(c, 220, core_y + 24, core_w, 56, accent=TEAL,
         label="GridPlatform",
         sublabel="ApiHub · DirtyBus · EventBus · PipelineRunner")
    chip(c, 220 + core_w + 20, core_y + 24, core_w, 56, accent=TEAL,
         label="ProfileManager + ExpressionEngine",
         sublabel="HistoryStack · StorageAdapter")
    return c.render()


def fig_11_module_pipeline() -> str:
    """Horizontal pipeline of 9 modules with priorities labelled."""
    W, H = 1080, 540
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="Module pipeline",
                subtitle="Modules transform columnDefs / gridOptions in priority order.",
                accent=INDIGO)

    modules = [
        ("general-settings",     0,   BLUE,      "Grid Options",       "transform"),
        ("column-templates",     5,   PURPLE,    "passive holder",     "state only"),
        ("column-customization", 10,  TEAL,      "8-band per-column",  "transform"),
        ("calculated-columns",   15,  AMBER,     "virtual columns",    "transform"),
        ("column-groups",        18,  GREEN,     "nestable groups",    "transform"),
        ("conditional-styling",  20,  ORANGE,    "rules + flash",      "transform"),
        ("grid-state",          200,  INDIGO,    "native AG state",    "transform"),
        ("toolbar-visibility", 1000,  INK_MUTED, "chrome only",        "no transform"),
        ("saved-filters",     1001,   INK_MUTED, "host filter shape",  "no transform"),
    ]
    # 3 columns × 3 rows
    cols = 3
    cw, ch = 320, 100
    gap_x, gap_y = 14, 22
    base_y = 110
    margin_x = 40
    for i, (name, prio, accent, body, kind) in enumerate(modules):
        col = i % cols
        row = i // cols
        x = margin_x + col * (cw + gap_x)
        y = base_y + row * (ch + gap_y)
        card(c, x, y, cw, ch, fill=SURFACE, stroke=RULE)
        c.add(f'<rect x="{x}" y="{y}" width="3" height="{ch}" rx="1.5" ry="1.5" fill="{accent}"/>')
        text(c, x + 16, y + 24, name, size=13, weight=600, fill=INK)
        # Priority chip top-right
        pill(c, x + cw - 64, y + 10, 50, 22, fill=SURFACE_3,
             label=f"p{prio}", label_color=INK_SOFT, size=11, weight=600)
        text(c, x + 16, y + 50, body, size=11, fill=INK_MUTED)
        text(c, x + 16, y + ch - 14, kind, size=10, fill=INK_FAINT, italic=True)
        # In-row arrow to next card
        if col < cols - 1 and i < len(modules) - 1:
            ax1 = x + cw + 2
            ax2 = x + cw + gap_x - 2
            ay  = y + ch / 2
            arrow(c, ax1, ay, ax2, ay, color=INK_FAINT, marker="arrow-soft")
        # Row-wrap arrow (last col → first col of next row): U-turn
        if col == cols - 1 and i < len(modules) - 1:
            # right edge → down → left → first card of next row
            mid_y = y + ch + gap_y / 2
            c.add(f'<path d="M{x + cw + 2} {y + ch / 2} '
                  f'L{x + cw + 6} {y + ch / 2} '
                  f'L{x + cw + 6} {mid_y} '
                  f'L{margin_x - 6} {mid_y} '
                  f'L{margin_x - 6} {y + ch + gap_y + ch / 2} '
                  f'L{margin_x - 2} {y + ch + gap_y + ch / 2}" '
                  f'fill="none" stroke="{INK_FAINT}" stroke-width="1.4" marker-end="url(#arrow-soft)"/>')

    # Footer note
    note(c, margin_x, H - 80, W - 2 * margin_x, 56,
         lines=["Modules read each other through ctx.getModuleState<T>(moduleId) — no direct imports between module files.",
                "Each exports schemaVersion + initialState + serialize/deserialize/migrate, optional transform*() and activate()."],
         accent=INDIGO)
    return c.render()


def fig_12_openfin_hosting() -> str:
    """Sequence-y flow: manifest → provider → dock → views."""
    W, H = 980, 600
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="OpenFin hosting — boot sequence",
                subtitle="Manifest → hidden provider window → dock → per-view OpenFin Views.",
                accent=AMBER)

    # 4 boxes in a horizontal chain (top row)
    chain = [
        ("①  manifest.fin.json",     ["customSettings.useRest", "configServiceRestUrl",
                                       "platform.url → provider"]),
        ("②  /platform/provider",    ["initWorkspace()",
                                       "registers Home / Store / Dock /\n  Notifications",
                                       "installs CustomActions map",
                                       "background prefetch of route chunks"]),
        ("③  Dock buttons",          ["authored via WorkspaceSetup",
                                       "ACTION_LAUNCH_COMPONENT",
                                       "launchRegisteredComponent(entryId)"]),
        ("④  OpenFin Views",        ["customData carries",
                                       " instanceId · templateId · component-",
                                       " Type / SubType · appId · userId ·",
                                       " configServiceRestUrl",
                                       "(+ savedTitle, activeProfileId)"]),
    ]
    cw, ch = 220, 230
    gap = 16
    for i, (title, lines) in enumerate(chain):
        x = 40 + i * (cw + gap)
        y = 110
        card(c, x, y, cw, ch, fill=SURFACE, stroke=RULE)
        c.add(f'<rect x="{x}" y="{y}" width="3" height="{ch}" rx="1.5" ry="1.5" fill="{AMBER}"/>')
        text(c, x + 14, y + 24, title, size=13, weight=600, fill=INK)
        multi_text(c, x + 14, y + 50,
                   [ln for grp in lines for ln in grp.split("\n")],
                   size=11, fill=INK_SOFT, leading=1.55)
        if i < 3:
            arrow(c, x + cw, y + ch / 2, x + cw + gap, y + ch / 2,
                  color=INK_SOFT, marker="arrow")
    # Views listed below
    views_y = 380
    cluster(c, 40, views_y, W - 80, 180, label="Routes opened as Views", accent=AMBER)
    views = [
        ("/blotters/marketsgrid",  "HostedMarketsGrid"),
        ("/dataproviders",         "DataProviderEditor"),
        ("/config-browser",        "ConfigBrowserPanel"),
        ("/workspace-setup",       "WorkspaceSetup"),
        ("/rename-view-tab",       "popout (Save Tab As…)"),
    ]
    vx = 60
    vy = views_y + 30
    for i, (path, comp) in enumerate(views):
        chip(c, vx + (i % 5) * 175, vy + (i // 5) * 60, 165, 50,
             accent=BLUE, label=path, sublabel=comp)
    return c.render()


def fig_13_hosted_markets_grid() -> str:
    """Single-component wrapper — flat stack from outside in."""
    stack = [
        ("useHostedIdentity()",
         ["resolves OpenFin / browser identity",
          "builds storage factory"], AMBER),
        ("useAgGridTheme()",
         ["reads [data-theme], returns Quartz theme"], BLUE),
        ("useHostedView()",
         ["useIab · useOpenFinChannel",
          "useTabsHidden · useWorkspaceSaveEvent",
          "useColorLinking · useFdc3Channel"], PURPLE),
        ("<DataServicesProvider>",
         ["eager hydration"], ORANGE),
        ("<ConfigManagerLoadingGuard>",
         ["blocks until ConfigManager ready"], TEAL),
        ("<MarketsGridContainer>",
         ["two-provider model (live + historical)",
          "Shift+Ctrl+P chord toolbar",
          "gridLevelData persistence"], INDIGO),
        ("<MarketsGrid>",
         ["the actual widget + handle exposed up"], GREEN),
    ]
    # Per-card heights based on body line count
    sx, sw = 40, 520
    gap = 14
    title_h = 90
    heights = [max(70, 50 + 18 * len(lines)) for _t, lines, _a in stack]
    stack_h = sum(heights) + gap * (len(stack) - 1)
    W = 940
    H = title_h + stack_h + 60
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="<HostedMarketsGrid> — flat composition",
                subtitle="A six-deep stack collapsed into one component. Hooks attach OpenFin lifecycle.",
                accent=GREEN)

    y = title_h + 10
    for i, ((n, lines, accent), sh) in enumerate(zip(stack, heights)):
        banded_card(c, sx, y, sw, sh, accent=accent, title=n, body_lines=lines)
        if i < len(stack) - 1:
            arrow(c, sx + sw / 2, y + sh, sx + sw / 2, y + sh + gap,
                  color=INK_FAINT, marker="arrow-soft")
        y += sh + gap

    # Right column: before/after note
    note_x = sx + sw + 40
    note_w = W - note_x - 40
    card(c, note_x, title_h + 10, note_w, 180, fill=BLUE_SOFT, stroke=BLUE)
    text(c, note_x + 16, title_h + 32, "Before consolidation", size=11, weight=600, fill=INK_MUTED)
    multi_text(c, note_x + 16, title_h + 52,
               ["BlottersMarketsGrid",
                "→ HostedFeatureView",
                "  → HostedComponent",
                "    → BlotterGrid",
                "      → MarketsGridContainer",
                "        → MarketsGrid"],
               size=11, fill=INK_SOFT, family=FONT_MONO, leading=1.55)
    text(c, note_x + 16, title_h + 170, "→ collapsed to the stack on the left.",
         size=10, fill=INK_MUTED, italic=True)

    card(c, note_x, title_h + 210, note_w, 130, fill=SURFACE, stroke=RULE)
    text(c, note_x + 16, title_h + 232, "Net effect", size=11, weight=600, fill=INK_MUTED)
    multi_text(c, note_x + 16, title_h + 254,
               ["727 LOC removed across 4 files",
                "≈ 225 LOC of wrapper + hooks",
                "Flat props (no gridProps hatch)",
                "Public contract documented in README"],
               size=11, fill=INK_SOFT, leading=1.5)
    return c.render()


def fig_14_save_tab_as() -> str:
    """Numbered 5-step sequence."""
    steps = [
        ("①  Right-click view tab",
         ["WorkspacePlatformOverride.openViewTabContextMenu",
          "injects the menu item via injectRenameMenuItem."]),
        ("②  Open frameless popout",
         ["ACTION_RENAME_VIEW_TAB fires.",
          "openChildWindow(/rename-view-tab) with",
          "customData = { view, currentTitle }."]),
        ("③  Popout form",
         ["shadcn Card + Input seeded with currentTitle.",
          "Enter / Save commits, Esc / Cancel closes."]),
        ("④  On confirm, two writes",
         ["executeJavaScript: document.title = newTitle",
          "   → workspace tabstrip updates immediately",
          "view.updateOptions({ customData: { …, savedTitle } })",
          "   → captured by getSnapshot()"]),
        ("⑤  Next workspace load",
         ["OpenFinRuntime.applySavedViewTitle()",
          "• reads customData.savedTitle",
          "• reapplies to document.title",
          "• MutationObserver guards for 3 s post-boot"]),
    ]
    sx_w = 880
    sx = 40
    # Variable card height — enough room for title (~44 px from top) + body
    card_heights = [max(100, 60 + 18 * len(lines)) for _h, lines in steps]
    gap = 14
    title_h = 90  # space for title block
    note_h = 80
    note_gap = 24
    H = title_h + sum(card_heights) + gap * (len(steps) - 1) + note_gap + note_h + 24
    W = sx + sx_w + 40
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="\"Save Tab As…\" — survives workspace restore",
                subtitle="A rename writes both document.title (live) and customData.savedTitle (snapshot).",
                accent=PURPLE)
    y = title_h + 20
    for i, (h, lines) in enumerate(steps):
        sh = card_heights[i]
        banded_card(c, sx, y, sx_w, sh, accent=PURPLE, title=h,
                    body_lines=lines)
        y += sh + gap
    # Trailing note (well below the last card)
    note(c, sx, y + note_gap - gap, sx_w, note_h,
         lines=["Why two writes?  View.updateOptions({ title }) is silently dropped at runtime —",
                "`title` lives on the create-time ViewOptions shape, not on MutableViewOptions.",
                "Hence document.title (live tabstrip) + customData.savedTitle (workspace snapshot)."],
         accent=PURPLE)
    return c.render()


def fig_15_app_composition() -> str:
    """Six app cards with icons for stack identification."""
    W, H = 1080, 620
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="App compositions",
                subtitle="Six apps, three patterns — pick the one closest to your use case.",
                accent=ORANGE)

    apps = [
        ("apps/demo-react",
         "Primary E2E target", "react",
         ["AppShell over BrowserRuntime",
          "URL view switcher",
          "  (single · dashboard · depth · …)",
          "Live ticking · showcase profile seed"],
         BLUE),
        ("apps/demo-configservice-react",
         "Multi-user demo", "react",
         ["AppShell over BrowserRuntime",
          "Header user picker (dev1 / alice / bob)",
          "scopedActiveProfileKey per user",
          "ConfigBrowser via window.open popout"],
         INDIGO),
        ("apps/markets-ui-react-reference",
         "OpenFin shell", "react",
         ["OpenFinRuntime when isOpenFin()",
          "/platform/provider · /blotters/marketsgrid",
          "/dataproviders · /config-browser",
          "/workspace-setup · /rename-view-tab"],
         AMBER),
        ("apps/demo-apps/basic-starui-app",
         "Minimal example", "react",
         ["createMarketsGridLocalStorageStorage()",
          "No AppShell · No ConfigService",
          "StatusStrip + ConfigInspector read",
          "the same localStorage bundle key"],
         GREEN),
        ("apps/demo-angular",
         "Angular dock-manager demo", "angular",
         ["32 standalone widget components",
          "DockManagerCoreComponent layouts",
          "PrimeNG (ChromaDeskPreset)",
          "Consumes only @starui/design-system today"],
         PURPLE),
        ("apps/stomp-view-server",
         "Dev-time data source", "nodejs",
         ["Node + ws on :8081",
          "Synthetic FI snapshots (~20k rows)",
          "/health · / metadata endpoints",
          "Used by demo MarketsGrid blotters"],
         TEAL),
    ]
    cw, ch = 320, 200
    gx, gy = 20, 20
    for i, (name, role, ico, body, accent) in enumerate(apps):
        x = 40 + (i % 3) * (cw + gx)
        y = 110 + (i // 3) * (ch + gy)
        # Card frame
        card(c, x, y, cw, ch, fill=SURFACE, stroke=RULE)
        c.add(f'<rect x="{x}" y="{y}" width="3" height="{ch}" rx="1.5" ry="1.5" fill="{accent}"/>')
        # Icon top-right
        icon(c, x + cw - 56, y + 14, 42, ico)
        # Header
        text(c, x + 16, y + 26, name, size=13, weight=600, fill=INK)
        text(c, x + 16, y + 44, role, size=10.5, weight=500, fill=INK_MUTED)
        # Hairline
        c.add(f'<line x1="{x + 16}" y1="{y + 60}" x2="{x + cw - 16}" y2="{y + 60}" '
              f'stroke="{RULE_SOFT}"/>')
        multi_text(c, x + 16, y + 80, body, size=11, fill=INK_SOFT, leading=1.55)
    return c.render()


def fig_16_mcp_scaffolding() -> str:
    """MCP scaffolding server — developer → MCP → generated StarUI app."""
    W, H = 1080, 660
    c = Canvas(W, H, [])
    title_block(c, 40, 36, title="StarUI MCP — scaffolding server",
                subtitle="One prompt → fully-wired application. The framework's config-driven seams are the API surface.",
                accent=PURPLE)

    # Developer / IDE on the left
    cluster(c, 40, 110, 260, 420, label="Developer", accent=BLUE)
    icon(c, 40 + (260 - 64) / 2, 140, 64, "user")
    text(c, 40 + 130, 222, "Engineer in IDE / chat",
         size=12, weight=600, fill=INK, anchor="middle")
    text(c, 40 + 130, 240, "(natural-language prompt)",
         size=10, fill=INK_MUTED, anchor="middle")

    # Quote-style prompt
    card(c, 60, 270, 220, 220, fill=BLUE_SOFT, stroke=BLUE)
    text(c, 70, 290, "“Build a bond blotter",
         size=11, italic=True, fill=INK)
    text(c, 70, 306, "  dashboard with two",
         size=11, italic=True, fill=INK)
    text(c, 70, 322, "  MarketsGrids hosted in",
         size=11, italic=True, fill=INK)
    text(c, 70, 338, "  OpenFin, wired to my",
         size=11, italic=True, fill=INK)
    text(c, 70, 354, "  STOMP feed.”",
         size=11, italic=True, fill=INK)
    text(c, 70, 388, "→ resolves to:",
         size=10, fill=INK_MUTED)
    multi_text(c, 70, 410,
               ["• AppShell + BrowserRuntime",
                "  / OpenFinRuntime",
                "• ConfigManager bootstrap",
                "• DataServices SharedWorker",
                "• 2× HostedMarketsGrid",
                "• Provider config",
                "• Routes + manifest"],
               size=10, fill=INK_SOFT, leading=1.45)

    # MCP server in the middle
    cluster(c, 360, 110, 360, 420, label="@starui/mcp-server", accent=PURPLE)
    icon(c, 360 + (360 - 64) / 2, 140, 64, "server")
    text(c, 360 + 180, 222, "StarUI MCP server",
         size=13, weight=600, fill=INK, anchor="middle")
    text(c, 360 + 180, 240, "Model Context Protocol",
         size=10, fill=INK_MUTED, anchor="middle")

    # Tools / responsibilities
    tools = [
        ("read_registry",         "What components are available?"),
        ("read_config",           "What providers / profiles exist?"),
        ("scaffold_app",          "Generate app skeleton + wiring"),
        ("add_component",         "Drop a configured widget in"),
        ("configure_provider",    "Wire a STOMP / REST source"),
        ("apply_edit",            "Write the files (MCP tools)"),
    ]
    for i, (name, body) in enumerate(tools):
        x = 380
        y = 280 + i * 36
        c.add(f'<rect x="{x}" y="{y}" width="320" height="30" rx="6" ry="6" '
              f'fill="{SURFACE}" stroke="{RULE}"/>')
        text(c, x + 12, y + 19, name, size=11, weight=600, fill=INK, family=FONT_MONO)
        text(c, x + 152, y + 19, body, size=10, fill=INK_MUTED)

    # StarUI framework on the right
    cluster(c, 780, 110, 260, 420, label="StarUI framework", accent=GREEN)
    icon(c, 780 + (260 - 64) / 2, 140, 64, "react")
    text(c, 780 + 130, 222, "Configuration-driven",
         size=12, weight=600, fill=INK, anchor="middle")
    text(c, 780 + 130, 240, "components + services",
         size=10, fill=INK_MUTED, anchor="middle")

    # Framework surface (callable API)
    surfaces = [
        "<AppShell>",
        "<HostedMarketsGrid>",
        "ConfigManager",
        "DataServices SharedWorker",
        "<DataProviderEditor>",
        "<WorkspaceSetup>",
        "registerProvider()",
        "createConfigServiceStorage()",
    ]
    sy = 280
    for s in surfaces:
        c.add(f'<rect x="800" y="{sy}" width="220" height="22" rx="11" ry="11" '
              f'fill="{GREEN_SOFT}" stroke="{GREEN}"/>')
        text(c, 800 + 110, sy + 15, s, size=10, weight=500, fill=INK,
             family=FONT_MONO, anchor="middle")
        sy += 28

    # Output — the generated app
    card(c, 60, 540, W - 120, 90, fill=AMBER_SOFT, stroke=AMBER)
    icon(c, 80, 555, 56, "javascript")
    text(c, 150, 568, "Generated application",
         size=13, weight=600, fill=INK)
    multi_text(c, 150, 588,
               ["apps/<your-app>/src/main.tsx · vite.config.ts · package.json deps",
                "ProviderStack wired correctly · routes registered · seed-config.json populated",
                "No 50-line boilerplate.  The MCP server lays out exactly the same composition the framework expects."],
               size=10.5, fill=INK_SOFT, leading=1.45)

    # Arrows
    arrow(c, 300, 280, 360, 280, color=INK_SOFT, marker="arrow",
          label="prompt", label_offset=(0, -16))
    arrow(c, 720, 280, 780, 280, color=INK_SOFT, marker="arrow",
          label="reads", label_offset=(0, -16))
    arrow(c, 720, 400, 780, 400, color=INK_SOFT, marker="arrow",
          label="composes", label_offset=(0, -16))
    arrow(c, 540, 510, 540, 540, color=INK_SOFT, marker="arrow",
          label="emits code", label_offset=(50, 0))

    return c.render()


# ─── Build ─────────────────────────────────────────────────────────────────

BUILDERS = [
    ("01-layer-model",            fig_01_layer_model),
    ("02-framework-matrix",       fig_02_framework_matrix),
    ("03-package-graph",          fig_03_package_graph),
    ("04-runtime-port",           fig_04_runtime_port),
    ("05-config-service",         fig_05_config_service),
    ("06-profile-bundle",         fig_06_profile_bundle),
    ("07-data-services",          fig_07_data_services),
    ("08-template-resolution",    fig_08_template_resolution),
    ("09-profile-lifecycle",      fig_09_profile_lifecycle),
    ("10-markets-grid-composition", fig_10_marketsgrid_composition),
    ("11-module-pipeline",        fig_11_module_pipeline),
    ("12-openfin-hosting",        fig_12_openfin_hosting),
    ("13-hosted-markets-grid",    fig_13_hosted_markets_grid),
    ("14-save-tab-as",            fig_14_save_tab_as),
    ("15-app-composition",        fig_15_app_composition),
    ("16-mcp-scaffolding",        fig_16_mcp_scaffolding),
]


def main() -> None:
    for name, builder in BUILDERS:
        svg = builder()
        path = OUT_DIR / f"{name}.svg"
        path.write_text(svg, encoding="utf-8")
        print(f"wrote {path.name} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
