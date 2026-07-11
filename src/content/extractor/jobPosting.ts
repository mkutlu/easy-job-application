import type { JobPostingContext } from "../../shared/types";

// Most job boards embed schema.org/JobPosting JSON-LD in the document head
// so Google for Jobs can index the listing -- this is a web standard, not a
// per-site scrape, so reading it stays within the "no adapters" principle.
// Only the top-level document is checked: search engines don't reliably
// crawl iframe content, so sites always put this in the main document.

interface RawPostalAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string | { name?: string };
}

interface RawPlace {
  "@type"?: string;
  address?: string | RawPostalAddress;
}

interface RawJobPosting {
  "@type"?: string | string[];
  title?: string;
  hiringOrganization?: { name?: string } | string;
  employmentType?: string | string[];
  jobLocationType?: string;
  jobLocation?: RawPlace | RawPlace[];
}

function formatAddress(address: string | RawPostalAddress | undefined): string | null {
  if (!address) return null;
  if (typeof address === "string") return address.trim() || null;
  const country =
    typeof address.addressCountry === "string"
      ? address.addressCountry
      : address.addressCountry?.name;
  const parts = [address.addressLocality, address.addressRegion, country].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatLocation(posting: RawJobPosting): string | null {
  if (posting.jobLocationType?.toUpperCase() === "TELECOMMUTE") return "Remote";

  const locations = Array.isArray(posting.jobLocation)
    ? posting.jobLocation
    : posting.jobLocation
      ? [posting.jobLocation]
      : [];
  const formatted = locations
    .map((loc) => formatAddress(loc.address))
    .filter((l): l is string => l !== null);

  return formatted.length > 0 ? Array.from(new Set(formatted)).join("; ") : null;
}

function isJobPosting(node: unknown): node is RawJobPosting {
  if (!node || typeof node !== "object") return false;
  const type = (node as RawJobPosting)["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && t.toLowerCase() === "jobposting");
}

// Structured data can appear as a single object, an array of objects, or
// nested under "@graph" -- this walks all three shapes shallowly.
function findJobPostingNode(parsed: unknown): RawJobPosting | null {
  if (isJobPosting(parsed)) return parsed;
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findJobPostingNode(item);
      if (found) return found;
    }
  } else if (parsed && typeof parsed === "object" && "@graph" in parsed) {
    return findJobPostingNode((parsed as { "@graph": unknown })["@graph"]);
  }
  return null;
}

export function extractJobPostingContext(): JobPostingContext | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const posting = findJobPostingNode(parsed);
    if (!posting) continue;

    const orgName =
      typeof posting.hiringOrganization === "string"
        ? posting.hiringOrganization
        : posting.hiringOrganization?.name ?? null;
    const employmentType = Array.isArray(posting.employmentType)
      ? posting.employmentType.join(", ")
      : posting.employmentType ?? null;

    return {
      title: posting.title?.trim() || null,
      location: formatLocation(posting),
      company: orgName?.trim() || null,
      employmentType: employmentType?.trim() || null,
    };
  }
  return null;
}
