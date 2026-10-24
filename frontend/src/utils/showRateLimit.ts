import toast from "react-hot-toast"
import type { ApiError } from "../types"
import { readJson } from "./json"

// The API answers 429 Too Many Requests when a rate limit is hit (see
// backend/middleware/rateLimits.ts), with an error saying what was limited and
// when to try again. Anything else that answers 429, like a proxy, may not send
// that JSON, hence the fallback. Repeated attempts replace the toast instead of
// stacking more.
export default async function showRateLimit(res: Response) {
    const data = await readJson<Partial<ApiError>>(res).catch((): Partial<ApiError> => ({}))
    toast.error(data.error ?? "Too many requests, try again later", { id: "rate-limit" })
}
