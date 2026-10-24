import {
  test, expect, sidebarEntry, messages, openChat, sendMessage, expectOnline,
} from "../fixtures.ts";

test("E2E-4: a message for a closed chat becomes a toast and a badge, not a message in the open chat", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const carol = await makeUser("Carol");
  const [alicePage, bobPage] = await Promise.all([alice.open(), bob.open()]);
  await Promise.all([expectOnline(alicePage, bob), expectOnline(bobPage, alice)]);

  await openChat(bobPage, carol);
  await openChat(alicePage, bob);
  await sendMessage(alicePage, "psst bob");

  await expect(bobPage.getByText(`${alice.fullName}: psst bob`)).toBeVisible();
  await expect(sidebarEntry(bobPage, alice).getByLabel("1 unread messages")).toBeVisible();
  await expect(messages(bobPage, "psst bob")).toHaveCount(0); // not in Carol's chat

  await openChat(bobPage, alice);
  await expect(messages(bobPage, "psst bob")).toBeVisible();
  await expect(sidebarEntry(bobPage, alice).getByLabel(/unread messages/)).toHaveCount(0);
});

test("E2E-17: unread badges count messages sent while you were away, and stay right after a reload", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const carol = await makeUser("Carol");
  // Bob doesn't have the app open, so nothing is pushed to him; it's all saved.
  for (const text of ["while you were out", "still there?"]) {
    expect((await alice.send(bob, text)).status()).toBe(201);
  }
  expect((await carol.send(bob, "hi bob")).status()).toBe(201);

  const page = await bob.open();
  await expect(sidebarEntry(page, alice).getByLabel("2 unread messages")).toBeVisible();
  await expect(sidebarEntry(page, carol).getByLabel("1 unread messages")).toBeVisible();

  // Opening Alice's chat tells the server it has been read.
  const markedRead = page.waitForResponse((res) => res.url().endsWith("/read") && res.request().method() === "POST");
  await openChat(page, alice);
  await markedRead;
  await expect(sidebarEntry(page, alice).getByLabel(/unread messages/)).toHaveCount(0);

  // After a reload the counts come from the server again. Carol's badge showing
  // proves they've loaded, so Alice's missing badge means hers really was cleared.
  await page.reload();
  await expect(sidebarEntry(page, carol).getByLabel("1 unread messages")).toBeVisible();
  await expect(sidebarEntry(page, alice).getByLabel(/unread messages/)).toHaveCount(0);
});

test("E2E-5: with no chat open, a message becomes a toast and a badge", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const bobPage = await bob.open();
  await expect(sidebarEntry(bobPage, alice)).toBeVisible();
  await expect(bobPage.getByText("Select a chat to start messaging")).toBeVisible();
  // Bob seeing someone come online proves his socket is listening.
  const alicePage = await alice.open();
  await expectOnline(bobPage, alice);

  await openChat(alicePage, bob);
  await sendMessage(alicePage, "anyone home?");

  await expect(bobPage.getByText(`${alice.fullName}: anyone home?`)).toBeVisible();
  await expect(sidebarEntry(bobPage, alice).getByLabel("1 unread messages")).toBeVisible();
});

test("E2E-14: a very long message wraps inside its bubble, and its toast preview is cut to 60 characters", async ({ makeUser }) => {
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const bobPage = await bob.open();
  const alicePage = await alice.open();
  await expectOnline(bobPage, alice);
  const text = "the quick brown fox jumps over the lazy dog ".repeat(12).trim();

  await openChat(alicePage, bob);
  await sendMessage(alicePage, text);

  await expect(bobPage.getByText(`${alice.fullName}: ${text.slice(0, 60)}…`, { exact: true })).toBeVisible();

  await openChat(bobPage, alice);
  const bubble = messages(bobPage, "the quick brown fox").first();
  await expect(bubble).toBeVisible();
  const layout = await bubble.evaluate((el) => {
    const scroller = el.closest(".overflow-auto");
    return {
      lines: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
      bubbleOverflows: el.scrollWidth > el.clientWidth,
      chatScrollsSideways: scroller!.scrollWidth > scroller!.clientWidth,
    };
  });
  expect(layout.lines).toBeGreaterThan(2);
  expect(layout.bubbleOverflows).toBe(false);
  expect(layout.chatScrollsSideways).toBe(false);
});
