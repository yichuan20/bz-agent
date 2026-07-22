"""File routes — workspace file operations.

All paths are confined to the workspace root (see :class:`FileService`); escapes via
``..``, absolute paths outside it, or symlinks are rejected with 400.

    GET    /api/v1/files?path=         list a directory
    GET    /api/v1/files/content       read a file as text
    PUT    /api/v1/files               write text to a file
    DELETE /api/v1/files?path=         delete a file or directory
    POST   /api/v1/files/mkdir         create a directory
    POST   /api/v1/files/rename        rename a file (same directory)
    POST   /api/v1/files/duplicate     duplicate a file (auto-named copy)
    POST   /api/v1/files/upload        upload binary file(s) via multipart
    GET    /api/v1/files/download      download a file as an attachment
    GET    /api/v1/files/view          serve a file inline (browser preview)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from workspace_backend.api.deps import get_file_service
from workspace_backend.api.schemas import (
    DuplicateFileRequest,
    FileContentResponse,
    FileEntry,
    FileListResponse,
    MkdirRequest,
    OkResponse,
    PathResponse,
    RenameFileRequest,
    UploadFileResponse,
    WriteFileRequest,
)
from workspace_backend.services.file_service import FileService

router = APIRouter(prefix="/api/v1/files", tags=["Files"])


@router.get(
    "",
    response_model=FileListResponse,
    summary="List a directory",
    description="List directory entries (dotfiles and doc sidecars hidden). Blank `path` lists the default workspace.",
)
async def list_dir(
    path: str = Query("", description="Directory to list; blank = default workspace."),
    svc: FileService = Depends(get_file_service),
) -> FileListResponse:
    resolved, entries = svc.list_dir(path)
    return FileListResponse(
        path=resolved,
        entries=[
            FileEntry(name=e.name, path=e.path, is_dir=e.is_dir, size=e.size, modified=e.modified) for e in entries
        ],
    )


@router.get(
    "/content",
    response_model=FileContentResponse,
    summary="Read a file",
    description="Read a file as UTF-8 text (invalid bytes replaced). Rejects paths outside the workspace.",
)
async def read_file(
    path: str = Query(..., description="File path (absolute within the workspace, or relative)."),
    svc: FileService = Depends(get_file_service),
) -> FileContentResponse:
    return FileContentResponse(path=path, content=svc.read_text(path))


@router.put(
    "",
    response_model=OkResponse,
    summary="Write a file",
    description="Write UTF-8 text to a file, creating parent directories. Rejects paths outside the workspace.",
)
async def write_file(
    body: WriteFileRequest,
    svc: FileService = Depends(get_file_service),
) -> OkResponse:
    svc.write_text(body.path, body.content)
    return OkResponse()


@router.delete(
    "",
    response_model=OkResponse,
    summary="Delete a file or directory",
    description="Delete a file, or a directory recursively. Rejects paths outside the workspace.",
)
async def delete_path(
    path: str = Query(..., description="Path to delete."),
    svc: FileService = Depends(get_file_service),
) -> OkResponse:
    svc.delete(path)
    return OkResponse()


@router.post(
    "/mkdir",
    response_model=PathResponse,
    summary="Create a directory",
    description="Create a directory `name` under `parent`. `name` may not contain slashes or `..`.",
)
async def mkdir(
    body: MkdirRequest,
    svc: FileService = Depends(get_file_service),
) -> PathResponse:
    return PathResponse(path=svc.mkdir(body.parent, body.name))


@router.post(
    "/rename",
    response_model=PathResponse,
    summary="Rename a file",
    description="Rename a file to a new basename within the same directory. Returns 400 if destination exists.",
)
async def rename_file(
    body: RenameFileRequest,
    svc: FileService = Depends(get_file_service),
) -> PathResponse:
    return PathResponse(path=svc.rename(body.path, body.new_name))


@router.post(
    "/duplicate",
    response_model=PathResponse,
    summary="Duplicate a file",
    description="Copy a file to an auto-named `<stem> copy[N]<suffix>` in the same directory.",
)
async def duplicate_file(
    body: DuplicateFileRequest,
    svc: FileService = Depends(get_file_service),
) -> PathResponse:
    return PathResponse(path=svc.duplicate(body.path))


@router.post(
    "/upload",
    response_model=UploadFileResponse,
    summary="Upload a file",
    description="Upload a file to the workspace. The filename is auto-incremented on collision.",
)
async def upload_file(
    file: UploadFile = File(...),
    dir: str = Form("", description="Destination directory; blank = default workspace."),
    svc: FileService = Depends(get_file_service),
) -> UploadFileResponse:
    data = await file.read()
    dest = await svc.save_upload(data, file.filename or "upload", dir)
    return UploadFileResponse(path=dest, name=dest.rsplit("/", 1)[-1])


@router.get(
    "/download",
    summary="Download a file",
    description="Download a file as an attachment (Content-Disposition: attachment).",
    response_class=FileResponse,
)
async def download_file(
    path: str = Query(..., description="File path."),
    svc: FileService = Depends(get_file_service),
) -> FileResponse:
    p, mime = svc.download_path(path)
    return FileResponse(p, media_type=mime, filename=p.name)


@router.get(
    "/view",
    summary="View a file",
    description="Serve a file inline (Content-Disposition: inline) for browser preview.",
    response_class=FileResponse,
)
async def view_file(
    path: str = Query(..., description="File path."),
    svc: FileService = Depends(get_file_service),
) -> FileResponse:
    p, mime = svc.download_path(path)
    return FileResponse(p, media_type=mime, headers={"Content-Disposition": "inline"})
