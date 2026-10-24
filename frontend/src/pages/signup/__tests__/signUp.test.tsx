import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignUp from "../signUp";
import GenderCheckbox from "../GenderCheckbox";
import useSignUp from "../../../hooks/useSignUp";
import { renderWithProviders } from "../../../../test/renderWithProviders";

jest.mock("../../../hooks/useSignUp");

describe("FU-41: SignUp", () => {
  test("submits everything typed and picked", async () => {
    const signup = jest.fn();
    (useSignUp as jest.Mock).mockReturnValue({ loading: false, signup });
    const user = userEvent.setup();
    renderWithProviders(<SignUp />, { user: null });

    await user.type(screen.getByPlaceholderText("John Doe"), "Ann Lee");
    await user.type(screen.getByPlaceholderText("johndoe"), "ann");
    await user.type(screen.getByPlaceholderText("Enter Password"), "secret1");
    await user.type(screen.getByPlaceholderText("Re-enter Password"), "secret1");
    await user.click(screen.getByRole("checkbox", { name: "Female" }));
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(signup).toHaveBeenCalledWith({
      fullName: "Ann Lee", username: "ann", password: "secret1", confirmPassword: "secret1", gender: "female",
    });
  });

  test("while signing up, the button is disabled and shows a spinner", () => {
    (useSignUp as jest.Mock).mockReturnValue({ loading: true, signup: jest.fn() });
    renderWithProviders(<SignUp />, { user: null });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.querySelector(".loading-spinner")).toBeInTheDocument();
  });
});

test("FU-42: GenderCheckbox: only one gender is checked at a time", async () => {
  const Harness = () => {
    const [gender, setGender] = useState<"" | "male" | "female">("");
    return <GenderCheckbox selectedGender={gender} onCheckboxChange={setGender} />;
  };
  const user = userEvent.setup();
  renderWithProviders(<Harness />, { user: null });
  const male = screen.getByRole("checkbox", { name: "Male" });
  const female = screen.getByRole("checkbox", { name: "Female" });

  await user.click(male);
  expect(male).toBeChecked();
  expect(female).not.toBeChecked();

  await user.click(female);
  expect(female).toBeChecked();
  expect(male).not.toBeChecked();
});
