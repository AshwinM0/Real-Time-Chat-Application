import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../login";
import useLogin from "../../../hooks/useLogin";
import { renderWithProviders } from "../../../../test/renderWithProviders";

jest.mock("../../../hooks/useLogin");

describe("FU-41: Login", () => {
  test("submits the typed username and password", async () => {
    const login = jest.fn();
    useLogin.mockReturnValue({ loading: false, login });
    const user = userEvent.setup();
    renderWithProviders(<Login />, { user: null });

    await user.type(screen.getByPlaceholderText("Enter username"), "ann");
    await user.type(screen.getByPlaceholderText("Enter Password"), "secret1");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(login).toHaveBeenCalledWith("ann", "secret1");
  });

  test("while logging in, the button is disabled and shows a spinner", () => {
    useLogin.mockReturnValue({ loading: true, login: jest.fn() });
    renderWithProviders(<Login />, { user: null });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.querySelector(".loading-spinner")).toBeInTheDocument();
  });
});
