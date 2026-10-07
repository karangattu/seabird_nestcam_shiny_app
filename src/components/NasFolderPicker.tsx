"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SynologyFolderListing } from "@/lib/synology";

export function NasFolderPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (folder: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<SynologyFolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const browseButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ folder: path });
        const response = await fetch(`/api/synology/folders?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Could not load NAS folders.");
        if (!controller.signal.aborted) setListing(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not load NAS folders.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [open, path, attempt]);

  function close() {
    setOpen(false);
    browseButton.current?.focus();
  }

  function navigate(folder: string) {
    setLoading(true);
    setListing(null);
    setPath(folder);
  }

  return (
    <>
      <button ref={browseButton} className="button button-ghost" type="button" disabled={disabled}
        aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) { close(); return; }
          navigate(value);
          setOpen(true);
        }}>
        Browse folders
      </button>
      {open && (
        <section className="nas-folder-picker" id={panelId} aria-label="Choose NAS folder"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") { event.preventDefault(); close(); }
          }}>
          <div className="nas-folder-picker-header">
            <strong>Choose NAS folder</strong>
            <button className="button button-ghost" type="button" autoFocus onClick={close}>Cancel</button>
          </div>
          <p className="nas-folder-path">{listing?.folder || path || "Starting folder"}</p>
          <button className="button button-ghost" type="button" disabled={loading || !!error || !listing?.parentFolder}
            onClick={() => listing?.parentFolder && navigate(listing.parentFolder)}>Up one folder</button>
          {loading ? <p role="status">Loading folders...</p> : error ? (
            <div>
              <p role="alert">{error}</p>
              <button className="button button-ghost" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
            </div>
          ) : (
            <ul className="nas-folder-list">
              {listing?.folders.map((folder) => (
                <li key={folder.path}>
                  <button className="button button-ghost" type="button" aria-label={`Open ${folder.name}`}
                    onClick={() => navigate(folder.path)}>{folder.name}<span aria-hidden="true">›</span></button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && listing?.folders.length === 0 && <p>No subfolders in this folder.</p>}
          <button className="button button-primary" type="button" disabled={loading || !!error || !listing}
            onClick={() => { if (listing) { onChange(listing.folder); close(); } }}>Use this folder</button>
        </section>
      )}
    </>
  );
}
