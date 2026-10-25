import {
  test, expect, sidebarEntry, chatHeader, messages, openChat, sendMessage, expectOnline,
} from "../fixtures.ts";
import { API } from "../urls.ts";

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

test("E2E-18: a message whose answer was lost, sent again, is saved and shown once", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await Promise.all([expectOnline(alicePage, bob), expectOnline(bobPage, alice)]);
  await openChat(bobPage, alice);
  await openChat(alicePage, bob);

  // Alice's first send reaches the server, which saves the message, but the answer
  // never reaches her browser, as when the connection drops at the wrong moment.
  let answerLost = () => {};
  const firstAttemptFailed = new Promise<void>((resolve) => { answerLost = resolve; });
  let dropped = false;
  let firstStatus = 0;
  await alicePage.route(`${API}/api/messages/send/*`, async (route) => {
    if (dropped || route.request().method() !== "POST") return route.continue();
    dropped = true;
    firstStatus = (await route.fetch()).status();
    await route.abort();
    answerLost();
  });
  const input = alicePage.getByPlaceholder("Send a Message");
  await sendMessage(alicePage, "only once please");
  await firstAttemptFailed;

  // The server did save it, and pushed it to Bob, so the retry below really is a
  // second send of a saved message, not the first that got through.
  expect(firstStatus).toBe(201);
  await expect(messages(bobPage, "only once please")).toHaveCount(1);

  // To her it failed, so the text is still there, and she sends it again.
  await expect(input).toHaveValue("only once please");
  await alicePage.getByRole("button", { name: "Send message" }).click();

  await expect(input).toHaveValue("");
  await expect(messages(alicePage, "only once please")).toHaveCount(1);
  await expect(messages(bobPage, "only once please")).toHaveCount(1);
  // Saved once: Bob's chat, loaded fresh from the server, has it once.
  await bobPage.reload();
  await openChat(bobPage, alice);
  await expect(messages(bobPage, "only once please")).toHaveCount(1);
});

test("E2E-12: history survives a reload, in order", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  for (const [from, to, text] of [[alice, bob, "first"], [bob, alice, "second"], [alice, bob, "third"]] as const) {
    expect((await from.send(to, text)).status()).toBe(201);
  }

  const page = await bob.open();
  await openChat(page, alice);
  await expect(page.getByTestId("message")).toHaveText(["first", "second", "third"]);

  await page.reload();
  await openChat(page, alice);
  await expect(page.getByTestId("message")).toHaveText(["first", "second", "third"]);
});

test("E2E-16: a long chat opens on its newest messages, and scrolling up loads older ones without jumping", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  // 60 messages: one more page's worth than the 50 a chat opens with.
  const note = (n: number) => `note ${String(n).padStart(2, "0")}`;
  for (let n = 1; n <= 60; n++) {
    expect((await alice.send(bob, note(n))).status()).toBe(201);
  }

  const page = await bob.open();
  await openChat(page, alice);
  await expect(page.getByTestId("message")).toHaveCount(50);
  await expect(messages(page, note(60))).toBeInViewport(); // starts at the bottom
  await expect(messages(page, note(10))).toHaveCount(0);

  await page.getByTestId("message-list").evaluate((list) => list.scrollTo(0, 0));

  await expect(page.getByTestId("message")).toHaveCount(60);
  await expect(page.getByTestId("message").first()).toHaveText(note(1));
  // The reader's place is kept: note 11, at the top before the older ones arrived,
  // is still in view. The list jumped neither to the very top nor to the bottom.
  await expect(messages(page, note(11))).toBeInViewport();
  await expect(messages(page, note(1))).not.toBeInViewport();
  await expect(messages(page, note(60))).not.toBeInViewport();
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
