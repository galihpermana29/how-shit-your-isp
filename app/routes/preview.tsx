import { useMemo, useState } from "react";
import { Board } from "../components/Board";
import { mockBoardData } from "../lib/mock";

export function meta() {
  return [{ title: "Rumah Uptime - pratinjau" }];
}

/**
 * Papan yang sama dengan data sintetis, supaya tata letaknya bisa disetel
 * sebelum ESP32-nya terpasang - dan supaya perubahan tampilan bisa dilihat
 * tanpa menunggu insiden asli terjadi.
 */
export default function Preview() {
  const [now] = useState(() => Date.now());
  const [meetings, setMeetings] = useState<Record<string, boolean>>({});
  const [bolas, setBolas] = useState<Record<string, boolean>>({});
  const base = useMemo(() => mockBoardData(now), [now]);

  const data = {
    ...base,
    recent: base.recent.map((incident) => ({
      ...incident,
      meeting: meetings[incident._id] ?? incident.meeting,
      bola: bolas[incident._id] ?? incident.bola,
    })),
  };

  return (
    <Board
      data={data}
      onToggleMeeting={(id, meeting) =>
        setMeetings((prev) => ({ ...prev, [id]: meeting }))
      }
      onToggleBola={(id, bola) => setBolas((prev) => ({ ...prev, [id]: bola }))}
    />
  );
}
