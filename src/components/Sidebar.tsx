import type { Channel } from "../types";
import { ChannelList } from "./ChannelList";

interface SidebarProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  loading: boolean;
  onHome: () => void;
}

export function Sidebar({
  channels,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  loading,
  onHome,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand-block">
          <span className="sidebar-brand">PandoraIPTV</span>
          <span className="sidebar-signal">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {channels.length} on air
          </span>
        </div>
        <div className="sidebar-actions">
          <button className="change-source" onClick={onHome} title="Back to dashboard">
            Home
          </button>
        </div>
      </div>

      <ChannelList
        channels={channels}
        activeId={activeId}
        favoriteIds={favoriteIds}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        loading={loading}
      />
    </div>
  );
}