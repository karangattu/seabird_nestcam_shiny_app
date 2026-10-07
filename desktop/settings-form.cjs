const textFields = [
  {
    section: "Synology File Station",
    fields: [
      {
        name: "SYNOLOGY_BASE_URL",
        label: "NAS URL",
        placeholder: "http://192.168.12.166:5000",
        required: true,
        help: "Use the NAS address, such as http://192.168.12.166:5000 or https://192.168.12.166:5001.",
      },
      {
        name: "SYNOLOGY_PORT",
        label: "NAS port override",
        placeholder: "Leave blank when the URL already includes :5000",
        help: "If the NAS URL includes a port, leave this blank. Otherwise, enter the port from your administrator.",
      },
      {
        name: "SYNOLOGY_USERNAME",
        label: "NAS username",
        help: "Use an account with read access to the camera folder. Do not use a personal admin account.",
        required: true,
      },
      {
        name: "SYNOLOGY_PASSWORD",
        label: "NAS password",
        help: "Enter the password for your NAS account.",
        inputType: "password",
        required: true,
      },
      {
        name: "SYNOLOGY_DEFAULT_FOLDER",
        label: "Default image folder",
        placeholder: "/volume1/camera-folder",
        required: true,
        help: "Enter the camera folder path from your administrator, such as /volume1/camera-folder.",
      },
      {
        name: "SYNOLOGY_ALLOWED_FOLDER_PREFIX",
        label: "Allowed folder prefix",
        defaultValue: "/volume1",
        help: "This limits which folders you can browse. Use the parent path that contains your camera folders, such as /volume1.",
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
      form { margin-top: 20px; display: grid; gap: 18px; }
      fieldset { margin: 0; padding: 18px; border: 1px solid #d8dde6; border-radius: 8px; background: #fff; display: grid; gap: 14px; }
      legend { padding: 0 6px; font-weight: 700; color: #28313d; }
      label, .field { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #28313d; }
      input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cbd3df; border-radius: 6px; padding: 9px 10px; font: inherit; font-size: 13px; background: #fff; color: #17202a; }
      textarea { min-height: 88px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      input:focus, textarea:focus { outline: 2px solid #2f6fed; outline-offset: 1px; border-color: #2f6fed; }
      .intro { margin-top: 12px; }
      .help { font-size: 12px; font-weight: 400; color: #56616f; }
      .help summary { width: fit-content; cursor: pointer; color: #1e5fcf; }
      .help summary:focus-visible { outline: 2px solid #2f6fed; outline-offset: 3px; }
      .help p { margin-top: 6px; font-size: 12px; }
      .setup-help { padding: 12px 16px; border: 1px solid #d8dde6; border-radius: 8px; background: #fff; }
      .setup-help p + p { margin-top: 8px; }
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
      <p>A NAS is a network storage device. Enter its address, account details, and camera folder. Select Save and Start to open the app.</p>
      <p class="intro">For a private NAS address, connect to the same local network or VPN as the NAS.</p>
      <form id="settings-form">
        ${textFields.map((section) => renderSection(section, settings)).join("")}
        <fieldset>
          <legend>Connection and saved settings</legend>
          <label class="check">
            <input type="checkbox" name="SYNOLOGY_VERIFY_SSL" aria-describedby="SYNOLOGY_VERIFY_SSL-help" value="true" ${settings.SYNOLOGY_VERIFY_SSL === "false" ? "" : "checked"} />
            Verify HTTPS certificates
          </label>
          ${renderHelp("SYNOLOGY_VERIFY_SSL", "HTTPS certificates", "Keep this enabled to make sure that the HTTPS connection uses a trusted certificate. Turn it off only if your administrator requires it. This disables the certificate check.")}
          <label class="check">
            <input type="checkbox" name="saveSettings" aria-describedby="saveSettings-help" value="true" checked />
            Save these settings on this computer
          </label>
          <div class="hint">Saved settings include your NAS password.</div>
          ${renderHelp("saveSettings", "Saved settings", "The app stores these values in your local app data folder and reuses them at startup. If you clear this box, these values apply only while the app runs. Previously saved values stay on this computer.")}
        </fieldset>
        <details class="help setup-help">
          <summary>App help</summary>
          <p>The installer includes everything needed to run the app. Your database connection is set during the build.</p>
          <p>To change these values later, open Server &gt; Settings...</p>
          <p>Keep the app open while you annotate. To stop its server, close the app window or select Server &gt; Stop Server and Quit.</p>
          <p>If the server fails to start, open Server &gt; Open Server Log. Send server.log to the project maintainer.</p>
          <p>The error page shows recent log lines and the log path. Select Server &gt; Open Logs Folder to find the file.</p>
        </details>
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
  const settingVal = settings[field.name];
  const value =
    typeof settingVal === "string" && settingVal.trim().length > 0
      ? settingVal
      : (field.defaultValue ?? "");
  const required = field.required ? " required" : "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const helpId = `${field.name}-help`;
  const describedBy = field.help ? ` aria-describedby="${helpId}"` : "";
  const help = field.help ? renderHelp(field.name, field.label, field.help) : "";
  const input = field.type === "textarea"
    ? `<textarea id="${field.name}" name="${field.name}"${describedBy}${placeholder}${required}>${escapeHtml(value)}</textarea>`
    : `<input id="${field.name}" name="${field.name}" type="${field.inputType ?? "text"}" value="${escapeHtml(value)}"${describedBy}${placeholder}${required} />`;

  return `<div class="field"><label for="${field.name}">${escapeHtml(field.label)}</label>${input}${help}</div>`;
}

function renderHelp(name, label, help) {
  return `<details class="help"><summary aria-label="Help for ${escapeHtml(label)}">ⓘ Help</summary><p id="${name}-help">${escapeHtml(help)}</p></details>`;
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
