"use client";

import { useState, useEffect } from "react";
import { AnnotationWorkspace } from "@/components/AnnotationWorkspace";
import { ManagementDashboard } from "@/components/ManagementDashboard";
import { initDynamicSupabase } from "@/lib/supabase";

export default function HomePage() {
  const [view, setView] = useState<"workspace" | "dashboard">("workspace");
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const config = await res.json();
          if (config.supabaseUrl && config.supabaseAnonKey) {
            initDynamicSupabase(config.supabaseUrl, config.supabaseAnonKey);
          }
        }
      } catch (err) {
        console.error("Failed to load Supabase config, using defaults:", err);
      } finally {
        setIsConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  if (!isConfigLoaded) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "sans-serif", background: "#f7f8fa", color: "#28313d" }}>
        <div style={{ textAlign: "center" }}>
          <h2>Initializing...</h2>
          <p style={{ color: "#667180" }}>Configuring database connection</p>
        </div>
      </div>
    );
  }

  if (view === "dashboard") {
    return <ManagementDashboard onBack={() => setView("workspace")} />;
  }

  return <AnnotationWorkspace onOpenDashboard={() => setView("dashboard")} />;
}