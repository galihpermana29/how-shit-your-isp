import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * One tooltip layer for the whole board.
 *
 * The browser's own `title` tooltip is unusable here: it waits a second, cannot
 * be styled, and never appears on a touch screen. This one is rendered into the
 * document body through a portal, so the `overflow: hidden` on cards cannot clip
 * it, and it follows the pointer immediately.
 */
type TooltipContent = { title: string; rows: Array<{ label: string; value: string; color?: string }> };

type TooltipApi = {
  show: (content: TooltipContent, x: number, y: number) => void;
  hide: () => void;
};

const TooltipContext = createContext<TooltipApi | null>(null);

export function useTooltip(): TooltipApi {
  const api = useContext(TooltipContext);
  if (!api) throw new Error("useTooltip must be used inside TooltipLayer");
  return api;
}

type State = { content: TooltipContent; x: number; y: number } | null;

export function TooltipLayer({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);

  const api = useMemo<TooltipApi>(
    () => ({
      show: (content, x, y) => setState({ content, x, y }),
      hide: () => setState(null),
    }),
    [],
  );

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {state !== null && typeof document !== "undefined"
        ? createPortal(<Bubble {...state} />, document.body)
        : null}
    </TooltipContext.Provider>
  );
}

function Bubble({ content, x, y }: NonNullable<State>) {
  // Keep the bubble on screen near the edges: it is anchored to the pointer, and
  // a block in the first or last minutes of the day would otherwise hang off.
  const margin = 12;
  const halfWidth = 110;
  const clampedX = Math.min(Math.max(x, halfWidth + margin), window.innerWidth - halfWidth - margin);
  const above = y > 160;

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[220px] -translate-x-1/2 rounded-xl border p-2.5 text-[11px] shadow-[0_12px_40px_rgb(0_0_0/0.55)]"
      style={{
        left: clampedX,
        top: above ? y - margin : y + margin,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
        background: "var(--color-surface-2)",
        borderColor: "var(--color-line)",
      }}
    >
      <div className="font-medium text-[var(--color-ink)]">{content.title}</div>
      <ul className="mt-1.5 space-y-0.5">
        {content.rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[var(--color-faint)]">
              {row.color && (
                <i
                  className="inline-block size-1.5 shrink-0 rounded-full not-italic"
                  style={{ background: row.color }}
                />
              )}
              {row.label}
            </span>
            <span className="tnum text-[var(--color-muted)]">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pointer position helper shared by the interactive cards. */
export function useTrackIndex(count: number) {
  return useCallback(
    (event: { currentTarget: HTMLElement; clientX: number }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;
      return Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
    },
    [count],
  );
}
