export interface EpgProgramme {
  channelId: string;
  title: string;
  description?: string;
  start: string; // original string from API e.g. "2026-08-26 12:00:00"
  stop: string;
  startTime: number; // epoch ms
  stopTime: number;
}

export interface EpgNowNext {
  now?: EpgProgramme;
  next?: EpgProgramme;
}

export type EpgMap = Map<string, EpgNowNext>;
