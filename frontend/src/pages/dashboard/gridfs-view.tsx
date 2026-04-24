// @soleil-clems: Dashboard - MongoDB GridFS file manager
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type GridFSFileInfo } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function GridFSView() {
  const { selectedDb } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: buckets, isLoading: loadingBuckets } = useQuery<string[]>({
    queryKey: ["gridfs-buckets", selectedDb],
    queryFn: () => databaseRequest.mongoListGridFSBuckets(selectedDb),
    enabled: !!selectedDb,
  });

  const { data: files, isLoading: loadingFiles } = useQuery<GridFSFileInfo[]>({
    queryKey: ["gridfs-files", selectedDb, selectedBucket],
    queryFn: () => databaseRequest.mongoListGridFSFiles(selectedDb, selectedBucket!),
    enabled: !!selectedDb && !!selectedBucket,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      databaseRequest.mongoUploadGridFSFile(selectedDb, selectedBucket!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gridfs-files", selectedDb, selectedBucket] });
      queryClient.invalidateQueries({ queryKey: ["gridfs-buckets", selectedDb] });
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast("File uploaded", "success");
    },
    onError: (err: Error) => {
      setUploadError(err.message);
      toast(err.message, "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      databaseRequest.mongoDeleteGridFSFile(selectedDb, selectedBucket!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gridfs-files", selectedDb, selectedBucket] });
      toast("File deleted", "success");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBucket) return;
    setUploadError(null);
    uploadMutation.mutate(file);
  };

  const handleDownload = async (file: GridFSFileInfo) => {
    try {
      await databaseRequest.mongoDownloadGridFSFile(
        selectedDb,
        selectedBucket!,
        file.id,
        file.filename,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (file: GridFSFileInfo) => {
    if (!await confirm({ title: "Delete file", message: `Delete "${file.filename}"? This cannot be undone.`, confirmLabel: "Delete", variant: "destructive" })) return;
    deleteMutation.mutate(file.id);
  };

  // Auto-select first bucket
  if (buckets && buckets.length > 0 && !selectedBucket) {
    setSelectedBucket(buckets[0]);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">GridFS</span>
        <span className="text-muted-foreground">
          {selectedDb} · {buckets?.length ?? 0} bucket{(buckets?.length ?? 0) > 1 ? "s" : ""}
        </span>
        {selectedBucket && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {files?.length ?? 0} file{(files?.length ?? 0) > 1 ? "s" : ""}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && selectedBucket && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "+ Upload"}
              </Button>
            </>
          )}
        </div>
      </div>

      {loadingBuckets ? (
        <div className="p-3 space-y-2">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !buckets || buckets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm p-6">
          <div className="max-w-md">
            <div className="text-4xl mb-3">📁</div>
            <div className="font-medium text-foreground mb-1">No GridFS buckets</div>
            <p>
              GridFS stores files larger than 16 MB in MongoDB. A bucket is created
              automatically when you upload your first file via the driver.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Bucket sidebar */}
          <div className="w-48 border-r border-border bg-card/50 shrink-0 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Buckets
            </div>
            {buckets.map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBucket(b)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  selectedBucket === b
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground border-l-2 border-transparent"
                }`}
              >
                <span className="text-[10px]">📁</span>
                <span className="truncate font-mono">{b}</span>
              </button>
            ))}
          </div>

          {/* File list */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
            {loadingFiles ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-2">
                  {files?.map((f) => (
                    <div
                      key={f.id}
                      className="border border-border rounded-lg bg-card p-3 group hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold shrink-0">
                          📄
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">
                              {f.filename}
                            </span>
                            <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono">
                              {formatBytes(f.length)}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                            <span>Chunk: {formatBytes(f.chunkSize)}</span>
                            <span>·</span>
                            <span>{formatDate(f.uploadDate)}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
                            id: {f.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => handleDownload(f)}
                            className="text-[11px] text-primary hover:bg-primary/10 px-2 py-1 rounded"
                          >
                            Download
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(f)}
                              disabled={deleteMutation.isPending}
                              className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!files || files.length === 0) && (
                    <div className="text-center text-muted-foreground py-16 text-sm">
                      No files in this bucket.
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}

      {uploadError && (
        <div className="px-3 py-2 border-t border-destructive/20 bg-destructive/5 text-xs text-destructive">
          {uploadError}
        </div>
      )}
      {deleteMutation.isError && (
        <div className="px-3 py-2 border-t border-destructive/20 bg-destructive/5 text-xs text-destructive">
          {deleteMutation.error.message}
        </div>
      )}
    </div>
  );
}
