import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
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
  registerRecord,
  search,
  BUNKEN_JOB_COLLECTION,
  BUNKEN_SAMEAS_COLLECTION,
  type CollectionDeps,
} from "../src/index.js";

describe("bunken collection — pure helpers", () => {
  it("maps schemes to CDX url patterns (isbn delegated → null)", () => {
    expect(cdxQueryForScheme("lccn")).toBe("lccn.loc.gov/*");
    expect(cdxQueryForScheme("oclc")).toBe("worldcat.org/oclc/*");
    expect(cdxQueryForScheme("doi")).toBe("doi.org/10.*");
    expect(cdxQueryForScheme("isbn")).toBeNull();
  });

  it("extracts scheme-native ids from discovered URLs", () => {
    expect(
      extractIdFromUrl("ndl:bib", "https://id.ndl.go.jp/bib/000012345")
    ).toBe("000012345");
    expect(
      extractIdFromUrl("ncid", "https://ci.nii.ac.jp/ncid/BA12345678")
    ).toBe("BA12345678");
    expect(
      extractIdFromUrl("oclc", "https://www.worldcat.org/oclc/9876543")
    ).toBe("9876543");
    expect(
      extractIdFromUrl("doi", "https://doi.org/10.1000/xyz.123")
    ).toBe("10.1000/xyz.123");
    expect(extractIdFromUrl("viaf", "https://example.org/nope")).toBeNull();
  });

  it("parses CDX json lines (drops non-200 + garbage)", () => {
    expect(
      parseCdxUrl(
        '{"urlkey":"go,ndl)/bib/1","url":"https://id.ndl.go.jp/bib/1","status":"200"}'
      )
    ).toBe("https://id.ndl.go.jp/bib/1");
    expect(parseCdxUrl('{"url":"https://x","status":"404"}')).toBeNull();
    expect(parseCdxUrl("not json")).toBeNull();
    expect(parseCdxUrl("")).toBeNull();
  });

  it("classifies era buckets from year", () => {
    expect(classifyEra(undefined)).toBeUndefined();
    expect(classifyEra(-500)).toBe("prehistoric");
    expect(classifyEra(300)).toBe("ancient");
    expect(classifyEra(1200)).toBe("medieval");
    expect(classifyEra(1700)).toBe("industrial");
    expect(classifyEra(2001)).toBe("modern");
  });

  it("djb2 is stable; sameAsMatchKey is order/case-insensitive", () => {
    expect(djb2("abc")).toBe(djb2("abc"));
    expect(
      sameAsMatchKey({ title: "  源氏 物語 ", authors: ["B", "a"] })
    ).toBe(sameAsMatchKey({ title: "源氏 物語", authors: ["A", "b"] }));
  });

  it("sameAsRkey is order-independent", () => {
    expect(sameAsRkey("did:x", "did:y")).toBe(sameAsRkey("did:y", "did:x"));
  });
});

describe("bunken collection — pipeline", () => {
  let e: any;
  // CDX fixture: 3 NDL bib hits (one dup, one 404, one bad line).
  const cdxBody = [
    '{"url":"https://id.ndl.go.jp/bib/100","status":"200"}',
    '{"url":"https://id.ndl.go.jp/bib/100","status":"200"}', // dup
    '{"url":"https://id.ndl.go.jp/bib/200","status":"200"}',
    '{"url":"https://id.ndl.go.jp/bib/300","status":"404"}', // dropped
    "garbage line",
  ].join("\n");

  const deps: CollectionDeps = {
    fetchText: async () => cdxBody,
    enrich: async ({ externalId }) => ({
      title: `書誌 ${externalId}`,
      authors: ["著者"],
      year: 1850,
      materialType: "book",
      country: "JP",
    }),
    registerDid: async () => true,
  };

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:bunken.etzhayyim.com" });
  });

  it("collectFromCdx creates one job per collectable scheme; skips isbn", async () => {
    const r = await collectFromCdx(e, { schemes: ["ndl:bib", "isbn", "oclc"] });
    expect(r.jobs.map((j) => j.scheme).sort()).toEqual(["ndl:bib", "oclc"]);
    expect(r.skipped).toContain("isbn");
    expect(e.count(BUNKEN_JOB_COLLECTION)).toBe(2);
  });

  it("fetchCdxBatch discovers nodes, dedups, and marks the job done", async () => {
    await collectFromCdx(e, { schemes: ["ndl:bib"] });
    const r = await fetchCdxBatch(e, { limit: 100 }, deps);
    expect(r.scheme).toBe("ndl:bib");
    expect(r.discovered).toBe(2); // 100 + 200 (dup collapsed, 404 dropped)
    expect(r.status).toBe("done"); // short page → exhausted

    const found = await search(e, { scheme: "ndl:bib" });
    expect(found.total).toBe(2);
    // discovered-only nodes carry empty title + enriched:false
    expect(found.items.every((i) => i.title === "")).toBe(true);
  });

  it("fetchCdxBatch with no pending job is a no-op", async () => {
    const r = await fetchCdxBatch(e, {}, deps);
    expect(r.error).toBe("noPendingJob");
  });

  it("enrichBatch fills metadata + auto-classifies era", async () => {
    await collectFromCdx(e, { schemes: ["ndl:bib"] });
    await fetchCdxBatch(e, {}, deps);
    const r = await enrichBatch(e, { batchSize: 10 }, deps);
    expect(r.enriched).toBe(2);
    const got = await search(e, { scheme: "ndl:bib" });
    expect(got.items.every((i) => i.title.startsWith("書誌"))).toBe(true);
    expect(got.items.every((i) => i.era === "industrial")).toBe(true); // 1850
  });

  it("enrichBatch without an enricher skips (Murakumo unavailable)", async () => {
    await collectFromCdx(e, { schemes: ["ndl:bib"] });
    await fetchCdxBatch(e, {}, deps);
    const r = await enrichBatch(e, {}, { fetchText: deps.fetchText });
    expect(r.enriched).toBe(0);
    expect(r.skipped).toBe(2);
  });

  it("registerDids marks enriched records registered", async () => {
    await collectFromCdx(e, { schemes: ["ndl:bib"] });
    await fetchCdxBatch(e, {}, deps);
    await enrichBatch(e, {}, deps);
    const r = await registerDids(e, {}, deps);
    expect(r.registered).toBe(2);
    // idempotent: nothing left to register
    const again = await registerDids(e, {}, deps);
    expect(again.processed).toBe(0);
  });

  it("linkSameAs bridges identical works across differing schemes", async () => {
    // same title+author under two schemes → one SAME_AS edge
    await registerRecord(e, {
      scheme: "ndl:bib",
      externalId: "1",
      title: "源氏物語",
      authors: ["紫式部"],
    });
    await registerRecord(e, {
      scheme: "ncid",
      externalId: "BA1",
      title: "源氏物語",
      authors: ["紫式部"],
    });
    // a same-scheme twin must NOT be linked
    await registerRecord(e, {
      scheme: "ndl:bib",
      externalId: "2",
      title: "源氏物語",
      authors: ["紫式部"],
    });
    const r = await linkSameAs(e, {});
    expect(r.groups).toBe(1);
    // ndl:bib:1↔ncid + ndl:bib:2↔ncid = 2 cross-scheme edges; ndl↔ndl excluded
    expect(r.edgesCreated).toBe(2);
    expect(e.count(BUNKEN_SAMEAS_COLLECTION)).toBe(2);
    // immutable + idempotent on re-run
    const again = await linkSameAs(e, {});
    expect(again.edgesCreated).toBe(0);
  });
});
