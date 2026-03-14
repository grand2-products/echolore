import yaml from "js-yaml";
// @ts-expect-error -- .yaml files are loaded as raw strings via webpack/turbopack config
import enYaml from "./locales/en.yaml";
// @ts-expect-error -- .yaml files are loaded as raw strings via webpack/turbopack config
import jaYaml from "./locales/ja.yaml";
// @ts-expect-error -- .yaml files are loaded as raw strings via webpack/turbopack config
import zhCNYaml from "./locales/zh-CN.yaml";
// @ts-expect-error -- .yaml files are loaded as raw strings via webpack/turbopack config
import koYaml from "./locales/ko.yaml";

export const supportedLocales = ["ja", "en", "zh-CN", "ko"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export type TranslationDictionary = {
  [key: string]: string | TranslationDictionary;
};

function loadYaml(raw: string): TranslationDictionary {
  return yaml.load(raw) as TranslationDictionary;
}

const en = loadYaml(enYaml);
const ja = loadYaml(jaYaml);
const zhCN = loadYaml(zhCNYaml);
const ko = loadYaml(koYaml);

export const messagesByLocale: Record<SupportedLocale, TranslationDictionary> = {
  ja,
  en,
  "zh-CN": zhCN,
  ko,
};

export const defaultLocale: SupportedLocale = "ja";
