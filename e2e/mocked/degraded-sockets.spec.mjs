import { test, expect } from "@playwright/test";
import { mockApi, blockSockets, seedUser, ME, BOB } from "./mockApi.mjs";

test("FM-5: with sockets blocked, sending still works over plain HTTP", async ({ page }) => {
  await seedUser(page, ME);
  await mockApi(page, "/api/users", { json: [BOB] });
  await mockApi(page, "/api/messages/bob", { json: [] });
  await mockApi(page, "/api/messages/send/bob", {
    status: 201,
    json: { _id: "m1", senderId: "me", receiverId: "bob", message: "still here", createdAt: new Date().toISOString() },
  });
  await blockSockets(page);

  await page.goto("/");
  await page.getByRole("button", { name: BOB.fullName }).click();
  await page.getByPlaceholder("Send a Message").fill("still here");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByTestId("message").filter({ hasText: "still here" })).toBeVisible();
  await expect(page.getByPlaceholder("Send a Message")).toHaveValue("");
});
