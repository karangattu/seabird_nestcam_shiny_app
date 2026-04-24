import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { AnnotationWorkspace } from "./AnnotationWorkspace";
import type { AnnotationRecord } from "@/lib/annotation-data";

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
      expect(screen.getAllByText("Black-footed Albatross (Phoebastria nigripes)").length).toBeGreaterThan(1);
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
});
