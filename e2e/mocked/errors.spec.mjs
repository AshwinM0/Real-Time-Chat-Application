import { test, expect } from "@playwright/test";
import { mockApi, blockSockets, seedUser, ME, BOB } from "./mockApi.mjs";

test("FM-2: a rejected login shows the server's reason and stays on the login page", async ({ page }) => {
  await mockApi(page, "/api/auth/login", { status: 400, json: { error: "Incorrect password" } });

  await page.goto("/login");
  await page.getByPlaceholder("Enter username").fill("ann");
  await page.getByPlaceholder("Enter Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText("Incorrect password")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
});

test("FM-3: a failing user list shows an error, and the page still renders", async ({ page }) => {
  await seedUser(page, ME);
  await mockApi(page, "/api/users", { status: 500, json: { error: "Internal Server Error" } });
  await blockSockets(page);

  await page.goto("/");

  await expect(page.getByText("Internal Server Error")).toBeVisible();
  await expect(page.getByText(`Welcome 👋 ${ME.fullName}`)).toBeVisible();
  await expect(page.getByPlaceholder("Search...")).toBeVisible();
});

test("FM-4: a slow chat shows skeletons first, then the messages", async ({ page }) => {
  await seedUser(page, ME);
  await mockApi(page, "/api/users", { json: [BOB] });
  await mockApi(page, "/api/messages/bob", {
    delayMs: 1500,
    json: [{ _id: "m1", senderId: "bob", receiverId: "me", message: "worth the wait", createdAt: new Date().toISOString() }],
  });
  await blockSockets(page);

  await page.goto("/");
  await page.getByRole("button", { name: BOB.fullName }).click();

  await expect(page.locator(".skeleton").first()).toBeVisible();
  await expect(page.getByTestId("message").filter({ hasText: "worth the wait" })).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
});
