/**
 * bunken kotoba — record types.
 *
 * Per ADR-2605203000 Option B (PDS XRPC). 文献書誌 (bibliographic) intelligence
 * across 9 public schemes. Public bibliographic data (no PII, no payment) →
 * 3-axis clean. ADR-2605172000 kotoba.
 *
 * ISBN validation/metadata is authoritative at isbn.etzhayyim.com; bunken only
 * manages the cross-scheme bibliographic DID + same-as links.
 *
 * Identity hierarchy (per bunken CLAUDE.md, 9-scheme multi-DID):
 *   did:web:bunken.etzhayyim.com                          — controller
 *   did:web:bunken.etzhayyim.com:ndl:bib:{bibId}          — NDL 書誌
 *   did:web:bunken.etzhayyim.com:ncid:{ncid}              — CiNii
 *   did:web:bunken.etzhayyim.com:doi:{prefix}:{suffix}    — DOI
 */

export const BUNKEN_DID_PREFIX = "did:web:bunken.etzhayyim.com:" as const;

/** The 9 public bibliographic schemes bunken federates. */
export type BunkenScheme =
  | "ndl:bib"
  | "ndl:pid"
  | "ncid"
  | "lccn"
  | "oclc"
  | "isbn"
  | "doi"
  | "viaf"
  | "ark";

export const BUNKEN_SCHEMES: ReadonlySet<BunkenScheme> = new Set([
  "ndl:bib",
  "ndl:pid",
  "ncid",
  "lccn",
  "oclc",
  "isbn",
  "doi",
  "viaf",
  "ark",
]);

export type MaterialType =
  | "book"
  | "article"
  | "serial"
  | "thesis"
  | "manuscript"
  | "map"
  | "other";

export interface BunkenRecord {
  did: string;
  scheme: BunkenScheme;
  /** Scheme-native identifier (NDL bibId, NCID, DOI suffix, ISBN-13, …). */
  externalId: string;
  title: string;
  authors?: string[];
  year?: number;
  /** Japanese era label (令和 / 平成 / 昭和 / …) where applicable. */
  era?: string;
  materialType?: MaterialType;
  /** ISO 3166-1 alpha-2 country of publication. */
  country?: string;
  /** ISO 639-1 / 639-3. */
  language?: string;
  sourceUrl?: string;
  /**
   * Collection-pipeline state (set by the CDX → enrich → registerDids flow):
   *   enriched      — Murakumo LLM has filled title/authors/year (false = discovered-only).
   *   didRegistered — path-based DID has been registered with the identity service.
   * Records created via registerRecord (manual) are enriched:true by construction.
   */
  enriched?: boolean;
  didRegistered?: boolean;
  collectedAt: string;
  createdAt: string;
}

export interface BunkenView extends BunkenRecord {
  bunkenUri: string;
}

export interface RegisterRecordInput {
  scheme: BunkenScheme;
  externalId: string;
  title: string;
  authors?: string[];
  year?: number;
  era?: string;
  materialType?: MaterialType;
  country?: string;
  language?: string;
  sourceUrl?: string;
}

export interface RegisterRecordOutput {
  status: "registered" | "alreadyExists" | "rejected";
  bunkenUri?: string;
  did?: string;
  scheme?: BunkenScheme;
  externalId?: string;
  error?: string;
}

export interface GetRecordInput {
  scheme: BunkenScheme;
  externalId: string;
}

export interface GetRecordOutput {
  record?: BunkenView;
  error?: string;
}

export interface SearchInput {
  /** Case-insensitive substring over title + authors. */
  q?: string;
  scheme?: BunkenScheme;
  era?: string;
  country?: string;
  materialType?: MaterialType;
  limit?: number;
  cursor?: string;
}

export interface SearchOutput {
  items: BunkenView[];
  cursor?: string;
  total: number;
}

export interface StatsInput {
  maxScan?: number;
}

export interface StatsOutput {
  total?: number;
  byScheme?: Record<string, number>;
  byMaterialType?: Record<string, number>;
  byCountry?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Normalize a scheme-native id: trim, drop surrounding whitespace. */
export function normalizeExternalId(id: string): string {
  return id.trim();
}

/**
 * Path-based DID for a (scheme, externalId). The scheme already carries its own
 * colon segments (e.g. "ndl:bib"); the externalId is appended after one colon.
 */
export function bunkenDid(scheme: BunkenScheme, externalId: string): string {
  return `${BUNKEN_DID_PREFIX}${scheme}:${normalizeExternalId(externalId)}`;
}

/** rkey — flatten ':' '/' '.' (not valid in an rkey segment) to '_'. */
export function bunkenRkey(scheme: BunkenScheme, externalId: string): string {
  return `${scheme}:${normalizeExternalId(externalId)}`.replace(/[:/.]/g, "_");
}
