export function AppLegalFooter({ className }: { className?: string }) {
  return (
    <footer className={className}>
      <div className="rounded-xl border bg-card px-6 py-2 text-card-foreground shadow-none">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Model-assisted. Human-accountable.
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Reg AI uses large language models and related automated systems to draft gap analyses,
          redlines, scores, summaries, and other recommendations. These outputs are probabilistic.
          They may be incomplete, outdated, or incorrect, and they are not legal advice, a
          regulatory determination, or a certification of compliance. A qualified professional must
          independently verify all material before it is adopted, filed, published, or relied upon.
          Reg AI and its affiliates accept no liability for decisions, filings, or losses arising
          from unverified model output.
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">© 2026 Reg AI. All rights reserved.</p>
      </div>
    </footer>
  );
}
