import { test, expect, uniqueTag, sidebarEntry, PASSWORD } from "../fixtures.ts";

test("E2E-1: signing up through the form lands on Home, loads the sidebar, and survives a reload", async ({ page, makeUser }) => {
  const other = await makeUser("Other"); // someone for the sidebar to list
  const tag = uniqueTag();
  const fullName = `Signup ${tag}`;

  await page.goto("/signup");
  await page.getByPlaceholder("John Doe").fill(fullName);
  await page.getByPlaceholder("johndoe").fill(`signup_${tag}`);
  await page.getByPlaceholder("Enter Password", { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder("Re-enter Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: "Female" }).check();
  await page.getByRole("button", { name: "Sign Up" }).click();

  await expect(page.getByText(`Welcome 👋 ${fullName}`)).toBeVisible();
  // The sidebar loading proves the browser kept the signup cookie: /api/users needs it.
  await expect(sidebarEntry(page, other)).toBeVisible();
  await expect(page.getByText(/Unauthorized|session has expired/)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(`Welcome 👋 ${fullName}`)).toBeVisible();
  await expect(sidebarEntry(page, other)).toBeVisible();
});

test("E2E-2: logging in and out through the UI, and staying logged out after a reload", async ({ makeUser }) => {
  const ann = await makeUser("Ann", { loggedIn: false });
  const page = await ann.open();

  await page.getByPlaceholder("Enter username").fill(ann.username);
  await page.getByPlaceholder("Enter Password").fill(ann.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText(`Welcome 👋 ${ann.fullName}`)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Login/ })).toBeVisible();
  await expect(page.getByText("session has expired")).toHaveCount(0);
});
