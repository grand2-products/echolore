"use server";

import { updateTag } from "next/cache";
import { SITE_SETTINGS_CACHE_TAG } from "./site-settings";

export async function revalidateSiteSettings() {
  updateTag(SITE_SETTINGS_CACHE_TAG);
}
