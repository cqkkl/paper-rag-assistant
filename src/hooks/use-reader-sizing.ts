import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const key = (name: string) => `paper-rag:reader-sizing:${name}`;
function preference(name: string, fallback: number, min: number, max: number) {
  try { const value = Number(localStorage.getItem(key(name)) ?? fallback); return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
  catch { return fallback; }
}
function persist(name: string, value: number) {
  try { localStorage.setItem(key(name), String(value)); } catch { /* Session state remains available. */ }
}

export function useReaderSizing() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const leftColumn = useRef<HTMLElement>(null);
  const rightColumn = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState(() => preference("focus", 0, 0, 1) === 1);
  const [split, setSplitState] = useState(() => preference("split", 50, 25, 75));
  const [heightRatio, setHeightState] = useState(() => preference("height", 1, .45, 1));
  const [availableHeight, setAvailableHeight] = useState(600);
  const [widths, setWidths] = useState([600, 600]);
  const drag = useRef<"split" | "height" | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => { root.current = node; }, []);
  const stageRef = useCallback((node: HTMLDivElement | null) => { stage.current = node; }, []);
  const leftRef = useCallback((node: HTMLElement | null) => { leftColumn.current = node; }, []);
  const rightRef = useCallback((node: HTMLElement | null) => { rightColumn.current = node; }, []);

  useEffect(() => {
    const measure = () => {
      if (stage.current) setAvailableHeight(Math.max(260, window.innerHeight - Math.max(0, stage.current.getBoundingClientRect().top) - 28));
      setWidths([leftColumn.current, rightColumn.current].map((column) => {
        const pane = column?.querySelector<HTMLElement>("[data-pdf-pane]");
        if (!pane) return 600;
        const style = getComputedStyle(pane);
        return Math.max(80, pane.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1);
      }));
    };
    const observer = new ResizeObserver(measure);
    for (const element of [root.current, leftColumn.current, rightColumn.current, leftColumn.current?.querySelector("[data-pdf-pane]"), rightColumn.current?.querySelector("[data-pdf-pane]"), root.current?.querySelector("[data-reader-controls]")]) if (element) observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [focus]);

  const setSplit = (value: number) => {
    const next = Math.max(25, Math.min(75, value)); setSplitState(next); persist("split", next);
  };
  const setHeight = (value: number) => {
    const next = Math.max(.45, Math.min(1, value)); setHeightState(next); persist("height", next);
  };
  const toggleFocus = (value: boolean) => { setFocus(value); persist("focus", value ? 1 : 0); };
  const startDrag = (event: PointerEvent<HTMLElement>, kind: "split" | "height") => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = kind;
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const bounds = stage.current?.getBoundingClientRect();
    if (!bounds || !drag.current) return;
    if (drag.current === "split") setSplit((event.clientX - bounds.left) / bounds.width * 100);
    else setHeight((event.clientY - bounds.top) / availableHeight);
  };
  const stopDrag = () => { drag.current = null; };

  return { root: rootRef, stage: stageRef, leftColumn: leftRef, rightColumn: rightRef, focus, toggleFocus, split, setSplit, heightRatio, setHeight, widths,
    height: Math.max(220, availableHeight * heightRatio), startDrag, moveDrag, stopDrag,
    reset: () => { setSplit(50); setHeight(1); } };
}
