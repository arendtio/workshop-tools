import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getKnowledgePoolSummary,
  isAllowedKnowledgeFilename,
  listKnowledgePools,
  searchKnowledgePool,
  uploadKnowledgePoolFile,
} from "../src/knowledgePools/store.js";

describe("knowledgePools store", () => {
  /** @type {string | undefined} */
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    delete process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR;
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("validates allowed extensions", () => {
    expect(isAllowedKnowledgeFilename("a.pdf")).toBe(true);
    expect(isAllowedKnowledgeFilename("b.docx")).toBe(true);
    expect(isAllowedKnowledgeFilename("c.exe")).toBe(false);
  });

  it("lists pools from manifest directories", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-pools-"));
    process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR = tmpDir;
    const poolDir = path.join(tmpDir, "demo");
    fs.mkdirSync(poolDir, { recursive: true });
    fs.writeFileSync(
      path.join(poolDir, "manifest.json"),
      JSON.stringify({
        name: "demo",
        vector_store_id: "vs_test",
        created_at: "2026-01-01T00:00:00.000Z",
        files: [{ filename: "a.txt", status: "completed", size_bytes: 3 }],
      }),
    );
    const { pools } = listKnowledgePools();
    expect(pools).toHaveLength(1);
    expect(pools[0].name).toBe("demo");
    expect(pools[0].ready).toBe(true);
  });

  it("uploads, indexes, and searches via mocked OpenAI", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-upload-"));
    process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR = tmpDir;
    process.env.OPENAI_API_KEY = "sk-test";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const u = String(url);
        if (u.includes("/vector_stores") && init?.method === "POST" && !u.includes("/search") && !u.includes("/files")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: "vs_mock_1" }),
          };
        }
        if (u.includes("/files") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: "file_mock_1" }),
          };
        }
        if (u.includes("/vector_stores/vs_mock_1/files") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: "file_mock_1", status: "in_progress" }),
          };
        }
        if (u.includes("/vector_stores/vs_mock_1/files/file_mock_1") && (!init?.method || init.method === "GET")) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: "file_mock_1", status: "completed" }),
          };
        }
        if (u.includes("/vector_stores/vs_mock_1/search")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                data: [
                  {
                    file_id: "file_mock_1",
                    filename: "notes.txt",
                    score: 0.9,
                    content: [{ type: "text", text: "hello world" }],
                  },
                ],
              }),
          };
        }
        if (u.includes("/vector_stores/vs_mock_1/files/file_mock_1") && init?.method === "DELETE") {
          return { ok: true, status: 200, text: async () => "{}" };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );

    const up = await uploadKnowledgePoolFile("faq", "notes.txt", Buffer.from("hello world"));
    expect(up.ok).toBe(true);
    expect(up.vector_store_id).toBe("vs_mock_1");

    const summary = getKnowledgePoolSummary("faq");
    expect(summary.ok).toBe(true);
    expect(summary.ready).toBe(true);
    expect(summary.files).toHaveLength(1);

    const search = await searchKnowledgePool("faq", "hello");
    expect(search.ok).toBe(true);
    expect(search.results?.[0]?.text).toContain("hello");
  });
});
