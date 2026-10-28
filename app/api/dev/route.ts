import { NextResponse } from "next/server";
import { devAllowed, isOffline, setOffline } from "@/lib/dev/offline";
import { deleteSnapshot, findTape, getSnapshot, listSnapshots, saveSnapshot, saveTape, tapeCounts, type Snapshot, type Tape } from "@/lib/dev/tapes";

// Developer mode's one route (dev server only; 404 in production): recorded responses, snapshots and the offline switch.

const gone = () => new NextResponse(null, { status: 404 });

export async function GET(req: Request) {
  if (!devAllowed()) return gone();
  const q = new URL(req.url).searchParams;
  const op = q.get("op");
  if (op === "status") return NextResponse.json({ offline: isOffline(), tapes: await tapeCounts(), snapshots: await listSnapshots() });
  if (op === "snapshot") return NextResponse.json((await getSnapshot(q.get("name") ?? "")) ?? null);
  return gone();
}

export async function POST(req: Request) {
  if (!devAllowed()) return gone();
  const body = (await req.json()) as { op: string } & Record<string, unknown>;
  switch (body.op) {
    case "mode":
      setOffline(!!body.offline);
      return NextResponse.json({ offline: isOffline() });
    case "record":
      await saveTape(body.tape as Tape);
      return NextResponse.json({ ok: true });
    case "replay": {
      const hit = await findTape(String(body.path), String(body.key), String(body.req ?? ""), String(body.brand ?? ""));
      return NextResponse.json(hit ?? null);
    }
    case "save":
      await saveSnapshot(body.snapshot as Snapshot);
      return NextResponse.json({ ok: true });
    case "delete":
      await deleteSnapshot(String(body.name));
      return NextResponse.json({ ok: true });
  }
  return gone();
}
