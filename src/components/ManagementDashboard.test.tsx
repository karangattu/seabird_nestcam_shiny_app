import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ManagementDashboard } from "./ManagementDashboard";
import { supabase } from "@/lib/supabase";

import { realtime } from "@/test/realtime";

vi.mock("@/lib/supabase", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase")>();
  const { mockRealtime } = await import("@/test/realtime");
  return { ...original, supabase: mockRealtime(original.supabase) };
});
beforeEach(() => realtime.reset());

describe("ManagementDashboard", () => {
  test("renders management tabs including Annotations Database", async () => {
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    expect(screen.getByText(/Camera Unit IDs, Camera Locations & Reviewers/i)).toBeInTheDocument();
    expect(screen.getByText(/Species & Behaviors/i)).toBeInTheDocument();
    expect(screen.getByText(/Annotation Templates/i)).toBeInTheDocument();
    expect(screen.getByText(/Annotations Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity Log/i)).toBeInTheDocument();
  });

  test("can switch to the Annotations Database tab and view controls", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    const annotationsTab = screen.getByText(/Annotations Database/i);
    await user.click(annotationsTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search annotations/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
      expect(screen.getByText(/All Cameras/i)).toBeInTheDocument();
      expect(screen.getByText(/All Sites/i)).toBeInTheDocument();
    });
  });

  test("can switch to the Activity Log tab and view controls", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    const auditTab = screen.getByText(/Activity Log/i);
    await user.click(auditTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search user, action, summary/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /export audit csv/i })).toBeInTheDocument();
      expect(screen.getByText(/All Actions/i)).toBeInTheDocument();
      expect(screen.getByText(/All Categories \/ Tables/i)).toBeInTheDocument();
      expect(screen.getByText(/All Users/i)).toBeInTheDocument();
    });
  });

  test("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    const backButton = screen.getByRole("button", { name: /back to annotations/i });
    await user.click(backButton);
    expect(onBack).toHaveBeenCalled();
  });

  test("deletes behavior matching both name and type", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deletedUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (init?.method === "DELETE") {
          deletedUrls.push(urlStr);
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("behaviors")) {
          return new Response(
            JSON.stringify([{ name: "Foraging", type: "Seabird" }]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url, init);
      }),
    );

    render(<ManagementDashboard onBack={onBack} />);

    const tab = screen.getByText(/Species & Behaviors/i);
    await user.click(tab);

    const deleteButtons = await screen.findAllByRole("button", { name: /^delete$/i });
    expect(deleteButtons.length).toBeGreaterThan(0);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(deletedUrls.length).toBeGreaterThan(0);
      expect(deletedUrls[0]).toContain("behaviors?");
      expect(deletedUrls[0]).toContain("name=eq.");
      expect(deletedUrls[0]).toContain("type=eq.");
    });
  });

  test("renders audit log items and displays detail modal when clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("audit_logs")) {
          return new Response(
            JSON.stringify([
              {
                id: "audit-123",
                table_name: "cameras",
                action: "CREATE",
                record_id: "CAM-99",
                user_name: "AuditorAlice",
                old_data: null,
                new_data: { name: "CAM-99" },
                summary: 'Added Camera "CAM-99"',
                created_at: "2026-10-05T12:00:00Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url, init);
      }),
    );

    render(<ManagementDashboard onBack={onBack} />);

    const auditTab = screen.getByText(/Activity Log/i);
    await user.click(auditTab);

    await waitFor(() => {
      expect(screen.getAllByText("AuditorAlice").length).toBeGreaterThan(0);
      expect(screen.getByText('Added Camera "CAM-99"')).toBeInTheDocument();
    });

    const viewButton = screen.getByRole("button", { name: /^view$/i });
    await user.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText(/Audit Entry Details/i)).toBeInTheDocument();
      expect(screen.getAllByText(/CAM-99/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});


test("updates management lists for another user's insert, rename, and deletion", async () => {
  let cameras = [{name: "CAM-1"}];
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("/rest/v1/cameras")) return Response.json(cameras);
    return originalFetch(url, init);
  }));
  render(<ManagementDashboard onBack={() => {}} />);
  await screen.findByText("CAM-1");
  cameras = [{name: "CAM-1"}, {name: "CAM-2"}];
  act(() => realtime.emit("cameras"));
  await screen.findByText("CAM-2");
  cameras = [{name: "CAM-RENAMED"}];
  act(() => realtime.emit("cameras", {eventType: "UPDATE", new: {name: "CAM-RENAMED"}, old: {name: "CAM-1"}}));
  await screen.findByText("CAM-RENAMED");
  expect(screen.queryByText("CAM-1")).not.toBeInTheDocument();
  cameras = [];
  act(() => realtime.emit("cameras", {eventType: "DELETE", new: {}, old: {name: "CAM-RENAMED"}}));
  await waitFor(() => expect(screen.queryByText("CAM-RENAMED")).not.toBeInTheDocument());
});

