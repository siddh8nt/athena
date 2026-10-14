import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import { safeUrl } from "@/lib/agent/intake";

/**
 * Fetches a URL that came from outside Athena (a brand's site, a model's citation, a podcast feed) (PRD §23.2 step
 * 4b). https and public hostnames only, and the check is on the address the name resolves to, at connect time, on
 * every redirect: so neither a link nor a DNS answer can reach Cloud Run's metadata server or any other internal
 * address. Bodies are capped (after decompression) and every fetch has one deadline. Returns undefined instead of
 * throwing.
 */

export type SafeInit = { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; method?: "GET" | "HEAD" };

const v4 = (ip: string) => ip.split(".").map(Number);

/** True only for addresses on the public internet. */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const [a, b] = v4(ip);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this network, private, loopback, multicast/reserved
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local, incl. the metadata server
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (v4(ip)[2] === 0 || v4(ip)[2] === 2)) || (b === 88 && v4(ip)[2] === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && v4(ip)[2] === 100))) return false; // benchmarking, test net
    if (a === 203 && b === 0 && v4(ip)[2] === 113) return false;
    return true;
  }
  if (fam === 6) {
    const s = ip.toLowerCase();
    const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPublicIp(mapped[1]);
    if (s === "::" || s === "::1") return false;
    const first = parseInt(s.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return false; // unique local
    if ((first & 0xffc0) === 0xfe80) return false; // link-local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (s.startsWith("64:ff9b:") || s.startsWith("2001:db8:") || s.startsWith("2001:0db8:")) return false; // NAT64, documentation
    return (first & 0xe000) === 0x2000; // global unicast is 2000::/3
  }
  return false;
}

/** Resolves like dns.lookup, but fails unless every address is public; the socket connects to what was checked. */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    if (!addresses.length || addresses.some((a) => !isPublicIp(a.address))) {
      const e = Object.assign(new Error(`${hostname} does not resolve to a public address`), { code: "ENOTPUBLIC" });
      return callback(e, "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

type Raw = { status: number; headers: Record<string, string>; body?: Buffer };

function once(url: URL, init: SafeInit, deadline: AbortSignal): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method ?? "GET",
        lookup: publicLookup,
        signal: deadline,
        headers: { "Accept-Encoding": "gzip, deflate, br", ...init.headers },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;
        const status = res.statusCode ?? 0;
        if ((status >= 300 && status < 400) || init.method === "HEAD") {
          res.resume();
          return resolve({ status, headers });
        }
        const enc = (headers["content-encoding"] ?? "").toLowerCase();
        const stream: Readable = enc.includes("br") ? res.pipe(createBrotliDecompress()) : enc.includes("gzip") ? res.pipe(createGunzip()) : enc.includes("deflate") ? res.pipe(createInflate()) : res;
        const max = init.maxBytes ?? 5 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > max) {
            // Over the cap: keep what fits and stop reading.
            chunks.push(c.subarray(0, c.length - (size - max)));
            res.destroy();
            stream.destroy();
            resolve({ status, headers: { ...headers, "x-athena-truncated": "1" }, body: Buffer.concat(chunks) });
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(url: string, init: SafeInit = {}): Promise<Response | undefined> {
  let next = safeUrl(url);
  const deadline = AbortSignal.timeout(init.timeoutMs ?? 10_000);
  for (let hop = 0; next && hop < 5; hop++) {
    try {
      const u = new URL(next);
      const r = await once(u, init, deadline);
      if (r.status >= 300 && r.status < 400) {
        const to = r.headers.location;
        next = to ? safeUrl(new URL(to, u).toString()) : undefined;
        continue;
      }
      const headers = new Headers(Object.entries(r.headers).filter(([k]) => k !== "content-encoding" && k !== "content-length" && k !== "transfer-encoding"));
      headers.set("x-athena-url", u.toString());
      const status = r.status >= 200 && r.status <= 599 ? r.status : 502;
      return new Response(status === 204 || status === 304 || init.method === "HEAD" ? null : new Uint8Array(r.body ?? Buffer.alloc(0)), { status, headers });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The final URL after redirects, as fetched. */
export const fetchedUrl = (res: Response, asked: string) => res.headers.get("x-athena-url") ?? asked;
