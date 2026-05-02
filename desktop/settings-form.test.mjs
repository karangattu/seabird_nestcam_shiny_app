import { describe, expect, test } from "vitest";
import settingsForm from "./settings-form.cjs";

const { createSettingsHtml } = settingsForm;

describe("desktop settings form", () => {
  test("renders the first-run settings fields with saved values", () => {
    const html = createSettingsHtml({
      settings: {
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
      },
      canCancel: false,
    });

    expect(html).toContain('name="SYNOLOGY_BASE_URL"');
    expect(html).toContain('value="http://192.168.12.166:5000"');
    expect(html).toContain('name="GOOGLE_PRIVATE_KEY"');
    expect(html).toContain('name="saveSettings"');
    expect(html).not.toContain('data-action="cancel"');
  });

  test("escapes values before rendering them in fields", () => {
    const html = createSettingsHtml({
      settings: { SYNOLOGY_USERNAME: 'local"user<script>' },
      canCancel: true,
    });

    expect(html).toContain('local&quot;user&lt;script&gt;');
    expect(html).toContain('data-action="cancel"');
    expect(html).not.toContain('local"user<script>');
  });
});
