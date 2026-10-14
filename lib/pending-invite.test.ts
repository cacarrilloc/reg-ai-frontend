import { describe, expect, it } from "vitest";
import { inviteSignInPath, inviteSignUpPath, joinPathForToken } from "@/lib/pending-invite";

describe("invite auth paths", () => {
  it("sends organization invites to sign-in, not sign-up", () => {
    expect(inviteSignInPath("tok-1", "reader@firm.com")).toBe(
      "/sign-in?next=%2Fjoin%3Ftoken%3Dtok-1&invite_token=tok-1&email=reader%40firm.com"
    );
    expect(inviteSignInPath("tok-1")).toContain("/sign-in?");
    expect(inviteSignInPath("tok-1")).not.toContain("/sign-up");
  });

  it("keeps join as the post-auth destination", () => {
    expect(joinPathForToken("abc")).toBe("/join?token=abc");
    expect(inviteSignUpPath("abc", "a@b.com")).toContain("invite_token=abc");
    expect(inviteSignUpPath("abc", "a@b.com")).toContain("/sign-up?");
  });
});
