"""Builds data/places.json and data/outlines.json from one-off BigQuery extractions (PRD §9.3, §9.4).

Run the three queries in jobs/ with `bq query --format=csv` and pass the CSVs:
    python jobs/overture-places.py places.csv outlines.csv zips.csv

places.json rows: [name, kind, state, population, wikidata, city, county, lat, lon, bbox | 0]
  kind: s state, c county, l city or town, m macrohood, n neighbourhood, u microhood, z zip code
  bbox: [minLon, minLat, maxLon, maxLat]
outlines.json: { "<ST>" or "<ST>|<county name>": simplified WKT }

Sources: Overture Maps Foundation divisions (ODbL; © Overture Maps Foundation, OpenStreetMap contributors) and
U.S. Census Bureau ZCTAs (public domain).
"""
import csv
import json
import sys

csv.field_size_limit(10**9)
KIND = {"region": "s", "county": "c", "locality": "l", "macrohood": "m", "neighborhood": "n", "microhood": "u"}


def num(x, cast=float):
    try:
        return cast(x)
    except (TypeError, ValueError):
        return None


def box(r):
    b = [num(r.get(k)) for k in ("xmin", "ymin", "xmax", "ymax")]
    return [round(v, 3) for v in b] if all(v is not None for v in b) else 0


def main(places_csv, outlines_csv, zips_csv):
    rows = []
    for r in csv.DictReader(open(places_csv, encoding="utf8", newline="")):
        kind = KIND.get(r["subtype"])
        lat, lon = num(r["lat"]), num(r["lon"])
        if not kind or not r["name"] or lat is None:
            continue
        pop = num(r["population"], int) or 0
        wd = 1 if r["wd"] == "true" else 0
        # Cities and towns: only ones with a population or a Wikidata entry (drops most unnamed hamlets).
        if kind == "l" and not pop and not wd:
            continue
        st = (r["region"] or "")[3:]
        # Neighbourhoods are named by their point; only states, counties and cities need a box and a county.
        big = kind in ("s", "c", "l")
        rows.append([r["name"], kind, st, pop, wd, r["city"] or "", r["county"] if big else "", round(lat, 3), round(lon, 3), box(r) if big else 0])
    for r in csv.DictReader(open(zips_csv, encoding="utf8", newline="")):
        lat, lon = num(r["lat"]), num(r["lon"])
        if lat is None:
            continue
        city = (r["city"] or "").removesuffix(" city").removesuffix(" town").removesuffix(" village")
        rows.append([r["zip"], "z", r["st"], 0, 0, city, "", round(lat, 3), round(lon, 3), box(r)])
    outlines = {}
    for r in csv.DictReader(open(outlines_csv, encoding="utf8", newline="")):
        if not r["wkt"]:
            continue
        st = (r["region"] or "")[3:]
        outlines[st if r["subtype"] == "region" else f"{st}|{r['name']}"] = r["wkt"]
    meta = {
        "source": "Overture Maps Foundation divisions (release 2026-09-23.1); U.S. Census Bureau ZCTAs",
        "license": "Overture: ODbL 1.0, © Overture Maps Foundation, OpenStreetMap contributors. Census: public domain.",
    }
    json.dump({**meta, "columns": ["name", "kind", "state", "population", "wikidata", "city", "county", "lat", "lon", "bbox"], "rows": rows},
              open("data/places.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({**meta, "outlines": outlines}, open("data/outlines.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    kinds = {}
    for r in rows:
        kinds[r[1]] = kinds.get(r[1], 0) + 1
    print(len(rows), kinds, len(outlines))


if __name__ == "__main__":
    main(*sys.argv[1:4])
