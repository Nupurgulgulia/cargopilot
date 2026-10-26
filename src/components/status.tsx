import type { Readiness, RuleStatus, Severity } from "@/lib/types";
import { Check, Dots, Plane, Question, Stop, Warn } from "./icons";

export const READINESS_META: Record<Readiness, { label: string; sub: string; cls: string; dot: string; board: string }> = {
  grounded: {
    label: "Grounded",
    sub: "Has problems that must be fixed before it can ship",
    cls: "bg-red-500 text-white border-red-500",
    dot: "bg-red-600",
    board: "GROUNDED",
  },
  attention: {
    label: "Needs Attention",
    sub: "A few things to check before it ships",
    cls: "bg-amber-400 text-[#3d2a00] border-amber-400",
    dot: "bg-amber-500",
    board: "NEEDS ATTENTION",
  },
  cleared: {
    label: "Cleared for Dispatch",
    sub: "Passed every check and is ready for your final review",
    cls: "bg-emerald-500 text-white border-emerald-500",
    dot: "bg-emerald-600",
    board: "CLEARED FOR DISPATCH",
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
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${m.cls} ${size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[11px]"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {m.label}
    </span>
  );
}

export function SeverityTag({ s }: { s: Severity }) {
  return s === "Red" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
      Critical
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-semibold text-[#3d2a00]">
      Warning
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
