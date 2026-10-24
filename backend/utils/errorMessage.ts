// What to log or show for a caught error. JavaScript can throw anything, so a
// catch block gets `unknown` and this checks before reading a message. Some
// errors have none, such as node-redis's TimeoutError: the class name says what
// happened.
// eslint-disable-next-line no-restricted-syntax -- a thrown value can be anything
export const errorMessage = (e: unknown): string =>
    e instanceof Error ? (e.message || e.constructor.name) : String(e)
