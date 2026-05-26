#!/usr/bin/env node
// Verify that locale YAML files under apps/web/lib/i18n/locales/ have parity
// of translation keys.
//
// - Bases: ja.yaml and en.yaml (must agree with each other; both are treated
//   as authoritative references).
// - Targets: ko.yaml and zh-CN.yaml.
// - Reports any key in the union of base keys that is missing in a target
//   (and, as informational output, any extra keys present only in a target).
// - Exits non-zero when a target is missing one or more keys, or when the
//   bases disagree with each other.
//
// Usage: node scripts/dev/check-i18n-key-parity.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const localesDir = path.join(repoRoot, "apps", "web", "lib", "i18n", "locales");

const baseLocales = ["ja", "en"];
const targetLocales = ["ko", "zh-CN"];

function loadLocale(locale) {
  const file = path.join(localesDir, `${locale}.yaml`);
  const raw = fs.readFileSync(file, "utf8");
  const parsed = yaml.load(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Locale ${locale} did not parse to an object`);
  }
  return parsed;
}

/**
 * Walk a nested dictionary and yield every leaf key path joined with ".".
 * Leaves are non-object values (string, number, boolean, null, array).
 */
function collectKeys(value, prefix, out) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      collectKeys(v, next, out);
    }
    return;
  }
  out.add(prefix);
}

function keySetFor(dict) {
  const out = new Set();
  collectKeys(dict, "", out);
  return out;
}

function diff(aSet, bSet) {
  const onlyInA = [];
  for (const k of aSet) {
    if (!bSet.has(k)) onlyInA.push(k);
  }
  onlyInA.sort();
  return onlyInA;
}

const loaded = {};
for (const locale of [...baseLocales, ...targetLocales]) {
  loaded[locale] = loadLocale(locale);
}

const keysByLocale = {};
for (const [locale, dict] of Object.entries(loaded)) {
  keysByLocale[locale] = keySetFor(dict);
}

let hasError = false;
const lines = [];

// Sanity: bases should agree with each other.
const [ja, en] = baseLocales;
const jaOnly = diff(keysByLocale[ja], keysByLocale[en]);
const enOnly = diff(keysByLocale[en], keysByLocale[ja]);
if (jaOnly.length > 0 || enOnly.length > 0) {
  hasError = true;
  lines.push(`Base locales ${ja}/${en} disagree:`);
  if (jaOnly.length > 0) {
    lines.push(`  Present in ${ja} but missing in ${en}:`);
    for (const k of jaOnly) lines.push(`    - ${k}`);
  }
  if (enOnly.length > 0) {
    lines.push(`  Present in ${en} but missing in ${ja}:`);
    for (const k of enOnly) lines.push(`    - ${k}`);
  }
  lines.push("");
}

// Union of base keys = authoritative key set.
const baseUnion = new Set();
for (const locale of baseLocales) {
  for (const k of keysByLocale[locale]) baseUnion.add(k);
}

for (const locale of targetLocales) {
  const missing = diff(baseUnion, keysByLocale[locale]);
  const extra = diff(keysByLocale[locale], baseUnion);
  if (missing.length > 0) {
    hasError = true;
    lines.push(`Locale ${locale} is missing ${missing.length} key(s):`);
    for (const k of missing) lines.push(`  - ${k}`);
    lines.push("");
  }
  if (extra.length > 0) {
    // Extras are informational, not a hard error.
    lines.push(`Locale ${locale} has ${extra.length} extra key(s) not in base (informational):`);
    for (const k of extra) lines.push(`  - ${k}`);
    lines.push("");
  }
}

if (hasError) {
  process.stderr.write(`${lines.join("\n")}\n`);
  process.stderr.write(
    "i18n key parity check failed. Add the missing keys to the target locale YAML files.\n"
  );
  process.exit(1);
}

if (lines.length > 0) {
  // Informational notes only.
  process.stdout.write(`${lines.join("\n")}\n`);
}
process.stdout.write(
  `i18n key parity OK (bases: ${baseLocales.join(", ")}; targets: ${targetLocales.join(", ")}).\n`
);
