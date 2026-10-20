import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Messages from "../Messages";
import Message from "../Message";
import MessageContainer from "../MessageContainer";
import MessageInput from "../MessageInput";
import useConversation from "../../../zustand/useConversation";
import useGetMessages from "../../../hooks/useGetMessages";
import useSendMessage from "../../../hooks/useSendMessage";
import { serverEmit } from "../../../../test/fakeSocket";
import { renderWithProviders, ME } from "../../../../test/renderWithProviders";
import { jsonResponse } from "../../../../test/http";

jest.mock("../../../hooks/useSendMessage");
// Messages is tested with a fake hook; MessageContainer uses the real one.
jest.mock("../../../hooks/useGetMessages", () => {
  const actual = jest.requireActual("../../../hooks/useGetMessages");
  return { __esModule: true, default: jest.fn(actual.default) };
});

const BOB = { _id: "u2", fullName: "Bob Ray", profilePic: "bob.png" };
const message = (overrides) => ({
  _id: "m1", senderId: "u2", receiverId: "me", message: "hello", createdAt: "2026-01-02T09:05:00.000Z", ...overrides,
});

describe("FU-47: Messages", () => {
  test("loading shows skeletons", () => {
    useGetMessages.mockReturnValueOnce({ loading: true, messages: [] });
    const { container } = renderWithProviders(<Messages />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("message")).not.toBeInTheDocument();
  });

  test("an empty chat invites you to start", () => {
    useGetMessages.mockReturnValueOnce({ loading: false, messages: [] });
    renderWithProviders(<Messages />);
    expect(screen.getByText("Send a message to start the conversation")).toBeInTheDocument();
  });

  test("a chat with history shows a bubble per message", () => {
    useGetMessages.mockReturnValueOnce({ loading: false, messages: [message(), message({ _id: "m2", message: "again" })] });
    renderWithProviders(<Messages />);
    expect(screen.getAllByTestId("message").map((m) => m.textContent.trim())).toEqual(["hello", "again"]);
  });
});

describe("FU-48: Message", () => {
  test("my message sits on the right, in blue", () => {
    renderWithProviders(<Message message={message({ senderId: "me", receiverId: "u2" })} />);
    const bubble = screen.getByTestId("message");
    expect(bubble).toHaveClass("bg-blue-500");
    expect(bubble.closest(".chat")).toHaveClass("chat-end");
  });

  test("their message sits on the left", () => {
    renderWithProviders(<Message message={message()} />);
    const bubble = screen.getByTestId("message");
    expect(bubble).not.toHaveClass("bg-blue-500");
    expect(bubble.closest(".chat")).toHaveClass("chat-start");
  });
});

describe("FU-49: MessageContainer", () => {
  test("with no chat selected, welcomes you by name", () => {
    renderWithProviders(<MessageContainer />);
    expect(screen.getByText(`Welcome 👋 ${ME.fullName} ❄`)).toBeInTheDocument();
    expect(screen.queryByTestId("chat-header")).not.toBeInTheDocument();
  });

  test("with a chat selected, the header names them and shows when they're online", async () => {
    fetch.mockResolvedValue(jsonResponse([]));
    useSendMessage.mockReturnValue({ loading: false, sendMessage: jest.fn() });
    useConversation.getState().setSelectedConversation(BOB);
    renderWithProviders(<MessageContainer />);

    const header = screen.getByTestId("chat-header");
    expect(header).toHaveTextContent("Bob Ray");
    expect(header).not.toHaveTextContent("online");

    act(() => serverEmit("onlineUsers", ["u2"]));
    expect(header).toHaveTextContent("online");
    // Let the message fetch finish before the test ends.
    expect(await screen.findByText("Send a message to start the conversation")).toBeInTheDocument();
  });

  test("leaving the chat screen clears the selection", () => {
    fetch.mockResolvedValue(jsonResponse([]));
    useSendMessage.mockReturnValue({ loading: false, sendMessage: jest.fn() });
    useConversation.getState().setSelectedConversation(BOB);
    const { unmount } = renderWithProviders(<MessageContainer />);

    unmount();

    expect(useConversation.getState().selectedConversation).toBeNull();
  });
});

describe("FU-50: MessageInput", () => {
  test("submitting nothing sends nothing", async () => {
    const sendMessage = jest.fn();
    useSendMessage.mockReturnValue({ loading: false, sendMessage });
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("submitting text sends it and clears the input", async () => {
    const sendMessage = jest.fn().mockResolvedValue();
    useSendMessage.mockReturnValue({ loading: false, sendMessage });
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);
    const input = screen.getByPlaceholderText("Send a Message");

    await user.type(input, "hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(sendMessage).toHaveBeenCalledWith("hello");
    expect(input).toHaveValue("");
  });
});

describe("FU-52: MessageInput while a message is sending", () => {
  // The real hook, so loading follows the request instead of a canned value.
  beforeEach(() => useSendMessage.mockImplementation(jest.requireActual("../../../hooks/useSendMessage").default));
  afterEach(() => useSendMessage.mockReset());

  test("more Enters and clicks don't send it again, and the button comes back once it's sent", async () => {
    useConversation.getState().setSelectedConversation(BOB);
    let respond;
    fetch.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);
    const input = screen.getByPlaceholderText("Send a Message");
    const button = screen.getByRole("button", { name: "Send message" });

    await user.type(input, "hello{Enter}");
    await user.keyboard("{Enter}");
    await user.click(button);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => respond(jsonResponse(message({ senderId: "me", receiverId: "u2" }), 201)));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(button).toBeEnabled();
  });
});
