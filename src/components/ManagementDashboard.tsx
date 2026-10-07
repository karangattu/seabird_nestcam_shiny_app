"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchChoiceTable, type ChoiceTable } from "@/lib/choices";
import { fetchAnnotationPage, type AnnotationCursor, type DbAnnotation } from "@/lib/annotation-queries";
import { CHOICE_TABLES, subscribeToDatabaseChanges } from "@/lib/realtime";
import { type AnnotationTemplate, type ObservationType, type DynamicChoices, fallbackChoices } from "@/lib/annotation-data";
import { logAuditEvent, type AuditLogRecord } from "@/lib/audit-logger";
import { AppLogo } from "@/components/AppLogo";
import { SyncIcon, TrashIcon } from "@/components/Icons";

type ActiveTab = "dropdowns" | "species_behaviors" | "templates" | "annotations" | "audit_trail";

interface ManagementDashboardProps {
  onBack: () => void;
}

export function ManagementDashboard({ onBack }: ManagementDashboardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dropdowns");
  const [choices, setChoices] = useState<DynamicChoices>(fallbackChoices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [adminUser, setAdminUser] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kesrp_admin_user") || "";
    }
    return "";
  });

  const [newCamera, setNewCamera] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newReviewer, setNewReviewer] = useState("");

  const [newSpeciesName, setNewSpeciesName] = useState("");
  const [newSpeciesType, setNewSpeciesType] = useState<ObservationType>("Seabird");
  const [newBehaviorName, setNewBehaviorName] = useState("");
  const [newBehaviorType, setNewBehaviorType] = useState<ObservationType>("Seabird");

  const [newTemplateLabel, setNewTemplateLabel] = useState("");
  const [newTemplateType, setNewTemplateType] = useState<ObservationType>("Seabird");
  const [newTemplateSpecies, setNewTemplateSpecies] = useState("");
  const [newTemplateBehavior, setNewTemplateBehavior] = useState("");

  const [bulkLocationsText, setBulkLocationsText] = useState("");
  const [bulkCamerasText, setBulkCamerasText] = useState("");
  const [bulkLocationsImporting, setBulkLocationsImporting] = useState(false);
  const [bulkCamerasImporting, setBulkCamerasImporting] = useState(false);

  const [annotationsList, setAnnotationsList] = useState<DbAnnotation[]>([]);
  const [annotationSearch, setAnnotationSearch] = useState("");
  const [annotationQuery, setAnnotationQuery] = useState({ camera:"", site:"", type:"", date:"", search:"", cursors:[null] as Array<AnnotationCursor | null> });
  const {camera:filterCamera, site:filterSite, type:filterType, date:filterDate} = annotationQuery;
  const [hasNextPage, setHasNextPage] = useState(false);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [exportingAnnotations, setExportingAnnotations] = useState(false);
  const setFilterCamera = (camera: string) => setAnnotationQuery((prev) => ({...prev, camera, cursors:[null]}));
  const setFilterSite = (site: string) => setAnnotationQuery((prev) => ({...prev, site, cursors:[null]}));
  const setFilterType = (type: string) => setAnnotationQuery((prev) => ({...prev, type, cursors:[null]}));

  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditTableFilter, setAuditTableFilter] = useState("");
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [viewingLogDetails, setViewingLogDetails] = useState<AuditLogRecord | null>(null);

  const isMountedRef = useRef(true);
  const tableRequests = useRef<Record<string, number>>({});
  const annotationRequest = useRef(0);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleSetAdminUser(name: string) {
    setAdminUser(name);
    if (typeof window !== "undefined") {
      localStorage.setItem("kesrp_admin_user", name);
    }
  }

  const loadAnnotations = useCallback(async () => {
    const request = ++annotationRequest.current;
    setAnnotationsLoading(true);
    try {
      const page = await fetchAnnotationPage(annotationQuery, annotationQuery.cursors.at(-1));
      if (!isMountedRef.current || request !== annotationRequest.current) return;
      setAnnotationsList(page.rows);
      setHasNextPage(page.hasNext);
      if (!page.rows.length && annotationQuery.cursors.length > 1) {
        setAnnotationQuery((prev) => ({...prev, cursors:prev.cursors.slice(0,-1)}));
      }
    } catch (err: any) {
      if (isMountedRef.current && request === annotationRequest.current) setError(err.message || "Could not load annotations.");
    } finally {
      if (isMountedRef.current && request === annotationRequest.current) setAnnotationsLoading(false);
    }
  }, [annotationQuery]);
  const loadAnnotationsRef = useRef(loadAnnotations);
  loadAnnotationsRef.current = loadAnnotations;
  useEffect(() => { void loadAnnotations(); }, [loadAnnotations]);
  useEffect(() => {
    const timer = setTimeout(() => setAnnotationQuery((prev) => prev.search === annotationSearch ? prev : {...prev, search:annotationSearch, cursors:[null]}), 200);
    return () => clearTimeout(timer);
  }, [annotationSearch]);

  async function loadAllData(showLoading = true, tables: readonly string[] = [...CHOICE_TABLES, "annotations", "audit_logs"]) {
    if (showLoading) setLoading(true);
    setError("");
    await Promise.all(tables.map(async (table) => {
      if (table === "annotations") return loadAnnotationsRef.current();
      const request = (tableRequests.current[table] ?? 0) + 1;
      tableRequests.current[table] = request;
      try {
        if (table === "audit_logs") {
          const {data, error} = await supabase.from("audit_logs").select("*").order("created_at", {ascending:false}).limit(250);
          if (error) throw error;
          if (isMountedRef.current && request === tableRequests.current[table]) setAuditLogs(data ?? []);
        } else {
          const patch = await fetchChoiceTable(table as ChoiceTable);
          if (isMountedRef.current && request === tableRequests.current[table]) setChoices((prev) => ({...prev, ...patch}));
        }
      } catch (err: any) {
        if (isMountedRef.current && request === tableRequests.current[table]) setError(err.message || "Could not load shared lists.");
      }
    }));
    if (isMountedRef.current && showLoading) setLoading(false);
  }

  useEffect(() => {
    isMountedRef.current = true;
    void loadAllData(true, [...CHOICE_TABLES, "audit_logs"]);
    const unsubscribe = subscribeToDatabaseChanges("management-realtime", [...CHOICE_TABLES, "annotations", "audit_logs"], (tables) => {
      void loadAllData(false, tables);
    });
    return () => {
      isMountedRef.current = false;
      annotationRequest.current++;
      unsubscribe();
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  function showFeedback(msg: string) {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setActionMessage(msg);
    feedbackTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setActionMessage("");
      }
    }, 3500);
  }

  // --- Add actions ---
  async function handleAddCamera(e: React.FormEvent) {
    e.preventDefault();
    if (!newCamera.trim()) return;
    try {
      const name = newCamera.trim();
      const { error } = await supabase.from("cameras").insert({ name });
      if (error) throw error;
      await logAuditEvent({
        table_name: "cameras",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Added Camera Unit ID "${name}"`,
        new_data: { name },
      });
      setNewCamera("");
      showFeedback(`Camera "${name}" added.`);
      void loadAllData(false, ["cameras", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocation.trim()) return;
    try {
      const name = newLocation.trim();
      const { error } = await supabase.from("site_locations").insert({ name });
      if (error) throw error;
      await logAuditEvent({
        table_name: "site_locations",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Added Camera Location "${name}"`,
        new_data: { name },
      });
      setNewLocation("");
      showFeedback(`Site "${name}" added.`);
      void loadAllData(false, ["site_locations", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddReviewer(e: React.FormEvent) {
    e.preventDefault();
    if (!newReviewer.trim()) return;
    try {
      const name = newReviewer.trim();
      const { error } = await supabase.from("team_members").insert({ name });
      if (error) throw error;
      await logAuditEvent({
        table_name: "team_members",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Added Reviewer "${name}"`,
        new_data: { name },
      });
      setNewReviewer("");
      showFeedback(`Reviewer "${name}" added.`);
      void loadAllData(false, ["team_members", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  // --- Bulk import actions ---
  async function handleBulkImportLocations() {
    if (!bulkLocationsText.trim()) return;
    setBulkLocationsImporting(true);
    try {
      const items = bulkLocationsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const uniqueItems = Array.from(new Set(items));
      const existingLocations = new Set(choices.locations);
      const newItems = uniqueItems.filter((item) => !existingLocations.has(item));

      if (newItems.length === 0) {
        alert("All entered Camera Locations are already present in the database.");
        setBulkLocationsImporting(false);
        return;
      }

      const { error } = await supabase
        .from("site_locations")
        .insert(newItems.map((name) => ({ name })));

      if (error) throw error;

      await logAuditEvent({
        table_name: "site_locations",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Bulk imported ${newItems.length} Camera Location(s)`,
        new_data: { count: newItems.length, items: newItems },
      });

      setBulkLocationsText("");
      showFeedback(`Successfully imported ${newItems.length} new Camera Location(s).`);
      void loadAllData(false, ["site_locations", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error performing bulk import.");
    } finally {
      setBulkLocationsImporting(false);
    }
  }

  async function handleBulkImportCameras() {
    if (!bulkCamerasText.trim()) return;
    setBulkCamerasImporting(true);
    try {
      const items = bulkCamerasText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const uniqueItems = Array.from(new Set(items));
      const existingCameras = new Set(choices.cameras);
      const newItems = uniqueItems.filter((item) => !existingCameras.has(item));

      if (newItems.length === 0) {
        alert("All entered Camera Unit IDs are already present in the database.");
        setBulkCamerasImporting(false);
        return;
      }

      const { error } = await supabase
        .from("cameras")
        .insert(newItems.map((name) => ({ name })));

      if (error) throw error;

      await logAuditEvent({
        table_name: "cameras",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Bulk imported ${newItems.length} Camera Unit ID(s)`,
        new_data: { count: newItems.length, items: newItems },
      });

      setBulkCamerasText("");
      showFeedback(`Successfully imported ${newItems.length} new Camera Unit ID(s).`);
      void loadAllData(false, ["cameras", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error performing bulk import.");
    } finally {
      setBulkCamerasImporting(false);
    }
  }

  async function handleAddSpecies(e: React.FormEvent) {
    e.preventDefault();
    if (!newSpeciesName.trim()) return;
    try {
      const name = newSpeciesName.trim();
      const { error } = await supabase.from("species").insert({
        name,
        type: newSpeciesType,
      });
      if (error) throw error;
      await logAuditEvent({
        table_name: "species",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Added ${newSpeciesType} Species "${name}"`,
        new_data: { name, type: newSpeciesType },
      });
      setNewSpeciesName("");
      showFeedback(`Species "${name}" added.`);
      void loadAllData(false, ["species", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddBehavior(e: React.FormEvent) {
    e.preventDefault();
    if (!newBehaviorName.trim()) return;
    try {
      const name = newBehaviorName.trim();
      const { error } = await supabase.from("behaviors").insert({
        name,
        type: newBehaviorType,
      });
      if (error) throw error;
      await logAuditEvent({
        table_name: "behaviors",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Added ${newBehaviorType} Behavior "${name}"`,
        new_data: { name, type: newBehaviorType },
      });
      setNewBehaviorName("");
      showFeedback(`Behavior "${name}" added.`);
      void loadAllData(false, ["behaviors", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTemplateLabel.trim() || !newTemplateSpecies || !newTemplateBehavior) {
      alert("Please fill in all template fields.");
      return;
    }
    try {
      const label = newTemplateLabel.trim();
      const templateData = {
        label,
        type: newTemplateType,
        species: newTemplateSpecies,
        behavior: newTemplateBehavior,
      };
      const { error } = await supabase.from("templates").insert(templateData);
      if (error) throw error;
      await logAuditEvent({
        table_name: "templates",
        action: "CREATE",
        user_name: adminUser || "Admin",
        summary: `Created Template "${label}" (${newTemplateType})`,
        new_data: templateData,
      });
      setNewTemplateLabel("");
      setNewTemplateSpecies("");
      setNewTemplateBehavior("");
      showFeedback(`Template "${label}" created.`);
      void loadAllData(false, ["templates", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error creating template.");
    }
  }

  async function handleDeleteItem(table: string, column: string, value: string) {
    if (!confirm(`Are you sure you want to delete this ${table} entry?`)) return;
    try {
      const { error } = await supabase.from(table).delete().eq(column, value);
      if (error) throw error;
      await logAuditEvent({
        table_name: table,
        action: "DELETE",
        user_name: adminUser || "Admin",
        summary: `Deleted ${table} entry "${value}"`,
        old_data: { [column]: value },
      });
      showFeedback("Item deleted.");
      void loadAllData(false, [table, "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error deleting item.");
    }
  }

  async function handleDeleteBehavior(name: string, type: ObservationType) {
    if (!confirm(`Are you sure you want to delete behavior "${name}" (${type})?`)) return;
    try {
      const { error } = await supabase.from("behaviors").delete().match({ name, type });
      if (error) throw error;
      await logAuditEvent({
        table_name: "behaviors",
        action: "DELETE",
        user_name: adminUser || "Admin",
        summary: `Deleted behavior "${name}" (${type})`,
        old_data: { name, type },
      });
      showFeedback("Behavior deleted.");
      void loadAllData(false, ["behaviors", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error deleting behavior.");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const target = choices.templates.find((t) => t.id === id);
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
      await logAuditEvent({
        table_name: "templates",
        action: "DELETE",
        record_id: id,
        user_name: adminUser || "Admin",
        summary: `Deleted template "${target?.label || id}"`,
        old_data: target || { id },
      });
      showFeedback("Template deleted.");
      void loadAllData(false, ["templates", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error deleting template.");
    }
  }

  async function handleDeleteAnnotation(id: string) {
    if (!confirm("Are you sure you want to delete this annotation from the database?")) return;
    try {
      const target = annotationsList.find((a) => a.id === id);
      const { error } = await supabase.from("annotations").delete().eq("id", id);
      if (error) throw error;
      await logAuditEvent({
        table_name: "annotations",
        action: "DELETE",
        record_id: id,
        user_name: adminUser || "Admin",
        summary: `Deleted annotation for images ${target?.start_filename || id} to ${target?.end_filename || ""}`,
        old_data: target || { id },
      });
      showFeedback("Annotation deleted.");
      void loadAllData(false, ["annotations", "audit_logs"]);
    } catch (err: any) {
      alert(err.message || "Error deleting annotation.");
    }
  }

  const uniqueAuditUsers = useMemo(() => {
    return Array.from(new Set(auditLogs.map((l) => l.user_name).filter(Boolean))).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditActionFilter && log.action !== auditActionFilter) return false;
      if (auditTableFilter && log.table_name !== auditTableFilter) return false;
      if (auditUserFilter && log.user_name !== auditUserFilter) return false;
      if (query) {
        const matches =
          log.summary?.toLowerCase().includes(query) ||
          log.user_name?.toLowerCase().includes(query) ||
          log.table_name?.toLowerCase().includes(query) ||
          log.action?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [auditActionFilter, auditLogs, auditSearch, auditTableFilter, auditUserFilter]);

  function handleExportAuditCsv() {
    if (!filteredAuditLogs.length) return;
    const columns = ["Timestamp", "User", "Action", "Target Table", "Summary", "Previous Data", "New Data"];
    const header = columns.join(",");
    const rows = filteredAuditLogs.map((log) =>
      [
        log.created_at,
        log.user_name,
        log.action,
        log.table_name,
        log.summary,
        log.old_data ? JSON.stringify(log.old_data) : "",
        log.new_data ? JSON.stringify(log.new_data) : "",
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = `supabase-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function handleExportAnnotationsCsv() {
    if (exportingAnnotations) return;
    setExportingAnnotations(true);
    try {
      const exported: DbAnnotation[] = [];
      let cursor: AnnotationCursor | null = null;
      for (;;) {
        const page = await fetchAnnotationPage(annotationQuery, cursor, 500);
        exported.push(...page.rows);
        if (!page.hasNext) break;
        cursor = page.rows[page.rows.length - 1];
      }
      if (!exported.length) return;
      const columns = [
        "Start Filename",
        "End Filename",
        "Site",
        "Camera",
        "Retrieval Date",
        "Type",
        "Species",
        "Behavior",
        "Sequence Start Time",
        "Sequence End Time",
        "Is Single Image",
        "Reviewer Name",
        "Notes",
        "Created At",
      ];
      const header = columns.join(",");
      const rows = exported.map((anno) =>
        [
          anno.start_filename,
          anno.end_filename,
          anno.site,
          anno.camera,
          anno.retrieval_date,
          anno.type,
          anno.species,
          anno.behavior,
          anno.sequence_start_time || "",
          anno.sequence_end_time || "",
          anno.is_single_image,
          anno.reviewer_name,
          anno.notes || "",
          anno.created_at || "",
        ]
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(","),
      );
      const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = `supabase-annotations-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadLink.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) { setError(err.message || "Could not export annotations."); }
    finally { setExportingAnnotations(false); }
  }

  const filteredAnnotations = annotationsList;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><AppLogo /></div>
          <div>
            <h1>KESRP NestCam</h1>
            <p>Management & Admin Dashboard</p>
          </div>
        </div>
        <div className="topbar-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: "700", color: "var(--muted)" }}>
            <span>Admin / User:</span>
            <input
              type="text"
              list="admin-user-list"
              value={adminUser}
              onChange={(e) => handleSetAdminUser(e.target.value)}
              placeholder="Your Name"
              style={{ minHeight: "34px", padding: "4px 8px", fontSize: "0.85rem", width: "140px", borderRadius: "6px", border: "1px solid var(--line)" }}
            />
            <datalist id="admin-user-list">
              {choices.teamMembers.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <button className="button" type="button" onClick={() => { void loadAllData(); }} title="Refresh tables">
            <SyncIcon /> Sync Data
          </button>
          <button className="button button-primary" type="button" onClick={onBack}>
            Back to Annotations
          </button>
        </div>
      </div>

      <nav className="nav-tab-bar" aria-label="Management options">
        <button
          className={`nav-tab ${activeTab === "dropdowns" ? "active" : ""}`}
          onClick={() => setActiveTab("dropdowns")}
        >
          Camera Unit IDs, Camera Locations & Reviewers
        </button>
        <button
          className={`nav-tab ${activeTab === "species_behaviors" ? "active" : ""}`}
          onClick={() => setActiveTab("species_behaviors")}
        >
          Species & Behaviors
        </button>
        <button
          className={`nav-tab ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Annotation Templates
        </button>
        <button
          className={`nav-tab ${activeTab === "annotations" ? "active" : ""}`}
          onClick={() => setActiveTab("annotations")}
        >
          Annotations Database
        </button>
        <button
          className={`nav-tab ${activeTab === "audit_trail" ? "active" : ""}`}
          onClick={() => setActiveTab("audit_trail")}
        >
          Activity Log ({auditLogs.length})
        </button>
      </nav>

      {error && (
        <div className="form-alert" style={{ marginBottom: "20px" }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {actionMessage && (
        <div className="sync-note success" style={{ marginBottom: "20px" }}>
          <span>{actionMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state" style={{ minHeight: "300px" }}>
          <SyncIcon size={32} />
          <strong>Synchronizing with Supabase database...</strong>
        </div>
      ) : (
        <div>
          {/* Tab 1: Dropdowns */}
          {activeTab === "dropdowns" && (
            <>
              <div className="dashboard-panel">
              <div className="form-grid" style={{ gap: "20px" }}>
                {/* Cameras List */}
                <div className="admin-card">
                  <h3>Active Camera Unit IDs ({choices.cameras.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "200px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Camera Unit ID</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choices.cameras.map((cam) => (
                          <tr key={cam}>
                            <td><strong>{cam}</strong></td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger-text-button"
                                onClick={() => handleDeleteItem("cameras", "name", cam)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {choices.cameras.length === 0 && (
                          <tr>
                            <td colSpan={2} style={{ color: "var(--muted)" }}>No custom camera unit IDs. Click Add to create one.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sites List */}
                <div className="admin-card">
                  <h3>Camera Locations ({choices.locations.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "200px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Camera Location</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choices.locations.map((loc) => (
                          <tr key={loc}>
                            <td><strong>{loc}</strong></td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger-text-button"
                                onClick={() => handleDeleteItem("site_locations", "name", loc)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {choices.locations.length === 0 && (
                          <tr>
                            <td colSpan={2} style={{ color: "var(--muted)" }}>No custom camera locations.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Reviewers List */}
                <div className="admin-card">
                  <h3>Team Members / Reviewers ({choices.teamMembers.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "200px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Reviewer Name</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choices.teamMembers.map((member) => (
                          <tr key={member}>
                            <td><strong>{member}</strong></td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger-text-button"
                                onClick={() => handleDeleteItem("team_members", "name", member)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {choices.teamMembers.length === 0 && (
                          <tr>
                            <td colSpan={2} style={{ color: "var(--muted)" }}>No custom reviewers.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Side panel Add Forms */}
              <div className="form-grid" style={{ gap: "20px" }}>
                <div className="admin-card">
                  <h3>Add New Camera Unit ID</h3>
                  <form onSubmit={handleAddCamera} className="form-grid">
                    <label>
                      Camera Unit ID
                      <input
                        type="text"
                        placeholder="e.g. LOC009"
                        value={newCamera}
                        onChange={(e) => setNewCamera(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Camera Unit ID
                    </button>
                  </form>
                </div>

                <div className="admin-card">
                  <h3>Add New Camera Location</h3>
                  <form onSubmit={handleAddLocation} className="form-grid">
                    <label>
                      Camera Location
                      <input
                        type="text"
                        placeholder="e.g. Location 7"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Camera Location
                    </button>
                  </form>
                </div>

                <div className="admin-card">
                  <h3>Add Team Member</h3>
                  <form onSubmit={handleAddReviewer} className="form-grid">
                    <label>
                      Reviewer Name
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={newReviewer}
                        onChange={(e) => setNewReviewer(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Member
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Bulk Import / Batch Upload Section */}
            <div className="admin-card" style={{ marginTop: "24px" }}>
              <h3>Bulk Import / Batch Upload</h3>
              <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginBottom: "16px", lineHeight: "1.4" }}>
                Easily batch upload multiple Camera Locations or Camera Unit IDs at once. Paste a list copied from Excel, Google Sheets, or a text file (one name per line). Duplicates and already-existing entries will be automatically filtered out to prevent errors.
              </p>
              <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
                
                {/* Bulk Add Camera Locations */}
                <div style={{ display: "grid", gap: "10px", contentVisibility: "auto" }}>
                  <label style={{ fontWeight: 800, color: "var(--muted)", display: "grid", gap: "6px" }}>
                    Batch Add Camera Locations
                    <textarea
                      rows={6}
                      placeholder="Paste camera locations here (one per line)&#10;e.g.&#10;Location A&#10;Location B&#10;Location C"
                      value={bulkLocationsText}
                      onChange={(e) => setBulkLocationsText(e.target.value)}
                      style={{ marginTop: "6px", fontFamily: "monospace", minHeight: "130px" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={handleBulkImportLocations}
                    disabled={bulkLocationsImporting || !bulkLocationsText.trim()}
                  >
                    {bulkLocationsImporting ? "Importing..." : "Import Locations"}
                  </button>
                </div>

                {/* Bulk Add Camera Unit IDs */}
                <div style={{ display: "grid", gap: "10px", contentVisibility: "auto" }}>
                  <label style={{ fontWeight: 800, color: "var(--muted)", display: "grid", gap: "6px" }}>
                    Batch Add Camera Unit IDs
                    <textarea
                      rows={6}
                      placeholder="Paste camera unit IDs here (one per line)&#10;e.g.&#10;CAM001&#10;CAM002&#10;CAM003"
                      value={bulkCamerasText}
                      onChange={(e) => setBulkCamerasText(e.target.value)}
                      style={{ marginTop: "6px", fontFamily: "monospace", minHeight: "130px" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={handleBulkImportCameras}
                    disabled={bulkCamerasImporting || !bulkCamerasText.trim()}
                  >
                    {bulkCamerasImporting ? "Importing..." : "Import Camera Unit IDs"}
                  </button>
                </div>

              </div>
            </div>
            </>
          )}

          {/* Tab 2: Species & Behaviors */}
          {activeTab === "species_behaviors" && (
            <div className="dashboard-panel">
              <div className="form-grid" style={{ gap: "20px" }}>
                {/* Species List */}
                <div className="admin-card">
                  <h3>Configured Species ({choices.species.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "300px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Species Name</th>
                          <th>Category</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choices.species.map((spec) => (
                          <tr key={spec.name}>
                            <td><strong>{spec.name}</strong></td>
                            <td>
                              <span className={`pill-badge ${spec.type.toLowerCase()}`}>
                                {spec.type}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger-text-button"
                                onClick={() => handleDeleteItem("species", "name", spec.name)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Behaviors List */}
                <div className="admin-card">
                  <h3>Configured Behaviors ({choices.behaviors.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "300px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Behavior</th>
                          <th>Category</th>
                          <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choices.behaviors.map((beh) => (
                          <tr key={`${beh.name}-${beh.type}`}>
                            <td><strong>{beh.name}</strong></td>
                            <td>
                              <span className={`pill-badge ${beh.type.toLowerCase()}`}>
                                {beh.type}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="danger-text-button"
                                onClick={() => handleDeleteBehavior(beh.name, beh.type)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Side Add Forms */}
              <div className="form-grid" style={{ gap: "20px" }}>
                <div className="admin-card">
                  <h3>Add Species</h3>
                  <form onSubmit={handleAddSpecies} className="form-grid">
                    <label>
                      Category
                      <select
                        value={newSpeciesType}
                        onChange={(e) => setNewSpeciesType(e.target.value as ObservationType)}
                      >
                        <option value="Seabird">Seabird</option>
                        <option value="Predator">Predator</option>
                      </select>
                    </label>
                    <label>
                      Species Name
                      <input
                        type="text"
                        placeholder="e.g. Newell's Shearwater (Puffinus newelli)"
                        value={newSpeciesName}
                        onChange={(e) => setNewSpeciesName(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Species
                    </button>
                  </form>
                </div>

                <div className="admin-card">
                  <h3>Add Behavior</h3>
                  <form onSubmit={handleAddBehavior} className="form-grid">
                    <label>
                      Category
                      <select
                        value={newBehaviorType}
                        onChange={(e) => setNewBehaviorType(e.target.value as ObservationType)}
                      >
                        <option value="Seabird">Seabird</option>
                        <option value="Predator">Predator</option>
                      </select>
                    </label>
                    <label>
                      Behavior Description
                      <input
                        type="text"
                        placeholder="e.g. Incubating"
                        value={newBehaviorName}
                        onChange={(e) => setNewBehaviorName(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Behavior
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Annotation Templates */}
          {activeTab === "templates" && (
            <div className="dashboard-panel">
              <div className="admin-card">
                <h3>Annotation Templates ({choices.templates.length})</h3>
                <div className="table-wrap" style={{ maxHeight: "500px" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Template Label</th>
                        <th>Type</th>
                        <th>Species</th>
                        <th>Behavior</th>
                        <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {choices.templates.map((temp) => (
                        <tr key={temp.id || temp.label}>
                          <td><strong>{temp.label}</strong></td>
                          <td>
                            <span className={`pill-badge ${temp.type.toLowerCase()}`}>
                              {temp.type}
                            </span>
                          </td>
                          <td>{temp.species}</td>
                          <td>{temp.behavior}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="danger-text-button"
                              onClick={() => {
                                if (temp.id) handleDeleteTemplate(temp.id);
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {choices.templates.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ color: "var(--muted)" }}>No custom templates configured.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Side Add Form */}
              <div className="admin-card">
                <h3>Create New Template</h3>
                <form onSubmit={handleAddTemplate} className="form-grid">
                  <label>
                    Observation Category
                    <select
                      value={newTemplateType}
                      onChange={(e) => {
                        setNewTemplateType(e.target.value as ObservationType);
                        setNewTemplateSpecies("");
                        setNewTemplateBehavior("");
                      }}
                    >
                      <option value="Seabird">Seabird</option>
                      <option value="Predator">Predator</option>
                    </select>
                  </label>

                  <label>
                    Template Label
                    <input
                      type="text"
                      placeholder="e.g. Newell's - Incubating"
                      value={newTemplateLabel}
                      onChange={(e) => setNewTemplateLabel(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Select Species
                    <select
                      value={newTemplateSpecies}
                      onChange={(e) => setNewTemplateSpecies(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Species --</option>
                      {choices.species
                        .filter((s) => s.type === newTemplateType)
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    Select Behavior
                    <select
                      value={newTemplateBehavior}
                      onChange={(e) => setNewTemplateBehavior(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Behavior --</option>
                      {choices.behaviors
                        .filter((b) => b.type === newTemplateType)
                        .map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <button type="submit" className="button button-primary">
                    Create Template
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === "annotations" && (
            <div className="admin-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Synced Annotations Database</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                    Page {annotationQuery.cursors.length} · {annotationsList.length} annotations shown
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder="Search annotations..."
                    value={annotationSearch}
                    onChange={(e) => setAnnotationSearch(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--line)" }}
                  />
                  <select
                    value={filterCamera}
                    onChange={(e) => setFilterCamera(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--line)" }}
                  >
                    <option value="">All Cameras</option>
                    {choices.cameras.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={filterSite}
                    onChange={(e) => setFilterSite(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--line)" }}
                  >
                    <option value="">All Sites</option>
                    {choices.locations.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--line)" }}
                  >
                    <option value="">All Types</option>
                    <option value="Seabird">Seabird</option>
                    <option value="Predator">Predator</option>
                  </select>
                  <label>
                    Retrieval date filter
                    <input type="date" value={filterDate} onChange={(event) => { const date = event.target.value; setAnnotationQuery((prev) => ({...prev, date, cursors:[null]})); }} />
                  </label>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleExportAnnotationsCsv}
                    disabled={!filteredAnnotations.length || exportingAnnotations || annotationsLoading}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    {exportingAnnotations ? "Exporting…" : "Export CSV"}
                  </button>
                </div>
              </div>

              <div className="topbar-actions" aria-label="Annotation pages">
                <button className="button" type="button" disabled={annotationQuery.cursors.length === 1 || annotationsLoading} onClick={() => setAnnotationQuery((prev) => ({...prev, cursors:prev.cursors.slice(0,-1)}))}>Previous page</button>
                <span aria-live="polite">{annotationsLoading ? "Loading annotations…" : `Page ${annotationQuery.cursors.length}`}</span>
                <button className="button" type="button" disabled={!hasNextPage || annotationsLoading} onClick={() => setAnnotationQuery((prev) => ({...prev, cursors:[...prev.cursors, annotationsList[annotationsList.length - 1]]}))}>Next page</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: "550px", overflowY: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Image / Sequence</th>
                      <th>Location & Camera</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Species</th>
                      <th>Behavior</th>
                      <th>Reviewer</th>
                      <th>Notes</th>
                      <th style={{ width: "80px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnotations.map((anno) => (
                      <tr key={anno.id}>
                        <td>
                          <strong>{anno.start_filename}</strong>
                          {anno.is_single_image === "false" && anno.end_filename !== anno.start_filename && (
                            <span style={{ color: "var(--muted)", fontSize: "0.8rem", display: "block" }}>
                              &rarr; {anno.end_filename}
                            </span>
                          )}
                        </td>
                        <td>{anno.site} / {anno.camera}</td>
                        <td>{anno.retrieval_date}</td>
                        <td>
                          <span className={`pill-badge ${anno.type.toLowerCase()}`}>
                            {anno.type}
                          </span>
                        </td>
                        <td>{anno.species}</td>
                        <td>{anno.behavior}</td>
                        <td>{anno.reviewer_name}</td>
                        <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={anno.notes || ""}>
                          {anno.notes || "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="danger-text-button"
                            onClick={() => handleDeleteAnnotation(anno.id)}
                            title="Delete annotation from database"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAnnotations.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "24px" }}>
                          {annotationsList.length === 0
                            ? "No annotations found in the database. Annotate images in the workspace to sync them here."
                            : "No annotations match the current filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "audit_trail" && (
            <div className="admin-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Activity & Audit Trail ({filteredAuditLogs.length})</h3>
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                    Full history of who created, modified, or deleted records in the database.
                  </p>
                </div>
                <button
                  className="button"
                  onClick={handleExportAuditCsv}
                  disabled={filteredAuditLogs.length === 0}
                  type="button"
                >
                  Export Audit CSV
                </button>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px", background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "8px" }}>
                <input
                  type="search"
                  placeholder="Search user, action, summary..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  style={{ minHeight: "38px" }}
                />
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  style={{ minHeight: "38px" }}
                >
                  <option value="">All Actions</option>
                  <option value="CREATE">CREATE</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <select
                  value={auditTableFilter}
                  onChange={(e) => setAuditTableFilter(e.target.value)}
                  style={{ minHeight: "38px" }}
                >
                  <option value="">All Categories / Tables</option>
                  <option value="annotations">Annotations</option>
                  <option value="cameras">Camera Unit IDs</option>
                  <option value="site_locations">Camera Locations</option>
                  <option value="species">Species</option>
                  <option value="behaviors">Behaviors</option>
                  <option value="team_members">Team Members</option>
                  <option value="templates">Templates</option>
                </select>
                <select
                  value={auditUserFilter}
                  onChange={(e) => setAuditUserFilter(e.target.value)}
                  style={{ minHeight: "38px" }}
                >
                  <option value="">All Users</option>
                  {uniqueAuditUsers.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="topbar-actions" aria-label="Annotation pages">
                <button className="button" type="button" disabled={annotationQuery.cursors.length === 1 || annotationsLoading} onClick={() => setAnnotationQuery((prev) => ({...prev, cursors:prev.cursors.slice(0,-1)}))}>Previous page</button>
                <span aria-live="polite">{annotationsLoading ? "Loading annotations…" : `Page ${annotationQuery.cursors.length}`}</span>
                <button className="button" type="button" disabled={!hasNextPage || annotationsLoading} onClick={() => setAnnotationQuery((prev) => ({...prev, cursors:[...prev.cursors, annotationsList[annotationsList.length - 1]]}))}>Next page</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: "550px", overflowY: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "160px" }}>Timestamp</th>
                      <th style={{ width: "130px" }}>User</th>
                      <th style={{ width: "90px" }}>Action</th>
                      <th style={{ width: "130px" }}>Target</th>
                      <th>Summary</th>
                      <th style={{ width: "80px", textAlign: "right" }}>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                        </td>
                        <td>
                          <span className="pill-badge user">
                            {log.user_name}
                          </span>
                        </td>
                        <td>
                          <span className={`pill-badge ${log.action.toLowerCase()}`}>
                            {log.action}
                          </span>
                        </td>
                        <td><strong>{log.table_name}</strong></td>
                        <td>{log.summary}</td>
                        <td style={{ textAlign: "right" }}>
                          {(log.old_data || log.new_data) && (
                            <button
                              className="button"
                              style={{ padding: "3px 8px", fontSize: "0.75rem", minHeight: "unset" }}
                              onClick={() => setViewingLogDetails(log)}
                              type="button"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredAuditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "24px" }}>
                          {auditLogs.length === 0
                            ? "No audit records logged yet. Operations will be recorded here automatically."
                            : "No activity logs match the selected filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {viewingLogDetails && (
        <div className="modal-backdrop" onClick={() => setViewingLogDetails(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Audit Entry Details</h3>
              <button className="button" onClick={() => setViewingLogDetails(null)} type="button">✕</button>
            </div>
            <p><strong>Action:</strong> {viewingLogDetails.action} on <code>{viewingLogDetails.table_name}</code> by <strong>{viewingLogDetails.user_name}</strong></p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              {viewingLogDetails.created_at ? new Date(viewingLogDetails.created_at).toLocaleString() : "—"}
            </p>
            <p>{viewingLogDetails.summary}</p>
            {viewingLogDetails.old_data && (
              <div style={{ marginTop: "12px" }}>
                <strong>Previous Data:</strong>
                <pre style={{ background: "rgba(0,0,0,0.05)", padding: "10px", borderRadius: "6px", fontSize: "0.8rem", overflowX: "auto" }}>
                  {JSON.stringify(viewingLogDetails.old_data, null, 2)}
                </pre>
              </div>
            )}
            {viewingLogDetails.new_data && (
              <div style={{ marginTop: "12px" }}>
                <strong>New Data:</strong>
                <pre style={{ background: "rgba(0,0,0,0.05)", padding: "10px", borderRadius: "6px", fontSize: "0.8rem", overflowX: "auto" }}>
                  {JSON.stringify(viewingLogDetails.new_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
