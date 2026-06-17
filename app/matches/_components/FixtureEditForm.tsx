"use client";

import type { Player, EditDraft } from "./types";

export default function FixtureEditForm({
  editDraft,
  attending,
  onEditDraftChange,
  onSaveEdit,
}: {
  editDraft: EditDraft;
  attending: Player[];
  onEditDraftChange: (next: EditDraft) => void;
  onSaveEdit: () => void;
}) {
  return (
    <div className="p-3 space-y-3 bg-surface-raised">
      {(["a1", "a2", "b1", "b2"] as const).map((slot, idx) => (
        <div key={slot}>
          {idx === 2 && (
            <div className="flex items-center gap-2 my-1">
              <span className="flex-1 h-px bg-border" />
              <span className="text-xs font-black italic text-faint">VS</span>
              <span className="flex-1 h-px bg-border" />
            </div>
          )}
          <select
            value={editDraft[slot]}
            onChange={(e) =>
              onEditDraftChange({ ...editDraft, [slot]: parseInt(e.target.value) })
            }
            className="w-full bg-surface-hover border-2 border-transparent focus:border-accent rounded-xl px-3 py-2 text-sm font-medium text-text focus:outline-none"
          >
            <option value={0}>—</option>
            {attending.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        onClick={onSaveEdit}
        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white text-sm font-bold hover:brightness-110 transition-all"
      >
        Save override
      </button>
    </div>
  );
}
