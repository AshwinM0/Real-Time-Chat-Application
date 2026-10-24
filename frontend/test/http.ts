// What the mocked fetch resolves to: just the parts of a Response the hooks read.
// Typed any, so it can stand in wherever a Response is expected.
export const jsonResponse = (body: any, status = 200): any => ({
  status,
  ok: status < 400,
  json: async () => body,
});
