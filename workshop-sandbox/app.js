/**
 * Workshop AI Sandbox — workbench UI mock-up (no backend).
 * Form fields are aligned with current OpenAI platform APIs (see each card’s
 * “API note”) as documented at https://developers.openai.com/api/reference/
 * and related guides (May 2026).
 */

const INPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Typed or pasted text", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Upload or reference stills", live: false },
  { id: "audio-rec", code: "A·R", title: "Audio (recorded)", desc: "Captured clip or file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streaming microphone", live: true },
  { id: "video-live", code: "V·L", title: "Video (live)", desc: "Webcam / screen stream", live: true },
  { id: "video-rec", code: "V·R", title: "Video (recorded)", desc: "File-based video", live: false },
];

const PROCESS_TYPES = [
  { id: "instruction", code: "INS", title: "Instruction", desc: "Natural-language task or prompt", live: false },
  { id: "vector-db", code: "RAG", title: "Knowledge / vectors", desc: "Retrieval from a vector store", live: false },
  { id: "tooling", code: "TLS", title: "Tooling", desc: "APIs, code, external tools", live: false },
  { id: "skills", code: "SKL", title: "Skills / context", desc: "Bundled rules, docs, or skill packs", live: false },
];

const OUTPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Structured or free-form reply", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Generated or edited visuals", live: false },
  { id: "audio", code: "AUD", title: "Audio", desc: "Speech or sound file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streamed speech / playback", live: true },
  { id: "video", code: "VID", title: "Video", desc: "Rendered or composed video", live: false },
  { id: "video-live", code: "V·L", title: "Video (live)", desc: "Live composite or stream out", live: true },
];

const ROLE_LABEL = { input: "Input", process: "Processing", output: "Output" };

/** @type {Map<string, MediaStream>} block id → active preview stream */
const blockMediaStreams = new Map();

/** @type {Map<string, { recorder: MediaRecorder, chunks: BlobPart[], statusEl: HTMLElement | null }>} */
const blockMediaRecorders = new Map();

/**
 * Mock form fields per module type. Keys are `role:typeId`.
 * Field objects: type is one of text, textarea, number, select, segmented, dropzone, hint,
 * camera_preview, file, media_device, audio_record.
 * @type {Record<string, { apiMapping?: string, defaults: Record<string, string>, fields: object[] }>}
 */
