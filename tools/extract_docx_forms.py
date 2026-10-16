"""Reads the Kindergarten and Lower Primary reflection .docx files and adds them to public/form_def.json
Usage: python extract_docx_forms.py kindergarten.docx lower_primary.docx ../public/form_def.json
"""
import json, re, sys
import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

def clean(t): return re.sub(r"\s+", " ", t).strip()

def parse(path):
    d = docx.Document(path)
    out = {"general": [], "sections": [], "prepared_by": None}
    cur = None
    for el in d.element.body.iterchildren():
        if el.tag.endswith("}p"):
            for line in Paragraph(el, d).text.split("\n"):
                t = clean(line)
                if not t: continue
                m = re.match(r"^(\d+)\.\s+(.*)$", t)
                if m:
                    cur = {"num": int(m.group(1)), "title": m.group(2), "intro": "", "kind": None, "cols": [], "rows": []}
                    out["sections"].append(cur)
                elif t.startswith("Prepared by"):
                    out["prepared_by"] = "Prepared by"
                elif cur is None:
                    out.setdefault("head", []).append(t)
                elif cur["kind"] is None:
                    cur["intro"] = (cur["intro"] + " " + t).strip()
        elif el.tag.endswith("}tbl"):
            tb = Table(el, d)
            rows = []
            for r in tb.rows:
                seen, cells = [], []
                for c in r.cells:
                    if c._tc in seen: continue
                    seen.append(c._tc); cells.append(clean(c.text))
                rows.append(cells)
            if cur["num"] == 1:
                out["general"] = [r[0] for r in rows if r and r[0] and r[0] not in ("Item",)]
            elif rows[0][0] == "No.":
                cur["kind"] = "list"; cur["cols"] = rows[0][1:]; cur["rows"] = [r[0] for r in rows[1:]]
            else:
                cur["kind"] = "rows"; cur["cols"] = rows[0][:2]
                cur["rows"] = [r[0] for r in rows[1:] if r and r[0]]
    return out

kg, lp, target = parse(sys.argv[1]), parse(sys.argv[2]), sys.argv[3]
for f in (kg, lp):
    f["general"] = [x for g in f["general"] for x in ([ "Class Teacher", "Roll"] if g == "Class Teacher Roll" else [g])]  # KG doc has these two lines in one cell
    f["sections"] = [s for s in f["sections"] if s["num"] != 1]
defn = json.load(open(target, encoding="utf-8"))
defn["forms"] = {"kg": {"head": kg["head"], **{k: v for k, v in kg.items() if k != "head"}},
                 "lp": {"head": lp["head"], **{k: v for k, v in lp.items() if k != "head"}}}
json.dump(defn, open(target, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
for k, f in defn["forms"].items():
    print(k, f["head"], f["general"], f["prepared_by"])
    for s in f["sections"]: print("  ", s["num"], s["title"], s["kind"], s["cols"], len(s["rows"]), s["intro"][:40])
