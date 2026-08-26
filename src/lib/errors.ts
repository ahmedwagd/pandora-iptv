export type PlaylistErrorCode =
  | "NETWORK"
  | "AUTH"
  | "EMPTY"
  | "UNKNOWN";

/** Structured error for playlist/Xtream operations */
export class PlaylistError extends Error {
  code: PlaylistErrorCode;
  constructor(message: string, code: PlaylistErrorCode = "UNKNOWN") {
    super(message);
    this.name = "PlaylistError";
    this.code = code;
  }
}

export function toErrorString(e: unknown): string {
  if (e instanceof PlaylistError) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  try {
    return JSON.stringify(e) || "Failed to load playlist.";
  } catch {
    return "Failed to load playlist.";
  }
}
