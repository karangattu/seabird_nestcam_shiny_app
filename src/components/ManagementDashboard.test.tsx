import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ManagementDashboard } from "./ManagementDashboard";

describe("ManagementDashboard", () => {
  test("renders management tabs including Annotations Database", async () => {
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    expect(screen.getByText(/Camera Unit IDs, Camera Locations & Reviewers/i)).toBeInTheDocument();
    expect(screen.getByText(/Species & Behaviors/i)).toBeInTheDocument();
    expect(screen.getByText(/Annotation Templates/i)).toBeInTheDocument();
    expect(screen.getByText(/Annotations Database/i)).toBeInTheDocument();
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

  test("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ManagementDashboard onBack={onBack} />);

    const backButton = screen.getByRole("button", { name: /back to annotations/i });
    await user.click(backButton);
    expect(onBack).toHaveBeenCalled();
  });
});
