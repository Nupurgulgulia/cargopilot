import type { Readiness, RuleStatus, Severity } from "@/lib/types";
import { Check, Dots, Plane, Question, Stop, Warn } from "./icons";

export const READINESS_META: Record<Readiness, { label: string; sub: string; cls: string; dot: string }> = {
  grounded: {
    label: "Grounded",
    sub: "Blocked by Red issues — must not ship until fixed",
    cls: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-600",
  },
  attention: {
    label: "Needs Attention",
    sub: "Warnings, confirmations or missing details to review",
    cls: "bg-amber-50 text-amber-900 border-amber-200",
    dot: "bg-amber-500",
  },
  cleared: {
    label: "Cleared for Dispatch",
    sub: "No rulebook issues detected — ready for seller review",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-600",
  },
};

export function ReadinessIcon({ r, className = "h-5 w-5" }: { r: Readiness; className?: string }) {
  if (r === "grounded") return <Stop className={className} />;
  if (r === "attention") return <Warn className={className} />;
  return <Plane className={className} />;
}

export function ReadinessBadge({ r, size = "sm" }: { r: Readiness; size?: "sm" | "lg" }) {
  const m = READINESS_META[r];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${m.cls} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      <ReadinessIcon r={r} className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {m.label}
    </span>
  );
}

export function SeverityTag({ s }: { s: Severity }) {
  return s === "Red" ? (
    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-800">
      <Stop className="h-3 w-3" /> Red · critical
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
      <Warn className="h-3 w-3" /> Amber · warning
    </span>
  );
}

export const STATUS_META: Record<RuleStatus, { label: string; cls: string }> = {
  pass: { label: "Passed", cls: "text-emerald-700" },
  fail: { label: "Failed", cls: "text-red-700" },
  review: { label: "Confirm", cls: "text-amber-800" },
  not_evaluable: { label: "Waiting for data", cls: "text-slate-500" },
};

export function StatusIcon({ status, severity, className = "h-4 w-4" }: { status: RuleStatus; severity?: Severity; className?: string }) {
  if (status === "pass") return <Check className={`${className} text-emerald-600`} />;
  if (status === "fail") return severity === "Red" ? <Stop className={`${className} text-red-600`} /> : <Warn className={`${className} text-amber-600`} />;
  if (status === "review") return <Question className={`${className} text-amber-600`} />;
  return <Dots className={`${className} text-slate-400`} />;
}
