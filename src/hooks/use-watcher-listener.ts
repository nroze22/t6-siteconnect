import { useEffect } from "react";
import { listenForFileDetected } from "@/lib/tauri";
import { useWatcherStore } from "@/stores/use-watcher-store";
import { useToast } from "@/components/ui/Toast";
import { useAppStore } from "@/stores/use-app-store";
import { previewRealFile } from "@/lib/real-import";

/**
 * Global hook that listens for watcher file-detected events,
 * surfaces toast notifications, and kicks off background previews.
 * Mount once at the app root.
 */
export function useWatcherListener() {
  const addDetectedFile = useWatcherStore((s) => s.addDetectedFile);
  const setPreviewStatus = useWatcherStore((s) => s.setPreviewStatus);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const toast = useToast();

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    listenForFileDetected((event) => {
      addDetectedFile(event);

      toast.toast({
        type: "info",
        title: `New file detected: ${event.file_name}`,
        description: `${formatBytes(event.size_bytes)} — ready to import`,
        duration: 6000,
        action: {
          label: "Import",
          onClick: () => {
            sessionStorage.setItem(
              "siteconnect-import-file",
              JSON.stringify({
                path: event.path,
                name: event.file_name,
                size: event.size_bytes,
              })
            );
            setCurrentPage("import");
          },
        },
      });

      // Background preview
      setPreviewStatus(event.path, "loading");
      previewRealFile(event.path)
        .then(() => setPreviewStatus(event.path, "ready"))
        .catch(() => setPreviewStatus(event.path, "error"));
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, [addDetectedFile, setPreviewStatus, setCurrentPage, toast]);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
