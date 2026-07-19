/**
 * bunken kotoba — bibliographic registry (slice 1, 4/4 canonical).
 *
 *   registerRecord — register a 文献 (rkey={scheme}_{externalId}, idempotent).
 *   getRecord      — by (scheme, externalId).
 *   search         — substring over title+authors + scheme/era/country/material.
 *   stats          — aggregate counts by scheme / materialType / country.
 *
 * Replaces vendor createKyselyDb()/:Bunken graph writes with AT PDS records
 * (no RW). Public bibliographic data → 3-axis clean.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  BUNKEN_SCHEMES,
  bunkenDid,
  bunkenRkey,
  normalizeExternalId,
  type BunkenRecord,
  type BunkenScheme,
  type BunkenView,
  type GetRecordInput,
  type GetRecordOutput,
  type MaterialType,
  type RegisterRecordInput,
  type RegisterRecordOutput,
  type SearchInput,
  type SearchOutput,
  type StatsInput,
  type StatsOutput,
} from "./types.js";

export const BUNKEN_COLLECTION = "com.etzhayyim.apps.bunken.record";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

function matchesQuery(v: BunkenRecord, q: string): boolean {
  const needle = q.toLowerCase();
  if (v.title.toLowerCase().includes(needle)) return true;
  return (v.authors ?? []).some((a) => a.toLowerCase().includes(needle));
}

export async function registerRecord(
  e: Etzhayyim,
  input: RegisterRecordInput
): Promise<RegisterRecordOutput> {
  if (!input.title || !input.scheme || !input.externalId) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!BUNKEN_SCHEMES.has(input.scheme)) {
    return { status: "rejected", error: "invalidScheme" };
  }
  const externalId = normalizeExternalId(input.externalId);
  if (!externalId) return { status: "rejected", error: "emptyExternalId" };

  const rkey = bunkenRkey(input.scheme, externalId);
  const existing = await e
    .read<BunkenRecord>({ collection: BUNKEN_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      bunkenUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      scheme: input.scheme,
      externalId,
    };
  }

  const did = bunkenDid(input.scheme, externalId);
  const now = new Date().toISOString();
  const record: BunkenRecord = {
    did,
    scheme: input.scheme,
    externalId,
    title: input.title,
    authors: input.authors,
    year: input.year,
    era: input.era,
    materialType: input.materialType,
    country: input.country,
    language: input.language,
    sourceUrl: input.sourceUrl,
    enriched: true,
    didRegistered: false,
    collectedAt: now,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: BUNKEN_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    bunkenUri: receipt.uri,
    did,
    scheme: input.scheme,
    externalId,
  };
}

export async function getRecord(
  e: Etzhayyim,
  input: GetRecordInput
): Promise<GetRecordOutput> {
  if (!input.scheme || !input.externalId) {
    return { error: "missingSchemeOrExternalId" };
  }
  const resp = await e
    .read<BunkenRecord>({
      collection: BUNKEN_COLLECTION,
      rkey: bunkenRkey(input.scheme, normalizeExternalId(input.externalId)),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  return { record: { ...r.value, bunkenUri: r.uri } };
}

export async function search(
  e: Etzhayyim,
  input: SearchInput = {}
): Promise<SearchOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<BunkenRecord>({
    collection: BUNKEN_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: BunkenView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.scheme && v.scheme !== input.scheme) return false;
      if (input.era && v.era !== input.era) return false;
      if (input.country && v.country !== input.country) return false;
      if (input.materialType && v.materialType !== input.materialType) return false;
      if (input.q && !matchesQuery(v, input.q)) return false;
      return true;
    })
    .map((r) => ({ ...r.value, bunkenUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function stats(
  e: Etzhayyim,
  input: StatsInput = {}
): Promise<StatsOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  let cursor: string | undefined;
  let scanned = 0;
  const byScheme: Record<string, number> = {};
  const byMaterialType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  while (scanned < maxScan) {
    const page = await e.read<BunkenRecord>({
      collection: BUNKEN_COLLECTION,
      cursor,
      limit: PAGE_LIMIT,
    });
    for (const r of page.records) {
      if (scanned >= maxScan) break;
      const v = r.value;
      byScheme[v.scheme as BunkenScheme] =
        (byScheme[v.scheme as BunkenScheme] ?? 0) + 1;
      if (v.materialType) {
        byMaterialType[v.materialType as MaterialType] =
          (byMaterialType[v.materialType as MaterialType] ?? 0) + 1;
      }
      if (v.country) byCountry[v.country] = (byCountry[v.country] ?? 0) + 1;
      scanned += 1;
    }
    if (scanned >= maxScan || !page.cursor || page.records.length < PAGE_LIMIT) {
      break;
    }
    cursor = page.cursor;
  }
  return {
    total: scanned,
    byScheme,
    byMaterialType,
    byCountry,
    truncated: scanned >= maxScan,
  };
}
