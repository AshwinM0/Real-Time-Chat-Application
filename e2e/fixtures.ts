import { test as base, expect, type APIResponse, type BrowserContext, type Page } from "@playwright/test";
import { API } from "./urls.ts";

export const PASSWORD = "secret123";

// Every test shares one backend and one database, and the sidebar lists every
// user in it. Unique names keep each test's people apart from everyone else's.
let counter = 0;
export const uniqueTag = () =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Someone a test signed up: the API's answer, plus their own browser context and
// helpers to act as them.
export interface TestUser {
  _id: string;
  fullName: string;
  username: string;
  profilePic: string;
  tag: string;
  password: string;
  context: BrowserContext;
  send: (to: { _id: string }, message: string) => Promise<APIResponse>;
  open: () => Promise<Page>;
}

type MakeUser = (name: string, options?: { loggedIn?: boolean }) => Promise<TestUser>;

export const test = base.extend<{ makeUser: MakeUser }>({
  // makeUser("Alice") signs a user up through the API and gives them their own
  // browser context. A context is like a separate browser profile, with its own
  // cookies and localStorage, so two contexts are two people chatting.
  //
  // Create every user before opening any page: the sidebar fetches the user list
  // once when it loads, so someone who signs up later doesn't appear until a reload.
  makeUser: async ({ browser, playwright, baseURL }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (name, { loggedIn = true } = {}) => {
      const tag = uniqueTag();
      const api = await playwright.request.newContext();
      const res = await api.post(`${API}/api/auth/signup`, {
        data: {
          fullName: `${name} ${tag}`, username: `${name.toLowerCase()}_${tag}`,
          password: PASSWORD, confirmPassword: PASSWORD, gender: "female",
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      const user = await res.json();
      const { cookies } = await api.storageState();
      await api.dispose();

      // A logged-in user starts with the jwt cookie and the saved "chat-user",
      // exactly what the app leaves behind after a real signup.
      const context = await browser.newContext({
        baseURL,
        storageState: loggedIn
          ? { cookies, origins: [{ origin: baseURL!, localStorage: [{ name: "chat-user", value: JSON.stringify(user) }] }] }
          : undefined,
      });
      contexts.push(context);

      return {
        ...user,
        tag,
        password: PASSWORD,
        context,
        // Sends a message straight through the API, using this user's cookie.
        send: (to, message) => context.request.post(`${API}/api/messages/send/${to._id}`, { data: { message } }),
        open: async () => {
          const page = await context.newPage();
          await page.goto("/");
          // Fail here, clearly, if the app didn't render, rather than later in a
          // way that looks like a presence or delivery bug.
          await expect(page.locator("#root"), `${name}'s page rendered`).not.toBeEmpty();
          return page;
        },
      };
    });
    for (const c of contexts) await c.close();
  },
});

export { expect };

// Page helpers, so the tests read like what a user does.
type Named = { fullName: string };
export const sidebarEntry = (page: Page, user: Named) => page.getByRole("button", { name: user.fullName });
export const chatHeader = (page: Page) => page.getByTestId("chat-header");
export const messages = (page: Page, text: string) => page.getByTestId("message").filter({ hasText: text });

export async function openChat(page: Page, user: Named) {
  await sidebarEntry(page, user).click();
  await expect(chatHeader(page)).toContainText(user.fullName);
}

export async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder("Send a Message").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

// Seeing someone's online dot proves both sockets are connected: theirs, which
// put them on the list, and ours, which received the list. Wait for it before
// testing anything live, or a message can be sent before anyone is listening.
export const expectOnline = (page: Page, user: Named) => expect(sidebarEntry(page, user)).toContainText("online");
export const expectOffline = (page: Page, user: Named) => expect(sidebarEntry(page, user)).not.toContainText("online");
