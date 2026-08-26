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
  zapList?: Channel[];
  onZap?: (ch: Channel) => void;
  getEpgForChannel?: (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
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
  zapList,
  onZap,
  getEpgForChannel,
}: WatchViewProps) {
  const { has: hasRem, add: addRem, remove: remRem } = useEpgReminders(profileId);
  const [localEpg, setLocalEpg] = useState<EpgProgramme[]>([]);
  const [catchupCh, setCatchupCh] = useState<Channel | null>(null);
  const [catchupProg, setCatchupProg] = useState<EpgProgramme | null>(null);
  const playingChannel = catchupCh ?? channel;
  const isLiveChannel = channel.kind == null || channel.kind === "live";

  const loadEpg = useCallback(async () => {
    if (!onFetchEpg) return;
    const list = await onFetchEpg(channel.id);
    setLocalEpg(list);
  }, [onFetchEpg, channel.id]);

  // Fetch EPG for the current channel whenever it changes (live only).
  useEffect(() => {
    setLocalEpg([]);
    if (isLiveChannel && onFetchEpg) void loadEpg();
  }, [channel.id, isLiveChannel, onFetchEpg, loadEpg]);

  useEffect(() => {
    setCatchupCh(null);
    setCatchupProg(null);
  }, [channel.id]);

  const handleCatchup = useCallback((p: EpgProgramme) => {
    const startSec = Math.floor(p.startTime / 1000);
    const endSec = Math.floor(p.stopTime / 1000);
    let catchupUrl: string;
    if (channel.url.includes(".m3u8")) {
      catchupUrl = channel.url.replace(/\.m3u8(\?.*)?$/, `-${startSec}-${endSec}.m3u8$1`);
    } else {
      catchupUrl = `${channel.url}-${startSec}-${endSec}.m3u8`;
    }
    const ch: Channel = { ...channel, url: catchupUrl, name: `${channel.name} — ${p.title}` };
    setCatchupCh(ch);
    setCatchupProg(p);
  }, [channel]);

  const wrappedOnZap = useCallback((ch: Channel) => {
    setCatchupCh(null);
    setCatchupProg(null);
    onZap?.(ch);
  }, [onZap]);

  const progs = localEpg.length
    ? localEpg
    : ([epgNow, epgNext].filter(Boolean) as EpgProgramme[]);

  const catchupEnabled = Boolean(channel.catchup);
  const catchupDays = channel.catchup?.days;

  return (
    <div className="watch">
      <header className="watch-bar">
        <button type="button" className="watch-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="watch-bar-info">
          <span className="watch-title">{playingChannel.name}</span>
          <span className="watch-meta">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {channel.group} · {catchupCh ? "Catchup" : "Live"}
            {catchupProg ? (
              <span className="watch-epg" title={catchupProg.description}>
                {" "}· {catchupProg.title} ({formatEpgTime(catchupProg)})
              </span>
            ) : epgNow ? (
              <span className="watch-epg" title={epgNow.description}>
                {" "}· Now: {epgNow.title} ({formatEpgTime(epgNow)})
              </span>
            ) : epgNext ? (
              <span className="watch-epg watch-epg--next">
                {" "}· Next: {epgNext.title} ({formatEpgTime(epgNext)})
              </span>
            ) : null}
            {catchupCh && (
              <button type="button" className="watch-catchup-exit" onClick={() => { setCatchupCh(null); setCatchupProg(null); }}>Back to live</button>
            )}
          </span>
        </div>
      </header>
      <div className="watch-stage">
        <Player channel={playingChannel} onBack={onBack} profileId={profileId} zapList={zapList} onZap={wrappedOnZap} getEpgForChannel={getEpgForChannel} />
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
            onCatchup={catchupEnabled ? handleCatchup : undefined}
            catchupEnabled={catchupEnabled}
            catchupDays={catchupDays}
          />
        </div>
      )}
    </div>
  );
}
