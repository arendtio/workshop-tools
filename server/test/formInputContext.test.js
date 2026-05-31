import { describe, expect, it } from "vitest";
import { buildFormBootstrapUserText, buildFormInputInstructions } from "../src/formInputContext.js";

describe("formInputContext", () => {
  it("includes participant values and tooling hint in bootstrap text", () => {
    const text = buildFormBootstrapUserText(
      {
        id: "f1",
        formItems: [
          { typ: "text", label: "Vorname" },
          { typ: "text", label: "Nachname" },
        ],
        formParticipantValues: { Vorname: "Maria", Nachname: "Müller" },
      },
      "Input · form (f1)",
    );
    expect(text).toContain("Maria");
    expect(text).toContain("Müller");
    expect(text).toContain("first_name");
    expect(text).toContain("last_name");
  });

  it("adds form section to full instructions", () => {
    const text = buildFormInputInstructions({
      blocks: [
        {
          role: "input",
          typeId: "form",
          id: "in-form",
          formParticipantValues: { Vorname: "Ben", Nachname: "Demo" },
        },
      ],
    });
    expect(text).toContain("input form values");
    expect(text).toContain("Ben");
    expect(text).toContain("first_name");
  });
});
