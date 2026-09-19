import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";

/**
 * Where the money went.
 *
 * Only money lives here. Lost work time used to be a third row, but it is hours,
 * not rupiah, and it already has its own card - mixing units in one list made
 * the list hard to read and pushed the card past its height on laptop screens.
 */
export function Costs({
  quotaMb,
  quotaRupiah,
  ispWasted,
  streamingWasted,
  quotaPctOfPlan,
  quotaGbPerMonth,
}: {
  quotaMb: number;
  quotaRupiah: number;
  ispWasted: number;
  streamingWasted: number;
  quotaPctOfPlan: number;
  quotaGbPerMonth: number;
}) {
  const { t, f } = useI18n();

  const rows = [
    {
      title: t("costs.data"),
      note: t("costs.dataNote", { gb: f.data(quotaMb) }),
      value: f.rupiah(quotaRupiah),
      color: "var(--color-down)",
    },
    {
      title: t("costs.paid"),
      note: t("costs.paidNote", { a: f.rupiah(ispWasted), b: f.rupiah(streamingWasted) }),
      value: f.rupiah(ispWasted + streamingWasted),
      color: "var(--color-power)",
    },
  ];

  const planWidth = Math.min(100, quotaPctOfPlan);

  return (
    <Card
      label={t("costs.label")}
      info={t("costs.info")}
      hint={t("costs.hint")}
      className="col-span-2 min-h-[190px] fit:min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        {rows.map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-7 w-[3px] shrink-0 rounded-full" style={{ background: row.color }} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{row.title}</div>
                <div className="truncate text-[11px] text-[var(--color-faint)]">{row.note}</div>
              </div>
            </div>
            <div className="tnum shrink-0 text-sm font-semibold">{row.value}</div>
          </div>
        ))}

        <div>
          <div className="flex justify-between text-[11px] text-[var(--color-faint)]">
            <span>{t("costs.plan")}</span>
            <span className="tnum">
              {f.percent(quotaPctOfPlan, 1)} / {quotaGbPerMonth} GB
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--color-line-soft)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${planWidth}%`, background: "var(--color-down)" }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
