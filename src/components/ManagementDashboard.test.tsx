import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ManagementDashboard } from "./ManagementDashboard";
import { supabase } from "@/lib/supabase";

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
