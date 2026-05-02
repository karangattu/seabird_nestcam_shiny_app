const textFields = [
  {
    section: "Google Sheets",
    fields: [
      {
        name: "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        label: "Service account email",
        placeholder: "nestcam-bot@project.iam.gserviceaccount.com",
        help: "Use this with the private key, or paste the full JSON key below instead.",
      },
      {
        name: "GOOGLE_PRIVATE_KEY",
        label: "Private key",
        type: "textarea",
        placeholder: "-----BEGIN PRIVATE KEY-----",
        help: "Keep the BEGIN and END lines if you paste only the private key.",
      },
      {
        name: "GOOGLE_SERVICE_ACCOUNT_JSON",
        label: "Service account JSON",
        type: "textarea",
        placeholder: '{"client_email":"...","private_key":"..."}',
        help: "Paste the complete downloaded JSON key here if that is easier.",
      },
      {
        name: "GOOGLE_SHEETS_SPREADSHEET_ID",
        label: "Shared spreadsheet ID",
        placeholder: "Use this when both tabs are in one spreadsheet",
        help: "This is the long ID in the Google Sheets URL.",
      },
      {
        name: "GOOGLE_ASSIGNMENTS_SPREADSHEET_ID",
        label: "Assignments spreadsheet ID",
      },
      {
        name: "GOOGLE_ANNOTATIONS_SPREADSHEET_ID",
        label: "Annotations spreadsheet ID",
      },
      {
        name: "GOOGLE_ASSIGNMENTS_SHEET_NAME",
        label: "Assignments sheet name",
        defaultValue: "Sheet1",
      },
      {
        name: "GOOGLE_ANNOTATIONS_SHEET_NAME",
        label: "Annotations sheet name",
        defaultValue: "Sheet1",
      },
    ],
  },
  {
    section: "Synology File Station",
    fields: [
      {
        name: "SYNOLOGY_BASE_URL",
        label: "NAS URL",
        placeholder: "http://192.168.12.166:5000",
        required: true,
        help: "Use the address provided for the NAS. Private addresses require the same LAN or VPN.",
      },
      {
        name: "SYNOLOGY_PORT",
        label: "NAS port override",
        placeholder: "Leave blank when the URL already includes :5000",
        help: "Most users can leave this blank when the URL already has a port.",
      },
      {
        name: "SYNOLOGY_USERNAME",
        label: "NAS username",
        required: true,
      },
      {
        name: "SYNOLOGY_PASSWORD",
        label: "NAS password",
        inputType: "password",
        required: true,
      },
      {
        name: "SYNOLOGY_DEFAULT_FOLDER",
        label: "Default image folder",
        placeholder: "/volume1/camera-folder",
        required: true,
        help: "Start with the shared camera folder path you were given.",
      },
      {
        name: "SYNOLOGY_ALLOWED_FOLDER_PREFIX",
        label: "Allowed folder prefix",
        defaultValue: "/volume1",
        help: "This limits browsing to the approved NAS folder area.",
      },
    ],
  },
];

