import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureOpenAiApiKeyLoaded } from "../src/openaiConfig.js";

describe("ensureOpenAiApiKeyLoaded", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY_FILE;
  });

  it("leaves OPENAI_API_KEY when already set", () => {
    process.env.OPENAI_API_KEY = "sk-direct";
    process.env.OPENAI_API_KEY_FILE = "/tmp/should-not-read";
    ensureOpenAiApiKeyLoaded();
    expect(process.env.OPENAI_API_KEY).toBe("sk-direct");
  });

  it("reads key from OPENAI_API_KEY_FILE", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wst-key-"));
    const file = path.join(dir, "openai.secret");
    fs.writeFileSync(file, "sk-from-file\n", "utf8");
    process.env.OPENAI_API_KEY_FILE = file;
    ensureOpenAiApiKeyLoaded();
    expect(process.env.OPENAI_API_KEY).toBe("sk-from-file");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
