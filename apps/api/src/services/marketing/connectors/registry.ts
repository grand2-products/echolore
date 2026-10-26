import type { MarketingConnectorType, MarketingConnectorTypeDto } from "@echolore/shared/contracts";
import { csvConnector } from "./csv.js";
import { ga4Connector } from "./ga4.js";
import { googleAdsConnector } from "./google-ads.js";
import { lpMonitorConnector } from "./lp-monitor.js";
import { metaAdsConnector } from "./meta-ads.js";
import type { MarketingConnectorDefinition } from "./types.js";

const REGISTRY: Record<MarketingConnectorType, MarketingConnectorDefinition> = {
  meta_ads: metaAdsConnector,
  google_ads: googleAdsConnector,
  ga4: ga4Connector,
  lp_monitor: lpMonitorConnector,
  csv: csvConnector,
};

export function getConnectorDefinition(type: string): MarketingConnectorDefinition | null {
  return REGISTRY[type as MarketingConnectorType] ?? null;
}

export function listConnectorTypes(): MarketingConnectorTypeDto[] {
  return Object.values(REGISTRY).map((def) => ({
    type: def.type,
    configFields: def.configFields,
    secretFields: def.secretFields,
    supportsSync: def.supportsSync,
    supportsCsvImport: true,
    metrics: def.metrics,
  }));
}
