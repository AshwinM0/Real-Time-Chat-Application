import type { IncomingMessage } from "node:http";
import { parse } from "cookie";

// The login token from the request's "jwt" cookie (see generateToken.ts), if it
// has one. It takes any HTTP request, so API requests and the Socket.IO handshake
// read the cookie in exactly the same way. cookie-parser would also do it, but it
// types every cookie as any.
export const loginToken = (req: IncomingMessage): string | undefined =>
    parse(req.headers.cookie ?? "").jwt;
