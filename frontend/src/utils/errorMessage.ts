// What to show for a caught error. JavaScript can throw anything, so a catch block
// gets `unknown` and this checks before reading a message.
// eslint-disable-next-line no-restricted-syntax -- a thrown value can be anything
export const errorMessage = (e: unknown): string =>
    e instanceof Error ? (e.message || e.constructor.name) : String(e)
