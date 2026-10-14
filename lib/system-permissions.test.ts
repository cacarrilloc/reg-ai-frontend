import { describe, expect, it } from "vitest";
import { canManageOrgNewsletterSubscribers } from "./system-permissions";

describe("canManageOrgNewsletterSubscribers", () => {
  it("allows Master and CCO membership roles", () => {
    expect(canManageOrgNewsletterSubscribers({ role: "master_user" })).toBe(true);
    expect(canManageOrgNewsletterSubscribers({ role: "org:master_user" })).toBe(true);
    expect(canManageOrgNewsletterSubscribers({ role: "chief_compliance_officer" })).toBe(true);
    expect(canManageOrgNewsletterSubscribers({ role: "org:chief_compliance_officer" })).toBe(true);
    expect(canManageOrgNewsletterSubscribers({ role: "cco" })).toBe(true);
  });

  it("hides the section from Product Managers and nominated members", () => {
    expect(canManageOrgNewsletterSubscribers({ role: "product_manager" })).toBe(false);
    expect(canManageOrgNewsletterSubscribers({ role: "nominated_team_member" })).toBe(false);
    expect(canManageOrgNewsletterSubscribers({ role: null })).toBe(false);
  });

  it("prefers the backend capability flag when present", () => {
    expect(
      canManageOrgNewsletterSubscribers({ role: "nominated_team_member", canManage: true })
    ).toBe(true);
    expect(canManageOrgNewsletterSubscribers({ role: "master_user", canManage: false })).toBe(false);
  });
});
