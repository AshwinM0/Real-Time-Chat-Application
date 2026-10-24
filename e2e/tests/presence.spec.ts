import { test, expect, chatHeader, openChat, expectOnline, expectOffline } from "../fixtures.ts";

test("E2E-6: when Alice closes her browser, Bob sees her go offline", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const [, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await expectOnline(bobPage, alice);
  await openChat(bobPage, alice);
  await expect(chatHeader(bobPage)).toContainText("online");

  await alice.context.close();

  await expectOffline(bobPage, alice);
  await expect(chatHeader(bobPage)).not.toContainText("online");
});

test("E2E-7: Alice stays online until her last tab closes", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const [tab1, tab2, bobPage] = await Promise.all([alice.open(), alice.open(), bob.open()]);
  await Promise.all([expectOnline(tab1, bob), expectOnline(tab2, bob), expectOnline(bobPage, alice)]);

  await tab1.close();
  // Proving that something did NOT happen needs a short wait for the server's
  // disconnect broadcast to arrive, if it were going to drop her.
  await bobPage.waitForTimeout(1000);
  await expectOnline(bobPage, alice);

  await tab2.close();
  await expectOffline(bobPage, alice);
});

test("E2E-9: when Alice logs out, Bob sees her go offline", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await expectOnline(bobPage, alice);

  await alicePage.getByRole("button", { name: "Log out" }).click();
  await expect(alicePage.getByRole("heading", { name: /Login/ })).toBeVisible();

  await expectOffline(bobPage, alice);
});
