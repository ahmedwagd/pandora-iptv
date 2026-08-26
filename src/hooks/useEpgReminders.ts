import { useCallback, useEffect, useRef, useState } from "react";
import { getStore } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

export interface EpgReminder {
  id: string; // channelId + startTime
  channelId: string;
  channelName: string;
  title: string;
  startTime: number;
  stopTime: number;
  createdAt: number;
}

function keyFor(reminder: Pick<EpgReminder, "channelId" | "startTime">) {
  return `${reminder.channelId}::${reminder.startTime}`;
}

export function useEpgReminders(profileId: string | null) {
  const [reminders, setReminders] = useState<EpgReminder[]>([]);
  const [due, setDue] = useState<EpgReminder | null>(null);
  const key = StorageKeys.epgReminders + (profileId ? `:${profileId}` : ""); // scoped manually
  // scopedKey alternative:
  // const key = scopedKey(StorageKeys.epgReminders, profileId as string);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getStore();
      const raw = await s.get<EpgReminder[]>(key);
      if (Array.isArray(raw)) {
        // prune expired (> stopTime)
        const now = Date.now();
        const pruned = raw.filter((r) => r.stopTime > now - 5 * 60 * 1000);
        setReminders(pruned);
        if (pruned.length !== raw.length) {
          const s = await getStore();
          await s.set(key, pruned);
        }
      } else setReminders([]);
    } catch {
      setReminders([]);
    }
  }, [key]);

  const save = useCallback(
    async (next: EpgReminder[]) => {
      setReminders(next);
      try {
        const s = await getStore();
        await s.set(key, next);
        await s.save();
      } catch {}
    },
    [key]
  );

  const add = useCallback(
    async (r: Omit<EpgReminder, "id" | "createdAt">) => {
      const id = keyFor(r);
      if (reminders.some((x) => x.id === id)) return;
      const next = [...reminders, { ...r, id, createdAt: Date.now() }].sort(
        (a, b) => a.startTime - b.startTime
      );
      await save(next);
    },
    [reminders, save]
  );

  const remove = useCallback(
    async (id: string) => {
      await save(reminders.filter((r) => r.id !== id));
    },
    [reminders, save]
  );

  const has = useCallback(
    (channelId: string, startTime: number) =>
      reminders.some((r) => r.id === keyFor({ channelId, startTime })),
    [reminders]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // due checker every 30s + mount
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      // due if start within window
      const dueNow = reminders.find(
        (r) => r.startTime >= now - 30000 && r.startTime <= now + 60000
      );
      if (dueNow) {
        setDue(dueNow);
        // auto-dismiss after 15s and remove so not retrigger
        setTimeout(() => setDue(null), 15000);
      }
    };
    check();
    timerRef.current = window.setInterval(check, 30000) as unknown as number;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reminders]);

  return { reminders, due, add, remove, has, dismissDue: () => setDue(null) };
}
