import { test, expect } from "@playwright/test";
import { mockApi, blockSockets, seedUser } from "./mockApi.mjs";

test("FM-1: a stale saved user lands on login with a single toast", async ({ page }) => {
  await seedUser(page, { _id: "ghost", fullName: "Ghost" });
  await mockApi(page, "/api/users", { status: 401, json: { error: "Unauthorized - No Token Provided" } });
  await blockSockets(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(page.getByText("Your session has expired")).toHaveCount(1);
});
