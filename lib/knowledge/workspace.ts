// The browser's workspace and file uploads (PRD §23.2 step 4), shared by onboarding and the Brand Graph's chat.
// Client-side only.

const WS_KEY = "athena-workspace";

/** This browser's workspace: a random id it keeps, so the founder's files stay theirs. */
export function workspace(): string {
  const fresh = () => (crypto.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
  try {
    const had = localStorage.getItem(WS_KEY);
    if (had) return had;
    const ws = fresh();
    localStorage.setItem(WS_KEY, ws);
    return ws;
  } catch {
    return fresh();
  }
}

/** Keeps one file in the workspace: its hash when kept, else the line to show for it. Never throws. */
export async function keepFile(ws: string, f: File): Promise<{ hash?: string; status: string }> {
  const form = new FormData();
  form.set("ws", ws);
  form.set("file", f);
  try {
    const j = (await (await fetch("/api/uploads", { method: "POST", body: form })).json()) as { file?: { hash?: string; kept: boolean; status: string } };
    return j.file?.kept && j.file.hash ? { hash: j.file.hash, status: "Kept" } : { status: j.file?.status ?? "Send it again in a moment" };
  } catch {
    return { status: "Still on its way; add it again in a moment" };
  }
}
