import { extractTime } from "../extractTime";

test("FU-6: formats the local time as HH:MM, padding single digits", () => {
  expect(extractTime(new Date(2026, 0, 2, 9, 5).toISOString())).toBe("09:05");
  expect(extractTime(new Date(2026, 0, 2, 21, 30).toISOString())).toBe("21:30");
});
