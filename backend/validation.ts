import { z } from "zod";
import type { ErrorBody } from "./types.ts";

// What the API accepts, checked as each request arrives. A handler parses its
// input with one of these first and answers 400 with the first problem when it
// doesn't fit, so the types below describe what really arrived. Unknown fields
// are dropped.

// Text that must be there. A missing field and an empty one are both "required".
const text = (name: string) =>
    z.string({ error: (issue) => issue.input === undefined ? `${name} is required` : `${name} must be text` })
        .min(1, { error: `${name} is required` })

// A body that isn't a JSON object, such as an array or a string.
const NOT_AN_OBJECT = { error: "Send the details as a JSON object" }

// POST /api/auth/signup. The 6-character minimum used to be checked only in the browser.
export const SignUpBody = z.object({
    fullName: text("Full name"),
    username: text("Username"),
    password: text("Password").min(6, { error: "Password must be at least 6 characters" }),
    confirmPassword: text("Password confirmation"),
    gender: z.enum(["male", "female"], { error: "Gender must be male or female" }),
}, NOT_AN_OBJECT)
export type SignUpBody = z.infer<typeof SignUpBody>

// POST /api/auth/login. A username must be text, so a query operator such as
// { "$ne": null } never reaches MongoDB.
export const LoginBody = z.object({
    username: text("Username"),
    password: text("Password"),
}, NOT_AN_OBJECT)
export type LoginBody = z.infer<typeof LoginBody>

// POST /api/messages/send/:id. clientMessageId is the sender's own id for the
// message, chosen once and sent again with every retry, so the message is saved
// once however many times it's sent (see sendMessage). The browser uses 128 random
// bits; the limit on its length keeps the index small.
export const SendMessageBody = z.object({
    message: text("Message"),
    clientMessageId: z.string({ error: (issue) => issue.input === undefined ? "clientMessageId is required" : "clientMessageId must be text" })
        .regex(/^[A-Za-z0-9_-]{16,64}$/, { error: "clientMessageId must be 16 to 64 letters, digits, - or _" }),
}, NOT_AN_OBJECT)

// Routes with the other user's id in the path: /send/:id, /:id and /:id/read.
// Anything but an ObjectId's 24 hex digits used to fail deeper down, as a 500.
export const ChatParams = z.object({
    id: z.string().regex(/^[0-9a-f]{24}$/i, { error: "That isn't a valid user id" }),
})
export type ChatParams = z.infer<typeof ChatParams>

// The 400's body: the first problem found, which the frontend shows.
export const invalid = (error: z.ZodError): ErrorBody => ({ error: error.issues[0]?.message ?? "Invalid request" })
