import {
  test, expect, sidebarEntry, chatHeader, messages, openChat, sendMessage, expectOnline,
} from "../fixtures.mjs";

test("E2E-3: a message from Alice appears live in Bob's open chat", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob"); // create everyone first
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await Promise.all([expectOnline(alicePage, bob), expectOnline(bobPage, alice)]);

  await openChat(bobPage, alice);
  await openChat(alicePage, bob);
  await sendMessage(alicePage, "hello bob");

  // Web-first assertion: retries until it passes or times out. No sleeps.
  await expect(messages(bobPage, "hello bob")).toBeVisible();
});

test("E2E-8: a message sent from one of two tabs appears exactly once in both", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const [tab1, tab2, bobPage] = await Promise.all([alice.open(), alice.open(), bob.open()]);
  await Promise.all([expectOnline(tab1, bob), expectOnline(tab2, bob), expectOnline(bobPage, alice)]);

  await openChat(tab1, bob);
  await openChat(tab2, bob);
  await sendMessage(tab1, "from tab one");

  // The sending tab gets the message twice, from the HTTP response and from the
  // socket. The socket pushes to all of the server's targets at once, so once
  // Bob's toast and the other tab have it, both copies have arrived.
  await expect(bobPage.getByText(`${alice.fullName}: from tab one`)).toBeVisible();
  await expect(messages(tab2, "from tab one")).toHaveCount(1);
  await expect(messages(tab1, "from tab one")).toHaveCount(1);
});

test("E2E-12: history survives a reload, in order", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  for (const [from, to, text] of [[alice, bob, "first"], [bob, alice, "second"], [alice, bob, "third"]]) {
    expect((await from.send(to, text)).status()).toBe(201);
  }

  const page = await bob.open();
  await openChat(page, alice);
  await expect(page.getByTestId("message")).toHaveText(["first", "second", "third"]);

  await page.reload();
  await openChat(page, alice);
  await expect(page.getByTestId("message")).toHaveText(["first", "second", "third"]);
});

test("E2E-13: searching part of a name and pressing Enter opens that chat", async ({ makeUser }) => {
  const zed = await makeUser("Zed");
  const me = await makeUser("Me");
  const page = await me.open();
  await expect(sidebarEntry(page, zed)).toBeVisible();

  // The tag is unique to this run, so it matches nobody else in the shared database.
  const search = page.getByPlaceholder("Search...");
  await search.fill(zed.tag);
  await search.press("Enter");

  await expect(chatHeader(page)).toContainText(zed.fullName);
  await expect(search).toHaveValue("");
});
