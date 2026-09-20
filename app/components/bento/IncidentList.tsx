import { CAUSE_COLOR, Card } from "./primitives";
import { useI18n, type MessageKey } from "../../lib/i18n";
import { isWeekendWib } from "../../../convex/lib/time";

export type IncidentRow = {
  _id: string;
  start: number;
  end: number | null;
  kind: string;
  cause: string;
  meeting: boolean;
  bola: boolean;
};

/** A tag button: same shape for both, the colour carries the meaning. */
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
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-[color,background,transform] duration-100 active:scale-90 motion-reduce:active:scale-100"
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

/**
 * Recent outages, with manual tags.
 *
 * Tags are manual on purpose. Meetings are about 4% of working hours but cost
 * twice as much data per hour, so raising the base rate to cover them would
 * overstate nearly every outage. One click on the outage that actually hit a
 * call is far more accurate - and because the data is raw, the click only flips
 * a flag; the rupiah recomputes itself.
 */
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
  const { t, f } = useI18n();

  return (
    <Card
      label={t("incidents.label")}
      info={t("incidents.info")}
      hint={incidents.length > 0 ? t("incidents.hint") : undefined}
      className="col-span-2 min-h-[170px] fit:min-h-0"
    >
      {incidents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          {t("incidents.empty")}
        </div>
      ) : (
        <ul className="-mr-1 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {incidents.map((incident) => {
            const ongoing = incident.end === null;
            return (
              <li
                key={incident._id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-[filter] duration-100 hover:brightness-125"
                style={{ background: "var(--color-surface-2)" }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <i
                    className="inline-block size-2 shrink-0 rounded-full not-italic"
                    style={{ background: CAUSE_COLOR[incident.cause] ?? "var(--color-device)" }}
                  />
                  <span className="tnum shrink-0 text-[11px] text-[var(--color-muted)]">
                    {f.dayTime(incident.start)}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-faint)]">
                    {t(`cause.${incident.cause}` as MessageKey)}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="tnum mr-0.5 text-[11px] font-medium">
                    {ongoing ? t("incidents.ongoing") : f.duration((incident.end ?? now) - incident.start)}
                  </span>
                  {incident.kind === "putus" && (
                    <>
                      <Tag
                        active={incident.meeting}
                        color="var(--color-down)"
                        label={t("tag.meeting")}
                        onClick={() => onToggleMeeting(incident._id, !incident.meeting)}
                      />
                      {/* Football only on weekends - showing it on a Tuesday afternoon
                          outage just adds a button nobody presses. */}
                      {isWeekendWib(incident.start) && (
                        <Tag
                          active={incident.bola}
                          color="var(--color-power)"
                          label={t("tag.bola")}
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
