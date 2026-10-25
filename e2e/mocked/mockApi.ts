import type { Page } from "@playwright/test";
import { API, WEB } from "../urls.ts";

// What a faked endpoint answers: the status, the JSON body, and how long it waits first.
export interface CannedAnswer {
  status?: number;
  json?: any;
  delayMs?: number;
}

// Answers requests to the API with canned responses, without reaching the backend.
// The app calls the API cross-origin with cookies, so even a faked answer must
// carry CORS headers, and the browser's preflight needs an answer of its own.
export async function mockApi(page: Page, path: string, { status = 200, json, delayMs = 0 }: CannedAnswer = {}) {
  const cors = { "access-control-allow-origin": WEB, "access-control-allow-credentials": "true" };
  await page.route(`${API}${path}`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: { ...cors, "access-control-allow-methods": "GET,POST", "access-control-allow-headers": "content-type" },
      });
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status, json, headers: cors });
  });
}

// No socket at all: every Socket.IO request fails, as if a proxy blocked them.
export const blockSockets = (page: Page) => page.route(`${API}/socket.io/**`, (route) => route.abort());

// Starts the page as if this user had logged in earlier. A logged-in page also loads
// the unread counts and marks the open chat as read, so those answer "nothing unread"
// and "done". A test can still mock them itself: the route added last wins.
export const seedUser = async (page: Page, user: object) => {
  await page.addInitScript((u) => localStorage.setItem("chat-user", JSON.stringify(u)), user);
  await mockApi(page, "/api/messages/unread", { json: {} });
  await mockApi(page, "/api/messages/*/read", { status: 204 });
};

export const ME = { _id: "me", fullName: "Mock Me", username: "me", profilePic: "" };
export const BOB = { _id: "bob", fullName: "Mock Bob", username: "bob", profilePic: "" };
