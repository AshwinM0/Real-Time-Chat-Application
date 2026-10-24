import toast from "react-hot-toast";
import showRateLimit from "../showRateLimit";

test("FU-67: a 429 without the API's JSON, such as a proxy's HTML page, still says to try again later", async () => {
  const proxyPage: any = { status: 429, json: async () => { throw new SyntaxError("Unexpected token '<'"); } };

  await showRateLimit(proxyPage);

  expect(toast.error).toHaveBeenCalledWith("Too many requests, try again later", { id: "rate-limit" });
});
