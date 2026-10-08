import type { QlooCall } from "@/lib/qloo/types";
import type { QlooClient } from "@/lib/qloo/client";
import type { Block, PlaybookConfig } from "@/lib/playbook/config";

/** Source label carried by every value on screen (PRD "How to read"). */
export type Source = "Qloo" | "Census" | "Overture" | "Ticketmaster" | "Apple Podcasts" | "Wikidata" | "Web" | "Agent";

/** One evidence chip. `callId` opens the call in the trace (F14). */
export type Evidence = {
  kind: "contribution" | "tag" | "growth" | "price" | "fit" | "rank";
  label: string;
  value?: number;
  callId: string;
};

export type Enriched<T> = { value: T; source: Source; url?: string; fetchedAt?: string; callId?: string };

export type BlockStatus = "ok" | "thin" | "empty" | "error";

export type BlockMeta = {
  block: Block | "read";
  status: BlockStatus;
  thinReason?: string;
  /** Qloo calls that built this block: drives "Built from n Qloo calls" (F14). */
  calls: QlooCall[];
  ms: number;
  /** Set when this is the last good result shown because a live run failed (§14.2). */
  fallbackFrom?: number;
};

export type AgentEvent = {
  t: number;
  tool: string;
  why: string;
  status: "running" | "ok" | "empty" | "thin" | "error" | "needs_input";
  callIds: string[];
  summary: string;
};

export type BlockContext = {
  pb: PlaybookConfig;
  qloo: QlooClient;
  /** Display names for accounts and other known entities, for "Like your [account]" reasons. */
  names: Map<string, string>;
  emit: (e: Omit<AgentEvent, "t">) => void;
};

export type TagChip = { id: string; name: string; type: string; rank: number; callId: string };
