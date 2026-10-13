import { useEffect, useRef, type ReactNode } from "react";

/** Native modal contains focus; restore the trigger explicitly when React unmounts it. */
export function ResearchDialog({ title, subtitle, onClose, children, wide = false }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`rail-dialog ${wide ? "wide" : ""}`} aria-labelledby="rail-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="rail-dialog-head"><div><span className="rail-kicker">{wide ? "ADVANCED RESEARCH" : "TEAM SETUP"}</span><h2 id="rail-dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="rail-close" aria-label={`關閉${title}`} onClick={onClose}>✕</button></header>
    <div className="rail-dialog-body">{children}</div>
  </dialog>;
}
