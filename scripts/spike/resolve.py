"""Venue resolution per PRD §9.1: name similarity >= 0.85 and (street number match or <= 150 m)."""
import math, re, unicodedata
from difflib import SequenceMatcher

import qloo

GENERIC = {"coffee", "cafe", "café", "bakery", "the", "and", "shop", "store", "market", "co", "company", "inc", "llc"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(s.split())


def clean_venue(name):
    # drop location suffixes like "A.MANO Brooklyn - Ground Floor" / "Foo (Downtown)" / "Foo #2"
    n = re.split(r"\s+[-–|/]\s+|\s*\(|\s+#\d", name or "")[0]
    return n.strip() or name


def name_sim(a, b):
    ta = set(norm(a).split()) - GENERIC or set(norm(a).split())
    tb = set(norm(b).split()) - GENERIC or set(norm(b).split())
    if not ta or not tb:
        return 0.0
    inter = " ".join(sorted(ta & tb))
    sa, sb = " ".join(sorted(ta)), " ".join(sorted(tb))
    if inter and (ta <= tb or tb <= ta):
        return 1.0
    return max(SequenceMatcher(None, sa, sb).ratio(),
               SequenceMatcher(None, inter, sa).ratio() if inter else 0,
               SequenceMatcher(None, inter, sb).ratio() if inter else 0)


def meters(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(d))


def street_no(addr):
    m = re.match(r"\s*(\d+[a-zA-Z]?)\b", addr or "")
    return m.group(1).lower() if m else None


def accept(row, cand):
    sim = name_sim(clean_venue(row["venue"]), cand["name"])
    loc = cand.get("location") or {}
    dist = None
    try:
        dist = meters((float(row["lat"]), float(row["lon"])), (loc["lat"], loc["lon"]))
    except (KeyError, TypeError, ValueError):
        pass
    sn_row, sn_c = street_no(row["address"]), street_no((cand.get("properties") or {}).get("address"))
    ok = sim >= 0.85 and ((sn_row and sn_row == sn_c) or (dist is not None and dist <= 150))
    # exact name, slightly off coordinates in the brand's locator feed
    ok = ok or (sim >= 0.99 and dist is not None and dist <= 300)
    return ok, sim, dist


def resolve_row(row):
    """Returns (status, entity, candidates_checked). status: matched | ambiguous | unresolved."""
    name = clean_venue(row["venue"])
    attempts = []
    if row.get("address"):
        attempts.append({"query": name, "types": "urn:entity:place", "filter.address": row["address"], "take": 5})
    try:
        attempts.append({"query": name, "types": "urn:entity:place",
                         "filter.location": f"{float(row['lat']):.6f},{float(row['lon']):.6f}",
                         "filter.radius": 0.5, "take": 5})
    except (TypeError, ValueError):
        pass
    seen = {}
    for p in attempts:
        res = qloo.results(qloo.call("/search", p)) or []
        for c in res:
            ok, sim, dist = accept(row, c)
            if ok:
                seen[c["entity_id"]] = (c, sim, dist)
        if seen:
            break
    if not seen:
        return "unresolved", None, 0
    best = sorted(seen.values(), key=lambda x: (-x[1], x[2] if x[2] is not None else 1e9))
    if len(best) > 1 and best[0][1] - best[1][1] < 0.05 and (best[1][2] or 1e9) < 150:
        return "ambiguous", best[0][0], len(best)
    return "matched", best[0][0], len(best)
