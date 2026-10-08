"use client";

import { useState } from "react";
import { METROS } from "@/lib/playbook/metros";

export type IntakeValues = {
  name: string;
  websites: string;
  description: string;
  accountsText: string;
  comparables: string;
  competitors: string;
  city: string;
};

const EMPTY: IntakeValues = { name: "", websites: "", description: "", accountsText: "", comparables: "", competitors: "", city: "" };

/** Try your own brand (M10, §6.2): only the name is required; everything else sharpens the plan. */
export function Intake({ onSubmit, onClose }: { onSubmit: (v: IntakeValues) => void; onClose: () => void }) {
  const [v, setV] = useState<IntakeValues>(EMPTY);
  const [more, setMore] = useState(false);
  const set = (k: keyof IntakeValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="intake-backdrop" role="dialog" aria-label="Try your own brand" onClick={onClose}>
      <form
        className="intake"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (v.name.trim()) onSubmit(v);
        }}
      >
        <header>
          <h2>Try your own brand</h2>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <p className="muted">Any consumer brand: food, drink, home, beauty, hardware or an app. A name is enough; a website or a list of your stockists makes the plan sharper.</p>
        <label>
          Brand name
          <input required autoFocus value={v.name} onChange={set("name")} placeholder="e.g. Graza" maxLength={120} />
        </label>
        <label>
          Website <span className="muted">(optional, up to 3 links)</span>
          <input value={v.websites} onChange={set("websites")} placeholder="graza.co, graza.co/pages/stockists" />
        </label>
        <label>
          City to grow into <span className="muted">(optional; otherwise I pick your crowd&apos;s strongest city)</span>
          <select value={v.city} onChange={set("city")}>
            <option value="">Let Athena choose</option>
            {METROS.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        {!more ? (
          <button type="button" className="linkish" onClick={() => setMore(true)}>+ Add stockists, comparable brands or competitors</button>
        ) : (
          <>
            <label>
              What you sell <span className="muted">(one line)</span>
              <input value={v.description} onChange={set("description")} maxLength={300} placeholder="Squeezable olive oil for everyday cooking" />
            </label>
            <label>
              Your stockists or accounts <span className="muted">(paste a list: name, address, city per line)</span>
              <textarea rows={5} value={v.accountsText} onChange={set("accountsText")} placeholder={"Bub and Grandma's, 3507 Eagle Rock Blvd, Los Angeles\nCheese Plus, 2001 Polk St, San Francisco"} />
            </label>
            <label>
              Brands like yours <span className="muted">(comma-separated)</span>
              <input value={v.comparables} onChange={set("comparables")} placeholder="Brightland, Fly By Jing" />
            </label>
            <label>
              Competitors <span className="muted">(up to 3)</span>
              <input value={v.competitors} onChange={set("competitors")} placeholder="Brightland" />
            </label>
          </>
        )}
        <div className="row-actions">
          <button type="submit" className="primary" disabled={!v.name.trim()}>Plan my growth</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export function intakeToBody(v: IntakeValues): Record<string, unknown> {
  return {
    name: v.name.trim(),
    websites: v.websites.split(/[\s,]+/).filter(Boolean).slice(0, 3),
    description: v.description.trim() || undefined,
    accountsText: v.accountsText.trim() || undefined,
    comparables: v.comparables.split(",").map((x) => x.trim()).filter(Boolean),
    competitors: v.competitors.split(",").map((x) => x.trim()).filter(Boolean),
    city: v.city || undefined,
  };
}
