import { InterviewSession } from "../types";
import { ensureSessionCompatibility } from "../data/session";

const STORAGE_KEY = "ajtbd-interview-assistant:sessions";

export function loadSessions(): InterviewSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as InterviewSession[];
    return parsed.map(ensureSessionCompatibility);
  } catch {
    return [];
  }
}

export function saveSessions(sessions: InterviewSession[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function exportSessionsPayload(sessions: InterviewSession[]) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "ajtbd-interview-assistant",
      sessions,
    },
    null,
    2,
  );
}

export function importSessionsPayload(raw: string): InterviewSession[] {
  const parsed = JSON.parse(raw) as
    | InterviewSession[]
    | {
        sessions?: InterviewSession[];
      };

  const sessions = Array.isArray(parsed) ? parsed : parsed.sessions ?? [];
  return sessions.map(ensureSessionCompatibility);
}
