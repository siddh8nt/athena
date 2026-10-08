import type { QlooCall } from "@/lib/qloo/types";
import type { BlockContext, BlockMeta, BlockStatus } from "./types";

/**
 * Runs one block with its own call log, so each block knows exactly which Qloo calls built it.
 * The block body returns its data plus a status; the wrapper adds timing and calls.
 */
export async function withCalls<T>(
  ctx: BlockContext,
  block: BlockMeta["block"],
  body: (ctx: BlockContext) => Promise<{ data: T; status: BlockStatus; thinReason?: string }>,
): Promise<{ meta: BlockMeta; data: T }> {
  const calls: QlooCall[] = [];
  const started = Date.now();
  const scoped: BlockContext = { ...ctx, qloo: ctx.qloo.withLog((c) => calls.push(c)) };
  const { data, status, thinReason } = await body(scoped);
  return { meta: { block, status, thinReason, calls, ms: Date.now() - started }, data };
}