function createSettingsHtml({ settings = {}, canCancel = false }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>App Settings</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fa; color: #17202a; }
      main { padding: 24px; }
      h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.2; }
      p { margin: 0; color: #56616f; font-size: 13px; line-height: 1.45; }
      h2 { margin: 0; font-size: 15px; line-height: 1.25; color: #28313d; }
      ul { margin: 0; padding-left: 20px; color: #4c5968; font-size: 13px; line-height: 1.45; }
      form { margin-top: 20px; display: grid; gap: 18px; }
      fieldset { margin: 0; padding: 18px; border: 1px solid #d8dde6; border-radius: 8px; background: #fff; display: grid; gap: 14px; }
      legend { padding: 0 6px; font-weight: 700; color: #28313d; }
      label { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #28313d; }
      input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cbd3df; border-radius: 6px; padding: 9px 10px; font: inherit; font-size: 13px; background: #fff; color: #17202a; }
      textarea { min-height: 88px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      input:focus, textarea:focus { outline: 2px solid #2f6fed; outline-offset: 1px; border-color: #2f6fed; }
      .intro { margin-top: 16px; padding: 16px 18px; border: 1px solid #d8dde6; border-radius: 8px; background: #fff; display: grid; gap: 8px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .check { display: flex; align-items: center; gap: 9px; font-weight: 650; }
      .check input { width: 16px; height: 16px; }
      .hint { font-size: 12px; color: #667180; font-weight: 500; }
      .actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 0 0; background: linear-gradient(180deg, rgba(247, 248, 250, 0), #f7f8fa 35%); }
      button { border: 1px solid #b8c1cf; border-radius: 6px; padding: 9px 14px; font: inherit; font-size: 13px; font-weight: 700; background: #fff; color: #17202a; cursor: pointer; }
      button[type="submit"] { border-color: #1e5fcf; background: #1e5fcf; color: #fff; }
      button:disabled { opacity: 0.65; cursor: progress; }
      @media (max-width: 720px) { .row { grid-template-columns: 1fr; } main { padding: 18px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>App Settings</h1>
      <p>Enter the Synology and Google Sheets values for this computer. Saved values stay on this machine and are used each time the app opens.</p>
      <div class="intro" aria-label="Before you start">
        <h2>Before You Start</h2>
        <ul>
          <li>Have the NAS address, folder path, Google spreadsheet ID, and service account key ready.</li>
          <li>This computer must be on the same LAN or VPN as the NAS when using a private NAS address.</li>
          <li>If you are unsure about a value, leave this window open and ask the project administrator.</li>
        </ul>
      </div>
      <form id="settings-form">
        ${textFields.map((section) => renderSection(section, settings)).join("")}
        <fieldset>
          <legend>Local Storage</legend>
          <label class="check">
            <input type="checkbox" name="SYNOLOGY_VERIFY_SSL" value="true" ${settings.SYNOLOGY_VERIFY_SSL === "false" ? "" : "checked"} />
            Verify HTTPS certificates
          </label>
          <label class="check">
            <input type="checkbox" name="saveSettings" value="true" checked />
            Save these settings on this computer
          </label>
          <div class="hint">Use limited Synology and Google accounts. Saved values are stored in this user's app data folder.</div>
        </fieldset>
        <div class="actions">
          ${canCancel ? '<button type="button" id="cancel-button" data-action="cancel">Cancel</button>' : ""}
          <button type="submit">Save and Start</button>
        </div>
      </form>
    </main>
    <script>
      const form = document.querySelector("#settings-form");
      const submitButton = form.querySelector('button[type="submit"]');
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        const formData = new FormData(form);
        const settings = {};
        for (const [key, value] of formData.entries()) {
          if (key !== "saveSettings") {
            settings[key] = String(value);
          }
        }
        settings.SYNOLOGY_VERIFY_SSL = formData.has("SYNOLOGY_VERIFY_SSL") ? "true" : "false";
        const response = await window.seabirdSettings.submit({
          settings,
          saveSettings: formData.has("saveSettings"),
        });
        if (!response.ok) {
          submitButton.disabled = false;
          alert(response.message || "Could not save settings.");
        }
      });
      ${canCancel ? 'document.querySelector("#cancel-button").addEventListener("click", () => window.seabirdSettings.cancel());' : ""}
    </script>
  </body>
</html>`;
}

function renderSection(section, settings) {
  return `<fieldset>
    <legend>${escapeHtml(section.section)}</legend>
    ${renderFieldRows(section.fields, settings)}
  </fieldset>`;
}

function renderFieldRows(fields, settings) {
  const rows = [];

  for (let index = 0; index < fields.length; index += 2) {
    rows.push(`<div class="row">${fields.slice(index, index + 2).map((field) => renderField(field, settings)).join("")}</div>`);
  }

  return rows.join("");
}

function renderField(field, settings) {
  const value = settings[field.name] ?? field.defaultValue ?? "";
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const help = field.help ? `<span class="hint">${escapeHtml(field.help)}</span>` : "";

  if (field.type === "textarea") {
    return `<label>${escapeHtml(field.label)}${help}<textarea name="${field.name}"${placeholder}${required}>${escapeHtml(value)}</textarea></label>`;
  }

  return `<label>${escapeHtml(field.label)}${help}<input name="${field.name}" type="${field.inputType ?? "text"}" value="${escapeHtml(value)}"${placeholder}${required} /></label>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

module.exports = { createSettingsHtml };
