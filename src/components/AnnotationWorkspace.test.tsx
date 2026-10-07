import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AnnotationWorkspace } from "./AnnotationWorkspace";
import type { AnnotationRecord } from "@/lib/annotation-data";

import { realtime } from "@/test/realtime";

vi.mock("@/lib/supabase", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase")>();
  const { mockRealtime } = await import("@/test/realtime");
  return { ...original, supabase: mockRealtime(original.supabase) };
});
beforeEach(() => realtime.reset());

const storedAnnotation: AnnotationRecord = {
  "Start Filename": "image-001.jpg",
  "End Filename": "image-002.jpg",
  Site: "Location 1",
  Camera: "LOC001",
  "Retrieval Date": "2026-04-24",
  Type: "Seabird",
  Species: "Black-footed Albatross (Phoebastria nigripes)",
  Behavior: "Cleaning",
  "Sequence Start Time": "2026-04-24 10:00:00",
  "Sequence End Time": "2026-04-24 10:01:00",
  "Is Single Image": "false",
  "Reviewer Name": "KG",
  Notes: "Initial note",
};

describe("AnnotationWorkspace", () => {
  test("shows uploaded images in contain mode so the whole frame is visible", async () => {
    const user = userEvent.setup();
    render(<AnnotationWorkspace />);

    const file = new File(["image"], "wide-frame.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/add nest camera images/i), file);

    const image = await screen.findByAltText("wide-frame.jpg");
    expect(image).toHaveClass("viewer-image--contain");
  });

  test("can edit and delete a saved local annotation", async () => {
    window.localStorage.setItem(
      "seabird-nestcam-annotations-v1",
      JSON.stringify([storedAnnotation]),
    );

    const user = userEvent.setup();
    render(<AnnotationWorkspace />);

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getByText("Black-footed Albatross (Phoebastria nigripes)")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /edit annotation/i }));

    expect(screen.getByRole("button", { name: /update annotation/i })).toBeEnabled();
    expect(screen.getByDisplayValue("Initial note")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete annotation/i }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("table")).queryByText(
          "Black-footed Albatross (Phoebastria nigripes)",
        ),
      ).not.toBeInTheDocument();
    });
  });

  test("does not intercept shortcuts when modifier keys like Cmd or Ctrl are held", async () => {
    const user = userEvent.setup();
    render(<AnnotationWorkspace />);

    const file = new File(["image"], "frame-1.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/add nest camera images/i), file);
    await screen.findByAltText("frame-1.jpg");

    const cmdSEvent = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(cmdSEvent);
    expect(cmdSEvent.defaultPrevented).toBe(false);

    const normalSEvent = new KeyboardEvent("keydown", {
      key: "s",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(normalSEvent);
    });
    expect(normalSEvent.defaultPrevented).toBe(true);
  });

  test("displays Supabase database status and does not render Google Sheets UI", () => {
    render(<AnnotationWorkspace />);

    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Supabase")).toBeInTheDocument();
    expect(screen.queryByText(/supabase \+ sheets/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sheet rows/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assignments/i)).not.toBeInTheDocument();
  });
});

