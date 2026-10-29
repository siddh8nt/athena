import { PageTransition } from "@/components/PageTransition";
import { ShareView } from "@/components/ShareView";
import { sharedPlan } from "@/lib/workspace/share";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared plan · Athena", robots: { index: false, follow: false } };

// Share with your team (PRD §23.6 k): /share/<secret> opens a view-only Execute Plan. A replaced link says so in one
// calm line, and a plan not written yet says it's coming; neither is an error page. The frame is in layout.tsx and the
// shape shown while the plan is read in loading.tsx.

export default async function Share({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const s = await sharedPlan(secret);
  return (
    <PageTransition>
      <div className="share-body">
        <header className="share-head">
          <span className="page-kicker">Shared plan · view only</span>
          {s.kind !== "replaced" && <h1>{s.brand}</h1>}
          <p className="small muted">
            {s.kind === "plan"
              ? s.sample
                ? `A sample: the plan Athena built for ${s.brand} from public information, view only.`
                : `A view-only copy of ${s.brand}'s plan from Athena. It follows the plan as it changes.`
              : s.kind === "waiting"
                ? "Athena is still writing this plan. This page fills in when it's ready."
                : "This link has been replaced. Ask whoever shared it for the new one."}
          </p>
        </header>
        {s.kind === "plan" && <ShareView team={s.team} brand={s.brand} budget={s.budget} />}
      </div>
    </PageTransition>
  );
}
