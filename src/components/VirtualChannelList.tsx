import { List, type RowComponentProps } from "react-window";
import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { ChannelRow } from "./ChannelRow";

type EpgGetter = (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;

interface VirtualListRowProps {
  filtered: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite: boolean;
  getEpgForChannel?: EpgGetter;
  profileId?: string | null;
  now: number;
  hasReminder?: (id: string, start: number) => boolean;
  onToggleReminder?: (ch: Channel, prog: EpgProgramme) => void;
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
}

const ROW_HEIGHT = 78;
const OVERSCAN_COUNT = 5;
const VIRTUALIZATION_THRESHOLD = 150;

function VirtualRow({
  index,
  style,
  filtered,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite,
  getEpgForChannel,
  profileId,
  now,
  hasReminder,
  onToggleReminder,
  getPosition,
}: RowComponentProps<VirtualListRowProps>) {
  const channel = filtered[index];
  if (!channel) return null;
  return (
    <ChannelRow
      ch={channel}
      idx={index}
      activeId={activeId}
      favoriteIds={favoriteIds}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
      showFavorite={showFavorite}
      getEpgForChannel={getEpgForChannel}
      profileId={profileId}
      now={now}
      style={style}
      hasReminder={hasReminder}
      onToggleReminder={onToggleReminder}
      getPosition={getPosition}
    />
  );
}

interface VirtualChannelListProps {
  filtered: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite: boolean;
  getEpgForChannel?: EpgGetter;
  profileId?: string | null;
  now: number;
  hasReminder?: (id: string, start: number) => boolean;
  onToggleReminder?: (ch: Channel, prog: EpgProgramme) => void;
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
}

export function VirtualChannelList({
  filtered,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite,
  getEpgForChannel,
  profileId,
  now,
  hasReminder,
  onToggleReminder,
  getPosition,
}: VirtualChannelListProps) {
  if (filtered.length <= VIRTUALIZATION_THRESHOLD) return null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <List
        className="channel-list"
        style={{ height: "100%", width: "100%" }}
        tagName="ul"
        role="listbox"
        aria-label="Channels"
        rowCount={filtered.length}
        rowHeight={ROW_HEIGHT}
        overscanCount={OVERSCAN_COUNT}
        rowComponent={VirtualRow}
        rowProps={{
          filtered,
          activeId,
          favoriteIds,
          onSelect,
          onToggleFavorite,
          showFavorite,
          getEpgForChannel,
          profileId,
          now,
          hasReminder,
          onToggleReminder,
          getPosition,
        }}
      />
    </div>
  );
}

export const VIRTUAL_THRESHOLD = VIRTUALIZATION_THRESHOLD;
export const CHANNEL_ROW_HEIGHT = ROW_HEIGHT;
