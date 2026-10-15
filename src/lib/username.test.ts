import { describe, expect, it } from "vitest";
import { loginEmail, usernameError } from "./username";

describe("usernames", () => {
  it("signs in with a never-deliverable email built from the username", () => {
    expect(loginEmail(" Sudhi.K ")).toBe("sudhi.k@pitstop.invalid");
  });

  it("accepts simple usernames and rejects odd ones", () => {
    expect(usernameError("sudhi_01")).toBeNull();
    expect(usernameError("SUDHI")).toBeNull();
    expect(usernameError("")).toBe("Enter a username.");
    expect(usernameError("ab")).toMatch(/3-30/);
    expect(usernameError("has space")).toMatch(/3-30/);
    expect(usernameError("me@mail.com")).toMatch(/3-30/);
    expect(usernameError(".dot")).toMatch(/3-30/);
  });
});