const FORM_SCHEMA = {
  "input:text": {
    apiMapping:
      "Chat Completions / Responses — user text turns (`messages` / `input`). See Text generation guide.",
    defaults: {
      content: "Summarize the workshop goals in two bullet points.",
      labelForModel: "Workshop participant",
    },
    fields: [
      {
        key: "content",
        label: "Text for the model",
        type: "textarea",
        rows: 4,
        placeholder: "Prompt or raw text content",
      },
      {
        key: "labelForModel",
        label: "Participant label (optional)",
        type: "text",
        placeholder: "Maps to optional `name` on chat messages — for logs only",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Backend sends this string as a user message (or `input_text` in the Responses API).",
      },
    ],
  },
  "input:image": {
    apiMapping:
      "Chat Completions user content `image_url` (`url` + `detail`) or Responses `input_image` (`image_url` / `file_id`). Vision guide.",
    defaults: {
      imageSource: "file",
      imageUrl: "",
      visionDetail: "auto",
      uploadStub: "",
    },
    fields: [
      {
        key: "imageSource",
        label: "Source",
        type: "segmented",
        options: [
          { value: "file", label: "File" },
          { value: "url", label: "URL" },
        ],
      },
      {
        key: "uploadStub",
        label: "Upload image",
        type: "dropzone",
        accept: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
        dropLabel: "Drop image here or click to browse",
        showWhen: { key: "imageSource", is: "file" },
      },
      {
        key: "imageUrl",
        label: "Image URL (https)",
        type: "text",
        placeholder: "https://…",
        showWhen: { key: "imageSource", is: "url" },
      },
      {
        key: "visionDetail",
        label: "Vision detail",
        type: "select",
        options: [
          { value: "auto", label: "auto — let the API decide" },
          { value: "low", label: "low — faster / cheaper" },
          { value: "high", label: "high — finer detail" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Workshop: most people upload a file; your backend maps it to `image_url` or a hosted URL.",
      },
    ],
  },
  "input:audio-rec": {
    apiMapping:
      "POST `/v1/audio/transcriptions` — multipart `file` + `model` (e.g. `gpt-4o-transcribe`, `whisper-1`). Speech-to-text guide.",
    defaults: {
      uploadStub: "",
      recordingStub: "",
      transcriptionModel: "gpt-4o-transcribe",
      language: "",
      responseShape: "text",
    },
    fields: [
      {
        key: "uploadStub",
        label: "Audio file",
        type: "dropzone",
        accept: "audio/*,.mp3,.wav,.m4a,.webm,.mp4,.mpeg,.mpga",
        dropLabel: "Drop audio or browse",
      },
      {
        key: "recordingStub",
        label: "Or record from microphone",
        type: "audio_record",
      },
      {
        key: "transcriptionModel",
        label: "Transcription model",
        type: "select",
        options: [
          { value: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
          { value: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
          { value: "gpt-4o-transcribe-diarize", label: "gpt-4o-transcribe-diarize (speakers)" },
          { value: "whisper-1", label: "whisper-1 (classic)" },
        ],
      },
      {
        key: "language",
        label: "Language hint (optional)",
        type: "text",
        placeholder: "ISO code e.g. en, de — improves accuracy",
      },
      {
        key: "responseShape",
        label: "What participants see first",
        type: "select",
        options: [
          { value: "text", label: "Plain transcript text" },
          { value: "verbose_json", label: "Verbose JSON (timestamps, etc.)" },
          { value: "diarized_json", label: "Diarized JSON (speakers)" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Recording produces a blob your backend forwards as `file`; duration is derived automatically.",
      },
    ],
  },
  "input:audio-live": {
    apiMapping:
      "Realtime API — `/v1/realtime` voice-agent session (WebRTC/WebSocket). Models like `gpt-realtime-2`. Realtime + Voice agents guides.",
    defaults: {
      sessionGoal: "voice_agent",
      connection: "webrtc",
      model: "gpt-realtime-2",
      device: "",
      vadPreset: "server_vad",
    },
    fields: [
      {
        key: "sessionGoal",
        label: "Session type",
        type: "select",
        options: [
          { value: "voice_agent", label: "Voice agent — model replies with speech" },
          { value: "transcription", label: "Live transcription — text deltas only" },
          { value: "translation", label: "Live translation — dedicated translation session" },
        ],
      },
      {
        key: "connection",
        label: "Transport",
        type: "select",
        options: [
          { value: "webrtc", label: "WebRTC (browser / Agents SDK pattern)" },
          { value: "websocket", label: "WebSocket (server-side audio)" },
        ],
      },
      {
        key: "model",
        label: "Realtime model",
        type: "select",
        options: [
          { value: "gpt-realtime-2", label: "gpt-realtime-2" },
          { value: "gpt-realtime-mini", label: "gpt-realtime-mini (example)" },
          { value: "gpt-realtime-whisper", label: "gpt-realtime-whisper (transcription)" },
        ],
      },
      {
        key: "device",
        label: "Microphone",
        type: "media_device",
        kind: "audioinput",
      },
      {
        key: "vadPreset",
        label: "Turn-taking",
        type: "select",
        options: [
          { value: "server_vad", label: "Server-side voice activity" },
          { value: "push_to_talk", label: "Push-to-talk (UI responsibility)" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Browser workshops: capture audio client-side, stream to your backend, forward to OpenAI with an ephemeral client secret — never expose org API keys.",
      },
    ],
  },
  "input:video-live": {
    apiMapping:
      "Sample frames → Chat `image_url` parts or future video inputs; live path mirrors Realtime/WebRTC capture patterns.",
    defaults: { source: "webcam", facing: "user", resolution: "1280x720", cameraDevice: "" },
    fields: [
      {
        key: "source",
        label: "Capture",
        type: "select",
        options: [
          { value: "webcam", label: "Webcam" },
          { value: "screen", label: "Screen share" },
        ],
      },
      {
        key: "cameraDevice",
        label: "Camera",
        type: "media_device",
        kind: "videoinput",
        showWhen: { key: "source", is: "webcam" },
      },
      { key: "facing", label: "Camera facing", type: "select", options: [
        { value: "user", label: "Front / selfie" },
        { value: "environment", label: "Back / room" },
      ], showWhen: { key: "source", is: "webcam" } },
      { key: "resolution", label: "Target resolution", type: "text", placeholder: "1280x720" },
      {
        key: "_live",
        label: "Preview",
        type: "camera_preview",
        mode: "video",
        facing: "user",
        showWhen: { key: "source", is: "webcam" },
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Workshop: show preview here; backend samples frames to still-image model calls until native video input is wired.",
      },
    ],
  },
  "input:video-rec": {
    apiMapping:
      "No single “video understanding” upload in core API — extract key frames client-side or server-side, then use `image_url` / `input_image`.",
    defaults: { uploadStub: "" },
    fields: [
      {
        key: "uploadStub",
        label: "Video file",
        type: "dropzone",
        accept: "video/*,.mp4,.webm,.mov,.mkv",
        dropLabel: "Drop video or browse",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Trim and prepare the clip before upload; the downstream pipeline samples frames as needed.",
      },
    ],
  },
  "process:instruction": {
    apiMapping:
      "POST `/v1/chat/completions` or `/v1/responses` — `messages`, `model`, `max_completion_tokens`, `reasoning_effort` (reasoning models), `modalities`, `tools`. Loop/retry is orchestrated in your app.",
    defaults: {
      instructionRole: "system",
      system:
        "You are a concise assistant. Respect safety policies. Prefer bullet lists when comparing options.",
      user: "Explain how this pipeline would run end-to-end in one short paragraph.",
      model: "gpt-4o",
      maxIterations: "4",
      stopWhen: "Answer includes a numbered list.",
      maxCompletionTokens: "1024",
      outputModalities: "text",
      outputVoice: "alloy",
      stream: "false",
    },
    fields: [
      {
        key: "instructionRole",
        label: "Instruction role",
        type: "select",
        options: [
          { value: "system", label: "system — classic GPT instructions" },
          { value: "developer", label: "developer — preferred on newer reasoning models" },
        ],
      },
      {
        key: "system",
        label: "System / developer text",
        type: "textarea",
        rows: 3,
        placeholder: "Behavior, tone, constraints",
      },
      {
        key: "user",
        label: "User instructions",
        type: "textarea",
        rows: 3,
        placeholder: "What to do with upstream inputs",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        options: [
          { value: "gpt-4o", label: "gpt-4o (multimodal text+image+audio in)" },
          { value: "gpt-4o-mini", label: "gpt-4o-mini" },
          { value: "gpt-4.1", label: "gpt-4.1" },
          { value: "gpt-5-mini", label: "gpt-5-mini (example)" },
          { value: "gpt-4o-audio-preview", label: "gpt-4o-audio-preview (audio out)" },
        ],
      },
      { key: "maxIterations", label: "Max iterations (agent / retry loop)", type: "number", placeholder: "4" },
      {
        key: "stopWhen",
        label: "Stop condition (plain language)",
        type: "textarea",
        rows: 2,
        placeholder: "When should the run stop retrying? (Your backend evaluates this.)",
      },
      {
        key: "maxCompletionTokens",
        label: "Max completion tokens",
        type: "number",
        placeholder: "Prefer `max_completion_tokens` over legacy `max_tokens`",
      },
      {
        key: "outputModalities",
        label: "Output modalities",
        type: "select",
        options: [
          { value: "text", label: "text only" },
          { value: "text,audio", label: "text + audio (audio-capable models)" },
        ],
      },
      {
        key: "outputVoice",
        label: "Spoken voice (if audio out)",
        type: "select",
        options: [
          { value: "alloy", label: "alloy" },
          { value: "ash", label: "ash" },
          { value: "ballad", label: "ballad" },
          { value: "coral", label: "coral" },
          { value: "echo", label: "echo" },
          { value: "sage", label: "sage" },
          { value: "shimmer", label: "shimmer" },
          { value: "marin", label: "marin" },
          { value: "cedar", label: "cedar" },
        ],
      },
      {
        key: "stream",
        label: "Stream tokens",
        type: "select",
        options: [
          { value: "false", label: "No" },
          { value: "true", label: "Yes (`stream: true`)" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Reasoning models: tune `reasoning_effort` on the server. Temperature is omitted here — set per-model defaults in the backend if needed.",
      },
    ],
  },
  "process:vector-db": {
    apiMapping:
      "Upload files → Vector store + `file_search` (`vector_store_ids`) in the Responses API. End users only pick files; indexing stays server-side.",
    defaults: {
      knowledgeFiles: "",
    },
    fields: [
      {
        key: "knowledgeFiles",
        label: "Knowledge files",
        type: "dropzone",
        accept: ".pdf,.txt,.md,.markdown,.doc,.docx,.html,.csv,.png,.jpg,.jpeg,.webp,.gif",
        dropLabel: "Drop one or more files (PDF, text, Office, images …)",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Your backend ingests these into a vector store / file search; participants do not manage collection IDs.",
      },
    ],
  },
  "process:tooling": {
    apiMapping:
      "Responses / Chat `tools`: `function`, `web_search`, `file_search`, custom tools — plus your own HTTP connectors executed server-side.",
    defaults: {
      toolKind: "function",
      toolName: "lookup_customer",
      toolDescription: "Fetch CRM row by id.",
      webSearchContext: "medium",
      allowedDomains: "",
      endpoint: "https://api.example.com/v1/mock",
      timeoutMs: "800",
    },
    fields: [
      {
        key: "toolKind",
        label: "Tooling pattern",
        type: "select",
        options: [
          { value: "function", label: "Function tool (JSON schema on server)" },
          { value: "web_search", label: "Built-in web_search" },
          { value: "file_search", label: "Built-in file_search (vector stores)" },
          { value: "http_json", label: "Custom HTTP (your middleware)" },
        ],
      },
      { key: "toolName", label: "Function name / id", type: "text", placeholder: "get_weather…" },
      {
        key: "toolDescription",
        label: "Function description",
        type: "textarea",
        rows: 2,
        placeholder: "Shown to the model when toolKind=function",
      },
      {
        key: "webSearchContext",
        label: "Web search context budget",
        type: "select",
        options: [
          { value: "low", label: "low" },
          { value: "medium", label: "medium (default)" },
          { value: "high", label: "high" },
        ],
      },
      {
        key: "allowedDomains",
        label: "Allowed domains (optional)",
        type: "text",
        placeholder: "pubmed.ncbi.nlm.nih.gov, … comma-separated",
      },
      { key: "endpoint", label: "Custom endpoint (if HTTP)", type: "text", placeholder: "https://…" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "800" },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Participants configure intent here; engineers map rows to actual JSON schemas / vector IDs.",
      },
    ],
  },
  "process:skills": {
    apiMapping:
      "Typically extra `system` / `developer` text, uploaded instruction files (`input_file`), or future Skills product hooks — same messaging stack as chat.",
    defaults: { packId: "workshop-default", injectMode: "prepend", packFileStub: "" },
    fields: [
      { key: "packId", label: "Pack name / id", type: "text", placeholder: "HR policy pack v3" },
      {
        key: "injectMode",
        label: "How to merge",
        type: "select",
        options: [
          { value: "prepend", label: "Prepend to system/developer message" },
          { value: "append", label: "Append after user instructions" },
          { value: "file_only", label: "Attach as `input_file` parts" },
        ],
      },
      {
        key: "packFileStub",
        label: "Upload pack (.md / .txt)",
        type: "dropzone",
        accept: ".md,.txt,.pdf",
        dropLabel: "Drop instruction file",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Workshop-friendly: treat packs as curated markdown; engineers wire to Files API + retrieval as needed.",
      },
    ],
  },
  "output:text": {
    apiMapping:
      "Assistant `content` in Chat Completions, or `output_text` items in Responses — `response_format`, streaming.",
    defaults: {
      format: "markdown",
      maxCompletionTokens: "1024",
      stream: "false",
      jsonSchemaStub: "",
    },
    fields: [
      {
        key: "format",
        label: "Presentation",
        type: "select",
        options: [
          { value: "markdown", label: "Markdown (rendered client-side)" },
          { value: "plain", label: "Plain text" },
          { value: "json_schema", label: "Structured JSON (schema on server)" },
        ],
      },
      {
        key: "maxCompletionTokens",
        label: "Max output tokens",
        type: "number",
        placeholder: "1024",
      },
      {
        key: "stream",
        label: "Stream to UI",
        type: "select",
        options: [
          { value: "false", label: "No" },
          { value: "true", label: "Yes" },
        ],
      },
      {
        key: "jsonSchemaStub",
        label: "JSON schema file (optional)",
        type: "dropzone",
        accept: ".json,.schema",
        dropLabel: "Drop schema draft (not executed here)",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Structured outputs: prefer `response_format.type = json_schema` on supported models (see Structured Outputs guide).",
      },
    ],
  },
  "output:image": {
    apiMapping:
      "POST `/v1/images/generations` — `model` (`gpt-image-1.5`, `dall-e-3`, …), `prompt`, `size`, `quality`, `n`, `output_format`, `background`.",
    defaults: {
      prompt: "Flat vector illustration of a team workshop at a whiteboard, soft daylight.",
      model: "gpt-image-1.5",
      size: "1024x1024",
      quality: "medium",
      n: "1",
      outputFormat: "png",
      background: "auto",
    },
    fields: [
      {
        key: "prompt",
        label: "Image prompt",
        type: "textarea",
        rows: 3,
        placeholder: "Describe the scene, style, constraints",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        options: [
          { value: "gpt-image-1.5", label: "gpt-image-1.5" },
          { value: "gpt-image-1", label: "gpt-image-1" },
          { value: "gpt-image-1-mini", label: "gpt-image-1-mini" },
          { value: "dall-e-3", label: "dall-e-3" },
          { value: "dall-e-2", label: "dall-e-2" },
        ],
      },
      {
        key: "size",
        label: "Size",
        type: "select",
        options: [
          { value: "1024x1024", label: "1024×1024" },
          { value: "1536x1024", label: "1536×1024 (landscape)" },
          { value: "1024x1536", label: "1024×1536 (portrait)" },
          { value: "auto", label: "auto (supported models)" },
        ],
      },
      {
        key: "quality",
        label: "Quality",
        type: "select",
        options: [
          { value: "auto", label: "auto" },
          { value: "low", label: "low" },
          { value: "medium", label: "medium" },
          { value: "high", label: "high" },
          { value: "hd", label: "hd (DALL·E 3)" },
          { value: "standard", label: "standard (DALL·E 3)" },
        ],
      },
      { key: "n", label: "Number of images", type: "number", placeholder: "1–10 (DALL·E 3 allows 1)" },
      {
        key: "outputFormat",
        label: "File format (GPT image models)",
        type: "select",
        options: [
          { value: "png", label: "png" },
          { value: "jpeg", label: "jpeg" },
          { value: "webp", label: "webp" },
        ],
      },
      {
        key: "background",
        label: "Background",
        type: "select",
        options: [
          { value: "auto", label: "auto" },
          { value: "opaque", label: "opaque" },
          { value: "transparent", label: "transparent (png/webp)" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "GPT image models return base64 by default; DALL·E 2/3 can return temporary URLs (`response_format`).",
      },
    ],
  },
  "output:audio": {
    apiMapping:
      "POST `/v1/audio/speech` — `model` (`gpt-4o-mini-tts`, `tts-1`, …), `input` text, `voice`, `instructions` (mini TTS), `speed`, `response_format`, `stream_format`.",
    defaults: {
      speechInput: "Welcome to the workshop! Here is a quick audio summary of the agenda.",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      speed: "1.0",
      responseFormat: "mp3",
      voiceInstructions: "Speak warmly and slightly slowly for a live room.",
    },
    fields: [
      {
        key: "speechInput",
        label: "Text to speak",
        type: "textarea",
        rows: 3,
        placeholder: "Up to ~4k characters for the speech endpoint",
      },
      {
        key: "model",
        label: "TTS model",
        type: "select",
        options: [
          { value: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts (style instructions)" },
          { value: "tts-1-hd", label: "tts-1-hd" },
          { value: "tts-1", label: "tts-1" },
        ],
      },
      {
        key: "voice",
        label: "Voice",
        type: "select",
        options: [
          { value: "alloy", label: "alloy" },
          { value: "ash", label: "ash" },
          { value: "ballad", label: "ballad" },
          { value: "coral", label: "coral" },
          { value: "echo", label: "echo" },
          { value: "sage", label: "sage" },
          { value: "shimmer", label: "shimmer" },
          { value: "verse", label: "verse" },
          { value: "marin", label: "marin" },
          { value: "cedar", label: "cedar" },
        ],
      },
      { key: "speed", label: "Speed (0.25–4.0)", type: "text", placeholder: "1.0" },
      {
        key: "responseFormat",
        label: "Audio format",
        type: "select",
        options: [
          { value: "mp3", label: "mp3" },
          { value: "wav", label: "wav" },
          { value: "aac", label: "aac" },
          { value: "opus", label: "opus" },
        ],
      },
      {
        key: "voiceInstructions",
        label: "Delivery instructions (mini TTS only)",
        type: "textarea",
        rows: 2,
        placeholder: "Ignored for tts-1 / tts-1-hd",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Streaming playback: `stream_format` supports `sse` or `audio` on newer models — workshop UIs can progressively play chunks.",
      },
    ],
  },
  "output:audio-live": {
    apiMapping:
      "Realtime audio out or streamed speech — combine Realtime session with `modalities: [\"text\",\"audio\"]` on audio-capable chat models for simpler cases.",
    defaults: {
      transport: "webrtc",
      playoutVoice: "marin",
      streamFormat: "audio",
      bitrateKbps: "160",
    },
    fields: [
      {
        key: "transport",
        label: "Delivery",
        type: "select",
        options: [
          { value: "webrtc", label: "WebRTC (low latency)" },
          { value: "websocket", label: "WebSocket" },
          { value: "sse", label: "SSE (`stream_format: sse` for TTS)" },
        ],
      },
      {
        key: "playoutVoice",
        label: "Voice",
        type: "select",
        options: [
          { value: "marin", label: "marin" },
          { value: "cedar", label: "cedar" },
          { value: "alloy", label: "alloy" },
          { value: "shimmer", label: "shimmer" },
        ],
      },
      {
        key: "streamFormat",
        label: "Chunk format",
        type: "select",
        options: [
          { value: "audio", label: "audio" },
          { value: "sse", label: "sse" },
        ],
      },
      { key: "bitrateKbps", label: "Target bitrate (kbps)", type: "number", placeholder: "160" },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Expose transport + voice only; engineers bind to Realtime events or streamed TTS responses.",
      },
    ],
  },
  "output:video": {
    apiMapping:
      "OpenAI does not ship a first-party “text-to-video clip” API in the core reference — treat as downstream compositing (FFmpeg, NLE) or partner video models.",
    defaults: { resolution: "1920x1080", fps: "30", durationSec: "12", exportHint: "H.264 MP4 via post pipeline" },
    fields: [
      { key: "resolution", label: "Target resolution", type: "text", placeholder: "1920x1080" },
      { key: "fps", label: "Frame rate", type: "number", placeholder: "30" },
      { key: "durationSec", label: "Duration (sec)", type: "number", placeholder: "12" },
      {
        key: "exportHint",
        label: "Export / codec hint",
        type: "text",
        placeholder: "For your media worker",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Workshop honesty: keep this block for storyboards + narration timing; generate stills with Images API, audio with Speech, mux offline.",
      },
    ],
  },
  "output:video-live": {
    apiMapping:
      "Browser compositor (Canvas/WebRTC) — not an OpenAI REST primitive; pair with Realtime for audio while you control video layout client-side.",
    defaults: { mixerLayout: "pip-right", encoder: "h264", branding: "Org logo overlay" },
    fields: [
      {
        key: "mixerLayout",
        label: "Compositor layout",
        type: "select",
        options: [
          { value: "pip-right", label: "Picture-in-picture · right" },
          { value: "grid-2", label: "Two-up grid" },
          { value: "full-cam", label: "Full camera" },
        ],
      },
      {
        key: "encoder",
        label: "Encoder",
        type: "select",
        options: [
          { value: "h264", label: "H.264" },
          { value: "vp9", label: "VP9" },
        ],
      },
      { key: "branding", label: "Overlay / branding note", type: "text", placeholder: "Optional" },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Use this card to capture production intent; implementation stays in your streaming stack.",
      },
    ],
  },
};

const state = {
  /** @type {{ id: string, role: 'input'|'process'|'output', typeId: string, values: Record<string, string>, runPreview?: string }[]} */
  blocks: [],
  /** Collapsible sections in the pipeline editor */
  sectionOpen: { input: true, process: true, output: true },
  /** Continuous mock run (no modal) */
  running: false,
};

let idSeq = 0;

function uid() {
  idSeq += 1;
  return `b-${idSeq}`;
}

function findDef(role, typeId) {
  const list =
    role === "input" ? INPUT_TYPES : role === "process" ? PROCESS_TYPES : OUTPUT_TYPES;
  return list.find((t) => t.id === typeId);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formSchemaKey(role, typeId) {
  return `${role}:${typeId}`;
}

function createBlock(role, typeId) {
  const sk = formSchemaKey(role, typeId);
  const schema = FORM_SCHEMA[sk];
  const values = schema ? { ...schema.defaults } : {};
  return { id: uid(), role, typeId, values };
}

function stopBlockMedia(blockId) {
  const stream = blockMediaStreams.get(blockId);
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  blockMediaStreams.delete(blockId);
}

function stopBlockRecorder(blockId) {
  const entry = blockMediaRecorders.get(blockId);
  if (!entry) return;
  try {
    if (entry.recorder && entry.recorder.state !== "inactive") {
      entry.recorder.stop();
    }
  } catch (_) {
    /* ignore */
  }
  blockMediaRecorders.delete(blockId);
}

function stopBlockCapture(blockId) {
  stopBlockMedia(blockId);
  stopBlockRecorder(blockId);
}

function addBlock(role, typeId) {
  state.blocks.push(createBlock(role, typeId));
  renderAll();
}

function removeBlock(id) {
  stopBlockCapture(id);
  state.blocks = state.blocks.filter((b) => b.id !== id);
  renderAll();
}

function renderPalette() {
  fillPalette("palette-inputs", INPUT_TYPES, "input");
  fillPalette("palette-process", PROCESS_TYPES, "process");
  fillPalette("palette-output", OUTPUT_TYPES, "output");
}

function fillPalette(containerId, types, role) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  types.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "part";
    btn.title = t.desc;
    btn.innerHTML = `<span class="pi" aria-hidden="true">${escapeHtml(t.code)}</span><span>${escapeHtml(t.title)}</span>`;
    btn.addEventListener("click", () => addBlock(role, t.id));
    el.appendChild(btn);
  });
}

function renderMeta() {
  const inputs = state.blocks.filter((b) => b.role === "input").length;
  const proc = state.blocks.filter((b) => b.role === "process").length;
  const outs = state.blocks.filter((b) => b.role === "output").length;
  const meta = document.getElementById("workbench-meta");
  const n = state.blocks.length;
  let line =
    n === 0
      ? "Nothing in pipeline"
      : `${n} part${n === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output`;
  if (state.running && n > 0) {
    line += " · mock run active";
  }
  meta.textContent = line;

  const multi = document.getElementById("multi-input-hint");
  multi.classList.toggle("visible", inputs > 1);
}

function renderHintField(field, wrap) {
  const p = document.createElement("p");
  p.className = "field-hint";
  p.textContent = field.hint || "";
  wrap.appendChild(p);
}

function renderDropzoneField(field, blockId, values, disabled, wrap) {
  const zone = document.createElement("div");
  zone.className = "dropzone" + (disabled ? " is-disabled" : "");
  zone.tabIndex = disabled ? -1 : 0;

  const labelRow = document.createElement("div");
  labelRow.className = "dropzone-label";
  labelRow.textContent = field.dropLabel || "Drop files or browse";
  zone.appendChild(labelRow);

  const sub = document.createElement("div");
  sub.className = "dropzone-sub";
  const name = values[field.key] || "";
  sub.textContent = name ? `Selected: ${name}` : "No file selected";
  zone.appendChild(sub);

  const inp = document.createElement("input");
  inp.type = "file";
  inp.className = "dropzone-input";
  if (field.accept) inp.accept = field.accept;
  inp.disabled = disabled;
  inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0];
    values[field.key] = f ? f.name : "";
    sub.textContent = f ? `Selected: ${f.name}` : "No file selected";
  });

  zone.addEventListener("click", () => {
    if (!disabled) inp.click();
  });

  function highlight(on) {
    zone.classList.toggle("is-dragover", on);
  }

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    highlight(true);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    highlight(true);
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (!zone.contains(e.relatedTarget)) highlight(false);
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    highlight(false);
    if (disabled) return;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      values[field.key] = f.name;
      sub.textContent = `Selected: ${f.name}`;
    }
  });

  zone.appendChild(inp);
  wrap.appendChild(zone);
}

function renderSegmentedField(field, block, disabled, wrap) {
  const bar = document.createElement("div");
  bar.className = "field-segmented";
  bar.setAttribute("role", "tablist");
  (field.options || []).forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segmented-opt" + (String(block.values[field.key]) === opt.value ? " is-active" : "");
    b.textContent = opt.label;
    b.disabled = disabled;
    b.addEventListener("click", () => {
      if (disabled) return;
      block.values[field.key] = opt.value;
      renderAll();
    });
    bar.appendChild(b);
  });
  wrap.appendChild(bar);
}

