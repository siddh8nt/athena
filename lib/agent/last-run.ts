import "server-only";
import { getStore } from "@/lib/store";
import type { BlockMeta } from "@/lib/blocks/types";
import type { Block } from "@/lib/playbook/config";

// Last good result per brand and block (§14.2), in the shared store (Firestore in production).
type Result = { meta: BlockMeta; data: unknown };

export const lastRun = {
  async save(slug: string, block: Block, result: Result) {
    await getStore().set("last-runs", `${slug}.${block}`, result);
  },
  async load(slug: string, block: Block): Promise<{ at: number; result: Result } | undefined> {
    const s = await getStore().get<Result>("last-runs", `${slug}.${block}`);
    return s ? { at: s.at, result: s.value } : undefined;
  },
};
