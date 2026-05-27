"use client";

import { useState } from "react";
import { AnnotationWorkspace } from "@/components/AnnotationWorkspace";
import { ManagementDashboard } from "@/components/ManagementDashboard";

export default function HomePage() {
  const [view, setView] = useState<"workspace" | "dashboard">("workspace");

  if (view === "dashboard") {
    return <ManagementDashboard onBack={() => setView("workspace")} />;
  }

  return <AnnotationWorkspace onOpenDashboard={() => setView("dashboard")} />;
}