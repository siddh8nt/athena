"""Minimal cached Qloo client for the key-day spike (PRD §18). Server-side only; reads the key from .env.

Responses are cached under .cache/qloo/ (git-ignored). Qloo data never goes into the repo.
"""
import hashlib, json, os, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, ".cache", "qloo")
os.makedirs(CACHE, exist_ok=True)


def _load_env():
    env = {}
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


_ENV = _load_env()
KEY = _ENV["QLOO_API_KEY"]
BASE = _ENV.get("QLOO_BASE_URL", "https://hackathon.api.qloo.com")
LOG = []  # (path, status, ms, cached)


def call(path, params=None, method="GET", body=None, use_cache=True):
    params = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
    qs = urllib.parse.urlencode(sorted(params.items()))
    key_src = f"{method} {path}?{qs} {json.dumps(body, sort_keys=True) if body else ''}"
    cpath = os.path.join(CACHE, hashlib.sha1(key_src.encode()).hexdigest() + ".json")
    if use_cache and os.path.exists(cpath):
        LOG.append((path, 200, 0, True))
        return json.load(open(cpath, encoding="utf-8"))
    url = BASE + path + ("?" + qs if qs else "")
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(3):
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"X-Api-Key": KEY, "Content-Type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = {"status": r.status, "body": json.loads(r.read().decode("utf-8"))}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "ignore")
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = raw[:500]
            out = {"status": e.code, "body": parsed}
        ms = int((time.time() - t0) * 1000)
        LOG.append((path, out["status"], ms, False))
        if out["status"] in (429,) or out["status"] >= 500:
            time.sleep(2 * (attempt + 1))
            continue
        break
    if out["status"] == 200 and use_cache:
        json.dump(out, open(cpath, "w", encoding="utf-8"))
    return out


def results(resp):
    b = resp.get("body")
    return b.get("results") if isinstance(b, dict) else None
