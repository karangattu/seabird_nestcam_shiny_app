"use client";

import { useEffect, useState } from "react";
import type { ReleaseCheckResult } from "@/lib/release-checker";

export const UPDATE_DISMISS_STORAGE_KEY = "seabird-dismissed-release";

type UpdateBannerProps = {
  storageKey?: string;
  initialData?: ReleaseCheckResult | null;
};

function safeGetStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function UpdateBanner({
  storageKey = UPDATE_DISMISS_STORAGE_KEY,
  initialData = null,
}: UpdateBannerProps) {
  const [updateInfo, setUpdateInfo] = useState<ReleaseCheckResult | null>(initialData);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (initialData?.latestVersion) {
      if (safeGetStorage(storageKey) === initialData.latestVersion) {
        setIsDismissed(true);
      }
      return;
    }

    let isMounted = true;
    async function fetchVersion() {
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const data: ReleaseCheckResult = await res.json();
        if (!isMounted) return;

        if (data.updateAvailable && data.latestVersion) {
          const dismissed = safeGetStorage(storageKey);
          if (dismissed === data.latestVersion) {
            setIsDismissed(true);
          } else {
            setUpdateInfo(data);
          }
        }
      } catch {}
    }

    fetchVersion();

    return () => {
      isMounted = false;
    };
  }, [initialData, storageKey]);

  if (!updateInfo || !updateInfo.updateAvailable || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    if (updateInfo.latestVersion) {
      safeSetStorage(storageKey, updateInfo.latestVersion);
    }
    setIsDismissed(true);
  };

  return (
    <aside className="update-banner" role="region" aria-label="Software update notification">
      <div className="update-banner-content">
        <span className="update-banner-tag">Update</span>
        <span className="update-banner-text">
          A new version (<strong>v{updateInfo.latestVersion}</strong>) is available on GitHub Releases.
          {updateInfo.currentVersion ? ` You are on v${updateInfo.currentVersion}.` : ""}
        </span>
      </div>
      <div className="update-banner-actions">
        <a
          href={updateInfo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="update-banner-link"
        >
          View Release
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          className="update-banner-dismiss"
          aria-label="Dismiss update notification"
          title="Dismiss"
        >
          &times;
        </button>
      </div>
    </aside>
  );
}
