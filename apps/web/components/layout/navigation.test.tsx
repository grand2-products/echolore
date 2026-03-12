import { describe, expect, it } from "vitest";

import { getVisibleNavigationItems } from "./navigation";

describe("navigation visibility", () => {
  it("hides admin items for non-admin users", () => {
    const items = getVisibleNavigationItems({
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      role: "member",
      avatarUrl: null,
    });

    expect(items.map((item) => item.href)).toEqual(["/", "/wiki", "/meetings", "/search"]);
  });

  it("shows admin items for admins", () => {
    const items = getVisibleNavigationItems({
      id: "user_2",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      avatarUrl: null,
    });

    expect(items.map((item) => item.href)).toEqual([
      "/",
      "/wiki",
      "/meetings",
      "/search",
      "/admin/access",
      "/admin/kpi",
      "/admin/agents",
    ]);
  });
});
