"""Key-day spike checks S1, S3-S10, S12-S16 (PRD §18). Uses only the tuning brand (Brightland) as a signal."""
import json, os, statistics

import qloo

R = {}
BRIGHTLAND = "DAEC51CD-62AE-446B-B1E6-EE12FCC3F726"


def ids(name):
    return [r["qloo_id"] for r in json.load(open(os.path.join(qloo.ROOT, ".cache", "resolved", name + ".json")))
            if r["status"] == "matched" and not r.get("is_closed")]


NYC = ids("brightland_New_York")
ents = lambda resp: ((qloo.results(resp) or {}).get("entities") or []) if isinstance(qloo.results(resp), dict) else []

# S1
a = qloo.call("/", use_cache=False)
b = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "filter.location.query": "Chicago", "take": 1}, use_cache=False)
R["S1"] = {"pass": a["status"] == 200 and b["status"] == 200, "detail": f"GET / {a['status']}, insights {b['status']}"}

# S3 venue-type tags: find URN, then count venues in 3 metros
WANT = {"cafe": "cafe", "coffee shop": "coffee shop", "bakery": "bakery", "brunch": "brunch", "deli": "deli",
        "gourmet grocery": "gourmet grocery store", "gift shop": "gift shop", "home goods": "home goods store",
        "gym": "gym", "yoga studio": "yoga studio", "spa": "spa", "boutique hotel": "boutique hotel",
        "concept store": "concept store", "art gallery": "art gallery", "wine store": "wine store",
        "cheese shop": "cheese shop", "health food": "health food store", "candle store": "candle store"}
s3 = {}
for label, query in WANT.items():
    tags = (qloo.results(qloo.call("/v2/tags", {"filter.query": query, "take": 10})) or {}).get("tags", [])
    place = [t for t in tags if any("place" in (p.get("type") or "") for p in t.get("parents") or [])
             or "place" in (t.get("id") or "")]
    genre = [t for t in place if t["id"].startswith("urn:tag:genre:place")] or \
            [t for t in place if t["id"].startswith("urn:tag:category:place")] or place
    if not genre:
        s3[label] = {"urn": None}
        continue
    urn = genre[0]["id"]
    counts = {}
    for metro in ("New York City", "Los Angeles", "Chicago"):
        r = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "filter.tags": urn,
                                       "filter.location.query": metro, "take": 50})
        counts[metro] = len(ents(r)) if r["status"] == 200 else f"HTTP {r['status']}"
    s3[label] = {"urn": urn, "counts": counts,
                 "pass": all(isinstance(v, int) and v >= 20 for v in counts.values())}
R["S3"] = s3

CHANNELS = ",".join(v["urn"] for k, v in s3.items() if v.get("urn") and k in
                    ("cafe", "coffee shop", "bakery", "deli", "gourmet grocery", "gift shop", "home goods",
                     "wine store", "cheese shop", "health food"))
SIG = ",".join(NYC[:50])

# S4 metros via diversify
r = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "signal.interests.entities": SIG, "filter.tags": CHANNELS,
                               "operator.filter.tags": "union", "diversify.by": "properties.geocode.metro",
                               "diversify.take": 4, "take": 50, "filter.exclude.location.query": "New York City"})
metros = [((e.get("properties") or {}).get("geocode") or {}).get("metro") for e in ents(r)]
order = list(dict.fromkeys(m for m in metros if m))
R["S4"] = {"pass": len(order) >= 8, "detail": f"HTTP {r['status']}, {len(order)} metros", "metros": order[:12]}

# S5 heatmap + neighbourhoods
h = qloo.call("/v2/insights", {"filter.type": "urn:heatmap", "filter.location.query": "Los Angeles", "signal.interests.entities": SIG})
hm = (qloo.results(h) or {}).get("heatmap", []) if isinstance(qloo.results(h), dict) else []
hn = qloo.call("/v2/insights", {"filter.type": "urn:heatmap", "filter.location.query": "Los Angeles",
                                "signal.interests.entities": SIG, "output.heatmap.boundary": "neighborhood"})