async function fillMediaDeviceSelect(selectEl, kind) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const preserve = selectEl.value;
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind);
  } catch {
    return;
  }
  const def = document.createElement("option");
  def.value = "";
  def.textContent = kind === "audioinput" ? "Default microphone" : "Default camera";
  selectEl.innerHTML = "";
  selectEl.appendChild(def);
  devices.forEach((d) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `${kind.replace("input", "")} (${d.deviceId.slice(0, 6)}…)`;
    selectEl.appendChild(o);
  });
  if (preserve && [...selectEl.options].some((o) => o.value === preserve)) {
    selectEl.value = preserve;
  }
}

function renderMediaDeviceField(field, block, disabled, wrap) {
  const row = document.createElement("div");
  row.className = "media-device-row";

  const sel = document.createElement("select");
  sel.disabled = disabled;
  const kind = field.kind === "videoinput" ? "videoinput" : "audioinput";

  sel.addEventListener("change", () => {
    block.values[field.key] = sel.value;
  });

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "media-device-refresh";
  refresh.textContent = "Refresh";
  refresh.disabled = disabled;
  refresh.addEventListener("click", async () => {
    await fillMediaDeviceSelect(sel, kind);
    showToast("Device list refreshed.");
  });

  row.appendChild(sel);
  row.appendChild(refresh);
  wrap.appendChild(row);

  fillMediaDeviceSelect(sel, kind).then(() => {
    const v = block.values[field.key] || "";
    if (v && [...sel.options].some((o) => o.value === v)) {
      sel.value = v;
    } else {
      block.values[field.key] = sel.value || "";
    }
  });
}

