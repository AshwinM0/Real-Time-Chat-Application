import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import Conversation from "../Conversation";
import Conversations from "../Conversations";
import SearchInput from "../SearchInput";
import useConversation from "../../../zustand/useConversation";
import { serverEmit } from "../../../../test/fakeSocket";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const BOB = { _id: "u2", fullName: "Bob Ray", profilePic: "bob.png" };
const CAROL = { _id: "u3", fullName: "Carol Sun", profilePic: "carol.png" };
const DAN = { _id: "u4", fullName: "Dan Ode", profilePic: "dan.png" };
const store = () => useConversation.getState();
const bobEntry = () => screen.getByRole("button", { name: /Bob Ray/ });

describe("Conversation", () => {
  test("FU-43: shows the online indicator while the user is online", () => {
    renderWithProviders(<Conversation conversation={BOB} />);
    expect(within(bobEntry()).queryByText("online")).not.toBeInTheDocument();

    act(() => serverEmit("onlineUsers", ["u2"]));

    expect(within(bobEntry()).getByText("online")).toBeInTheDocument();
  });

  test("FU-44: the unread badge appears with the count, and opening the chat clears it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Conversation conversation={BOB} />);
    expect(screen.queryByLabelText(/unread messages/)).not.toBeInTheDocument();

    act(() => { for (let i = 0; i < 3; i++) store().incrementUnread("u2"); });
    expect(screen.getByLabelText("3 unread messages")).toHaveTextContent("3");

    await user.click(bobEntry());
    expect(store().selectedConversation).toBe(BOB);
    expect(screen.queryByLabelText(/unread messages/)).not.toBeInTheDocument();
  });

  test("FU-63: from 100 unread, the badge says 99+ (the server stops counting at 100)", () => {
    renderWithProviders(<Conversation conversation={BOB} />);

    act(() => store().setUnread({ u2: 100 }));

    expect(screen.getByLabelText("More than 99 unread messages")).toHaveTextContent("99+");
  });
});

describe("Conversations", () => {
  test("lists every user as a button, with a spinner while loading", () => {
    const { container } = renderWithProviders(<Conversations conversations={[BOB, CAROL]} loading />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(container.querySelector(".loading-spinner")).toBeInTheDocument();
  });

  // Known gap: Conversations passes "lastIdc" but Conversation reads "lastIdx",
  // so every user, the last included, gets a divider. When the typo is fixed this
  // starts failing: make it a normal test then.
  test.failing("FU-45: no divider after the last user", () => {
    const { container } = renderWithProviders(<Conversations conversations={[BOB, CAROL, DAN]} loading={false} />);
    expect(container.querySelectorAll(".divider")).toHaveLength(2);
  });
});

describe("FU-46: SearchInput", () => {
  const renderSearch = () => {
    renderWithProviders(<SearchInput conversations={[BOB, CAROL]} />);
    return { input: screen.getByPlaceholderText("Search..."), user: userEvent.setup() };
  };

  test("under 3 characters is rejected", async () => {
    const { input, user } = renderSearch();
    await user.type(input, "Bo{Enter}");
    expect(toast.error).toHaveBeenCalledWith("Search string must be at least 3 characters");
    expect(store().selectedConversation).toBeNull();
  });

  test("a match anywhere in the name opens that chat and clears the input", async () => {
    const { input, user } = renderSearch();
    await user.type(input, "sun{Enter}");
    expect(store().selectedConversation).toBe(CAROL);
    expect(input).toHaveValue("");
  });

  test("no match says so", async () => {
    const { input, user } = renderSearch();
    await user.type(input, "zed{Enter}");
    expect(toast.error).toHaveBeenCalledWith("No such user found");
    expect(store().selectedConversation).toBeNull();
  });
});
