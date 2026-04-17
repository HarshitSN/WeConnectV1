import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function getRiskLabel(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "low";
  if (score >= 40) return "medium";
  return "high";
}

export function getCertTypeLabel(type: string) {
  return {
    none: "Self-Declared",
    self: "Self-Certified",
    digital: "Digital Certified",
    auditor: "Auditor Certified",
  }[type] ?? type;
}

export function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