function renderAudioRecordField(field, block, disabled, wrap) {
  const row = document.createElement("div");
  row.className = "audio-recorder";

  const status = document.createElement("div");
  status.className = "audio-recorder-status";
  status.textContent = block.values[field.key] ? `Stored: ${block.values[field.key]}` : "No recording yet";

  const btnRow = document.createElement("div");
  btnRow.className = "audio-recorder-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "audio-recorder-btn";
  start.textContent = "Record";
  start.disabled = disabled;

  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "audio-recorder-btn audio-recorder-secondary";
  stop.textContent = "Stop";
  stop.disabled = true;

  btnRow.appendChild(start);
  btnRow.appendChild(stop);
  row.appendChild(btnRow);
  row.appendChild(status);

  start.addEventListener("click", async () => {
    if (disabled) return;
    stopBlockRecorder(block.id);
    block.values[field.key] = "";
    status.textContent = "Requesting microphone…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      rec.addEventListener("dataavailable", (e) => {
        if (e.data.size) chunks.push(e.data);
      });
      rec.addEventListener("stop", () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length) {
          const ext = mime && mime.includes("webm") ? "webm" : "m4a";
          const name = `recording-${Date.now()}.${ext}`;
          block.values[field.key] = name;
          status.textContent = `Recorded: ${name} (blob kept locally for your backend)`;
        } else {
          status.textContent = "Recording empty — try again.";
        }
        blockMediaRecorders.delete(block.id);
        start.disabled = disabled;
        stop.disabled = true;
      });
      rec.start(200);
      blockMediaRecorders.set(block.id, { recorder: rec, chunks, statusEl: status });
      start.disabled = true;
      stop.disabled = false;
    } catch {
      status.textContent = "Microphone not available or denied.";
    }
  });

  stop.addEventListener("click", () => {
    const entry = blockMediaRecorders.get(block.id);
    if (entry && entry.recorder && entry.recorder.state !== "inactive") {
      try {
        entry.recorder.stop();
      } catch (_) {
        /* ignore */
      }
    }
  });

  wrap.appendChild(row);
}

