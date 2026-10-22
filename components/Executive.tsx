"use client";

import { Marks } from "./CrowdTabs";
import { tasksOf } from "@/lib/agent/executive";
import { planUnitemised } from "@/lib/agent/synthesis";
import { EXECUTIVE, nameOf, type SubagentId } from "@/lib/agent/specialists";
import { TASK_LABEL, TASK_STATUSES, type Mark, type Task, type TaskStatus, type TeamState } from "@/lib/team/types";

// The Executive's page (PRD §23.5 n): a task board from Athena's plan, To do, Doing, Done and Skipped. Each task says
// which subagent it's from, the action, what it needs, and takes the same marks as that subagent's page, which flow back
// there. The Executive tracks only: it never sends, books or applies.

export function ExecutiveBoard({ team, running, onUpdate, onStatus, onMark, onOpen }: { team: TeamState; running: boolean; onUpdate: () => void; onStatus: (t: Task, s: TaskStatus) => void; onMark: (t: Task, m: Mark) => void; onOpen: (id: SubagentId | "athena" | "plan") => void }) {
  const tasks = tasksOf(team.plan, team.outcomes, team.tasks);
  return (
    <section className="exec" aria-label="The Executive's tasks">
      <header className="spec-head">
        <h3>The {EXECUTIVE.name}</h3>
        <p className="small muted">{EXECUTIVE.mission}</p>
        <p className="small exec-note">It tracks only: it never sends, books or applies. You do those, then mark what happened, and the subagent that found it reads the mark.</p>
      </header>
      {!team.plan?.steps?.length ? (
        <p className="small muted">
          Your tasks come here once{" "}
          <button type="button" className="linkish" onClick={() => onOpen("plan")}>
            Athena&apos;s plan
          </button>{" "}
          is written.
        </p>
      ) : (
        <>
          <p className="small muted">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} from the {team.plan.steps.length} steps of{" "}
            <button type="button" className="linkish" onClick={() => onOpen("plan")}>
              Athena&apos;s plan
            </button>
            .
          </p>
          {planUnitemised(team.plan, team.works) && (
            <div className="stale-flag">
              <span className="small">This plan was written before its steps named each shop, partner and event. Update it to track each one.</span>
              <button type="button" className="linkish small" disabled={running} onClick={onUpdate}>
                {running ? "Updating" : "Update the plan"}
              </button>
            </div>
          )}
          <div className="exec-board">
            {TASK_STATUSES.map((s) => {
              const col = tasks.filter((t) => t.status === s);
              return (
                <div key={s} className={`exec-col exec-${s}`}>
                  <h4>
                    {TASK_LABEL[s]} <span className="exec-n">{col.length}</span>
                  </h4>
                  {col.length ? (
                    <ul>
                      {col.map((t) => (
                        <TaskCard key={t.id} t={t} onStatus={onStatus} onMark={onMark} onOpen={onOpen} />
                      ))}
                    </ul>
                  ) : (
                    <p className="small muted exec-empty">{s === "todo" ? "Nothing waiting." : "None yet."}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function TaskCard({ t, onStatus, onMark, onOpen }: { t: Task; onStatus: (t: Task, s: TaskStatus) => void; onMark: (t: Task, m: Mark) => void; onOpen: (id: SubagentId | "athena" | "plan") => void }) {
  return (
    <li className="exec-task">
      <strong>{t.action}</strong>
      <p className="small muted">
        Step {t.step} · {t.needs}
        {t.crowds.length > 0 && ` · for ${t.crowds.join(", ")}`}
      </p>
      {t.item && <p className="small muted">{t.stepWhat}</p>}
      {t.left && <p className="small muted">No longer in Athena&apos;s plan.</p>}
      <p className="small">
        From{" "}
        <button type="button" className="cite" onClick={() => onOpen(t.agent)} title={`Open the ${nameOf(t.agent)}`}>
          {t.agent === "athena" ? "Athena" : `the ${nameOf(t.agent)}`}
        </button>
      </p>
      <span className="seg exec-status" role="group" aria-label={`Status of ${t.action}`}>
        {TASK_STATUSES.map((s) => (
          <button key={s} type="button" className={t.status === s ? "on" : ""} aria-pressed={t.status === s} onClick={() => onStatus(t, s)}>
            {TASK_LABEL[s]}
          </button>
        ))}
      </span>
      {t.item && t.agent !== "athena" && <Marks agent={t.agent} name={t.item.name} mark={t.mark} onMark={(m) => onMark(t, m)} />}
    </li>
  );
}
