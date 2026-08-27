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
}

const ROW_HEIGHT = 72;
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
}: RowComponentProps<VirtualListRowProps>) {
  const channel = filtered[index];
  if (!channel) return null;
  return (
    <div style={style}>
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
      />
    </div>
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
  height?: number;
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
  height = 600,
}: VirtualChannelListProps) {
  if (filtered.length <= VIRTUALIZATION_THRESHOLD) return null;

  return (
    <List
      className="channel-list"
      style={{ height: "100%", maxHeight: height }}
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
      }}
    />
  );
}

export const VIRTUAL_THRESHOLD = VIRTUALIZATION_THRESHOLD;
export const CHANNEL_ROW_HEIGHT = ROW_HEIGHT;