function renderCameraPreviewField(field, block, disabled, wrap) {
  const mode = field.mode === "video" ? "video" : "image";

  const row = document.createElement("div");
  row.className = "camera-preview";

  const video = document.createElement("video");
  video.className = "camera-preview-video";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  row.appendChild(video);

  const img = document.createElement("img");
  img.className = "camera-preview-snap";
  img.alt = "Captured frame preview";
  img.hidden = true;
  row.appendChild(img);

  const btnRow = document.createElement("div");
  btnRow.className = "camera-preview-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "camera-preview-btn";
  start.textContent = mode === "video" ? "Open camera" : "Open camera";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "camera-preview-btn camera-preview-secondary";
  stop.textContent = "Stop";
  stop.disabled = true;
  const snap =
    mode === "image"
      ? (() => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "camera-preview-btn";
          b.textContent = "Capture still";
          b.disabled = true;
          return b;
        })()
      : null;

  btnRow.appendChild(start);
  if (snap) btnRow.appendChild(snap);
  btnRow.appendChild(stop);
  row.appendChild(btnRow);

  const note = document.createElement("p");
  note.className = "field-hint";
  note.textContent =
    mode === "video"
      ? "Preview only — no frames are uploaded from this mock-up."
      : "Capture stores a local preview only; a backend would sample frames for `image_url`.";
  row.appendChild(note);

  start.addEventListener("click", async () => {
    if (disabled) return;
    stopBlockMedia(block.id);
    img.hidden = true;
    const facingMode =
      block.values.facing === "environment" ? "environment" : field.facing === "environment" ? "environment" : "user";
    try {
      const vdev = mode === "video" ? block.values.cameraDevice : "";
      const videoConstraint =
        mode === "video" && vdev
          ? { deviceId: { exact: vdev } }
          : { facingMode: facingMode };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });
      blockMediaStreams.set(block.id, stream);
      video.srcObject = stream;
      await video.play();
      start.disabled = true;
      stop.disabled = false;
      if (snap) snap.disabled = false;
    } catch {
      note.textContent = "Camera permission denied or unavailable in this context.";
    }
  });

  stop.addEventListener("click", () => {
    stopBlockMedia(block.id);
    video.srcObject = null;
    start.disabled = disabled;
    stop.disabled = true;
    if (snap) snap.disabled = true;
  });

  if (snap) {
    snap.addEventListener("click", () => {
      if (!video.videoWidth) return;
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0);
      try {
        img.src = c.toDataURL("image/jpeg", 0.85);
        img.hidden = false;
      } catch {
        note.textContent = "Could not snapshot (canvas tainted or unsupported).";
      }
    });
  }

  wrap.appendChild(row);
}

