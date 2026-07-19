import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerRecord,
  getRecord,
  search,
  stats,
  bunkenDid,
  bunkenRkey,
} from "../src/index.js";

describe("bunken kotoba", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:bunken.etzhayyim.com" });
  });

  describe("helpers", () => {
    it("builds path-based DID per scheme", () => {
      expect(bunkenDid("ndl:bib", "000012345")).toBe(
        "did:web:bunken.etzhayyim.com:ndl:bib:000012345"
      );
    });
    it("flattens rkey colons/slashes/dots", () => {
      expect(bunkenRkey("doi", "10.1000/xyz.1")).toBe("doi_10_1000_xyz_1");
    });
  });

  describe("registerRecord", () => {
    const rec = {
      scheme: "ncid" as const,
      externalId: "BA12345678",
      title: "源氏物語の研究",
      authors: ["山田太郎"],
      year: 2001,
      era: "平成",
      materialType: "book" as const,
      country: "JP",
    };
    it("registers a record", async () => {
      const r = await registerRecord(e, rec);
      expect(r.status).toBe("registered");
      expect(r.did).toContain("ncid:BA12345678");
    });
    it("is idempotent on (scheme, externalId)", async () => {
      await registerRecord(e, rec);
      const again = await registerRecord(e, rec);
      expect(again.status).toBe("alreadyExists");
    });
    it("rejects an unknown scheme", async () => {
      const r = await registerRecord(e, { ...rec, scheme: "marc" as any });
      expect(r.status).toBe("rejected");
      expect(r.error).toBe("invalidScheme");
    });
    it("round-trips via getRecord", async () => {
      await registerRecord(e, rec);
      const got = await getRecord(e, { scheme: "ncid", externalId: "BA12345678" });
      expect(got.record?.title).toBe("源氏物語の研究");
      expect(got.record?.year).toBe(2001);
    });
  });

  describe("search + stats", () => {
    beforeEach(async () => {
      await registerRecord(e, {
        scheme: "ncid",
        externalId: "BA1",
        title: "源氏物語",
        authors: ["紫式部"],
        materialType: "book",
        country: "JP",
        era: "平安",
      });
      await registerRecord(e, {
        scheme: "doi",
        externalId: "10.1/abc",
        title: "On Genji translation",
        authors: ["A. Waley"],
        materialType: "article",
        country: "GB",
      });
    });
    it("searches title substring (case-insensitive)", async () => {
      const r = await search(e, { q: "genji" });
      expect(r.total).toBe(1);
      expect(r.items[0].scheme).toBe("doi");
    });
    it("searches author substring", async () => {
      const r = await search(e, { q: "紫式部" });
      expect(r.total).toBe(1);
    });
    it("filters by scheme + materialType", async () => {
      const r = await search(e, { scheme: "ncid", materialType: "book" });
      expect(r.total).toBe(1);
    });
    it("stats aggregate by scheme/material/country", async () => {
      const s = await stats(e);
      expect(s.total).toBe(2);
      expect(s.byScheme?.ncid).toBe(1);
      expect(s.byScheme?.doi).toBe(1);
      expect(s.byMaterialType?.book).toBe(1);
      expect(s.byCountry?.JP).toBe(1);
    });
  });
});
