/**
 * Form input values from the workbench → model instructions & bootstrap text.
 */

/**
 * @param {unknown} items
 */
function serializeFormBlueprint(items) {
  if (!Array.isArray(items) || !items.length) return "(no fields defined)";
  return items
    .map((it, i) => {
      const row = /** @type {{ typ?: string, label?: string, options?: string }} */ (it);
      const typ = String(row.typ || "text");
      const label = String(row.label || `field_${i}`);
      const opts = String(row.options || "").trim();
      const extra = typ === "radio" || typ === "select" ? ` options: ${opts || "—"}` : "";
      return `${i + 1}. [${typ}] ${label}${extra}`;
    })
    .join("\n");
}

/**
 * @param {Record<string, string>} values
 */
function toolingFilterHintFromFormValues(values) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  /** @type {Record<string, string>} */
  const byNorm = {};
  for (const [k, v] of Object.entries(values)) {
    byNorm[norm(k)] = String(v).trim();
  }
  const first =
    byNorm["vorname"] || byNorm["first name"] || byNorm["firstname"] || byNorm["first_name"] || "";
  const last =
    byNorm["nachname"] || byNorm["last name"] || byNorm["lastname"] || byNorm["last_name"] || "";
  if (first && last) {
    return (
      `For **customers** tooling search, use \`workshop_mock_tooling_call\` with ` +
      `\`operation: "list"\`, \`filter: { "first_name": "${first}", "last_name": "${last}" }\` ` +
      `(aliases \`vorname\` / \`nachname\` also work). Customer id field is \`id\` (cust-…), not a separate number.`
    );
  }
  const full = byNorm["name"] || byNorm["vollname"] || byNorm["kunde"];
  if (full) {
    return (
      `For **customers** tooling search, try \`filter: { "name_contains": "${full}" }\` ` +
      `or split into first_name + last_name if the form has separate fields.`
    );
  }
  return "";
}

/**
 * @param {{ id?: string, typeId?: string, formItems?: unknown[], formParticipantValues?: Record<string, string> }} block
 * @param {string} label
 */
export function buildFormBootstrapUserText(block, label) {
  const blueprint = serializeFormBlueprint(block.formItems);
  const values =
    block.formParticipantValues && typeof block.formParticipantValues === "object"
      ? block.formParticipantValues
      : {};
  const valueLines = Object.entries(values)
    .filter(([, v]) => String(v).trim() !== "")
    .map(([k, v]) => `- **${k}**: ${String(v).trim()}`);
  const toolingHint = toolingFilterHintFromFormValues(values);

  let text =
    `${label} — participant form (workbench)\n\n` +
    `Field blueprint:\n${blueprint}\n\n` +
    (valueLines.length
      ? `**Current values entered before Run** (use these — do not invent different names):\n${valueLines.join("\n")}\n`
      : "**No values captured** — ask the participant to fill the form in the workbench, then Run again or use Send inputs.\n");

  if (toolingHint) {
    text += `\n${toolingHint}\n`;
  }
  return text;
}

/**
 * @param {{ blocks: { role: string, typeId: string, id?: string, formItems?: unknown[], formParticipantValues?: Record<string, string> }[] }} plan
 */
export function buildFormInputInstructions(plan) {
  const forms = plan.blocks.filter((b) => b.role === "input" && b.typeId === "form");
  if (!forms.length) return "";

  const lines = [
    "## Workshop: input form values (workbench)",
    "",
    "The participant filled these fields **before this run**. Treat them as ground truth for lookups (e.g. customer search).",
    "",
  ];

  for (const b of forms) {
    const id = String(b.id || "").trim() || "(no id)";
    const values =
      b.formParticipantValues && typeof b.formParticipantValues === "object"
        ? b.formParticipantValues
        : {};
    lines.push(`### Form block \`${id}\``);
    const entries = Object.entries(values).filter(([, v]) => String(v).trim() !== "");
    if (!entries.length) {
      lines.push("(No values captured at Run — form may be empty.)");
    } else {
      for (const [k, v] of entries) {
        lines.push(`- **${k}**: ${String(v).trim()}`);
      }
    }
    const hint = toolingFilterHintFromFormValues(values);
    if (hint) lines.push("", hint);
    lines.push("");
  }

  return lines.join("\n").trim();
}
