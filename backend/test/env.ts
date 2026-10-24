// Runs before every test file. Tests never read .env: CI doesn't have one, and
// a developer's .env would point at their real database.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
// Deliberately not the default, so the CORS tests prove the origin comes from here.
process.env.CLIENT_ORIGIN = "http://client.test";
// Tests sign up and log in many users from one address, which the real limits
// would refuse. rateLimit.test.ts lowers them again to test each limiter.
process.env.RATE_LIMIT_LOGIN_PER_IP = "100000";
process.env.RATE_LIMIT_LOGIN_PER_USER = "100000";
process.env.RATE_LIMIT_SIGNUP_PER_IP = "100000";
process.env.RATE_LIMIT_SEND_PER_USER = "100000";
