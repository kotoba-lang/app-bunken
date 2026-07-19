/**
 * bunken kotoba — barrel.
 *
 * Per ADR-2605203000 Option B Phase E reference impl. 文献書誌 multi-scheme
 * bibliography on the etzhayyim substrate (AT PDS records; no RW).
 *
 * Slice 1: registry — registerRecord + getRecord + search + stats.
 * Slice 2: collection pipeline — collectFromCdx → fetchCdxBatch → enrichBatch →
 *          registerDids → linkSameAs (Common Crawl CDX discovery; per CLAUDE.md).
 */

export * from "./types.js";
export {
  registerRecord,
  getRecord,
  search,
  stats,
  BUNKEN_COLLECTION,
} from "./registry.js";
export {
  collectFromCdx,
  fetchCdxBatch,
  enrichBatch,
  registerDids,
  linkSameAs,
  cdxQueryForScheme,
  extractIdFromUrl,
  parseCdxUrl,
  classifyEra,
  djb2,
  sameAsMatchKey,
  sameAsRkey,
  BUNKEN_JOB_COLLECTION,
  BUNKEN_SAMEAS_COLLECTION,
  type BunkenCollectionJob,
  type JobStatus,
  type CollectionDeps,
  type EnrichInput,
  type EnrichResult,
  type CollectFromCdxInput,
  type CollectFromCdxOutput,
  type FetchCdxBatchInput,
  type FetchCdxBatchOutput,
  type EnrichBatchInput,
  type EnrichBatchOutput,
  type RegisterDidsInput,
  type RegisterDidsOutput,
  type LinkSameAsInput,
  type LinkSameAsOutput,
  type SameAsEdge,
} from "./collection.js";