test("browses NAS folders and selects a new image source", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/synology/folders") {
      const folder = url.searchParams.get("folder") || "/volume1/cameras/2024";
      const folders = folder === "/volume1/cameras" ? [{name: "2025", path: "/volume1/cameras/2025"}] : [];
      return Response.json({folder, folders, parentFolder: folder === "/volume1" ? null : "/volume1/cameras"});
    }
    if (url.pathname === "/api/synology/list") {
      if (url.searchParams.get("folder") !== "/volume1/cameras/2025") return Response.json({}, {status: 400});
      return Response.json({configured: true, images: [{name: "new-frame.jpg", path: "/volume1/cameras/2025/new-frame.jpg", size: 42, captureTime: "", url: "/api/synology/image?path=frame"}]});
    }
    return Response.json({configured: false, headers: [], rows: []});
  }));
  const user = userEvent.setup();
  render(<AnnotationWorkspace />);
  await user.click(screen.getByRole("button", {name: "Browse folders"}));
  await screen.findByText("/volume1/cameras/2024");
  await user.click(screen.getByRole("button", {name: "Up one folder"}));
  await user.click(await screen.findByRole("button", {name: "Open 2025"}));
  await screen.findByText("/volume1/cameras/2025");
  await user.click(screen.getByRole("button", {name: "Use this folder"}));
  expect(screen.getByLabelText("Folder path")).toHaveValue("/volume1/cameras/2025");
  expect(screen.queryByRole("region", {name: "Choose NAS folder"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Load NAS images"}));
  expect(await screen.findByAltText("new-frame.jpg")).toBeInTheDocument();
});

test("shows folder connection errors and allows retry or cancel", async () => {
  let failed = true;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    if (String(input).startsWith("/api/synology/folders")) {
      if (failed) return Response.json({message: "The NAS is offline."}, {status: 502});
      return Response.json({folder: "/volume1", parentFolder: null, folders: []});
    }
    return Response.json({configured: false, headers: [], rows: []});
  }));
  const user = userEvent.setup();
  render(<AnnotationWorkspace />);
  await user.click(screen.getByRole("button", {name: "Browse folders"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("The NAS is offline.");
  expect(screen.getByRole("button", {name: "Use this folder"})).toBeDisabled();
  failed = false;
  await user.click(screen.getByRole("button", {name: "Retry"}));
  await screen.findByText("No subfolders in this folder.");
  expect(screen.getByRole("button", {name: "Up one folder"})).toBeDisabled();
  await user.click(screen.getByRole("button", {name: "Cancel"}));
  expect(screen.getByLabelText("Folder path")).toHaveValue("");
  expect(screen.getByRole("button", {name: "Browse folders"})).toHaveFocus();
});


test("refreshes every workspace choice list without replacing the annotation draft", async () => {
  const rows: Record<string, any[]> = {
    cameras: [{name: "CAM-1"}], site_locations: [{name: "Site A"}], team_members: [{name: "Reviewer A"}],
    species: [{name: "Bird A", type: "Seabird"}], behaviors: [{name: "Resting", type: "Seabird"}],
    templates: [{id: "template-1", label: "Template A", type: "Seabird", species: "Bird A", behavior: "Resting"}],
  };
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const table = String(url).match(/\/rest\/v1\/([^?]+)/)?.[1];
    return table && rows[table] ? Response.json(rows[table]) : originalFetch(url, init);
  }));
  const user = userEvent.setup();
  render(<AnnotationWorkspace />);
  await screen.findByRole("option", {name: "CAM-1"});
  await user.type(screen.getByLabelText("Notes"), "Keep this draft");
  const changes = [
    ["cameras", [{name: "CAM-2"}], "CAM-2"],
    ["site_locations", [{name: "Site B"}], "Site B"],
    ["team_members", [{name: "Reviewer B"}], "Reviewer B"],
    ["species", [{name: "Bird B", type: "Seabird"}], "Bird B"],
    ["behaviors", [{name: "Flying", type: "Seabird"}], "Flying"],
    ["templates", [{id: "template-2", label: "Template B", type: "Seabird", species: "Bird B", behavior: "Flying"}], "Template B"],
  ] as const;
  for (const [table, values, label] of changes) {
    rows[table] = [...values];
    act(() => realtime.emit(table));
    if (table === "team_members") {
      await waitFor(() => expect(document.querySelector(`#reviewer-options option[value="${label}"]`)).toBeInTheDocument());
    } else {
      await screen.findByRole("option", {name: label});
    }
  }
  expect(screen.getByLabelText("Notes")).toHaveValue("Keep this draft");
  rows.cameras = [];
  act(() => realtime.emit("cameras", {eventType: "DELETE", new: {}, old: {name: "CAM-2"}}));
  await waitFor(() => expect(screen.queryByRole("option", {name: "CAM-2"})).not.toBeInTheDocument());
  expect(within(screen.getByLabelText("Camera Unit ID")).getAllByRole("option")).toHaveLength(1);
});
