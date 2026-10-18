import { test, expect, messages, openChat, expectOnline, expectOffline } from "../fixtures.mjs";
import { API } from "../urls.mjs";

test("E2E-10: a lost cookie sends you back to login with a single toast", async ({ makeUser }) => {
  const ann = await makeUser("Ann");
  const page = await ann.open();
  await expect(page.getByText(`Welcome 👋 ${ann.fullName}`)).toBeVisible();

  await ann.context.clearCookies();
  await page.reload();

  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(page.getByText("Your session has expired")).toHaveCount(1);
});

test("E2E-11: after the connection drops and comes back, the open chat catches up", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  // context.setOffline() can't be used here: Chromium's offline mode leaves an
  // open WebSocket running. Instead Bob's WebSockets go through a proxy the test can cut.
  const bobSockets = [];
  let upgraded;
  const bobUpgraded = new Promise((resolve) => { upgraded = resolve; });
  await bob.context.routeWebSocket(/\/socket\.io\//, (page) => {
    const server = page.connectToServer();
    bobSockets.push({ page, server });
    // Forward Bob's frames by hand to spot "5", the frame that completes the
    // switch from HTTP polling to this WebSocket. Until then there's nothing to cut.
    page.onMessage((frame) => {
      server.send(frame);
      if (frame === "5") upgraded();
    });
  });
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await Promise.all([expectOnline(alicePage, bob), expectOnline(bobPage, alice), bobUpgraded]);
  await openChat(bobPage, alice);

  // Socket.IO always reconnects over HTTP polling first, so failing those
  // requests keeps Bob disconnected until the route is removed.
  const refuse = (route) => route.abort();
  await bob.context.route(`${API}/socket.io/**`, refuse);
  // Cut both ends of the proxy, so the backend sees the drop too.
  await Promise.all(bobSockets.flatMap(({ page, server }) => [page.close(), server.close()]));
  // Alice seeing Bob go offline proves the server saw his socket drop, so the
  // message below can only reach him through the refetch after reconnecting.
  await expectOffline(alicePage, bob);
  expect((await alice.send(bob, "sent while you were away")).status()).toBe(201);

  await bob.context.unroute(`${API}/socket.io/**`, refuse);
  // Reconnect attempts back off to one every 5 seconds, so allow for a few.
  await expect(messages(bobPage, "sent while you were away")).toBeVisible({ timeout: 20_000 });
  await expectOnline(alicePage, bob); // presence repopulates too
});
