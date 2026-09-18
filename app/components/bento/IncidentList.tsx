import { CAUSE_COLOR, CAUSE_LABEL, Card, STATUS_LABEL } from "./primitives";
import { durasi } from "../../lib/format";
import { isWeekendWib, wibParts } from "../../../convex/lib/time";

export type IncidentRow = {
  _id: string;
  start: number;
  end: number | null;
  kind: string;
  cause: string;
  meeting: boolean;
  bola: boolean;
};

function jam(ms: number): string {
  const p = wibParts(ms);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  const hh = String(p.hour).padStart(2, "0");
  const mi = String(p.minute).padStart(2, "0");
  return `${dd}/${mm} ${hh}.${mi}`;
}

/**
 * Daftar insiden terakhir, dengan penanda "lagi meeting".
 *
 * Penandanya manual dan itu disengaja. Meeting cuma sekitar 4% dari jam kerja
 * tapi enam kali lebih mahal per jamnya, jadi menaikkan tarif dasar untuk
 * menampungnya akan melebihkan hampir semua insiden. Satu klik pada insiden
 * yang memang menabrak meeting jauh lebih akurat - dan karena datanya mentah,
 * klik itu hanya mengubah satu penanda; rupiahnya dihitung ulang sendiri.
 */
/** Tombol penanda - bentuknya sama, warnanya yang membedakan maksudnya. */
function Tag({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors"
      style={{
        background: active ? `color-mix(in oklab, ${color} 30%, transparent)` : "transparent",
        color: active ? color : "var(--color-faint)",
        border: `1px solid ${active ? color : "var(--color-line)"}`,
      }}
    >
      {label}
    </button>
  );
}

export function IncidentList({
  incidents,
  now,
  onToggleMeeting,
  onToggleBola,
}: {
  incidents: IncidentRow[];
  now: number;
  onToggleMeeting: (id: string, meeting: boolean) => void;
  onToggleBola: (id: string, bola: boolean) => void;
}) {
  return (
    <Card
      label="Insiden terakhir"
      hint={incidents.length > 0 ? "klik 'meeting' kalau kena" : "belum ada"}
      className="col-span-full min-h-[150px] lg:col-span-2 lg:min-h-0"
    >
      {incidents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          Belum ada insiden tercatat.
        </div>
      ) : (
        <ul className="-mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {incidents.map((incident) => {
            const ongoing = incident.end === null;
            return (
              <li
                key={incident._id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                style={{ background: "var(--color-surface-2)" }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <i
                    className="inline-block size-2 shrink-0 rounded-full not-italic"
                    style={{ background: CAUSE_COLOR[incident.cause] ?? "var(--color-device)" }}
                  />
                  <span className="tnum shrink-0 text-[11px] text-[var(--color-muted)]">
                    {jam(incident.start)}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-faint)]">
                    {CAUSE_LABEL[incident.cause] ?? STATUS_LABEL[incident.kind]}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <span className="tnum text-[11px] font-medium">
                    {ongoing ? "berlangsung" : durasi((incident.end ?? now) - incident.start)}
                  </span>
                  {incident.kind === "putus" && (
                    <>
                      <Tag
                        active={incident.meeting}
                        color="var(--color-down)"
                        label="meeting"
                        onClick={() => onToggleMeeting(incident._id, !incident.meeting)}
                      />
                      {/* Bola hanya muncul di akhir pekan - menampilkannya pada
                          outage Selasa siang cuma menambah tombol yang tak
                          pernah dipakai dan memperlambat baris yang dibaca. */}
                      {isWeekendWib(incident.start) && (
                        <Tag
                          active={incident.bola}
                          color="var(--color-power)"
                          label="bola"
                          onClick={() => onToggleBola(incident._id, !incident.bola)}
                        />
                      )}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
