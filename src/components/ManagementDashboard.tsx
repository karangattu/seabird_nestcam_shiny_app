"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type AnnotationTemplate, type ObservationType, type DynamicChoices, fallbackChoices } from "@/lib/annotation-data";
import { SyncIcon, TrashIcon } from "@/components/Icons";

type ActiveTab = "dropdowns" | "species_behaviors" | "templates" | "annotations";

interface DbAnnotation {
  id: string;
  start_filename: string;
  end_filename: string;
  site: string;
  camera: string;
  retrieval_date: string;
  type: string;
  species: string;
  behavior: string;
  sequence_start_time?: string | null;
  sequence_end_time?: string | null;
  is_single_image: string;
  reviewer_name: string;
  notes?: string | null;
  created_at?: string;
}

interface ManagementDashboardProps {
  onBack: () => void;
}

export function ManagementDashboard({ onBack }: ManagementDashboardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dropdowns");
  const [choices, setChoices] = useState<DynamicChoices>(fallbackChoices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

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
  const [filterCamera, setFilterCamera] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [filterType, setFilterType] = useState("");
  const isMountedRef = useRef(true);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  async function loadAllData() {
    setLoading(true);
    setError("");
    try {
      const [
        { data: camerasData, error: camErr },
        { data: locationsData, error: locErr },
        { data: speciesData, error: specErr },
        { data: behaviorsData, error: behErr },
        { data: teamData, error: teamErr },
        { data: templatesData, error: tempErr },
        { data: annotationsData },
      ] = await Promise.all([
        supabase.from("cameras").select("name").order("name"),
        supabase.from("site_locations").select("name").order("name"),
        supabase.from("species").select("name, type").order("name"),
        supabase.from("behaviors").select("name, type").order("name"),
        supabase.from("team_members").select("name").order("name"),
        supabase.from("templates").select("id, label, type, species, behavior").order("label"),
        supabase.from("annotations").select("*").order("created_at", { ascending: false }),
      ]);

      if (camErr || locErr || specErr || behErr || teamErr || tempErr) {
        throw new Error("Could not sync with Supabase tables. Ensure the schema SQL has been run.");
      }

      if (!isMountedRef.current) return;

      if (annotationsData) {
        setAnnotationsList(annotationsData as DbAnnotation[]);
      }

      setChoices({
        cameras: (camerasData || []).map((c: any) => c.name),
        locations: (locationsData || []).map((l: any) => l.name),
        species: (speciesData || []).map((s: any) => ({ name: s.name, type: s.type as ObservationType })),
        behaviors: (behaviorsData || []).map((b: any) => ({ name: b.name, type: b.type as ObservationType })),
        teamMembers: (teamData || []).map((t: any) => t.name),
        templates: (templatesData || []).map((t: any) => ({
          id: t.id,
          label: t.label,
          type: t.type as ObservationType,
          species: t.species,
          behavior: t.behavior,
        })),
      });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error(err);
      setError(err.message || "Failed to load database. Falling back to default list.");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    loadAllData();
    return () => {
      isMountedRef.current = false;
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
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
      const { error } = await supabase.from("cameras").insert({ name: newCamera.trim() });
      if (error) throw error;
      setNewCamera("");
      showFeedback(`Camera "${newCamera}" added.`);
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocation.trim()) return;
    try {
      const { error } = await supabase.from("site_locations").insert({ name: newLocation.trim() });
      if (error) throw error;
      setNewLocation("");
      showFeedback(`Site "${newLocation}" added.`);
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddReviewer(e: React.FormEvent) {
    e.preventDefault();
    if (!newReviewer.trim()) return;
    try {
      const { error } = await supabase.from("team_members").insert({ name: newReviewer.trim() });
      if (error) throw error;
      setNewReviewer("");
      showFeedback(`Reviewer "${newReviewer}" added.`);
      loadAllData();
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

      setBulkLocationsText("");
      showFeedback(`Successfully imported ${newItems.length} new Camera Location(s).`);
      loadAllData();
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

      setBulkCamerasText("");
      showFeedback(`Successfully imported ${newItems.length} new Camera Unit ID(s).`);
      loadAllData();
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
      const { error } = await supabase.from("species").insert({
        name: newSpeciesName.trim(),
        type: newSpeciesType,
      });
      if (error) throw error;
      setNewSpeciesName("");
      showFeedback(`Species "${newSpeciesName}" added.`);
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error adding item.");
    }
  }

  async function handleAddBehavior(e: React.FormEvent) {
    e.preventDefault();
    if (!newBehaviorName.trim()) return;
    try {
      const { error } = await supabase.from("behaviors").insert({
        name: newBehaviorName.trim(),
        type: newBehaviorType,
      });
      if (error) throw error;
      setNewBehaviorName("");
      showFeedback(`Behavior "${newBehaviorName}" added.`);
      loadAllData();
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
      const { error } = await supabase.from("templates").insert({
        label: newTemplateLabel.trim(),
        type: newTemplateType,
        species: newTemplateSpecies,
        behavior: newTemplateBehavior,
      });
      if (error) throw error;
      setNewTemplateLabel("");
      setNewTemplateSpecies("");
      setNewTemplateBehavior("");
      showFeedback(`Template "${newTemplateLabel}" created.`);
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error creating template.");
    }
  }

  async function handleDeleteItem(table: string, column: string, value: string) {
    if (!confirm(`Are you sure you want to delete this ${table} entry?`)) return;
    try {
      const { error } = await supabase.from(table).delete().eq(column, value);
      if (error) throw error;
      showFeedback("Item deleted.");
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error deleting item.");
    }
  }

  async function handleDeleteBehavior(name: string, type: ObservationType) {
    if (!confirm(`Are you sure you want to delete behavior "${name}" (${type})?`)) return;
    try {
      const { error } = await supabase.from("behaviors").delete().match({ name, type });
      if (error) throw error;
      showFeedback("Behavior deleted.");
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error deleting behavior.");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
      showFeedback("Template deleted.");
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error deleting template.");
    }
  }

  async function handleDeleteAnnotation(id: string) {
    if (!confirm("Are you sure you want to delete this annotation from the database?")) return;
    try {
      const { error } = await supabase.from("annotations").delete().eq("id", id);
      if (error) throw error;
      showFeedback("Annotation deleted.");
      loadAllData();
    } catch (err: any) {
      alert(err.message || "Error deleting annotation.");
    }
  }

  function handleExportAnnotationsCsv() {
    if (!filteredAnnotations.length) return;
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
    const rows = filteredAnnotations.map((anno) =>
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
  }

  const filteredAnnotations = useMemo(() => {
    const query = annotationSearch.trim().toLowerCase();
    return annotationsList.filter((anno) => {
      if (filterCamera && anno.camera !== filterCamera) return false;
      if (filterSite && anno.site !== filterSite) return false;
      if (filterType && anno.type !== filterType) return false;
      if (query) {
        const matches =
          anno.species?.toLowerCase().includes(query) ||
          anno.behavior?.toLowerCase().includes(query) ||
          anno.reviewer_name?.toLowerCase().includes(query) ||
          anno.start_filename?.toLowerCase().includes(query) ||
          anno.end_filename?.toLowerCase().includes(query) ||
          anno.notes?.toLowerCase().includes(query) ||
          anno.camera?.toLowerCase().includes(query) ||
          anno.site?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [annotationsList, annotationSearch, filterCamera, filterSite, filterType]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">📋</div>
          <div>
            <h1>KESRP NestCam</h1>
            <p>Management & Admin Dashboard</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="button" type="button" onClick={loadAllData} title="Refresh tables">
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
          Annotations Database ({annotationsList.length})
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
                  <h3 style={{ margin: 0 }}>Synced Annotations Database ({annotationsList.length})</h3>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                    Showing {filteredAnnotations.length} of {annotationsList.length} annotations in Supabase
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
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleExportAnnotationsCsv}
                    disabled={!filteredAnnotations.length}
                    style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                  >
                    Export CSV
                  </button>
                </div>
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
        </div>
      )}
    </div>
  );
}
