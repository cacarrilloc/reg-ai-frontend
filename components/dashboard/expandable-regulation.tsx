"use client";

import { useEffect, useRef, useState } from "react";

export function ExpandableRegulation({
  labels,
  emptyLabel = "—",
}: {
  labels: string[];
  emptyLabel?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const text = labels.join("\n");

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    if (expanded || !valueRef.current) return;

    const element = valueRef.current;
    const measure = () => {
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);

  if (labels.length === 0) {
    return <span aria-label="Not applicable">{emptyLabel}</span>;
  }

  return (
    <div className="font-normal text-muted-foreground">
      <span
        ref={valueRef}
        className={expanded ? "break-words" : "line-clamp-2 break-words"}
      >
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>
            {index > 0 ? <br /> : null}
            {label}
          </span>
        ))}
      </span>
      {overflows || expanded ? (
        <button
          type="button"
          className="mt-1 block w-full text-center text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
