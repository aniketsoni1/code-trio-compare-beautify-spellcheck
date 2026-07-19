import { describe, expect, it } from "vitest";
import { splitIdentifier, wordRuns } from "@ctr/spell-engine";

const texts = (word: string): string[] => splitIdentifier(word).map((s) => s.text);

describe("splitIdentifier", () => {
  it("splits camelCase", () => {
    expect(texts("getUserName")).toEqual(["get", "User", "Name"]);
  });
  it("splits snake_case and SCREAMING_CASE", () => {
    expect(texts("snake_case_value")).toEqual(["snake", "case", "value"]);
    expect(texts("MAX_BUFFER_SIZE")).toEqual(["MAX", "BUFFER", "SIZE"]);
  });
  it("handles acronym runs", () => {
    expect(texts("parseHTTPResponse")).toEqual(["parse", "HTTP", "Response"]);
    expect(texts("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
  });
  it("drops digits and separators, keeping offsets", () => {
    const parts = splitIdentifier("utf8Encoder");
    expect(parts.map((p) => p.text)).toEqual(["utf", "Encoder"]);
    expect(parts[1]?.offset).toBe(4);
  });
});

describe("wordRuns", () => {
  it("extracts identifier-like runs with offsets", () => {
    const runs = wordRuns("well-known reciever");
    expect(runs.map((r) => r.text)).toEqual(["well", "known", "reciever"]);
    expect(runs[2]?.offset).toBe(11);
  });
});
