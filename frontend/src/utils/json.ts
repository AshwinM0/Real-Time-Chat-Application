import type { ApiError } from "../types"

// The two places the app turns JSON into typed values. JSON can hold anything, and
// these don't check what arrives, so each type is a promise kept by whoever wrote
// the JSON: the backend for responses (see types.ts), and the app itself for what
// it saved in localStorage. Everywhere else, types are checked.
export const readJson = <T>(res: Response): Promise<T> => res.json()
// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- see above
export const parseJson = <T>(json: string): T => JSON.parse(json)

// Whether the backend answered { error } instead of what was asked for.
export const isApiError = (data: object): data is ApiError => "error" in data
