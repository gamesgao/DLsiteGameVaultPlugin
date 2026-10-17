import { describe, expect, it } from "vitest";
import {
  buildWorkUrl,
  extractWorkId,
  normalizeWorkId,
  parseWorkUrl,
} from "../src/index.js";

describe("work identity", () => {
  it.each(["RJ000001", "BJ012345", "VJ00000001", "RE01020304"])(
    "normalizes %s without losing zeroes",
    (id) => {
      expect(normalizeWorkId(` ${id.toLowerCase()} `)).toBe(id);
    },
  );

  it.each([
    "",
    "RJ12345",
    "RJ1234567",
    "RJ123456789",
    "XX123456",
    "[RJ123456]",
    "RJ123456 extra",
  ])("does not normalize an invalid whole ID: %s", (input) => {
    expect(normalizeWorkId(input)).toBeUndefined();
  });

  it.each([
    ["[RJ000001] Tiny Adventure (W) (v1.2).zip", "RJ000001"],
    ["Tiny_Adventure_rj01020304_(NC).7z", "RJ01020304"],
    ["作品【BJ000002】.zip", "BJ000002"],
    ["VJ000003 / vj000003", "VJ000003"],
    ["[RE000004] (PC)", "RE000004"],
  ])("extracts explicit filename identity: %s", (input, id) => {
    expect(extractWorkId(input)).toBe(id);
  });

  it.each([
    "Tiny Adventure",
    "[RJ000001] [BJ000001]",
    "RJ1234567",
    "RJ123456789",
    "XRJ123456",
    "RJ123456demo",
    "https://example.com/RJ000001.html",
    "file:///games/RJ000001.html",
  ])("does not guess an identity: %s", (input) => {
    expect(extractWorkId(input)).toBeUndefined();
  });

  it("normalizes an evidenced mobile work URL, dropping locale and tracking", () => {
    const input =
      "http://dlsite.com/maniax-touch/work/=/product_id/rj000001.html/?locale=en_US#details";
    expect(parseWorkUrl(input)).toEqual({
      id: "RJ000001",
      section: "maniax",
      url: "https://www.dlsite.com/maniax/work/=/product_id/RJ000001.html",
    });
    expect(extractWorkId(input)).toBe("RJ000001");
  });

  it.each(["home", "soft", "pro", "aix"])(
    "preserves the evidenced %s section instead of inferring it from the ID",
    (section) => {
      expect(
        parseWorkUrl(
          `https://www.dlsite.com/${section}/work/=/product_id/BJ000001.html`,
        )?.section,
      ).toBe(section);
    },
  );

  it.each([
    "not a URL",
    "https://www.dlsite.com.example.org/home/work/=/product_id/RJ000001.html",
    "https://example.com/?url=https://www.dlsite.com/home/work/=/product_id/RJ000001.html",
    "https://www.dlsite.com@evil.example/home/work/=/product_id/RJ000001.html",
    "https://user:pass@www.dlsite.com/home/work/=/product_id/RJ000001.html",
    "ftp://www.dlsite.com/home/work/=/product_id/RJ000001.html",
    "https://www.dlsite.com:8443/home/work/=/product_id/RJ000001.html",
    "https://www.dlsite.com/home/?product_id=RJ000001",
    "https://www.dlsite.com/unknown/work/=/product_id/RJ000001.html",
    "https://www.dlsite.com/home/work/=/product_id/RJ0000017.html",
    "https://www.dlsite.com/home/work/=/product_id/RJ000001.html?other=RJ000002",
  ])("rejects unrelated, unsupported or ambiguous URLs: %s", (input) => {
    expect(parseWorkUrl(input)).toBeUndefined();
  });

  it("builds a generic lookup URL without prefix-to-category guesses", () => {
    expect(buildWorkUrl("bj000001")).toBe(
      "https://www.dlsite.com/home/work/=/product_id/BJ000001.html",
    );
    expect(buildWorkUrl("RE000001", "soft")).toBe(
      "https://www.dlsite.com/soft/work/=/product_id/RE000001.html",
    );
    expect(() => buildWorkUrl("[RJ000001]")).toThrow(TypeError);
  });
});
