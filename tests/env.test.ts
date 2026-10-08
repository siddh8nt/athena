import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readEnv } = await import("@/lib/env");

describe("readEnv", () => {
  it("falls back to fixtures when no Qloo key is set", () => {
    const env = readEnv({});
    expect(env.fixtures).toBe(true);
    expect(env.qlooBaseUrl).toBe("https://hackathon.api.qloo.com");
  });

  it("runs live when a key is set and fixtures are off", () => {
    expect(readEnv({ QLOO_API_KEY: "test", ATHENA_FIXTURES: "0" }).fixtures).toBe(false);
  });

  it("forces fixtures with ATHENA_FIXTURES=1", () => {
    expect(readEnv({ QLOO_API_KEY: "test", ATHENA_FIXTURES: "1" }).fixtures).toBe(true);
  });
});
