"""S11: blind backtest on the TUNING brand only (PRD §10.4-10.6). Never run on a test brand before prereg-v1.

Athena: city-A stockists as the only signal, ranking city-B venues of the channel types.
Most popular: the identical call without a signal.
Hits: picks matched to hidden city-B independent stockists (by Qloo ID, else name + <=150 m).
Denominator: every independent city-B stockist, resolved or not.
"""
import csv, json, os, re, sys

import qloo
from resolve import clean_venue, meters, name_sim, norm

TUNING = {"csv": "brightland.csv", "a": "New York", "b": "Los Angeles", "b_query": "Los Angeles", "resolved": "brightland"}

CHAIN_WORDS = ["whole foods", "target", "erewhon", "gelson", "bristol farms", "sprouts", "trader joe", "ralphs", "vons",
               "pavilions", "williams sonoma", "sur la table", "crate", "west elm", "anthropologie", "urban outfitters",
               "nordstrom", "starbucks", "blue bottle", "la colombe", "intelligentsia", "verve", "alfred", "eataly",
               "lazy acres", "mother s market", "cost plus", "world market", "homegoods", "tj maxx", "costco",
               "smart and final", "safeway", "albertsons", "kroger", "cvs", "walgreens", "le pain quotidien",
               "joe and the juice", "pressed", "sweetgreen", "urth caffe", "coffee bean", "peet s", "dunkin"]
CHAIN_RX = re.compile(r"\b(" + "|".join(re.escape(norm(c)) for c in CHAIN_WORDS) + r")\b")


def load(name):
    return json.load(open(os.path.join(qloo.ROOT, ".cache", "resolved", name + ".json"), encoding="utf-8"))


def entities(resp):
    r = qloo.results(resp)
    return (r.get("entities") or []) if isinstance(r, dict) else []


def rank_city(params, pages=2):
    out = []
    for page in range(1, pages + 1):
        resp = qloo.call("/v2/insights", {**params, "take": 50, "page": page})
        if resp["status"] != 200:
            print("  HTTP", resp["status"], str(resp["body"])[:200], file=sys.stderr)
            break
        got = entities(resp)
        out += got
        if len(got) < 50:
            break
    seen, picks = set(), []
    for e in out:
        if e["entity_id"] in seen:
            continue
        seen.add(e["entity_id"])
        props = e.get("properties") or {}
        if props.get("is_closed") or CHAIN_RX.search(norm(e.get("name", ""))):
            continue
        picks.append(e)
    return picks


def hits(picks, truth_rows, k):
    truth_ids = {r["qloo_id"] for r in truth_rows if r["status"] == "matched"}
    unresolved = [r for r in truth_rows if r["status"] != "matched"]
    found = set()
    for e in picks[:k]:
        if e["entity_id"] in truth_ids:
            found.add(e["entity_id"])
            continue
        loc = e.get("location") or {}
        for r in unresolved:
            try:
                d = meters((float(r["lat"]), float(r["lon"])), (loc["lat"], loc["lon"]))
            except (KeyError, TypeError, ValueError):
                continue
            if d <= 150 and name_sim(clean_venue(r["venue"]), e["name"]) >= 0.85:
                found.add(e["entity_id"])
                break
    return len(found)


def run(channels, extra=None, label=""):
    a_rows = load(f"{TUNING['resolved']}_{TUNING['a'].replace(' ', '_')}")
    b_rows = load(f"{TUNING['resolved']}_{TUNING['b'].replace(' ', '_')}")
    signal = [r["qloo_id"] for r in a_rows if r["status"] == "matched" and not r.get("is_closed")]
    base = {"filter.type": "urn:entity:place", "filter.location.query": TUNING["b_query"],
            "filter.tags": ",".join(channels), "operator.filter.tags": "union", **(extra or {})}
    athena = rank_city({**base, "signal.interests.entities": ",".join(signal),
                        "filter.exclude.entities": ",".join(signal)})
    popular = rank_city(base)
    n_truth = len(b_rows)
    res = {"label": label, "signal": len(signal), "truth": n_truth,
           "truth_matched": sum(1 for r in b_rows if r["status"] == "matched"),
           "athena_picks": len(athena), "popular_picks": len(popular),
           "athena@50": hits(athena, b_rows, 50), "popular@50": hits(popular, b_rows, 50),
           "athena@10": hits(athena, b_rows, 10), "popular@10": hits(popular, b_rows, 10)}
    print(f"{label:38s} Athena {res['athena@50']:2d}/{n_truth} @50 ({res['athena@10']} @10) | "
          f"Popular {res['popular@50']:2d} @50 ({res['popular@10']} @10) | picks {len(athena)}/{len(popular)}")
    return res


if __name__ == "__main__":
    P = "urn:tag:genre:place:"
    PRD_G1 = [P + "restaurant:cafe", P + "restaurant:coffee_shop", P + "restaurant:bakery", P + "gourmet_grocery_store", P + "restaurant:health_food"]
    BROAD = PRD_G1 + [P + "gift_shop", P + "home_goods_store", P + "grocery_store", P + "health_food_store",
                      P + "restaurant:cheese_shop", P + "market"]
    RETAIL = [P + "gift_shop", P + "home_goods_store", P + "gourmet_grocery_store", P + "grocery_store",
              P + "health_food_store", P + "restaurant:cheese_shop", P + "market"]
    out = []
    out.append(run(PRD_G1, label="PRD G1 channels"))
    out.append(run(BROAD, label="Broad (data-derived) channels"))
    out.append(run(RETAIL, label="Retail-only channels"))
    out.append(run(BROAD, {"filter.price_level.min": 2, "filter.price_level.max": 4}, label="Broad + premium price 2-4"))
    for cb in ("0.2", "0.8"):
        out.append(run(BROAD, {"bias.content_based": cb}, label=f"Broad + bias.content_based={cb}"))
    json.dump(out, open(os.path.join(qloo.ROOT, ".cache", "backtest_tuning.json"), "w", encoding="utf-8"), indent=1)
