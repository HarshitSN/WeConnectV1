import kb from "./registry-kb.json";
import type { RegistryCompany } from "./types";

const companies = kb as RegistryCompany[];
const dynamicCompanies = new Map<string, RegistryCompany>();

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\/$/, "")
    .trim();
}

export function lookupRegistry(query: string): RegistryCompany | null {
  const q = normalize(query);
  if (!q) return null;

  for (const c of companies) {
    const name = normalize(c.companyName);
    if (q.includes(name) || name.includes(q)) return c;
    if (c.aliases.some((a) => q.includes(normalize(a)) || normalize(a).includes(q)))
      return c;
    if (q.includes(normalize(c.websiteUrl))) return c;
  }
  return null;
}

export function getCompanyById(id: string): RegistryCompany | null {
  return dynamicCompanies.get(id) ?? companies.find((c) => c.id === id) ?? null;
}

export function listRegistryCompanies(): RegistryCompany[] {
  return [...companies, ...dynamicCompanies.values()];
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function registerDynamicCompany(company: Omit<RegistryCompany, "id">): RegistryCompany {
  const id = `web-${toSlug(company.companyName) || "candidate"}`;
  const existing = dynamicCompanies.get(id);
  if (existing) return existing;
  const record: RegistryCompany = { id, ...company };
  dynamicCompanies.set(id, record);
  return record;
}
