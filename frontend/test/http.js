// What the mocked fetch resolves to: just the parts of a Response the hooks read.
export const jsonResponse = (body, status = 200) => ({
  status,
  ok: status < 400,
  json: async () => body,
});
