/**
 * Maps a validated workshop pipeline plan to Realtime session text and
 * post-connect client events (OpenAI Realtime client event shapes).
 */

const SKILL_SNIPPETS = {
  none: "",
  "workshop-general":
    "Facilitation: keep the group on track, ask clarifying questions, and summarize decisions briefly.",
  "workshop-writing": "Writing: tighten wording, preserve intent, offer alternatives where useful.",
  "workshop-compliance": "Tone: careful, policy-aware, avoid overclaiming; flag uncertainty explicitly.",
  "workshop-brief-de": "Language: concise German summaries unless participants choose another language.",
};

const TOOLING_ACCESS_LABEL = {
  read: "Daten lesen",
  write: "Daten schreiben",
};

const TOOLING_DOMAIN_LABEL = {
  customers: "Kundendaten",
  orders: "Auftragsdaten",
  shop: "Shop- & Produktdaten",
  inventory: "Lager / Bestand",
  other: "Sonstiges",
};

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string>, formItems?: unknown[], dynamicUiCommitted?: string, id?: string }[] }} plan
 */
export function buildFullRealtimeInstructions(plan) {
  const parts = [];

  const inst = plan.blocks.find((b) => b.role === "process" && b.typeId === "instruction");
  if (inst) {
    const sys = String(inst.values?.system ?? "").trim();
    if (sys) parts.push(sys);
    const mi = String(inst.values?.maxIterations ?? "").trim();
    const sw = String(inst.values?.stopWhen ?? "").trim();
    if (mi || sw) {
      const lines = [];
      if (mi) lines.push(`Orchestration: limit agent-style retries to about ${mi} iteration(s) where applicable.`);
      if (sw) lines.push(`Orchestration: prefer stopping when: ${sw}`);
      parts.push(lines.join("\n"));
    }
  }

  const skill = plan.blocks.find((b) => b.role === "process" && b.typeId === "skills");
  if (skill) {
    const key = String(skill.values?.skillPreset ?? "none");
    const extra = SKILL_SNIPPETS[key];
    if (extra) parts.push(extra);
  }

  const vector = plan.blocks.find((b) => b.role === "process" && b.typeId === "vector-db");
  if (vector) {
    const names = String(vector.values?.knowledgeFiles ?? "").trim();
    const excerpt = String(vector.values?.knowledgeInlineExcerpt ?? "").trim();
    if (names || excerpt) {
      const lines = [];
      if (names) lines.push(`Knowledge / retrieval: participants chose file name(s) in the UI: "${names}".`);
      if (excerpt) {
        lines.push(
          "Plain-text excerpt inlined from those uploads for this session (browser-side; not a real vector index):",
          excerpt,
        );
      } else if (names) {
        lines.push(
          "In production your backend would index bytes into a vector store and expose file_search; this session has no text excerpt yet (use a .txt / .md upload in the workbench).",
        );
      }
      parts.push(lines.join("\n"));
    }
  }

  const tool = plan.blocks.find((b) => b.role === "process" && b.typeId === "tooling");
  if (tool) {
    const mode = String(tool.values?.accessMode ?? "read");
    const dom = String(tool.values?.serviceDomain ?? "");
    const op = TOOLING_ACCESS_LABEL[mode] ?? mode;
    const domain = TOOLING_DOMAIN_LABEL[dom] ?? dom;
    parts.push(
      `Tooling (workshop mock): treat data access intent as "${op}" scoped to "${domain}". ` +
        `The Realtime tool \`workshop_mock_tooling_call\` exposes a small in-memory customers / orders / shop / inventory dataset that **persists for this run** (session id is injected server-side when the client secret is minted). ` +
        `Use list/get/create/update/delete on the matching domain; do not invent private production data.`,
    );
  }

  parts.push(describeConfiguredOutputs(plan));
  const liveImage = liveAudioImageOutputGuidance(plan);
  if (liveImage) parts.push(liveImage);

  const merged = parts.join("\n\n").trim();
  return merged || "You are a helpful workshop assistant.";
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
function describeConfiguredOutputs(plan) {
  const outs = plan.blocks.filter((b) => b.role === "output");
  if (!outs.length) return "";
  const lines = outs.map((b) => {
    if (b.typeId === "text") return "- Output: text (assistant replies as text; keep them aligned with upstream inputs).";
    if (b.typeId === "audio-live")
      return `- Output: live audio (voice ${String(b.values?.voice ?? "default").trim() || "default"}; match session audio output).`;
    if (b.typeId === "audio")
      return `- Output: TTS / speech file (voice preference: ${String(b.values?.voice ?? "").trim() || "server default"}). Call \`workshop_synthesize_speech\` only after the participant asks for spoken audio or a voice summary—not at session start without that request.`;
    if (b.typeId === "image")
      return `- Output: image (size hint: ${String(b.values?.size ?? "").trim() || "server default"}). Call \`workshop_generate_image\` only after the participant gives explicit instructions to generate or edit an image (voice or text)—not at session start.`;
    if (b.typeId === "form")
      return "- Output: structured form — call `workshop_emit_form_values` with `{ fields: [{ label, value }] }` when you have final values to show.";
    if (b.typeId === "dynamic-ui")
      return "- Output: dynamic UI — call `workshop_emit_dynamic_ui` with `ui_prompt` (NL stub), and/or `ui_spec` + `ui_data` (JSON Schema + payload) for declarative bound views; validate `ui_data` against the active schema.";
    return `- Output module: ${b.typeId}`;
  });
  return ["Configured workshop outputs (shape expectations):", ...lines].join("\n");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
function liveAudioImageOutputGuidance(plan) {
  const hasLiveIn = plan.blocks.some((b) => b.role === "input" && b.typeId === "audio-live");
  const hasImageOut = plan.blocks.some((b) => b.role === "output" && b.typeId === "image");
  if (!hasLiveIn || !hasImageOut) return "";
  return (
    "Live microphone input is active: wait for the participant to speak (or for new text input) before calling " +
    "`workshop_generate_image`. Do not generate or edit the output image immediately after session start; " +
    "bootstrap context and reference images are not sufficient instructions."
  );
}

/**
 * @param {unknown} url
 */
function isHttpsUrl(url) {
  const s = String(url ?? "").trim();
  if (!s.startsWith("https://")) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {unknown[]} items
 */
function serializeFormItems(items) {
  if (!Array.isArray(items)) return "";
  const lines = items.map((it, i) => {
    if (!isRecord(it)) return `${i + 1}. (invalid row)`;
    const typ = String(it.typ ?? "");
    const label = String(it.label ?? "");
    const opts = String(it.options ?? "").trim();
    const extra = typ === "radio" || typ === "select" ? ` options: ${opts || "—"}` : "";
    return `${i + 1}. [${typ}] ${label}${extra}`;
  });
  return lines.join("\n");
}

/**
 * Realtime client events to send after the `oai-events` data channel opens.
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string>, formItems?: unknown[], dynamicUiCommitted?: string, id?: string }[] }} plan
 * @returns {object[]}
 */
export function buildRealtimeBootstrapClientEvents(plan) {
  /** @type {object[]} */
  const events = [];

  const inputs = plan.blocks.filter((b) => b.role === "input");
  for (const b of inputs) {
    if (b.typeId === "audio-live") continue;

    const label = `Input · ${b.typeId}${b.id ? ` (${b.id})` : ""}`;

    if (b.typeId === "text") {
      const text = String(b.values?.content ?? "").trim();
      events.push(
        conversationUserText(
          `${label}\n\n${text || "(empty text input)"}`,
        ),
      );
      continue;
    }

    if (b.typeId === "image") {
      const src = String(b.values?.imageSource ?? "file");
      const url = String(b.values?.imageUrl ?? "").trim();
      if (src === "url" && isHttpsUrl(url)) {
        events.push({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: `${label} (image URL)` },
              { type: "input_image", image_url: url, detail: "auto" },
            ],
          },
        });
        continue;
      }
      if (src === "file") {
        // Bytes are attached after WebRTC connect by the browser (`input_image` + data URL).
        continue;
      }
      const stub = String(b.values?.uploadStub ?? "").trim();
      events.push(
        conversationUserText(
          `${label}\nImage source: ${src}. ` +
            (stub ? `Local filename stub: "${stub}".` : "") +
            (url && !isHttpsUrl(url) ? ` Non-HTTPS URL omitted: "${url.slice(0, 80)}".` : "") +
            " Provide an https:// image URL or use file mode and select an image before Run.",
        ),
      );
      continue;
    }

    if (b.typeId === "form") {
      const body = serializeFormItems(Array.isArray(b.formItems) ? b.formItems : []);
      events.push(
        conversationUserText(
          `${label} — form blueprint\n${body || "(no fields defined)"}\n\nSerialize participant answers as JSON when submitted.`,
        ),
      );
      continue;
    }

    if (b.typeId === "dynamic-ui") {
      const draft = String(b.values?.uiPrompt ?? "").trim();
      const staged = String(b.dynamicUiCommitted ?? "").trim();
      const looksSpec = staged.startsWith("{") && staged.includes('"kind"') && staged.includes("workshop-dynamic-ui");
      const body =
        draft || staged
          ? `${draft ? `Draft prompt:\n${draft}\n\n` : ""}${staged ? (looksSpec ? `Committed JSON UI spec (v2):\n${staged}` : `Committed preview prompt:\n${staged}`) : ""}`.trim()
          : "(empty UI prompt)";
      events.push(
        conversationUserText(
          `${label} — dynamic UI\n${body}${looksSpec ? "\n\n(After WebRTC connects, the host also sends an initial structured field-value JSON snapshot for v2 input specs.)" : ""}`,
        ),
      );
      continue;
    }

    if (b.typeId === "audio-rec") {
      // Bytes are attached after WebRTC connect by the browser (PCM via `input_audio`).
      continue;
    }

    events.push(
      conversationUserText(
        `${label}\n(Module-specific values are not mapped to a richer item in this version.)`,
      ),
    );
  }

  return events;
}

/**
 * @param {string} text
 */
function conversationUserText(text) {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  };
}
