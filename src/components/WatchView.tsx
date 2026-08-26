import { useCallback, useEffect, useState } from "react";
import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { Player } from "./Player";
import { EpgTimeline } from "./epg/EpgTimeline";
import { useEpgReminders } from "../hooks/useEpgReminders";

interface WatchViewProps {
  channel: Channel;
  onBack: () => void;
  epgNow?: EpgProgramme;
  epgNext?: EpgProgramme;
  profileId?: string | null;
  onFetchEpg?: (id: string) => Promise<EpgProgramme[]>;
}

function formatEpgTime(p: EpgProgramme): string {
  const s = new Date(p.startTime);
  const e = new Date(p.stopTime);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
  return `${s.toLocaleTimeString(undefined, opts)}–${e.toLocaleTimeString(undefined, opts)}`;
}

export function WatchView({
  channel,
  onBack,
  epgNow,
  epgNext,
  profileId = null,
  onFetchEpg,
}: WatchViewProps) {
  const { has: hasRem, add: addRem, remove: remRem } = useEpgReminders(profileId);
  const [localEpg, setLocalEpg] = useState<EpgProgramme[]>([]);

  const isLive = channel.kind == null || channel.kind === "live";

  const loadEpg = useCallback(async () => {
    if (!onFetchEpg) return;
    const list = await onFetchEpg(channel.id);
    setLocalEpg(list);
  }, [onFetchEpg, channel.id]);

  // Fetch EPG for the current channel whenever it changes (live only).
  useEffect(() => {
    setLocalEpg([]);
    if (isLive && onFetchEpg) void loadEpg();
  }, [channel.id, isLive, onFetchEpg, loadEpg]);

  const progs = localEpg.length
    ? localEpg
    : ([epgNow, epgNext].filter(Boolean) as EpgProgramme[]);
  return (
    <div className="watch">
      <header className="watch-bar">
        <button type="button" className="watch-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="watch-bar-info">
          <span className="watch-title">{channel.name}</span>
          <span className="watch-meta">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {channel.group} · Live
            {epgNow && (
              <span className="watch-epg" title={epgNow.description}>
                {" "}
                · Now: {epgNow.title} ({formatEpgTime(epgNow)})
              </span>
            )}
            {!epgNow && epgNext && (
              <span className="watch-epg watch-epg--next">
                {" "}
                · Next: {epgNext.title} ({formatEpgTime(epgNext)})
              </span>
            )}
          </span>
        </div>
      </header>
      <div className="watch-stage">
        <Player channel={channel} onBack={onBack} profileId={profileId} />
      </div>
      {progs.length > 0 && (
        <div className="watch-epg-panel">
          <EpgTimeline
            programmes={progs}
            channelName={channel.name}
            onReminder={(p) => {
              if (hasRem(channel.id, p.startTime)) remRem(`${channel.id}::${p.startTime}`);
              else
                addRem({
                  channelId: channel.id,
                  channelName: channel.name,
                  title: p.title,
                  startTime: p.startTime,
                  stopTime: p.stopTime,
                });
            }}
            hasReminder={(p) => hasRem(channel.id, p.startTime)}
          />
        </div>
      )}
    </div>
  );
}