test("updates the management annotation list after sync and deletion elsewhere", async () => {
  let rows: any[] = [];
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("/rest/v1/annotations")) return Response.json(rows);
    return originalFetch(url, init);
  }));
  const user = userEvent.setup();
  render(<ManagementDashboard onBack={() => {}} />);
  await user.click(screen.getByText(/Annotations Database/i));
  await screen.findByText(/No annotations found in the database/);
  rows = [{id: "annotation-1", start_filename: "frame.jpg", end_filename: "frame.jpg", site: "Site A", camera: "CAM-1", retrieval_date: "2026-10-06", type: "Seabird", species: "Test bird", behavior: "Resting", reviewer_name: "Reviewer A", notes: "Shared observation", created_at: "2026-10-06T12:00:00Z"}];
  act(() => realtime.emit("annotations"));
  await screen.findByText("Shared observation");
  rows = [];
  act(() => realtime.emit("annotations", {eventType: "DELETE", new: {}, old: {id: "annotation-1"}}));
  await screen.findByText(/No annotations found in the database/);
  expect(screen.queryByText("Shared observation")).not.toBeInTheDocument();
});

test("reloads management data after reconnect without clearing an unfinished entry", async () => {
  let cameras = [{name: "CAM-1"}];
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("/rest/v1/cameras")) return Response.json(cameras);
    return originalFetch(url, init);
  }));
  const user = userEvent.setup();
  render(<ManagementDashboard onBack={() => {}} />);
  await screen.findByText("CAM-1");
  const entry = screen.getByPlaceholderText("e.g. LOC009");
  await user.type(entry, "Draft camera");
  cameras = [{name: "CAM-NEW"}];
  act(() => realtime.reconnect());
  await screen.findByText("CAM-NEW");
  expect(entry).toHaveValue("Draft camera");
});

test("reloads only changed tables after a burst", async () => {
  render(<ManagementDashboard onBack={() => {}} />);
  await screen.findByRole("heading", {name:/Active Camera Unit IDs/});
  const fetchMock = vi.mocked(globalThis.fetch);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  fetchMock.mockClear();
  act(() => { for (let i = 0; i < 20; i++) realtime.emit("cameras"); });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("/cameras?");
});

test("shows the next annotation page and sends search and date filters to the database", async () => {
  const urls: URL[] = [];
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/annotations")) {
      urls.push(url);
      const offset = url.searchParams.get("or")?.includes("created_at.lt") ? 50 : 0;
      return Response.json(Array.from({length:offset ? 1 : 51}, (_,i)=>({id:`anno-${offset+i}`, start_filename:`frame-${offset+i}.jpg`,end_filename:`frame-${offset+i}.jpg`, site:"Site A",camera:"CAM-1",retrieval_date:"2026-10-01",type:"Seabird",species:"Bird",behavior:"Resting",reviewer_name:"KG",is_single_image:"true",created_at:"2026-10-01T00:00:00Z"})));
    }
    return original(input, init);
  }));
  const user = userEvent.setup();
  render(<ManagementDashboard onBack={() => {}} />);
  await user.click(screen.getByRole("button", {name:/Annotations Database/}));
  await screen.findByText("frame-0.jpg");
  expect(screen.queryByText("frame-50.jpg")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Next page"}));
  await screen.findByText("frame-50.jpg");
  expect(screen.queryByText("frame-0.jpg")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Previous page"}));
  await screen.findByText("frame-0.jpg");
  await user.type(screen.getByPlaceholderText(/Search annotations/), "nest");
  await waitFor(() => expect(urls.at(-1)?.searchParams.get("or")).toContain("nest"));
  await user.type(screen.getByLabelText("Retrieval date filter"), "2026-10-01");
  await waitFor(() => expect(urls.at(-1)?.searchParams.get("retrieval_date")).toBe("eq.2026-10-01"));
});
