#!/usr/bin/env python3
"""Emit per-variant metadata.json sidecars (source + geometry) for the 5 TRI-R06
layout-variant proofs, sourced from the measured reference table (table30.json)
and the proof generator's layout geometry. No fabricated similarity percentages.
"""
import json, os

OUT = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(OUT, "..", "..", "..", ".."))
TABLE = os.path.join(ROOT, "scratch", "tri-r06", "table30.json")

CANVAS = {"widthIn": 17.0, "heightIn": 11.0, "scalePxPerIn": 144,
          "widthPx": 2448, "heightPx": 1584, "page": "letter-inner-spread"}

# Anchor -> measured values (from table30.json; see families.md for method).
ANCHORS = {
    "sparse-editorial": {
        "anchor": "example-14",
        "family": "editorial-light",
        "moduleBand": [4, 6], "photoBand": [1, 3], "datedRowBand": [0, 6],
        "anchorGeometry": {
            "modules": [
                "masthead rule + heading (left 96-616 x 58-150)",
                "two body paragraphs (left column 96-616 x 180-420)",
                "garden note kicker + para (left 96-616 x 1180-1320)",
                "hero rail photo 760x1180 at (1580,200)",
                "navy footer band 150px full width (visiting/chaplain/kitchen/contact)",
            ],
        },
    },
    "medium-panel": {
        "anchor": "example-02",
        "family": "community-collage",
        "moduleBand": [8, 12], "photoBand": [4, 8], "datedRowBand": [6, 14],
        "anchorGeometry": {
            "modules": [
                "masthead rule + heading (96-996 x 58-150)",
                "two feature stories left column (96-526 x 190-640)",
                "3-photo vertical stack (580-1100 x 190-1240)",
                "dated-events rail 460x980 at (1180,190), 10 rows, no birthdays",
                "navy footer band 150px full width",
            ],
        },
    },
    "dense-grid": {
        "anchor": "example-11",
        "family": "dense-lavender-grid",
        "moduleBand": [12, 18], "photoBand": [6, 12], "datedRowBand": [14, 30],
        "anchorGeometry": {
            "modules": [
                "6-photo mosaic band 320x300 tiles, x=96..1916 at y=200",
                "three feature stories (96/900/1608 x 560-700)",
                "three info panels 460x420 at y=830 (visiting/chapel, calendar 4-row, kitchen)",
                "navy footer band 150px full width",
            ],
        },
    },
    "long-copy-feature": {
        "anchor": "example-18",
        "family": "feature-band",
        "moduleBand": [6, 10], "photoBand": [2, 5], "datedRowBand": [0, 10],
        "anchorGeometry": {
            "modules": [
                "masthead rule + heading (96-1296 x 58-150)",
                "three long body paragraphs, 1050px column x 190-1120",
                "feature photo 620x500 at (1250,190)",
                "subhead + continuation (96-1146 x 660-1120)",
                "navy footer band 150px full width",
            ],
        },
    },
    "photo-heavy": {
        "anchor": "example-05",
        "family": "photo-mosaic",
        "moduleBand": [8, 14], "photoBand": [10, 16], "datedRowBand": [0, 8],
        "anchorGeometry": {
            "modules": [
                "masthead + lede (96-596 x 60-180)",
                "11-tile mosaic grid (96-2352 x 220-1060)",
                "full-width photo 2256x340 at (96,1100)",
                "caption strip (96-1196 x 1460-1500)",
                "no footer band; mosaic is the anchor",
            ],
        },
    },
}

table = json.load(open(TABLE))

for name, spec in ANCHORS.items():
    anchor_id = spec["anchor"]
    measured = table.get(anchor_id)
    doc = {
        "variant": name,
        "task": "TRI-R06 layout-variant proof (Trilogy pages 2-3 follow-up)",
        "source": {
            "anchor": anchor_id,
            "referenceFile": f"apps/api/src/reference/porter-examples/{anchor_id}.pdf",
            "measured": measured,
            "measurementMethod": "PyMuPDF: get_image_info (IoU>=0.6 merged) for photos, get_text length for chars, dated-row regex, get_fonts; raw table in scratch/tri-r06/table30.json",
            "specDivergenceFromAnchor": "Birthday roster and director headshot REMOVED per task requirement; all other grammar (panels, rails, footer, photo placement) kept from the anchor.",
        },
        "geometry": {"canvas": CANVAS, **spec["anchorGeometry"]},
        "bands": {
            "moduleBand": spec["moduleBand"],
            "photoBand": spec["photoBand"],
            "datedRowBand": spec["datedRowBand"],
            "note": "Bands are targets, not mandates. Sparse variants must not inherit a 12-18 module floor (see PORTER_GRAMMAR_TARGETS.sparseMinModules=4).",
        },
        "artifacts": {
            "html": f"variants/{name}.html",
            "png": f"variants/{name}.png",
            "generator": "variants/gen_proofs.py",
            "render": "variants/render_pngs.mjs (puppeteer-core, chromium-1217)",
        },
        "scoreNote": "No similarity percentages recorded. The porterReferenceAffinity metric is a weighted closeness band 0-1 (photo 0.18 / panel 0.18 / image 0.14 / content 0.14 / dark 0.10 / rails 0.10 / largest 0.08 / bottom 0.08), not a design-similarity percentage.",
    }
    path = os.path.join(OUT, f"{name}.metadata.json")
    json.dump(doc, open(path, "w"), indent=2)
    print("wrote", path)
