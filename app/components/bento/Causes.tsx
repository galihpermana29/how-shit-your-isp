import { CAUSE_COLOR, Card } from "./primitives";
import { useI18n, type MessageKey } from "../../lib/i18n";

/**
 * What caused this month's downtime. This split decides whether an outage is
 * worth complaining about: a power cut is not a service the ISP failed to
 * deliver, and mixing it in makes any claim fall apart the first time it is
 * challenged.
 */
export function Causes({ causes }: { causes: Record<string, number> }) {
  const { t, f } = useI18n();
  const entries = Object.entries(causes).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);
  const label = (cause: string) => t(`cause.${cause}` as MessageKey);

  return (
    <Card
      label={t("causes.label")}
      info={t("causes.info")}
      hint={total > 0 ? f.duration(total) : undefined}
      className="col-span-2 min-h-[150px] fit:min-h-0"
    >
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          {t("causes.empty")}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {entries.map(([cause, ms]) => (
              <div
                key={cause}
                title={`${label(cause)} - ${f.duration(ms)}`}
                style={{
                  width: `${(ms / total) * 100}%`,
                  background: CAUSE_COLOR[cause] ?? "var(--color-device)",
                }}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {entries.map(([cause, ms]) => (
              <li key={cause} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <i
                    className="inline-block size-2 shrink-0 rounded-[2px] not-italic"
                    style={{ background: CAUSE_COLOR[cause] ?? "var(--color-device)" }}
                  />
                  <span className="truncate text-[var(--color-muted)]">{label(cause)}</span>
                </span>
                <span className="tnum shrink-0">{f.duration(ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
