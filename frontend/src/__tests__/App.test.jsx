import { screen } from "@testing-library/react";
import App from "../App";
import { renderWithProviders, ME } from "../../test/renderWithProviders";
import { jsonResponse } from "../../test/http";

beforeEach(() => fetch.mockResolvedValue(jsonResponse([])));

const loginPage = () => screen.findByRole("heading", { name: /Login/ });
const homePage = () => screen.findByText(`Welcome 👋 ${ME.fullName} ❄`);

describe("FU-40: routes", () => {
  test("/ shows Login when logged out", async () => {
    renderWithProviders(<App />, { user: null });
    expect(await loginPage()).toBeInTheDocument();
  });

  test("/ shows Home when logged in", async () => {
    renderWithProviders(<App />);
    expect(await homePage()).toBeInTheDocument();
  });

  test.each(["/login", "/signup"])("%s sends a logged-in user to Home", async (route) => {
    renderWithProviders(<App />, { route });
    expect(await homePage()).toBeInTheDocument();
  });

  test("/signup shows Sign Up when logged out", async () => {
    renderWithProviders(<App />, { user: null, route: "/signup" });
    expect(await screen.findByRole("heading", { name: /Sign Up/ })).toBeInTheDocument();
  });
});
