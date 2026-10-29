import { PageTransition } from "@/components/PageTransition";

// The shared plan's shape, shown the moment the link is opened while the plan is read (PRD §23.7 e): the heading, the
// tabs and quiet cards. No spinner and no words.
export default function ShareShape() {
  return (
    <PageTransition>
      <div className="share-body" aria-busy="true">
        <header className="share-head">
          <span className="page-kicker">Shared plan · view only</span>
          <span className="shape-bar shape-title" />
          <span className="shape-bar shape-line" />
        </header>
        <div className="shape-tabs">
          <span className="shape-bar" />
          <span className="shape-bar" />
          <span className="shape-bar" />
          <span className="shape-bar" />
        </div>
        <div className="shape-cards">
          <span className="shape-card" />
          <span className="shape-card" />
          <span className="shape-card" />
        </div>
      </div>
    </PageTransition>
  );
}
