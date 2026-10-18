// Runs before every test file. Tests never read .env: CI doesn't have one, and
// a developer's .env would point at their real database.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
// Deliberately not the default, so the CORS tests prove the origin comes from here.
process.env.CLIENT_ORIGIN = "http://client.test";
