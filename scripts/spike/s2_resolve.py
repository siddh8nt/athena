"""S2: resolve stockists, report match rate, save matches to .cache (Qloo IDs stay out of the repo)."""
import csv, json, os, random, sys

import qloo
from resolve import resolve_row, clean_venue

OUT = os.path.join(qloo.ROOT, ".cache", "resolved")
os.makedirs(OUT, exist_ok=True)


def run(csv_name, metro, sample=None, seed=7):
    rows = [r for r in csv.DictReader(open(os.path.join(qloo.ROOT, "proof", "stockists", csv_name), encoding="utf-8"))
            if r["metro"] == metro and r["is_chain"] == "no"]
    if sample:
        random.Random(seed).shuffle(rows)
        rows = rows[:sample]
    out = []
    for r in rows:
        status, ent, n = resolve_row(r)
        out.append({"venue": r["venue"], "address": r["address"], "lat": r["lat"], "lon": r["lon"], "status": status,
                    "qloo_id": ent["entity_id"] if ent else None, "qloo_name": ent["name"] if ent else None,
                    "qloo_address": (ent.get("properties") or {}).get("address") if ent else None,
                    "is_closed": (ent.get("properties") or {}).get("is_closed") if ent else None})
    tag = f"{csv_name.replace('.csv', '')}_{metro.replace(' ', '_')}{'_sample' if sample else ''}"
    json.dump(out, open(os.path.join(OUT, tag + ".json"), "w", encoding="utf-8"), indent=1)
    c = {s: sum(1 for o in out if o["status"] == s) for s in ("matched", "ambiguous", "unresolved")}
    print(f"{tag}: n={len(out)} matched={c['matched']} ({c['matched'] / len(out):.0%}) "
          f"ambiguous={c['ambiguous']} unresolved={c['unresolved']}")
    return out


if __name__ == "__main__":
    run("brightland.csv", "New York")
    run("brightland.csv", "Los Angeles")
    run("fishwife.csv", "New York", sample=40)