hnm = (qloo.results(hn) or {}).get("heatmap", []) if isinstance(qloo.results(hn), dict) else []
R["S5"] = {"pass": bool(hm) and bool(hnm), "detail": f"geohash cells {len(hm)} (HTTP {h['status']}), neighbourhood rows {len(hnm)} (HTTP {hn['status']})",
           "sample_cell": hm[0] if hm else None, "sample_neighbourhood_keys": sorted((hnm[0] if hnm else {}).keys()),
           "sample_neighbourhood": hnm[0] if hnm else None}

# S6 explainability + S8 audience_growth (places)
p = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "signal.interests.entities": SIG, "filter.tags": CHANNELS,
                               "operator.filter.tags": "union", "filter.location.query": "Los Angeles",
                               "feature.explainability": "true", "take": 20})
pe = ents(p)
expl = [e for e in pe if (e.get("query") or {}).get("explainability")]
growth = [((e.get("query") or {}).get("measurements") or {}).get("audience_growth") for e in pe]
R["S6"] = {"pass": len(expl) > 0, "detail": f"{len(expl)}/{len(pe)} results carry explainability",
           "sample": (pe[0].get("query") or {}).get("explainability") if pe else None}
R["S8"] = {"pass": any(g not in (None, 0) for g in growth), "detail": f"audience_growth values: {sorted(set(map(str, growth)))[:8]}"}

# S7 filter.results.entities with 100 ids over GET
pool = []
for page in (1, 2):
    pr = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "filter.tags": CHANNELS, "operator.filter.tags": "union",
                                    "filter.location.query": "Los Angeles", "take": 50, "page": page})
    pool += [e["entity_id"] for e in ents(pr)]
pool = list(dict.fromkeys(pool))[:100]
s7 = qloo.call("/v2/insights", {"filter.type": "urn:entity:place", "signal.interests.entities": SIG,
                                "filter.results.entities": ",".join(pool), "take": 100})
R["S7"] = {"pass": s7["status"] == 200 and len(ents(s7)) >= 0.8 * len(pool),
           "detail": f"pool {len(pool)}, scored {len(ents(s7))}, HTTP {s7['status']}"}

# S9 brand recs from place signals (bridges)
s9 = qloo.call("/v2/insights", {"filter.type": "urn:entity:brand", "signal.interests.entities": SIG, "take": 50})
fb = [e for e in ents(s9) if any("food_and_beverage" in (t.get("tag_id") or t.get("id") or "") for t in e.get("tags") or [])]
R["S9"] = {"pass": len(fb) >= 20, "detail": f"{len(ents(s9))} brands, {len(fb)} food & beverage",
           "sample": [e["name"] for e in ents(s9)[:12]]}

# S10 several filter.tag.types
s10 = qloo.call("/v2/insights", {"filter.type": "urn:tag", "signal.interests.entities": SIG,
                                 "filter.tag.types": "urn:tag:ambience:qloo,urn:tag:decor:qloo", "take": 20})
tt = sorted({t.get("type") or "" for t in ((qloo.results(s10) or {}).get("tags") or [])}) if isinstance(qloo.results(s10), dict) else []
R["S10"] = {"pass": s10["status"] == 200 and len(tt) >= 2, "detail": f"HTTP {s10['status']}, tag types returned: {tt}"}

# S13 app + hardware demo brands
s13 = {}
for name in ["Partiful", "Timeleft", "Meetup", "Bumble", "Hinge", "Teenage Engineering", "Nothing", "Marshall",
             "Master & Dynamic", "Skullcandy", "Sonos", "Bose"]:
    res = qloo.results(qloo.call("/search", {"query": name, "types": "urn:entity:brand", "take": 3})) or []
    s13[name] = [(e["name"], round(e.get("popularity") or 0, 3)) for e in res[:2]]
R["S13"] = s13