function renderModuleCard(block, container) {
  const def = findDef(block.role, block.typeId);
  if (!def) return;

  const card = document.createElement("article");
  card.className =
    "module-card role-" +
    block.role +
    (def.live ? " live" : "");
  card.dataset.blockId = block.id;

  const head = document.createElement("div");
  head.className = "module-card-head";
  head.innerHTML = `
    <span class="module-card-code">${escapeHtml(def.code)}</span>
    <span class="module-card-title">${escapeHtml(def.title)}</span>
  `;
  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "module-card-remove";
  rm.setAttribute("aria-label", `Remove ${def.title}`);
  rm.textContent = "×";
  rm.disabled = state.running;
  rm.classList.toggle("is-disabled", state.running);
  rm.addEventListener("click", () => removeBlock(block.id));
  head.appendChild(rm);
  card.appendChild(head);

  const sk = formSchemaKey(block.role, block.typeId);
  const schema = FORM_SCHEMA[sk];

  if (schema && schema.apiMapping) {
    const mapEl = document.createElement("p");
    mapEl.className = "module-api-mapping";
    mapEl.innerHTML = `<span class="module-api-mapping-k">API note</span> ${escapeHtml(schema.apiMapping)}`;
    card.appendChild(mapEl);
  }

  if (!schema || !schema.fields.length) {
    const p = document.createElement("p");
    p.className = "module-card-fallback";
    p.textContent = "No fields for this type (mock).";
    card.appendChild(p);
    appendRunPreviewRow(block, card);
    container.appendChild(card);
    return;
  }

  const form = document.createElement("div");
  form.className = "module-card-fields";

  const locked = state.running;

  schema.fields.forEach((field, fidx) => {
    if (field.showWhen) {
      const cur = block.values[field.showWhen.key];
      if (cur !== field.showWhen.is) return;
    }

    const wrap = document.createElement("div");
    wrap.className = "field field-compact";
    const fid = `f-${block.id}-n${fidx}`;
    let val = block.values[field.key];
    if (val === undefined || val === null) val = "";

    if (field.type === "hint") {
      renderHintField(field, wrap);
      form.appendChild(wrap);
      return;
    }

    if (field.label) {
      const lab = document.createElement("label");
      lab.htmlFor = fid;
      lab.textContent = field.label;
      wrap.appendChild(lab);
    }

    if (field.type === "segmented") {
      renderSegmentedField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }
    if (field.type === "media_device") {
      renderMediaDeviceField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }
    if (field.type === "audio_record") {
      renderAudioRecordField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }

    if (field.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.id = fid;
      ta.disabled = locked;
      ta.rows = field.rows ?? 2;
      if (field.placeholder) ta.placeholder = field.placeholder;
      ta.value = String(val);
      ta.addEventListener("input", () => {
        block.values[field.key] = ta.value;
      });
      wrap.appendChild(ta);
    } else if (field.type === "select" && field.options) {
      const sel = document.createElement("select");
      sel.id = fid;
      sel.disabled = locked;
      field.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      const strVal = String(val);
      if (field.options.some((o) => o.value === strVal)) sel.value = strVal;
      else {
        sel.selectedIndex = 0;
        block.values[field.key] = sel.value;
      }
      sel.addEventListener("change", () => {
        block.values[field.key] = sel.value;
        if (field.key === "source" && block.role === "input" && block.typeId === "video-live") {
          renderAll();
        }
      });
      wrap.appendChild(sel);
    } else if (field.type === "dropzone") {
      renderDropzoneField(field, block.id, block.values, locked, wrap);
    } else if (field.type === "camera_preview") {
      renderCameraPreviewField(field, block, locked, wrap);
    } else if (field.type === "file") {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.id = fid;
      inp.disabled = locked;
      if (field.accept) inp.accept = field.accept;
      inp.addEventListener("change", () => {
        const f = inp.files && inp.files[0];
        block.values[field.key] = f ? f.name : "";
      });
      wrap.appendChild(inp);
    } else {
      const inp = document.createElement("input");
      inp.id = fid;
      inp.disabled = locked;
      inp.type = field.type === "number" ? "number" : "text";
      if (field.placeholder) inp.placeholder = field.placeholder;
      inp.value = String(val);
      inp.addEventListener("input", () => {
        block.values[field.key] = inp.value;
      });
      wrap.appendChild(inp);
    }

    form.appendChild(wrap);
  });

  card.appendChild(form);
  appendRunPreviewRow(block, card);
  container.appendChild(card);
}

