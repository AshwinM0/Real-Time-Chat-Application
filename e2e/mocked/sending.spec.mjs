import { test, expect } from "@playwright/test";
import { mockApi, blockSockets, seedUser, ME, BOB } from "./mockApi.mjs";

test("FM-6: pressing Enter twice while a message is sending sends it once", async ({ page }) => {
  await seedUser(page, ME);
  await mockApi(page, "/api/users", { json: [BOB] });
  await mockApi(page, "/api/messages/bob*", { json: [] }); // * also matches ?limit=50
  // A slow answer keeps the first request in flight while Enter is pressed again.
  await mockApi(page, "/api/messages/send/bob", {
    status: 201,
    delayMs: 1000,
    json: { _id: "m1", senderId: "me", receiverId: "bob", message: "only once", createdAt: new Date().toISOString() },
  });
  await blockSockets(page);
  // Count requests, not bubbles: the store drops a second copy with the same _id,
  // so a duplicate send wouldn't show on screen, but the server would save it.
  const sends = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/messages/send/")) sends.push(req);
  });

  await page.goto("/");
  await page.getByRole("button", { name: BOB.fullName }).click();
  const input = page.getByPlaceholder("Send a Message");
  await input.fill("only once");
  await input.press("Enter");
  await input.press("Enter");

  await expect(page.getByTestId("message").filter({ hasText: "only once" })).toBeVisible();
  await expect(input).toHaveValue("");
  expect(sends).toHaveLength(1);
});
