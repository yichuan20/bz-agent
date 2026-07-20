import { CheckCircleIcon, FileIcon, MagnifyingGlassIcon, UploadIcon } from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { dynasClient } from '#/auth';

export const Route = createFileRoute('/_app/files')({
  component: FilesPage,
});

type FileResource = {
  resourceId: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  size?: number;
  description?: string;
};

type FileListResponse = {
  data: FileResource[];
  total: number;
  limit: number;
  offset: number;
};

type ProcessingFile = {
  resourceId: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
};

function FilesPage() {
  const [files, setFiles] = useState<FileResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchFiles is local to effect
  useEffect(() => {
    async function fetchFiles() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: apiError } = await dynasClient.GET('/v1/apps/{appId}/files', {
          params: {
            path: { appId: import.meta.env.VITE_DYNAS_APP_ID },
            query: { q: searchQuery || undefined, limit: 50, offset: 0 },
          },
        });

        if (apiError) {
          setError(`Failed to load files: ${JSON.stringify(apiError)}`);
          return;
        }

        const response = data as unknown as FileListResponse;
        setFiles(response.data || []);
        setTotal(response.total || 0);
      } catch (err) {
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }

    void fetchFiles();
  }, [searchQuery, refreshTrigger]);

  const pollFileProcessing = (resourceId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        setProcessingFiles(prev => prev.filter(f => f.resourceId !== resourceId));
        return;
      }
      attempts++;

      try {
        const { data, error } = await (dynasClient.GET as any)(
          '/v1/apps/{appId}/files/{resourceId}',
          {
            params: { path: { appId: import.meta.env.VITE_DYNAS_APP_ID, resourceId } },
          },
        );

        if (error) return;

        const processing = (data as any).processing;
        if (processing) {
          setProcessingFiles(prev =>
            prev.map(f =>
              f.resourceId === resourceId
                ? { ...f, status: processing.status, progress: processing.progress }
                : f,
            ),
          );

          if (processing.status === 'completed' || processing.status === 'error') {
            setTimeout(() => {
              setProcessingFiles(prev => prev.filter(f => f.resourceId !== resourceId));
              setRefreshTrigger(prev => prev + 1);
            }, 2000);
            return;
          }
        }

        setTimeout(poll, 2000);
      } catch {
        // polling errors are non-fatal
      }
    };

    poll();
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const filesArray: Blob[] = Array.from(selectedFiles);

      const { data, error: uploadError } = await dynasClient.POST('/v1/apps/{appId}/files', {
        params: { path: { appId: import.meta.env.VITE_DYNAS_APP_ID } },
        body: { files: filesArray } as any,
        bodySerializer: body => {
          const formData = new FormData();
          for (const file of (body as any).files as Blob[]) {
            formData.append('files', file);
          }
          return formData as any;
        },
      });

      if (uploadError) throw new Error(JSON.stringify(uploadError));

      const count = filesArray.length;
      setUploadSuccess(`Successfully uploaded ${count} file${count > 1 ? 's' : ''}`);

      const uploadedFiles = (data as any)?.data || [];
      setProcessingFiles(
        uploadedFiles.map((f: any) => ({
          resourceId: f.resourceId,
          name: f.name,
          status: f.processing?.status || 'pending',
          progress: f.processing?.progress || 0,
        })),
      );

      for (const f of uploadedFiles) pollFileProcessing(f.resourceId);

      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const fileTypeLabel: Record<string, string> = {
    'bz-pdf': 'PDF Document',
    'bz-doc': 'Word Document',
    'bz-spreadsheet': 'Spreadsheet',
    'bz-slides': 'Presentation',
    'bz-email': 'Email',
    'bz-chatdoc': 'Chat Document',
    'bz-app': 'Application',
    'bz-ui-config': 'UI Config',
    'bz-widget': 'Widget',
    'bz-table': 'Table',
  };

  const processingStatusLabel = (f: ProcessingFile) => {
    if (f.status === 'pending') return 'Pending…';
    if (f.status === 'processing') return `Processing… ${f.progress || 0}%`;
    if (f.status === 'completed') return 'Completed ✓';
    return 'Error ✗';
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Files</h1>
          <p className="page-subtitle">Browse and manage your files. Total: {total}</p>
        </div>
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={uploading}
          className="btn-accent"
        >
          <UploadIcon size={14} />
          {uploading ? 'Uploading…' : 'Upload File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="visually-hidden"
          multiple
          accept="*/*"
        />
      </div>

      {processingFiles.length > 0 && (
        <div>
          {processingFiles.map(f => (
            <div key={f.resourceId} className="processing-item">
              <div className="processing-header">
                <span className="processing-name">{f.name}</span>
                <span className="processing-status">{processingStatusLabel(f)}</span>
              </div>
              {f.status !== 'error' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${f.progress || 0}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadSuccess && (
        <div className="success-state">
          <CheckCircleIcon size={18} weight="fill" />
          {uploadSuccess}
        </div>
      )}

      {uploadError && <div className="error-state">{uploadError}</div>}

      <div className="search-wrapper">
        <span className="search-icon">
          <MagnifyingGlassIcon size={16} />
        </span>
        <input
          type="text"
          placeholder="Search files by name or description…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
        />
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {!loading && !error && files.length === 0 && (
        <div className="empty-state">
          <FileIcon size={40} weight="duotone" />
          <p className="empty-state-title">No files found</p>
          <p className="empty-state-subtitle">
            {searchQuery ? 'Try a different search query' : 'Upload files to get started'}
          </p>
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="file-grid">
          {files.map(file => (
            <div key={file.resourceId} className="card file-card">
              <div className="file-card-header">
                <div className="card-icon">
                  <FileIcon size={16} weight="duotone" />
                </div>
                <div className="file-name-col">
                  <p className="file-name">{file.name}</p>
                  <p className="file-type">{fileTypeLabel[file.type] ?? file.type}</p>
                </div>
              </div>

              {file.description && <p className="file-desc">{file.description}</p>}

              <div className="file-card-meta">
                <div className="file-meta-text">
                  <div>Size: {formatSize(file.size)}</div>
                  <div>Updated: {formatDate(file.updatedAt)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
