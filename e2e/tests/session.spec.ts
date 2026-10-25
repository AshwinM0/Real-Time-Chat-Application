import { test, expect, messages, openChat, expectOnline, expectOffline } from "../fixtures.ts";
import type { WebSocketRoute } from "@playwright/test";

// One of Bob's WebSockets, as the test proxies it: his page's end and the server's.
interface ProxiedSocket {
  page: WebSocketRoute;
  server: WebSocketRoute;
}

test("E2E-10: a lost cookie sends you back to login with a single toast", async ({ makeUser }) => {
  const ann = await makeUser("Ann");
  const page = await ann.open();
  await expect(page.getByText(`Welcome 👋 ${ann.fullName}`)).toBeVisible();

  await ann.context.clearCookies();
  await page.reload();

  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(page.getByText("Your session has expired")).toHaveCount(1);
});

test("E2E-15: logging out in one tab logs out the other tabs too, quietly", async ({ makeUser }) => {
  const ann = await makeUser("Ann");
  // Two pages in one context are two tabs: they share the cookie and localStorage.
  const tab1 = await ann.open();
  const tab2 = await ann.open();
  await expect(tab2.getByText(`Welcome 👋 ${ann.fullName}`)).toBeVisible();

  await tab1.getByRole("button", { name: "Log out" }).click();

  await expect(tab2.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(tab2.getByText("session has expired")).toHaveCount(0);
});

test("E2E-11: after the connection drops and comes back, the open chat catches up", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  // context.setOffline() can't be used here: Chromium's offline mode leaves an
  // open WebSocket running. Instead Bob's WebSockets go through a proxy the test can cut.
  const bobSockets: ProxiedSocket[] = [];
  // While Bob is offline, a new connection waits here before reaching the server,
  // like one stuck on a dead network.
  let networkUp = Promise.resolve();
  await bob.context.routeWebSocket(/\/socket\.io\//, async (page) => {
    await networkUp;
    bobSockets.push({ page, server: page.connectToServer() });
  });
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await Promise.all([expectOnline(alicePage, bob), expectOnline(bobPage, alice)]);
  await openChat(bobPage, alice);

  let reconnect = () => {};
  networkUp = new Promise<void>((resolve) => { reconnect = resolve; });
  // Cut both ends of the proxy, so the backend sees the drop too.
  await Promise.all(bobSockets.flatMap(({ page, server }) => [page.close(), server.close()]));
  // Alice seeing Bob go offline proves the server saw his socket drop, so the
  // message below can only reach him through the refetch after reconnecting.
  await expectOffline(alicePage, bob);
  expect((await alice.send(bob, "sent while you were away")).status()).toBe(201);

  reconnect();
  await expect(messages(bobPage, "sent while you were away")).toBeVisible();
  await expectOnline(alicePage, bob); // presence repopulates too
});