function sendInputsBatch() {
  const inputs = state.blocks.filter((b) => b.role === "input");
  if (!inputs.length) {
    showToast("No input modules — add some from the library.");
    return;
  }
  showToast("Inputs submitted (mock). Your backend would send the current input state together.");
  if (state.running) {
    applyRunTick();
  }
}

function appendRunPreviewRow(block, card) {
  if (block.role !== "output") return;

  const wrap = document.createElement("div");
  wrap.className = "field field-compact field-run-preview";
  const lab = document.createElement("label");
  lab.textContent =
    block.typeId === "text" ? "Last run (mock)" : "Last run note (mock)";
  wrap.appendChild(lab);

  const ta = document.createElement("textarea");
  ta.className = "run-preview-inline";
  ta.readOnly = true;
  ta.setAttribute("data-run-preview-block", block.id);
  ta.rows = block.typeId === "text" ? 5 : 2;
  ta.placeholder =
    block.typeId === "text"
      ? "Run the pipeline to show a fabricated reply here."
      : "Run to refresh mock asset / stream summary.";
  ta.value = block.runPreview || "";
  wrap.appendChild(ta);
  card.appendChild(wrap);
}

function renderEditorSection(role, list, root) {
  const section = document.createElement("section");
  section.className = "editor-section";

  const details = document.createElement("details");
  details.className = "editor-section-details";
  details.open = state.sectionOpen[role];
  details.addEventListener("toggle", () => {
    state.sectionOpen[role] = details.open;
  });

  const summary = document.createElement("summary");
  summary.className = "editor-section-summary";
  const title = ROLE_LABEL[role];
  summary.innerHTML = `<span class="editor-section-title">${escapeHtml(title)}</span><span class="editor-section-badge">${list.length}</span>`;

  const grid = document.createElement("div");
  grid.className = "editor-grid";

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "editor-grid-empty";
    empty.textContent = `No ${title.toLowerCase()} modules — add from the library.`;
    grid.appendChild(empty);
  } else {
    list.forEach((block) => renderModuleCard(block, grid));
  }

  details.appendChild(summary);
  details.appendChild(grid);
  if (role === "input" && list.length) {
    const bar = document.createElement("div");
    bar.className = "input-section-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "input-send-btn";
    btn.textContent = "Send inputs";
    btn.disabled = state.running;
    btn.addEventListener("click", () => sendInputsBatch());
    const hint = document.createElement("p");
    hint.className = "input-section-actions-hint";
    hint.textContent =
      "Push updated inputs together (e.g. new text + image). Mock only — connect your backend.";
    bar.appendChild(btn);
    bar.appendChild(hint);
    details.appendChild(bar);
  }
  section.appendChild(details);
  root.appendChild(section);
}

function renderModuleEditor() {
  const root = document.getElementById("module-editor");
  root.innerHTML = "";

  if (!state.blocks.length) {
    const wrap = document.createElement("div");
    wrap.className = "module-editor-empty";
    wrap.innerHTML =
      "<p>Pipeline is empty.</p><p class=\"hint\">Add inputs, processing, and outputs from the library on the left.</p>";
    root.appendChild(wrap);
    return;
  }

  const inputs = state.blocks.filter((b) => b.role === "input");
  const procs = state.blocks.filter((b) => b.role === "process");
  const outs = state.blocks.filter((b) => b.role === "output");

  renderEditorSection("input", inputs, root);
  renderEditorSection("process", procs, root);
  renderEditorSection("output", outs, root);
}

let mockRunInterval = null;

function injectRunPreviewIntoOutputs(previewText) {
  const textTargets = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  if (textTargets.length === 1) {
    textTargets[0].runPreview = previewText.trim();
    return;
  }
  if (textTargets.length > 1) {
    const share =
      previewText.trim().split("\n\n")[0] +
      "\n\n(mock: multiple text outputs — showing same preview in each for now)";
    textTargets.forEach((b) => {
      b.runPreview = share;
    });
    return;
  }
  state.blocks
    .filter((b) => b.role === "output")
    .forEach((b) => {
      b.runPreview = "[mock] Non-text output — summary appears in Last run while the loop is active.";
    });
}

function syncOutputPreviewFieldsFromState() {
  state.blocks
    .filter((b) => b.role === "output")
    .forEach((b) => {
      const el = document.querySelector(`textarea[data-run-preview-block="${b.id}"]`);
      if (el) el.value = b.runPreview || "";
    });
}

