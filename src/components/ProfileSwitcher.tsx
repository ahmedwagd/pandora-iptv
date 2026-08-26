import { useState } from "react";
import type { Profile } from "../types/profile";

interface ProfileSwitcherProps {
  profiles: Profile[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

export function ProfileSwitcher({ profiles, activeId, onSwitch, onCreate, onDelete }: ProfileSwitcherProps) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="profile-switcher">
      <div className="profile-switcher-list" role="group" aria-label="Profiles">
        {profiles.map((p) => (
          <div key={p.id} className={`profile-pill ${p.id === activeId ? "active" : ""}`}>
            <button
              type="button"
              className="profile-pill-btn"
              onClick={() => onSwitch(p.id)}
              aria-pressed={p.id === activeId}
              aria-label={`Switch to ${p.name}`}
            >
              {p.name}
            </button>
            {profiles.length > 1 && (
              <button
                type="button"
                className="profile-pill-delete"
                onClick={() => {
                  if (confirm(`Delete profile "${p.name}"? This clears its favorites and history.`)) onDelete(p.id);
                }}
                aria-label={`Delete ${p.name}`}
                title="Delete profile"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="profile-create">
          <input
            autoFocus
            type="text"
            placeholder="New profile name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            aria-label="New profile name"
          />
          <button type="button" className="profile-create-btn" onClick={handleCreate} disabled={!newName.trim()}>
            Add
          </button>
          <button type="button" className="profile-create-cancel" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="profile-add" onClick={() => setCreating(true)}>
          + New profile
        </button>
      )}
    </div>
  );
}
