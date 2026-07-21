"""File routes — basic workspace file operations.

All paths are confined to the workspace root (see :class:`FileService`); escapes via
``..``, absolute paths outside it, or symlinks are rejected with 400.

    GET    /api/v1/files?path=       list a directory
    GET    /api/v1/files/content     read a file as text
    PUT    /api/v1/files             write text to a file
    DELETE /api/v1/files?path=       delete a file or directory
    POST   /api/v1/files/mkdir       create a directory
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from workspace_backend.api.deps import get_file_service
from workspace_backend.api.schemas import (
    FileContentResponse,
    FileEntry,
    FileListResponse,
    MkdirRequest,
    OkResponse,
    PathResponse,
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