function updateRunChrome() {
  const fab = document.getElementById("fab-run");
  if (!fab) return;
  const label = document.getElementById("fab-run-label");
  const play = fab.querySelector(".fab-run-icon-play");
  const busy = fab.querySelector(".fab-run-icon-busy");
  const running = state.running;
  fab.classList.toggle("is-running", running);
  if (label) label.textContent = running ? "Stop" : "Run";
  fab.setAttribute("aria-pressed", running ? "true" : "false");
  fab.setAttribute("aria-label", running ? "Stop mock pipeline run" : "Start mock pipeline run");
  if (play) {
    play.style.display = running ? "none" : "";
    play.hidden = running;
  }
  if (busy) {
    busy.style.display = running ? "" : "none";
    busy.hidden = !running;
  }
  document.body.classList.toggle("pipeline-running", running);
  const st = document.getElementById("status-bar-text");
  if (st) {
    st.textContent = running
      ? "Mock run active — edit fields in place; library locked. Press Stop or Esc to end."
      : "Run starts a continuous mock loop (no popup). Outputs refresh on a timer; stop anytime. No real models.";
  }
}

function lockPalette(locked) {
  const pal = document.getElementById("palette");
  if (pal) pal.classList.toggle("palette-locked", locked);
  const clearBtn = document.getElementById("btn-clear");
  if (clearBtn) clearBtn.disabled = locked;
}

function applyRunTick() {
  injectRunPreviewIntoOutputs(buildMockPreview(state.blocks));
  syncOutputPreviewFieldsFromState();
}

function startMockRun() {
  if (state.running || !state.blocks.length) return;
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  state.running = true;
  updateRunChrome();
  lockPalette(true);
  renderAll();
  applyRunTick();
  mockRunInterval = setInterval(applyRunTick, 2600);
}

function stopMockRun() {
  if (!state.running) return;
  state.running = false;
  if (mockRunInterval) {
    clearInterval(mockRunInterval);
    mockRunInterval = null;
  }
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  updateRunChrome();
  lockPalette(false);
  renderAll();
}

function renderAll() {
  if (!state.blocks.length && state.running) {
    stopMockRun();
  }
  renderMeta();
  renderModuleEditor();
}

function applyPreset(presetId, silent) {
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  state.blocks = [];

  const presets = {
    "text-prompt": {
      blocks: [
        { role: "input", typeId: "text" },
        { role: "process", typeId: "instruction" },
        { role: "output", typeId: "text" },
      ],
    },
    vision: {
      blocks: [
        { role: "input", typeId: "image" },
        { role: "input", typeId: "text" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "vector-db" },
        { role: "output", typeId: "text" },
      ],
    },
    "live-audio": {
      blocks: [
        { role: "input", typeId: "audio-live" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "tooling" },
        { role: "output", typeId: "text" },
        { role: "output", typeId: "audio-live" },
      ],
    },
    "multimodal-out": {
      blocks: [
        { role: "input", typeId: "text" },
        { role: "input", typeId: "video-rec" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "skills" },
        { role: "output", typeId: "text" },
        { role: "output", typeId: "image" },
      ],
    },
  };

  const p = presets[presetId];
  if (!p) return;

  p.blocks.forEach((b) => {
    state.blocks.push(createBlock(b.role, b.typeId));
  });

  renderAll();
  if (!silent) {
    showToast("Example pipeline loaded — forms are editable; nothing executes for real.");
  }
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("visible"), 3200);
}

function buildMockPreview(blocks) {
  const lines = [];
  const textOut = blocks.some((b) => b.role === "output" && b.typeId === "text");
  const textIn = blocks.filter((b) => b.role === "input" && b.typeId === "text");
  const snippet = textIn.length
    ? String(textIn[0].values.content || "")
        .trim()
        .slice(0, 220)
    : "";

  const instr = blocks.find((b) => b.role === "process" && b.typeId === "instruction");
  const userInstr = instr ? String(instr.values.user || "").trim().slice(0, 160) : "";

  if (textOut) {
    lines.push("[assistant · mock]");
    lines.push("");
    if (snippet) {
      lines.push("Acknowledged input (excerpt):");
      lines.push(snippet + (String(textIn[0].values.content || "").length > 220 ? "…" : ""));
      lines.push("");
    }
    if (userInstr) {
      lines.push("Task (instruction module, excerpt):");
      lines.push(userInstr + (String(instr.values.user || "").length > 160 ? "…" : ""));
      lines.push("");
    }
    if (instr) {
      const mi = String(instr.values.maxIterations || "").trim();
      const swFull = String(instr.values.stopWhen || "");
      const sw = swFull.trim().slice(0, 120);
      if (mi || sw) {
        lines.push("Retry / loop (instruction module):");
        if (mi) lines.push(`- max iterations: ${mi}`);
        if (sw) lines.push(`- stop when: ${sw}${swFull.length > 120 ? "…" : ""}`);
        lines.push("");
      }
    }
    lines.push(
      "Here is a fabricated reply. A real run would use your form values, retrieval, and tools end-to-end."
    );
    lines.push("");
    lines.push("- Summary: simulated pass over the pipeline.");
    lines.push("- Confidence: illustrative only (no model).");
  } else if (blocks.some((b) => b.role === "output")) {
    lines.push(
      "[run preview · mock]\n\nThis pipeline has non-text outputs only. A full runner would show waveforms, image tiles, or stream panes here."
    );
  } else {
    lines.push(
      "[run preview · mock]\n\nNo output modules — add at least one output to see a richer preview stub."
    );
  }

  lines.push("");
  lines.push("— Fabricated telemetry —");
  lines.push(`session: mock-${Math.random().toString(36).slice(2, 10)}`);
  lines.push(`latency total: ${(180 + blocks.length * 95 + Math.floor(Math.random() * 120)).toFixed(0)} ms (fake)`);
  return lines.join("\n");
}

function init() {
  renderPalette();

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset"), false));
  });

  document.getElementById("fab-run").addEventListener("click", () => {
    if (state.blocks.length === 0) {
      showToast("Pipeline is empty — add modules before a run would make sense.");
      return;
    }
    if (state.running) {
      stopMockRun();
    } else {
      startMockRun();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.running) {
      e.preventDefault();
      stopMockRun();
    }
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    state.blocks.forEach((b) => stopBlockCapture(b.id));
    state.blocks = [];
    renderAll();
    showToast("Pipeline cleared.");
  });

  applyPreset("text-prompt", true);
  updateRunChrome();

  if (location.hash === "#demo-shot") {
    injectRunPreviewIntoOutputs(buildMockPreview(state.blocks));
    renderAll();
  }
}

document.addEventListener("DOMContentLoaded", init);
