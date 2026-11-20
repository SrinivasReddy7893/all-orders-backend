import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
import { MAX_MAILBOXES, planConnect } from "./mailbox.service";
import { isAccessRevoked } from "./orderSync.service";

describe("planConnect", () => {
  it("adds a new mailbox", () => {
    assert.equal(planConnect({ userId: "u1", existingOwnerId: null, userMailboxCount: 0 }), "create");
  });
  it("refreshes a mailbox the user already has, even at the limit", () => {
    assert.equal(
      planConnect({ userId: "u1", existingOwnerId: "u1", userMailboxCount: MAX_MAILBOXES }),
      "refresh"
    );
  });
  it("refuses a new mailbox past the limit", () => {
    assert.equal(
      planConnect({ userId: "u1", existingOwnerId: null, userMailboxCount: MAX_MAILBOXES }),
      "limit"
    );
  });
  it("moves a mailbox that belonged to someone else", () => {
    assert.equal(planConnect({ userId: "u1", existingOwnerId: "u2", userMailboxCount: 1 }), "takeover");
  });
  it("does not let a takeover skip the limit", () => {
    assert.equal(
      planConnect({ userId: "u1", existingOwnerId: "u2", userMailboxCount: MAX_MAILBOXES }),
      "limit"
    );
  });
});

describe("isAccessRevoked", () => {
  it("spots Google's invalid_grant", () => {
    assert.ok(isAccessRevoked({ response: { data: { error: "invalid_grant" } } }));
    assert.ok(isAccessRevoked(new Error("invalid_grant: Token has been expired or revoked.")));
  });
  it("ignores other failures", () => {
    assert.ok(!isAccessRevoked(new Error("ECONNRESET")));
    assert.ok(!isAccessRevoked(undefined));
  });
});
