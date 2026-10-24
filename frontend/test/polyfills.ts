// Runs before each test file loads (setupFiles in jest.config.cjs). jsdom, which
// stands in for the browser in tests, has no TextEncoder or TextDecoder, and React
// Router 7 uses them as soon as it's imported. Browsers have both, and so does Node.
import { TextDecoder, TextEncoder } from "node:util";

Object.assign(globalThis, { TextEncoder, TextDecoder });
