/**
 * Simple DJB-like hash for stable channel IDs (favorites keying).
 * Not cryptographic — collisions possible but low for name+url use.
 * Extracted from m3uParser for SRP and testability.
 */
export function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
