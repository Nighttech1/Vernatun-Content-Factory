"""Render portable calendar exports from the synchronized editorial release feed."""
import csv
from html import escape
import json
from pathlib import Path

directory = Path(__file__).resolve().parents[1] / "projects/vernatun/content-plan/exports"
plan = json.loads((directory / "publication-plan-2026-v3.json").read_text())
fields = ["Дата", "Формат", "Тема", "Канал", "Ответственный", "Задание"]
rows = [[u["date"], u["format_name"], u["title"], ", ".join(u["channels"]),
         u["owner"], " ".join(u["outline"])] for u in plan["units"]]
rows.extend([[a[key] for key in ("date", "format", "title", "channel", "owner", "action")]
             for a in plan.get("announcements", [])])
rows.sort(key=lambda row: (row[0], row[2]))

with (directory / "vernatun_content_calendar.csv").open("w", newline="", encoding="utf-8-sig") as stream:
    writer = csv.writer(stream)
    writer.writerow(fields)
    writer.writerows(rows)

def render_row(cells, tag):
    return "<tr>" + "".join(f"<{tag}>{escape(cell)}</{tag}>" for cell in cells) + "</tr>"

html = """<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Вернатун · Календарь публикаций</title><style>
body{margin:auto;max-width:1100px;padding:2rem;font:16px/1.6 system-ui;color:#26302e;background:#faf7f1}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.5rem;vertical-align:top;border-bottom:1px solid #d6cfc0}
.wrap{overflow-x:auto}a{color:#275677}h1{line-height:1.2}td:first-child{white-space:nowrap}
</style><h1>Вернатун · Календарь публикаций</h1>"""
html += f"<p>Редакция {plan['sequence']} · Москва. <a href='https://content.vernatunspeakclub.com/growth'>Открыть актуальный план фабрики</a></p>"
html += "<div class='wrap'><table><thead>" + render_row(fields, "th") + "</thead><tbody>"
html += "".join(render_row(row, "td") for row in rows) + "</tbody></table></div></html>\n"
(directory / "vernatun_publication_plan_2026.html").write_text(html)
