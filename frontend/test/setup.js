import "@testing-library/jest-dom";
import useConversation from "../src/zustand/useConversation";
import { resetFakeSockets } from "./fakeSocket";

// src/config.js reads import.meta.env, which only exists under Vite. Mocking it by
// path (not with a moduleNameMapper pattern) can't catch anything else: Testing
// Library has an internal module that is also imported as "./config".
jest.mock("../src/config", () => ({ API_URL: "http://api.test" }));

// Tests assert on what was shown by checking these calls, not by finding toasts
// in the DOM.
jest.mock("react-hot-toast", () => {
  const toast = jest.fn();
  toast.error = jest.fn();
  toast.success = jest.fn();
  return { __esModule: true, default: toast, toast, Toaster: () => null };
});

// jsdom doesn't implement scrolling. Messages.jsx scrolls to the newest message.
Element.prototype.scrollIntoView = jest.fn();

// Zustand stores live at module level, so without a reset, state would leak
// from one test into the next.
const initialState = useConversation.getState();

beforeEach(() => {
  useConversation.setState(initialState, true);
  localStorage.clear();
  // jsdom has no fetch. Each test says what the API answers.
  global.fetch = jest.fn();
  resetFakeSockets();
});
