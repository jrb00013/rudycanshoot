import { test } from "node:test";
import assert from "node:assert";
import { cookieHeader, captureUrl } from "../src/url_capture.js";

test("cookieHeader builds a Cookie header string", () => {
  assert.equal(cookieHeader({ sessionid: "abc", csrftoken: "xyz" }), "sessionid=abc; csrftoken=xyz");
  assert.equal(cookieHeader({}), "");
});

test("captureUrl requires a url", async () => {
  await assert.rejects(() => captureUrl({}), /url.*required/i);
});
