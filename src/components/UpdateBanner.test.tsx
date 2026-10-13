import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateBanner, UPDATE_DISMISS_STORAGE_KEY } from "./UpdateBanner";
import type { ReleaseCheckResult } from "@/lib/release-checker";

const mockReleaseAvailable: ReleaseCheckResult = {
  currentVersion: "0.2.15",
  latestVersion: "0.2.16",
  updateAvailable: true,
  name: "v0.2.16",
  htmlUrl: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases/tag/v0.2.16",
  assets: [],
};

const mockNoUpdate: ReleaseCheckResult = {
  currentVersion: "0.2.15",
  latestVersion: "0.2.15",
  updateAvailable: false,
  name: "v0.2.15",
  htmlUrl: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases",
  assets: [],
};

describe("UpdateBanner", () => {
  it("renders nothing when no update is available", () => {
    const { container } = render(<UpdateBanner initialData={mockNoUpdate} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders update banner when an update is available", () => {
    render(<UpdateBanner initialData={mockReleaseAvailable} />);
    expect(screen.getByRole("region", { name: "Software update notification" })).toBeInTheDocument();
    expect(screen.getByText(/v0\.2\.16/)).toBeInTheDocument();
    expect(screen.getByText(/v0\.2\.15/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "View Release" });
    expect(link).toHaveAttribute("href", mockReleaseAvailable.htmlUrl);
  });

  it("dismisses the banner when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<UpdateBanner initialData={mockReleaseAvailable} />);

    expect(screen.getByRole("region", { name: "Software update notification" })).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: "Dismiss update notification" });
    await user.click(closeBtn);

    expect(screen.queryByRole("region", { name: "Software update notification" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(UPDATE_DISMISS_STORAGE_KEY)).toBe("0.2.16");
  });

  it("fetches /api/version on mount when initialData is not provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleaseAvailable,
      })
    );

    render(<UpdateBanner />);
    expect(await screen.findByRole("region", { name: "Software update notification" })).toBeInTheDocument();
    expect(screen.getByText(/v0\.2\.16/)).toBeInTheDocument();
  });

  it("does not render when the current latest version was already dismissed", async () => {
    window.localStorage.setItem(UPDATE_DISMISS_STORAGE_KEY, "0.2.16");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleaseAvailable,
      })
    );

    const { container } = render(<UpdateBanner />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
