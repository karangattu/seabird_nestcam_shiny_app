"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ANNOTATION_COLUMNS,
  ANNOTATION_TEMPLATES,
  CAMERAS,
  SITE_LOCATIONS,
  getBehaviorChoices,
  getSpeciesChoices,
  type AnnotationRecord,
  type ObservationType,
} from "@/lib/annotation-data";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  EditIcon,
  EndIcon,
  ExpandIcon,
  InstallIcon,
  NestCamIcon,
  ServerIcon,
  SheetIcon,
  SingleImageIcon,
  StartIcon,
  SyncIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from "@/components/Icons";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

type LocalImage = {
  id: string;
  name: string;
  url: string;
  size: number;
  captureTime: string;
  lastModified: number;
  source: "local" | "synology";
  path?: string;
};

type AnnotationDraft = {
  site: string;
  camera: string;
  retrievalDate: string;
  type: ObservationType;
  species: string;
  behavior: string;
  reviewerName: string;
  notes: string;
};

type SheetApiResponse = {
  configured: boolean;
  headers: string[];
  rows: Record<string, string>[];
  message?: string;
};

type SyncStatus = "idle" | "syncing" | "success" | "error";

type SynologyListResponse = {
  configured: boolean;
  missing?: string[];
  defaultFolder?: string;
  images: Array<{
    name: string;
    path: string;
    size: number;
    captureTime: string;
    url: string;
  }>;
  message?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DRAFT_STORAGE_KEY = "seabird-nestcam-draft-v1";
const ANNOTATIONS_STORAGE_KEY = "seabird-nestcam-annotations-v1";
const REVIEWED_STORAGE_KEY = "seabird-nestcam-reviewed-v1";
const THUMBNAIL_WINDOW_SIZE = 48;

const emptySheetResponse: SheetApiResponse = {
  configured: false,
  headers: [],
  rows: [],
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultDraft(): AnnotationDraft {
  return {
    site: "",
    camera: "",
    retrievalDate: todayInputValue(),
    type: "Seabird",
    species: "",
    behavior: "",
    reviewerName: "",
    notes: "",
  };
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? (JSON.parse(storedValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate(),
  )} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(
    date.getSeconds(),
  )}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function csvEscape(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function makeCsv(records: AnnotationRecord[]) {
  const header = ANNOTATION_COLUMNS.join(",");
  const rows = records.map((record) =>
    ANNOTATION_COLUMNS.map((column) => csvEscape(record[column] ?? "")).join(","),
  );
  return [header, ...rows].join("\n");
}

function compactFileName(fileName: string, maxLength = 36) {
  if (fileName.length <= maxLength) {
    return fileName;
  }

  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : "";
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  return `${baseName.slice(0, maxLength - extension.length - 3)}...${extension}`;
}

function getMissingFields(draft: AnnotationDraft) {
  const requiredFields: Array<[string, string]> = [
    ["Site", draft.site],
    ["Camera", draft.camera],
    ["Retrieval Date", draft.retrievalDate],
    ["Species", draft.species],
    ["Behavior", draft.behavior],
    ["Reviewer Name", draft.reviewerName],
  ];

  return requiredFields
    .filter(([, fieldValue]) => !fieldValue.trim())
    .map(([fieldName]) => fieldName);
}

function recordToDraft(record: AnnotationRecord): AnnotationDraft {
  return {
    site: record.Site,
    camera: record.Camera,
    retrievalDate: record["Retrieval Date"],
    type: record.Type === "Predator" ? "Predator" : "Seabird",
    species: record.Species,
    behavior: record.Behavior,
    reviewerName: record["Reviewer Name"],
    notes: record.Notes,
  };
}

export function AnnotationWorkspace() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [markedStartIndex, setMarkedStartIndex] = useState<number | null>(null);
  const [markedEndIndex, setMarkedEndIndex] = useState<number | null>(null);
  const [sequenceStartTime, setSequenceStartTime] = useState("");
  const [sequenceEndTime, setSequenceEndTime] = useState("");
  const [isSingleImage, setIsSingleImage] = useState(false);
  const [draft, setDraft] = useState<AnnotationDraft>(() =>
    readStoredJson(DRAFT_STORAGE_KEY, createDefaultDraft()),
  );
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>(() =>
    readStoredJson(ANNOTATIONS_STORAGE_KEY, []),
  );
  const [reviewedNames, setReviewedNames] = useState<Set<string>>(
    () => new Set(readStoredJson<string[]>(REVIEWED_STORAGE_KEY, [])),
  );
  const [assignmentsSheet, setAssignmentsSheet] = useState<SheetApiResponse>(emptySheetResponse);
  const [annotationsSheet, setAnnotationsSheet] = useState<SheetApiResponse>(emptySheetResponse);
  const [sheetMessage, setSheetMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [editingAnnotationIndex, setEditingAnnotationIndex] = useState<number | null>(null);
  const [synologyFolder, setSynologyFolder] = useState("");
  const [synologyLimit, setSynologyLimit] = useState(300);
  const [isLoadingSynology, setIsLoadingSynology] = useState(false);
  const objectUrlsRef = useRef<string[]>([]);

  const currentImage = images[currentIndex] ?? null;
  const speciesChoices = useMemo(() => getSpeciesChoices(draft.type), [draft.type]);
  const behaviorChoices = useMemo(() => getBehaviorChoices(draft.type), [draft.type]);
  const missingFields = useMemo(() => getMissingFields(draft), [draft]);
  const hasMarkedRange = markedStartIndex !== null && markedEndIndex !== null;
  const canSave = images.length > 0 && hasMarkedRange && missingFields.length === 0;
  const editingAnnotation = editingAnnotationIndex === null ? null : annotations[editingAnnotationIndex];
  const canSubmitAnnotation = editingAnnotation ? missingFields.length === 0 : canSave;

  const reviewerChoices = useMemo(() => {
    const names = assignmentsSheet.rows
      .map((row) => row.Reviewer || row["Reviewer Name"] || "")
      .filter((name) => name.trim().length > 0);
    return Array.from(new Set(names)).sort((firstName, secondName) =>
      firstName.localeCompare(secondName),
    );
  }, [assignmentsSheet.rows]);

  const visibleImages = useMemo(() => {
    const halfWindow = Math.floor(THUMBNAIL_WINDOW_SIZE / 2);
    const firstIndex = Math.max(0, currentIndex - halfWindow);
    const lastIndex = Math.min(images.length, firstIndex + THUMBNAIL_WINDOW_SIZE);
    const adjustedFirstIndex = Math.max(0, lastIndex - THUMBNAIL_WINDOW_SIZE);

    return images.slice(adjustedFirstIndex, lastIndex).map((image, offset) => ({
      image,
      imageIndex: adjustedFirstIndex + offset,
    }));
  }, [currentIndex, images]);

  const selectedRangeLabel = useMemo(() => {
    if (markedStartIndex === null || markedEndIndex === null) {
      if (editingAnnotation) {
        return `${compactFileName(editingAnnotation["Start Filename"])} to ${compactFileName(
          editingAnnotation["End Filename"],
        )}`;
      }
      return "No range selected";
    }

    if (markedStartIndex === markedEndIndex) {
      return compactFileName(images[markedStartIndex]?.name ?? "Single image");
    }

    return `${compactFileName(images[markedStartIndex]?.name ?? "Start")} to ${compactFileName(
      images[markedEndIndex]?.name ?? "End",
    )}`;
  }, [editingAnnotation, images, markedEndIndex, markedStartIndex]);

  const recentAnnotations = useMemo(
    () => annotations.map((annotation, annotationIndex) => ({ annotation, annotationIndex })).slice(-8).reverse(),
    [annotations],
  );

  const clearObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    objectUrlsRef.current = [];
  }, []);

  const resetMarks = useCallback(() => {
    setMarkedStartIndex(null);
    setMarkedEndIndex(null);
    setSequenceStartTime("");
    setSequenceEndTime("");
    setIsSingleImage(false);
  }, []);

  const replaceImages = useCallback(
    (files: File[]) => {
      clearObjectUrls();
      const nextImages = files
        .filter(isImageFile)
        .sort((firstFile, secondFile) => firstFile.name.localeCompare(secondFile.name))
        .map((file, fileIndex) => {
          const objectUrl = URL.createObjectURL(file);
          objectUrlsRef.current.push(objectUrl);
          return {
            id: `${file.name}-${file.size}-${file.lastModified}-${fileIndex}`,
            name: file.name,
            url: objectUrl,
            size: file.size,
            captureTime: formatDateTime(file.lastModified),
            lastModified: file.lastModified,
            source: "local" as const,
          };
        });

      setImages(nextImages);
      setCurrentIndex(0);
      resetMarks();
    },
    [clearObjectUrls, resetMarks],
  );

  const goToPreviousImage = useCallback(() => {
    setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1));
  }, []);

  const goToNextImage = useCallback(() => {
    setCurrentIndex((previousIndex) => Math.min(images.length - 1, previousIndex + 1));
  }, [images.length]);

  const markStart = useCallback(() => {
    if (!currentImage || isSingleImage) {
      return;
    }

    setMarkedStartIndex((previousIndex) => {
      if (previousIndex === currentIndex) {
        setSequenceStartTime("");
        return null;
      }

      setSequenceStartTime(currentImage.captureTime);
      return currentIndex;
    });
  }, [currentImage, currentIndex, isSingleImage]);

  const markEnd = useCallback(() => {
    if (!currentImage || isSingleImage) {
      return;
    }

    setMarkedEndIndex((previousIndex) => {
      if (previousIndex === currentIndex) {
        setSequenceEndTime("");
        return null;
      }

      setSequenceEndTime(currentImage.captureTime);
      return currentIndex;
    });
  }, [currentImage, currentIndex, isSingleImage]);

  const toggleSingleImage = useCallback(() => {
    if (!currentImage) {
      return;
    }

    setIsSingleImage((previousValue) => {
      const nextValue = !previousValue;
      if (nextValue) {
        setMarkedStartIndex(currentIndex);
        setMarkedEndIndex(currentIndex);
        setSequenceStartTime(currentImage.captureTime);
        setSequenceEndTime(currentImage.captureTime);
      } else {
        resetMarks();
      }
      return nextValue;
    });
  }, [currentImage, currentIndex, resetMarks]);

  const handleFilesSelected = useCallback(
    (fileList: FileList | File[]) => {
      replaceImages(Array.from(fileList));
    },
    [replaceImages],
  );

  const loadSynologyImages = useCallback(async () => {
    setIsLoadingSynology(true);
    setSyncStatus("syncing");
    setSyncMessage("Loading images from Synology...");

    try {
      const params = new URLSearchParams({
        folder: synologyFolder,
        limit: String(synologyLimit),
      });
      const response = await fetch(`/api/synology/list?${params.toString()}`);
      const result = (await response.json()) as SynologyListResponse;

      if (!response.ok) {
        throw new Error(result.message ?? "Could not load images from Synology.");
      }
      if (!result.configured) {
        throw new Error(
          result.missing?.length
            ? `Missing Synology settings: ${result.missing.join(", ")}`
            : "Synology is not configured on the server.",
        );
      }

      clearObjectUrls();
      setImages(
        result.images.map((image, imageIndex) => ({
          id: `synology-${image.path}-${imageIndex}`,
          name: image.name,
          url: image.url,
          size: image.size,
          captureTime: image.captureTime,
          lastModified: 0,
          source: "synology" as const,
          path: image.path,
        })),
      );
      setCurrentIndex(0);
      resetMarks();
      if (!synologyFolder && result.defaultFolder) {
        setSynologyFolder(result.defaultFolder);
      }
      setSyncStatus("success");
      setSyncMessage(`Loaded ${result.images.length} Synology images.`);
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Could not load Synology images.");
    } finally {
      setIsLoadingSynology(false);
    }
  }, [clearObjectUrls, resetMarks, synologyFolder, synologyLimit]);

  const updateDraft = useCallback((patch: Partial<AnnotationDraft>) => {
    setDraft((previousDraft) => ({ ...previousDraft, ...patch }));
  }, []);

  const handleTypeChange = useCallback(
    (type: ObservationType) => {
      updateDraft({ type, species: "", behavior: "" });
    },
    [updateDraft],
  );

  const handleTemplateChange = useCallback(
    (templateLabel: string) => {
      const template = ANNOTATION_TEMPLATES.find(
        (candidateTemplate) => candidateTemplate.label === templateLabel,
      );
      if (!template) {
        return;
      }

      updateDraft({
        type: template.type,
        species: template.species,
        behavior: template.behavior,
      });
    },
    [updateDraft],
  );

  const saveAnnotation = useCallback(() => {
    const currentEditingRecord = editingAnnotationIndex === null ? null : annotations[editingAnnotationIndex];
    const requiresMarkedImages = !currentEditingRecord;

    if (
      !canSubmitAnnotation ||
      (requiresMarkedImages && (markedStartIndex === null || markedEndIndex === null))
    ) {
      setSyncStatus("error");
      setSyncMessage(
        missingFields.length
          ? `Missing: ${missingFields.join(", ")}`
          : "Mark a start and end image before saving.",
      );
      return;
    }

    if (
      !isSingleImage &&
      markedStartIndex !== null &&
      markedEndIndex !== null &&
      markedEndIndex < markedStartIndex
    ) {
      setSyncStatus("error");
      setSyncMessage("End image cannot be before the start image.");
      return;
    }

    const startImage = markedStartIndex === null ? null : images[markedStartIndex];
    const endImage = markedEndIndex === null ? null : images[markedEndIndex];
    const startFilename = startImage?.name ?? currentEditingRecord?.["Start Filename"] ?? "";
    const endFilename = endImage?.name ?? currentEditingRecord?.["End Filename"] ?? "";

    if (!startFilename || !endFilename) {
      setSyncStatus("error");
      setSyncMessage("Mark a start and end image before saving.");
      return;
    }

    const record: AnnotationRecord = {
      "Start Filename": startFilename,
      "End Filename": endFilename,
      Site: draft.site,
      Camera: draft.camera,
      "Retrieval Date": draft.retrievalDate,
      Type: draft.type,
      Species: draft.species,
      Behavior: draft.behavior,
      "Sequence Start Time": sequenceStartTime || currentEditingRecord?.["Sequence Start Time"] || "",
      "Sequence End Time": sequenceEndTime || currentEditingRecord?.["Sequence End Time"] || "",
      "Is Single Image": String(isSingleImage),
      "Reviewer Name": draft.reviewerName,
      Notes: draft.notes,
    };

    setAnnotations((previousAnnotations) => {
      if (editingAnnotationIndex === null) {
        return [...previousAnnotations, record];
      }

      return previousAnnotations.map((annotation, annotationIndex) =>
        annotationIndex === editingAnnotationIndex ? record : annotation,
      );
    });
    if (markedStartIndex !== null && markedEndIndex !== null) {
      setReviewedNames((previousNames) => {
        const nextNames = new Set(previousNames);
        const rangeStart = Math.min(markedStartIndex, markedEndIndex);
        const rangeEnd = Math.max(markedStartIndex, markedEndIndex);
        for (let imageIndex = rangeStart; imageIndex <= rangeEnd; imageIndex += 1) {
          const image = images[imageIndex];
          if (image) {
            nextNames.add(image.name);
          }
        }
        return nextNames;
      });
    }
    setSyncStatus("success");
    setSyncMessage(editingAnnotationIndex === null ? "Annotation saved locally." : "Annotation updated locally.");
    setEditingAnnotationIndex(null);
    updateDraft({ notes: "" });
    resetMarks();
    if (markedEndIndex !== null && images.length) {
      setCurrentIndex((previousIndex) => Math.min(images.length - 1, markedEndIndex + 1 || previousIndex));
    }
  }, [
    annotations,
    canSubmitAnnotation,
    draft,
    editingAnnotationIndex,
    images,
    isSingleImage,
    markedEndIndex,
    markedStartIndex,
    missingFields,
    resetMarks,
    sequenceEndTime,
    sequenceStartTime,
    updateDraft,
  ]);

  const beginEditAnnotation = useCallback(
    (annotation: AnnotationRecord, annotationIndex: number) => {
      setEditingAnnotationIndex(annotationIndex);
      setDraft(recordToDraft(annotation));
      setSequenceStartTime(annotation["Sequence Start Time"]);
      setSequenceEndTime(annotation["Sequence End Time"]);
      setIsSingleImage(annotation["Is Single Image"] === "true");

      const startIndex = images.findIndex((image) => image.name === annotation["Start Filename"]);
      const endIndex = images.findIndex((image) => image.name === annotation["End Filename"]);
      setMarkedStartIndex(startIndex >= 0 ? startIndex : null);
      setMarkedEndIndex(endIndex >= 0 ? endIndex : null);
      if (startIndex >= 0) {
        setCurrentIndex(startIndex);
      }
      setSyncStatus("idle");
      setSyncMessage("Editing local annotation.");
    },
    [images],
  );

  const cancelEditAnnotation = useCallback(() => {
    setEditingAnnotationIndex(null);
    updateDraft({ notes: "" });
    resetMarks();
    setSyncStatus("idle");
    setSyncMessage("Edit cancelled.");
  }, [resetMarks, updateDraft]);

  const deleteAnnotation = useCallback(
    (annotationIndex: number) => {
      setAnnotations((previousAnnotations) =>
        previousAnnotations.filter((_, candidateIndex) => candidateIndex !== annotationIndex),
      );
      if (editingAnnotationIndex === annotationIndex) {
        setEditingAnnotationIndex(null);
        resetMarks();
      }
      setSyncStatus("success");
      setSyncMessage("Annotation removed locally.");
    },
    [editingAnnotationIndex, resetMarks],
  );

  const undoLastAnnotation = useCallback(() => {
    if (!annotations.length) {
      return;
    }
    deleteAnnotation(annotations.length - 1);
  }, [annotations.length, deleteAnnotation]);

  const syncAnnotations = useCallback(async () => {
    if (!annotations.length) {
      return;
    }

    setSyncStatus("syncing");
    setSyncMessage("Syncing annotations...");

    try {
      const response = await fetch("/api/sheets/annotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ annotations }),
      });
      const result = (await response.json()) as { synced?: number; message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Google Sheets sync failed.");
      }

      setAnnotations([]);
      setEditingAnnotationIndex(null);
      setSyncStatus("success");
      setSyncMessage(`Synced ${result.synced ?? annotations.length} annotation rows.`);
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Google Sheets sync failed.");
    }
  }, [annotations]);

  const exportLocalCsv = useCallback(() => {
    if (!annotations.length) {
      return;
    }

    const blob = new Blob([makeCsv(annotations)], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = `seabird-annotations-${todayInputValue()}.csv`;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);
  }, [annotations]);

  const clearLocalSession = useCallback(() => {
    const confirmed = window.confirm("Clear local images, marks, and unsynced annotations?");
    if (!confirmed) {
      return;
    }

    clearObjectUrls();
    setImages([]);
    setCurrentIndex(0);
    setAnnotations([]);
    setEditingAnnotationIndex(null);
    setReviewedNames(new Set());
    setDraft(createDefaultDraft());
    resetMarks();
    setSyncStatus("idle");
    setSyncMessage("");
  }, [clearObjectUrls, resetMarks]);

  const installApp = useCallback(async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  useEffect(() => {
    writeStoredJson(DRAFT_STORAGE_KEY, draft);
  }, [draft]);

  useEffect(() => {
    writeStoredJson(ANNOTATIONS_STORAGE_KEY, annotations);
  }, [annotations]);

  useEffect(() => {
    writeStoredJson(REVIEWED_STORAGE_KEY, Array.from(reviewedNames));
  }, [reviewedNames]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadSheets() {
      try {
        const [assignmentsResponse, annotationsResponse] = await Promise.all([
          fetch("/api/sheets/assignments", { signal: abortController.signal }),
          fetch("/api/sheets/annotations", { signal: abortController.signal }),
        ]);
        const [nextAssignmentsSheet, nextAnnotationsSheet] = await Promise.all([
          assignmentsResponse.json() as Promise<SheetApiResponse>,
          annotationsResponse.json() as Promise<SheetApiResponse>,
        ]);

        if (abortController.signal.aborted) {
          return;
        }

        setAssignmentsSheet(nextAssignmentsSheet);
        setAnnotationsSheet(nextAnnotationsSheet);
        setSheetMessage(
          nextAssignmentsSheet.message || nextAnnotationsSheet.message || "",
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          setSheetMessage(
            error instanceof Error ? error.message : "Could not load Google Sheets data.",
          );
        }
      }
    }

    loadSheets();
    return () => abortController.abort();
  }, []);

  useEffect(() => clearObjectUrls, [clearObjectUrls]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousImage();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextImage();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        markStart();
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        markEnd();
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        toggleSingleImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextImage, goToPreviousImage, markEnd, markStart, toggleSingleImage]);

  return (
    <>
      <ServiceWorkerRegistration />
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <NestCamIcon size={32} />
            </div>
            <div>
              <h1>Seabird NestCam</h1>
              <p>Annotation workspace</p>
            </div>
          </div>
          <div className="topbar-actions">
            {installPrompt ? (
              <button className="button button-ghost" type="button" onClick={installApp}>
                <InstallIcon />
                Install
              </button>
            ) : null}
            <button
              className="button button-secondary"
              type="button"
              onClick={exportLocalCsv}
              disabled={!annotations.length}
            >
              <UploadIcon />
              CSV
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={syncAnnotations}
              disabled={!annotations.length || syncStatus === "syncing"}
            >
              <SyncIcon />
              {syncStatus === "syncing" ? "Syncing" : "Sync"}
            </button>
          </div>
        </header>

        <main className="workspace-grid">
          <section className="image-column" aria-label="Image review workspace">
            <div className="status-grid" aria-label="Session status">
              <div className="stat-tile">
                <CameraIcon />
                <span>Images</span>
                <strong>{images.length}</strong>
              </div>
              <div className="stat-tile">
                <StartIcon />
                <span>Current</span>
                <strong>{images.length ? `${currentIndex + 1}/${images.length}` : "0/0"}</strong>
              </div>
              <div className="stat-tile">
                <CheckIcon />
                <span>Saved</span>
                <strong>{annotations.length}</strong>
              </div>
              <div className="stat-tile">
                <SheetIcon />
                <span>Sheets</span>
                <strong>{assignmentsSheet.configured || annotationsSheet.configured ? "On" : "Local"}</strong>
              </div>
            </div>

            <label
              className="file-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFilesSelected(event.dataTransfer.files);
              }}
            >
              <input
                className="file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  if (event.currentTarget.files) {
                    handleFilesSelected(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }
                }}
              />
              <CameraIcon size={26} />
              <span className="file-drop-title">Add nest camera images</span>
              <span className="file-drop-meta">
                {images.length ? `${images.length} files loaded` : "JPG, PNG, or WebP"}
              </span>
            </label>

            <div className="source-panel" aria-label="Synology NAS image source">
              <div className="source-panel-title">
                <ServerIcon />
                <span>Synology NAS</span>
              </div>
              <label>
                Folder path
                <input
                  value={synologyFolder}
                  onChange={(event) => setSynologyFolder(event.currentTarget.value)}
                  placeholder="/volume1/camera-folder"
                />
              </label>
              <label>
                Max images
                <input
                  min={1}
                  max={2000}
                  type="number"
                  value={synologyLimit}
                  onChange={(event) => setSynologyLimit(Number(event.currentTarget.value) || 300)}
                />
              </label>
              <button
                className="button button-ghost"
                type="button"
                onClick={loadSynologyImages}
                disabled={isLoadingSynology}
              >
                <ServerIcon />
                {isLoadingSynology ? "Loading" : "Load NAS images"}
              </button>
            </div>

            <div className="viewer-panel">
              <div className="viewer-toolbar">
                <button
                  className="icon-button"
                  type="button"
                  onClick={goToPreviousImage}
                  disabled={currentIndex === 0}
                  title="Previous image"
                  aria-label="Previous image"
                >
                  <ArrowLeftIcon />
                </button>
                <div className="file-readout">
                  <strong>{currentImage ? compactFileName(currentImage.name, 54) : "No image selected"}</strong>
                  <span>{currentImage?.captureTime || "Load images to begin"}</span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={goToNextImage}
                  disabled={!images.length || currentIndex >= images.length - 1}
                  title="Next image"
                  aria-label="Next image"
                >
                  <ArrowRightIcon />
                </button>
              </div>

              <div className="image-stage">
                {currentImage ? (
                  <img
                    className="viewer-image viewer-image--contain"
                    src={currentImage.url}
                    alt={currentImage.name}
                    decoding="async"
                    onDoubleClick={() => setIsFullscreen(true)}
                  />
                ) : (
                  <div className="empty-state">
                    <NestCamIcon size={48} />
                    <strong>Ready for review</strong>
                    <span>Local files stay in the browser until synced.</span>
                  </div>
                )}
                {currentImage ? (
                  <button
                    className="stage-expand"
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    title="Expand image"
                    aria-label="Expand image"
                  >
                    <ExpandIcon />
                  </button>
                ) : null}
              </div>

              <div className="marking-bar" aria-label="Sequence markings">
                <button
                  className={`mark-button ${markedStartIndex === currentIndex ? "active start" : ""}`}
                  type="button"
                  onClick={markStart}
                  disabled={!currentImage || isSingleImage}
                  title="Mark sequence start"
                >
                  <StartIcon />
                  Start
                </button>
                <button
                  className={`mark-button ${markedEndIndex === currentIndex ? "active end" : ""}`}
                  type="button"
                  onClick={markEnd}
                  disabled={!currentImage || isSingleImage}
                  title="Mark sequence end"
                >
                  <EndIcon />
                  End
                </button>
                <button
                  className={`mark-button ${isSingleImage ? "active single" : ""}`}
                  type="button"
                  onClick={toggleSingleImage}
                  disabled={!currentImage}
                  title="Mark single image observation"
                >
                  <SingleImageIcon />
                  Single
                </button>
              </div>

              <div className="range-strip">
                <span>{selectedRangeLabel}</span>
                <button type="button" onClick={resetMarks} disabled={!hasMarkedRange}>
                  Reset marks
                </button>
              </div>
            </div>

            <div className="thumbnail-grid" aria-label="Loaded image thumbnails">
              {visibleImages.map(({ image, imageIndex }) => {
                const isCurrent = imageIndex === currentIndex;
                const isStart = imageIndex === markedStartIndex;
                const isEnd = imageIndex === markedEndIndex;
                const isReviewed = reviewedNames.has(image.name);

                return (
                  <button
                    className={`thumbnail ${isCurrent ? "current" : ""}`}
                    key={image.id}
                    type="button"
                    onClick={() => setCurrentIndex(imageIndex)}
                    title={image.name}
                    aria-label={`Open ${image.name}`}
                  >
                    <img src={image.url} alt="" loading="lazy" decoding="async" />
                    <span className="thumbnail-index">{imageIndex + 1}</span>
                    {isStart || isEnd || isReviewed ? (
                      <span className={`thumbnail-badge ${isStart ? "start" : isEnd ? "end" : "reviewed"}`}>
                        {isStart ? <StartIcon size={14} /> : isEnd ? <EndIcon size={14} /> : <CheckIcon size={14} />}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="annotation-panel" aria-label="Annotation details">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Annotation</span>
                <h2>Details</h2>
              </div>
              <button className="icon-button danger" type="button" onClick={clearLocalSession} title="Clear local data" aria-label="Clear local data">
                <TrashIcon />
              </button>
            </div>

            <div className="form-grid">
              <label>
                Template
                <select defaultValue="" onChange={(event) => handleTemplateChange(event.currentTarget.value)}>
                  <option value="">No template</option>
                  {ANNOTATION_TEMPLATES.map((template) => (
                    <option key={template.label} value={template.label}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="inline-fields">
                <label>
                  Site
                  <select value={draft.site} onChange={(event) => updateDraft({ site: event.currentTarget.value })}>
                    <option value="">Select</option>
                    {SITE_LOCATIONS.map((siteLocation) => (
                      <option key={siteLocation} value={siteLocation}>
                        {siteLocation}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Camera
                  <select value={draft.camera} onChange={(event) => updateDraft({ camera: event.currentTarget.value })}>
                    <option value="">Select</option>
                    {CAMERAS.map((camera) => (
                      <option key={camera} value={camera}>
                        {camera}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Retrieval date
                <input
                  type="date"
                  value={draft.retrievalDate}
                  onChange={(event) => updateDraft({ retrievalDate: event.currentTarget.value })}
                />
              </label>

              <fieldset className="segmented-control">
                <legend>Type</legend>
                <button
                  className={draft.type === "Seabird" ? "selected" : ""}
                  type="button"
                  onClick={() => handleTypeChange("Seabird")}
                >
                  Seabird
                </button>
                <button
                  className={draft.type === "Predator" ? "selected" : ""}
                  type="button"
                  onClick={() => handleTypeChange("Predator")}
                >
                  Predator
                </button>
              </fieldset>

              <label>
                Species
                <select value={draft.species} onChange={(event) => updateDraft({ species: event.currentTarget.value })}>
                  <option value="">Select</option>
                  {speciesChoices.map((species) => (
                    <option key={species} value={species}>
                      {species}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Behavior
                <select value={draft.behavior} onChange={(event) => updateDraft({ behavior: event.currentTarget.value })}>
                  <option value="">Select</option>
                  {behaviorChoices.map((behavior) => (
                    <option key={behavior} value={behavior}>
                      {behavior}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Reviewer
                <input
                  list="reviewer-options"
                  value={draft.reviewerName}
                  onChange={(event) => updateDraft({ reviewerName: event.currentTarget.value })}
                  placeholder="Name"
                />
                <datalist id="reviewer-options">
                  {reviewerChoices.map((reviewerName) => (
                    <option key={reviewerName} value={reviewerName} />
                  ))}
                </datalist>
              </label>

              <div className="inline-fields">
                <label>
                  Start time
                  <input value={sequenceStartTime} onChange={(event) => setSequenceStartTime(event.currentTarget.value)} />
                </label>
                <label>
                  End time
                  <input value={sequenceEndTime} onChange={(event) => setSequenceEndTime(event.currentTarget.value)} />
                </label>
              </div>

              <label>
                Notes
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => updateDraft({ notes: event.currentTarget.value })}
                />
              </label>
            </div>

            {missingFields.length ? (
              <div className="form-alert">
                <AlertIcon />
                <span>{missingFields.join(", ")}</span>
              </div>
            ) : null}

            <button className="button button-save" type="button" onClick={saveAnnotation} disabled={!canSubmitAnnotation}>
              <CheckIcon />
              {editingAnnotation ? "Update annotation" : "Save annotation"}
            </button>

            {editingAnnotation ? (
              <button className="button button-secondary button-cancel-edit" type="button" onClick={cancelEditAnnotation}>
                <UndoIcon />
                Cancel edit
              </button>
            ) : null}

            <div className={`sync-note ${syncStatus}`} aria-live="polite">
              {syncMessage || sheetMessage || "Local session is ready."}
            </div>

            <div className="sheet-summary">
              <div>
                <span>Assignments</span>
                <strong>{assignmentsSheet.rows.length}</strong>
              </div>
              <div>
                <span>Sheet rows</span>
                <strong>{annotationsSheet.rows.length}</strong>
              </div>
            </div>
          </aside>
        </main>

        <section className="saved-section" aria-label="Saved annotations">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Current session</span>
              <h2>Saved annotations</h2>
            </div>
            <div className="section-actions">
              <button className="button button-secondary" type="button" onClick={exportLocalCsv} disabled={!annotations.length}>
                <UploadIcon />
                Export CSV
              </button>
              <button className="button button-ghost" type="button" onClick={undoLastAnnotation} disabled={!annotations.length}>
                <UndoIcon />
                Undo last
              </button>
              <button className="button button-primary" type="button" onClick={syncAnnotations} disabled={!annotations.length || syncStatus === "syncing"}>
                <SheetIcon />
                Sync rows
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Species</th>
                  <th>Behavior</th>
                  <th>Reviewer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentAnnotations.length ? (
                  recentAnnotations.map(({ annotation, annotationIndex }) => (
                    <tr key={`${annotation["Start Filename"]}-${annotationIndex}`}>
                      <td>{annotation["Is Single Image"] === "true" ? "Single" : annotation.Type}</td>
                      <td>{compactFileName(annotation["Start Filename"], 28)}</td>
                      <td>{compactFileName(annotation["End Filename"], 28)}</td>
                      <td>{annotation.Species}</td>
                      <td>{annotation.Behavior}</td>
                      <td>{annotation["Reviewer Name"]}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => beginEditAnnotation(annotation, annotationIndex)}
                            aria-label="Edit annotation"
                            title="Edit annotation"
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => deleteAnnotation(annotationIndex)}
                            aria-label="Delete annotation"
                            title="Delete annotation"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>No local annotations saved yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {isFullscreen && currentImage ? (
        <div className="fullscreen-backdrop" role="dialog" aria-modal="true" onClick={() => setIsFullscreen(false)}>
          <button className="fullscreen-close" type="button" onClick={() => setIsFullscreen(false)}>
            Close
          </button>
          <img src={currentImage.url} alt={currentImage.name} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}
