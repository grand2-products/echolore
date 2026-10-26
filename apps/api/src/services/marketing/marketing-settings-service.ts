import type { MarketingSettingsDto } from "@echolore/shared/contracts";
import { createTypedSettingsService, FieldCodecs, field } from "../admin/create-settings-cache.js";

/**
 * Retention and staleness defaults follow the implementation plan's initial
 * proposal (集計13か月 / 処理ログ90日). Company policy takes precedence and can
 * be applied through the settings API.
 */
const cache = createTypedSettingsService({
  metricsRetentionMonths: field(
    "marketingMetricsRetentionMonths",
    FieldCodecs.numberWithDefault(13)
  ),
  runLogRetentionDays: field("marketingRunLogRetentionDays", FieldCodecs.numberWithDefault(90)),
  staleAfterHours: field("marketingStaleAfterHours", FieldCodecs.numberWithDefault(36)),
  knowledgeSpaceId: field("marketingKnowledgeSpaceId", FieldCodecs.nullableClearable),
  knowledgeRootPageId: field("marketingKnowledgeRootPageId", FieldCodecs.nullableClearable),
  defaultDashboardId: field("marketingDefaultDashboardId", FieldCodecs.nullableClearable),
});

export const getMarketingSettings: () => Promise<MarketingSettingsDto> = cache.get;
export const updateMarketingSettings: (
  input: Partial<MarketingSettingsDto>
) => Promise<MarketingSettingsDto> = cache.update;
