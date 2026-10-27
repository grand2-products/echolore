import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const locales = ["ja.yaml", "en.yaml", "ko.yaml", "zh-CN.yaml"];
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "locales");

function identifierFieldKeys(name: string): string[] {
  const doc = yaml.load(fs.readFileSync(path.join(dir, name), "utf8")) as {
    marketing?: { identifierFields?: Record<string, string> };
  };
  return Object.keys(doc.marketing?.identifierFields ?? {}).sort();
}

describe("marketing.identifierFields locales", () => {
  it("uses the same keys in every locale", () => {
    const keysByLocale = locales.map(identifierFieldKeys);
    const first = keysByLocale[0] ?? [];
    expect(first.length).toBeGreaterThan(0);
    for (const keys of keysByLocale.slice(1)) expect(keys).toEqual(first);
  });
});