# S14 partner quality with the reach window, from a brand signal
def partner_list(cap):
    r = qloo.call("/v2/insights", {"filter.type": "urn:entity:brand", "signal.interests.entities": BRIGHTLAND,
                                   "filter.exclude.entities": BRIGHTLAND, "filter.popularity.max": cap, "take": 50})
    return ents(r)
uncapped, capped = partner_list(None), partner_list(0.97)
over = lambda L: sum(1 for e in L[:10] if (e.get("popularity") or 0) > 0.99)
pods = ents(qloo.call("/v2/insights", {"filter.type": "urn:entity:podcast", "signal.interests.entities": BRIGHTLAND,
                                      "filter.popularity.max": 0.97, "take": 20}))
R["S14"] = {"pass": over(capped) <= 2, "detail": f"top-10 above 99th pct: uncapped {over(uncapped)}, capped {over(capped)}; podcasts {len(pods)}",
            "capped_top10": [e["name"] for e in capped[:10]], "uncapped_top10": [e["name"] for e in uncapped[:10]],
            "podcasts_top5": [e["name"] for e in pods[:5]]}

# S15 reverse mutual fit
genre = [t.get("tag_id") or t.get("id") for t in (qloo.results(qloo.call("/entities", {"entity_ids": BRIGHTLAND}))[0].get("tags") or [])
         if (t.get("tag_id") or "").startswith("urn:tag:genre:brand")]
narrow = sorted(genre, key=len)[-1] if genre else None
peers = ents(qloo.call("/v2/insights", {"filter.type": "urn:entity:brand", "signal.interests.entities": BRIGHTLAND,
                                       "filter.tags": narrow, "filter.exclude.entities": BRIGHTLAND, "take": 14}))
peer_ids = [BRIGHTLAND] + [e["entity_id"] for e in peers]
partner = capped[0]["entity_id"] if capped else None
rev = qloo.call("/v2/insights", {"filter.type": "urn:entity:brand", "signal.interests.entities": partner,
                                 "filter.results.entities": ",".join(peer_ids), "take": 15}) if partner else {"status": None}
rank = [e["entity_id"] for e in ents(rev)]
R["S15"] = {"pass": len(rank) == len(peer_ids), "detail": f"narrowest genre {narrow}; peers {len(peer_ids)}; ranked {len(rank)}; "
            f"Brightland rank {rank.index(BRIGHTLAND) + 1 if BRIGHTLAND in rank else None} of {len(rank)} for partner {capped[0]['name'] if capped else None}",
            "peers": [e["name"] for e in peers]}

# S16 POST
s16 = qloo.call("/v2/insights", method="POST", body={"filter.type": "urn:entity:place", "filter.location.query": "Chicago",
                "signal.interests.entities.query": [{"name": "Balthazar", "address": "80 Spring St, New York, NY"}], "take": 3},
                use_cache=False)
R["S16"] = {"pass": s16["status"] == 200, "detail": f"HTTP {s16['status']}: {str(s16['body'])[:160]}"}

# S12 latency
live = [ms for (_, st, ms, cached) in qloo.LOG if not cached and st == 200]
if live:
    live.sort()
    R["S12"] = {"pass": live[int(0.95 * (len(live) - 1))] < 3000,
                "detail": f"{len(live)} live calls: p50 {statistics.median(live)} ms, p95 {live[int(0.95 * (len(live) - 1))]} ms, "
                          f"429s {sum(1 for l in qloo.LOG if l[1] == 429)}"}

json.dump(R, open(os.path.join(qloo.ROOT, ".cache", "spike_checks.json"), "w", encoding="utf-8"), indent=1, default=str)
for k, v in R.items():
    if k == "S3":
        for lab, s in v.items():
            print(f"S3 {lab:16s} {s.get('urn')}  {s.get('counts')}  {'PASS' if s.get('pass') else 'FAIL'}")
    elif k == "S13":
        for n, s in v.items():
            print(f"S13 {n:20s} {s}")
    else:
        print(f"{k}: {'PASS' if v.get('pass') else 'FAIL'}  {v.get('detail')}")
