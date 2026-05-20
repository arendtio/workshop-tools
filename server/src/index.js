import path from "path";
import { createApp, resolveRepoRoot } from "./app.js";
import { ensureOpenAiApiKeyLoaded } from "./openaiConfig.js";

ensureOpenAiApiKeyLoaded();

const PORT = Number(process.env.PORT || 8080);
const repoRoot = resolveRepoRoot();
const staticRoot = path.join(repoRoot, "workshop-sandbox");

const app = createApp({ staticRoot });
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`workshop-server listening on http://0.0.0.0:${PORT} (static: ${staticRoot})`);
});
