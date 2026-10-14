import { describe, expect, it } from "vitest";
import {
  DELETE_RESOURCES,
  MANAGE_NEWSLETTER_SUBSCRIBERS,
  capabilitiesForRole,
  memberCan,
} from "./member-capabilities";

describe("memberCan", () => {
  it("allows Master and CCO to delete resources", () => {
    expect(memberCan("master_user", DELETE_RESOURCES)).toBe(true);
    expect(memberCan("org:chief_compliance_officer", DELETE_RESOURCES)).toBe(true);
    expect(memberCan("cco", DELETE_RESOURCES)).toBe(true);
  });

  it("excludes Product Managers and nominated members from deletes", () => {
    expect(memberCan("product_manager", DELETE_RESOURCES)).toBe(false);
    expect(memberCan("nominated_team_member", DELETE_RESOURCES)).toBe(false);
    expect(memberCan(null, DELETE_RESOURCES)).toBe(false);
  });

  it("prefers the server capability list when provided", () => {
    expect(memberCan("nominated_team_member", DELETE_RESOURCES, [DELETE_RESOURCES])).toBe(true);
    expect(memberCan("master_user", DELETE_RESOURCES, [])).toBe(false);
  });

  it("lists granted functionalities for a role", () => {
    expect(capabilitiesForRole("master_user")).toEqual([
      DELETE_RESOURCES,
      MANAGE_NEWSLETTER_SUBSCRIBERS,
    ]);
    expect(capabilitiesForRole("product_manager")).toEqual([]);
  });
});
