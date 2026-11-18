/**
 * HTTP integration tests: the real app, real routes and middleware, against the
 * throwaway test database (see scripts/integration-test.js). Run: npm run test:integration
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";
import type { AddressInfo } from "net";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { signAccessToken } from "../src/services/auth.service";
import { hashOtp } from "../src/services/otp";
import { upsertOrders } from "../src/services/order.service";

let server: Server;
let base: string;

type Res = { status: number; headers: Headers; body: any };
const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
};

let phoneSeq = 0;
const newUser = async () => {
  const user = await prisma.user.create({ data: { phone: `90000${String(++phoneSeq).padStart(5, "0")}`, isPhoneVerified: true } });
  return { user, token: signAccessToken(user.id) };
};

before(async () => {
  // Start from empty tables — only ever in the throwaway *_test database.
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assert.match(db, /_test$/, `refusing to clear non-test database ${db}`);
  await prisma.$executeRawUnsafe(
    `TRUNCATE "OrderEvent", "Order", "ReceivedMessage", "Session", "ConnectedEmailAccount", "otp", "User" CASCADE`
  );
  // Back to the seeded starting categories.
  await prisma.category.deleteMany({ where: { key: { notIn: ["APPAREL", "FOOD", "GROCERIES", "GADGETS", "PERSONAL_CARE", "HOME", "OTHER"] } } });

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

describe("basics", () => {
  test("health is public and has security headers", async () => {
    const res = await call("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  test("protected routes need a login", async () => {
    assert.equal((await call("GET", "/orders")).status, 401);
    assert.equal((await call("GET", "/orders", { token: "not-a-jwt" })).body.errorCode, "INVALID_TOKEN");
  });

  test("unknown routes are a clean 404", async () => {
    assert.equal((await call("GET", "/nope")).body.errorCode, "ROUTE_NOT_FOUND");
  });
});

describe("phone OTP login", () => {
  const phone = "9123456780";
  const seedOtp = (code: string) =>
    prisma.otp.create({ data: { phone, code: hashOtp(code), expiresAt: new Date(Date.now() + 5 * 60_000) } });

  test("send-otp validates the phone number", async () => {
    const res = await call("POST", "/auth/send-otp", { body: { phone: "12" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.errorCode, "VALIDATION_ERROR");
  });

  test("send-otp stores only a hash of the code", async () => {
    const res = await call("POST", "/auth/send-otp", { body: { phone } });
    assert.equal(res.status, 200);
    const stored = await prisma.otp.findFirstOrThrow({ where: { phone } });
    assert.match(stored.code, /^[a-f0-9]{64}$/);
    await prisma.otp.deleteMany({ where: { phone } });
  });

  test("5 wrong codes destroy the OTP — even the right code then fails", async () => {
    await seedOtp("111111");
    for (let i = 1; i <= 4; i++) {
      assert.equal((await call("POST", "/auth/verify-otp", { body: { phone, otp: "000000" } })).body.errorCode, "INVALID_OTP");
    }
    assert.equal((await call("POST", "/auth/verify-otp", { body: { phone, otp: "000000" } })).body.errorCode, "OTP_ATTEMPTS_EXCEEDED");
    assert.equal((await call("POST", "/auth/verify-otp", { body: { phone, otp: "111111" } })).body.errorCode, "INVALID_OTP");
  });

  test("right code logs in; refresh rotates; old refresh token and logout are enforced", async () => {
    await seedOtp("222222");
    const login = await call("POST", "/auth/verify-otp", { body: { phone, otp: "222222" } });
    assert.equal(login.status, 200);
    const { accessToken, refreshToken } = login.body.data;

    const session = await prisma.session.findFirstOrThrow({ where: { userId: login.body.data.user.id } });
    assert.notEqual(session.tokenHash, refreshToken); // only the hash is stored

    const refreshed = await call("POST", "/auth/refresh", { body: { refreshToken } });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.data.refreshToken, refreshToken);
    assert.equal((await call("POST", "/auth/refresh", { body: { refreshToken } })).status, 401); // old one is dead

    const next = refreshed.body.data.refreshToken;
    assert.equal((await call("POST", "/auth/logout", { token: accessToken, body: { refreshToken: next } })).status, 200);
    assert.equal((await call("POST", "/auth/refresh", { body: { refreshToken: next } })).status, 401);
  });
});

describe("phone messages → orders → tracking, summary, paging", () => {
  test("a Zomato order's notifications become one order with a timeline", async () => {
    const { token } = await newUser();
    const msg = (id: string, title: string, body: string, at: string) => ({
      id, source: "NOTIFICATION", sender: "com.application.zomato", title, body, receivedAt: at,
    });

    const first = await call("POST", "/messages", {
      token,
      body: { messages: [
        msg("z1", "Order confirmed", "Your order of Rs. 449 from Paradise Biryani is confirmed", "2026-11-18T19:00:00+05:30"),
        { id: "b1", source: "SMS", sender: "AX-HDFCBK", title: null, body: "OTP 123456 for txn of Rs 500. Do not share.", receivedAt: "2026-11-18T19:01:00+05:30" },
      ] },
    });
    assert.deepEqual(first.body.data.results.map((r: any) => r.outcome), ["CREATED", "IGNORED"]);

    const second = await call("POST", "/messages", {
      token,
      body: { messages: [
        msg("z2", "Your order is on the way", "Ravi has picked up your order", "2026-11-18T19:20:00+05:30"),
        msg("z3", "Order delivered", "Enjoy your order!", "2026-11-18T19:40:00+05:30"),
      ] },
    });
    assert.deepEqual(second.body.data.results.map((r: any) => r.outcome), ["ATTACHED", "ATTACHED"]);

    const resend = await call("POST", "/messages", { token, body: { messages: [msg("z2", "Your order is on the way", "x", "2026-11-18T19:20:00+05:30")] } });
    assert.equal(resend.body.data.results[0].outcome, "DUPLICATE");

    const orders = await call("GET", "/orders", { token });
    assert.equal(orders.body.data.orders.length, 1);
    assert.equal(orders.body.data.orders[0].status, "DELIVERED");
    assert.equal(orders.body.data.orders[0].amount, 449);

    const summary = await call("GET", "/orders/summary?month=2026-11", { token });
    assert.equal(summary.body.data.categories.find((c: any) => c.category === "FOOD").spent, 449);
  });

  test("courier SMS is trackable by AWB, with the OTP masked", async () => {
    const { token } = await newUser();
    await call("POST", "/messages", {
      token,
      body: { messages: [{ id: "d1", source: "SMS", sender: "JD-DLHVRY", title: null, receivedAt: "2026-11-18T19:02:00+05:30",
        body: "Your Delhivery shipment with AWB 1234567890123 from Amazon is out for delivery today. Share OTP 4821 with the agent." }] },
    });
    const tracked = await call("GET", "/tracking?q=1234567890123", { token });
    assert.equal(tracked.body.data.match, "TRACKING_NUMBER");
    assert.equal(tracked.body.data.shipment.carrier.code, "DELHIVERY");
    assert.equal(tracked.body.data.timeline[0].source, "SMS");
    assert.doesNotMatch(tracked.body.data.timeline[0].description, /4821/);
  });

  test("one user cannot see another user's order by tracking it", async () => {
    const owner = await newUser();
    const other = await newUser();
    await prisma.order.create({ data: { userId: owner.user.id, vendor: "AMAZON", externalOrderId: "402-0000000-0000001", status: "SHIPPED", category: "OTHER", trackingNumber: "TBA123456789012" } });
    const res = await call("GET", "/tracking?q=402-0000000-0000001", { token: other.token });
    assert.equal(res.body.data.match, "NONE");
    assert.equal(res.body.data.order, null);
  });

  test("orders are paged", async () => {
    const { user, token } = await newUser();
    await prisma.order.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({ userId: user.id, vendor: "AMAZON", externalOrderId: `P${1000 + i}`, status: "DELIVERED" as const, category: "OTHER" })),
    });
    const page2 = await call("GET", "/orders?page=2&pageSize=10", { token });
    assert.equal(page2.body.data.orders.length, 10);
    assert.deepEqual(page2.body.data.pagination, { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 });
    assert.equal((await call("GET", "/orders?pageSize=500", { token })).status, 400);
  });

  test("a category seen for the first time is created and listed", async () => {
    const { user, token } = await newUser();
    assert.equal(await prisma.category.count({ where: { key: "FRAGRANCE" } }), 0);
    await upsertOrders([{
      id: "gmail-1", orderId: "D&D1015", status: "CONFIRMED", vendor: "DUKEANDDOR", snippet: "", date: "2026-02-19T10:00:00.000Z",
      userId: user.id, trackingNumber: null, title: "NOIR", titles: ["NOIR"], amount: 3499, currency: "INR", carrier: null, trackingUrl: null,
    }]);
    const res = await call("GET", "/categories", { token });
    assert.ok(res.body.data.categories.some((c: any) => c.key === "FRAGRANCE" && c.label === "Fragrance"));
    assert.equal((await call("GET", "/orders?category=FRAGRANCE", { token })).body.data.orders[0].orderId, "D&D1015");
  });
});

describe("Gmail sync endpoint", () => {
  test("no connected Gmail → 400", async () => {
    const { token } = await newUser();
    assert.equal((await call("POST", "/orders/sync", { token })).body.errorCode, "GMAIL_NOT_CONNECTED");
  });

  test("a sync already running → 409 (lock not expired)", async () => {
    const { user, token } = await newUser();
    await prisma.connectedEmailAccount.create({
      data: { userId: user.id, email: `busy${user.id}@example.com`, googleAccessToken: "x", googleRefreshToken: "y", isSyncing: true, syncStartedAt: new Date() },
    });
    assert.equal((await call("POST", "/orders/sync", { token })).body.errorCode, "SYNC_IN_PROGRESS");
  });
});

describe("delete account", () => {
  test("removes the user and everything that belongs to them", async () => {
    const { user, token } = await newUser();
    const order = await prisma.order.create({ data: { userId: user.id, vendor: "BOAT", externalOrderId: "9652151", status: "CONFIRMED", category: "GADGETS" } });
    await prisma.orderEvent.create({ data: { orderId: order.id, status: "CONFIRMED", occurredAt: new Date(), description: "x", source: "EMAIL", sourceRef: "m1" } });
    await prisma.session.create({ data: { userId: user.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 1e6) } });
    await prisma.connectedEmailAccount.create({ data: { userId: user.id, email: `del${user.id}@example.com`, googleAccessToken: "x", googleRefreshToken: "y" } });

    const res = await call("DELETE", "/user", { token });
    assert.equal(res.status, 200);
    assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
    assert.equal(await prisma.order.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.orderEvent.count({ where: { orderId: order.id } }), 0);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.connectedEmailAccount.count({ where: { userId: user.id } }), 0);
  });
});
