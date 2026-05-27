"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type AnnotationTemplate, type ObservationType, type DynamicChoices, fallbackChoices } from "@/lib/annotation-data";
import { SyncIcon, TrashIcon } from "@/components/Icons";

type ActiveTab = "dropdowns" | "species_behaviors" | "templates";

interface ManagementDashboardProps {
  onBack: () => void;
}

export function ManagementDashboard({ onBack }: ManagementDashboardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dropdowns");
  const [choices, setChoices] = useState<DynamicChoices>(fallbackChoices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Input states for Add forms
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
      ] = await Promise.all([
        supabase.from("cameras").select("name").order("name"),
        supabase.from("site_locations").select("name").order("name"),
        supabase.from("species").select("name, type").order("name"),
        supabase.from("behaviors").select("name, type").order("name"),
        supabase.from("team_members").select("name").order("name"),
        supabase.from("templates").select("id, label, type, species, behavior").order("label"),
      ]);

      if (camErr || locErr || specErr || behErr || teamErr || tempErr) {
        throw new Error("Could not sync with Supabase tables. Ensure the schema SQL has been run.");
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
      console.error(err);
      setError(err.message || "Failed to load database. Falling back to default list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  // Helper to show brief success message
  function showFeedback(msg: string) {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(""), 3500);
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

  // --- Delete actions ---
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
          Cameras, Sites & Reviewers
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
            <div className="dashboard-panel">
              <div className="form-grid" style={{ gap: "20px" }}>
                {/* Cameras List */}
                <div className="admin-card">
                  <h3>Active Cameras ({choices.cameras.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "200px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Camera Name</th>
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
                            <td colSpan={2} style={{ color: "var(--muted)" }}>No custom cameras. Click Add to create one.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sites List */}
                <div className="admin-card">
                  <h3>Site Locations ({choices.locations.length})</h3>
                  <div className="table-wrap" style={{ maxHeight: "200px" }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Location Name</th>
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
                            <td colSpan={2} style={{ color: "var(--muted)" }}>No custom sites.</td>
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
                  <h3>Add New Camera</h3>
                  <form onSubmit={handleAddCamera} className="form-grid">
                    <label>
                      Camera Name
                      <input
                        type="text"
                        placeholder="e.g. LOC009"
                        value={newCamera}
                        onChange={(e) => setNewCamera(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Camera
                    </button>
                  </form>
                </div>

                <div className="admin-card">
                  <h3>Add New Site</h3>
                  <form onSubmit={handleAddLocation} className="form-grid">
                    <label>
                      Site Name
                      <input
                        type="text"
                        placeholder="e.g. Location 7"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="button button-primary">
                      Add Location
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
                                onClick={() => handleDeleteItem("behaviors", "name", beh.name)}
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
        </div>
      )}
    </div>
  );
}
