"""API request/response schemas (pydantic v2 DTOs).

Every route body — request and response — is a model here, so the generated OpenAPI
schema fully describes the wire format for FE clients and LLMs. Fields carry
descriptions and examples; enums surface valid values in the schema.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from workspace_backend.domain.models import RuntimeStatus, SessionMode

# ── System ────────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    """Liveness probe result — the process is up and serving."""

    status: str = Field(default="ok", description="Always 'ok' when running.", examples=["ok"])


class VersionResponse(BaseModel):
    """Backend version information."""

    backend: str = Field(description="workspace-backend version.", examples=["0.1.0"])


class OkResponse(BaseModel):
    """Generic success acknowledgement."""

    ok: bool = Field(default=True, examples=[True])


# ── Agents ──────────────────────────────────────────────────────────────────


class AgentSummary(BaseModel):
    """A durable agent record as shown in listings."""

    id: str = Field(description="Server-minted agent id.", examples=["bz-a1b2c3d4e5f6"])
    working_dir: str = Field(
        description="Working dir, relative to the server workspace root when under it (else absolute).",
        examples=["workspace/proj"],
    )
    mode: str = Field(description="Agent mode / persona id.", examples=["general", "coder"])
    title: str = Field(
        description="Title (user-set, or derived from the first message).", examples=["Fix the auth bug"]
    )
    model: str = Field(default="", description="Model backing the agent (empty = default).", examples=[""])
    message_count: int = Field(default=0, description="Number of user messages.", examples=[7])
    last_message: str = Field(default="", description="Preview of the last user message.", examples=["add tests"])
    last_modified: float = Field(
        default=0.0, description="Transcript mtime (epoch seconds).", examples=[1_720_000_000.0]
    )
    is_default: bool = Field(
        default=False, description="Whether this is the default agent for its cwd.", examples=[False]
    )


class AgentListResponse(BaseModel):
    """A list of agent records, newest first."""

    agents: list[AgentSummary]


class CreateAgentRequest(BaseModel):
    """Create a new agent (durable record + config). Does not start the runtime."""

    cwd: str = Field(
        default="", description="Working dir; blank/relative resolves against the default.", examples=["workspace/proj"]
    )
    mode: str = Field(default="general", description="Agent mode / persona id.", examples=["general", "widget"])


class CreateAgentResponse(BaseModel):
    """The id of the newly-created agent."""

    id: str = Field(description="The new agent id — connect to it next.", examples=["bz-a1b2c3d4e5f6"])


class UpdateAgentRequest(BaseModel):
    """Patch an agent's mutable fields."""

    title: str | None = Field(default=None, description="New title (max 100 chars).", examples=["Renamed session"])


class ConnectRequest(BaseModel):
    """Start (or re-attach to) an agent's runtime. All fields optional.

    cwd and mode are fixed at create time and stored in the agent's record; a normal
    (re)connect sends an empty body `{}`. Provide a field only to **override** the
    stored value for this run.
    """

    cwd: str = Field(
        default="", description="Override the agent's stored working dir (blank = use stored).", examples=[""]
    )
    mode: str = Field(default="", description="Override the agent's stored mode (blank = use stored).", examples=[""])


class ConnectResponse(BaseModel):
    """Runtime handshake returned after connecting."""

    id: str = Field(description="Agent id.", examples=["bz-a1b2c3d4e5f6"])
    cwd: str = Field(description="Resolved working directory.", examples=["/home/boltzagent/workspace/proj"])
    mode: str = Field(description="Active agent mode.", examples=["coder"])
    runtime_status: RuntimeStatus = Field(description="Live runtime status.", examples=[RuntimeStatus.IDLE])
    session_mode: SessionMode = Field(description="bzcode runtime mode.", examples=[SessionMode.YOLO])
    pid: int | None = Field(default=None, description="Process id of the bzcode runtime.", examples=[40123])
    modes: list[str] = Field(
        default_factory=list, description="Session modes bzcode advertises.", examples=[["default", "plan", "yolo"]]
    )
    commands: list[dict[str, Any]] = Field(default_factory=list, description="Slash commands bzcode advertises.")


class MessagesResponse(BaseModel):
    """An agent's conversation transcript."""

    messages: list[dict[str, Any]] = Field(description="Ordered message objects (bzcode format).")


class SendMessageRequest(BaseModel):
    """Send a user turn, or a permission/input reply, to a live agent.

    Either pass a full bzcode client message (with ``type``), or just ``content`` for
    a plain user turn. A ``/model <id>`` content switches the model.
    """

    content: str | None = Field(
        default=None,
        description="User message text (or a slash command).",
        examples=["Fix the bug", "/model boltzbit-1"],
    )
    type: str | None = Field(
        default=None, description="Full-message type (e.g. 'user'); omit to send a plain turn.", examples=["user"]
    )
    subtype: str | None = Field(
        default=None, description="'permission' or 'input' for replies.", examples=["permission"]
    )
    requestId: str | None = Field(default=None, description="The prompt requestId being answered.", examples=["req-1"])
    behavior: str | None = Field(
        default=None, description="Permission reply: allow | deny | always.", examples=["allow"]
    )
    answers: dict[str, str] | None = Field(default=None, description="Input reply answers, keyed by question.")
    clientId: str | None = Field(default=None, description="Client-only id echoed back for optimistic-UI dedup.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"content": "Fix the bug in auth.ts"},
                {"type": "user", "subtype": "permission", "requestId": "req-1", "behavior": "allow"},
            ]
        }
    }


class AgentRuntimeStatus(BaseModel):
    """One live runtime in the ops status snapshot."""

    agentId: str
    cwd: str
    mode: str
    pid: int | None
    alive: bool
    runtimeStatus: str
    sessionMode: str
    model: str
    subscribers: int
    idleSeconds: float | None


class PoolStatusResponse(BaseModel):
    """Ops snapshot of all live runtimes."""

    agents: list[AgentRuntimeStatus]


# ── Defaults ──────────────────────────────────────────────────────────────────


class SetDefaultRequest(BaseModel):
    """Set (or clear) the default agent for a working directory."""

    cwd: str = Field(description="Working directory.", examples=["workspace/proj"])
    agent_id: str = Field(
        default="", description="Agent id to make default; blank clears it.", examples=["bz-a1b2c3d4e5f6"]
    )


# ── Auth ──────────────────────────────────────────────────────────────────────


class ApiKeyStatusResponse(BaseModel):
    """Whether a BZ_API_KEY is configured."""

    present: bool = Field(description="True when a BZ_API_KEY is stored.", examples=[True])


class SetApiKeyRequest(BaseModel):
    """Set the BZ_API_KEY login credential."""

    value: str = Field(description="The BZ_API_KEY value.", examples=["bz_xxxxxxxxxxxxxxxx"])


# ── Secrets (widget placeholders) ─────────────────────────────────────────────


class SecretKeysResponse(BaseModel):
    """Names of stored widget secrets (never the values)."""

    keys: list[str] = Field(
        description="Secret placeholder names.", examples=[["OPENAI_API_KEY", "OPENWEATHERMAP_API_KEY"]]
    )


class SetSecretRequest(BaseModel):
    """Store a widget secret placeholder value."""

    key: str = Field(description="Secret name (referenced as {{KEY}} in widgets).", examples=["OPENWEATHERMAP_API_KEY"])
    value: str = Field(description="Secret value.", examples=["abc123"])


# ── Modes & models ────────────────────────────────────────────────────────────


class ModeInfo(BaseModel):
    """An agent mode / persona."""

    id: str = Field(examples=["coder"])
    label: str = Field(examples=["Coder"])
    icon: str = Field(default="", examples=["code"])
    description: str = Field(default="", examples=["Code projects and deployment"])


class ModesResponse(BaseModel):
    """Available agent modes and the default."""

    default: str = Field(examples=["general"])
    modes: list[ModeInfo]


class ClassifyRequest(BaseModel):
    """Classify a free-text request into a base mode."""

    message: str = Field(description="The user's request.", examples=["build a countdown timer"])


class ClassifyResponse(BaseModel):
    """The classified base mode."""

    mode: str = Field(description="One of: general, widget, worker, coder.", examples=["widget"])


class ModelInfo(BaseModel):
    """An available model."""

    id: str = Field(examples=["boltzbit-1"])
    displayName: str = Field(examples=["Boltzbit 1"])


class ModelsResponse(BaseModel):
    """Available models and the agent's current one."""

    models: list[ModelInfo]
    current: str = Field(default="", description="The current model for the queried agent.", examples=["boltzbit-1"])


# ── Files ─────────────────────────────────────────────────────────────────────


class FileEntry(BaseModel):
    """One entry in a directory listing."""

    name: str = Field(examples=["report.docx"])
    path: str = Field(examples=["/home/boltzagent/workspace/report.docx"])
    is_dir: bool = Field(examples=[False])
    size: int = Field(examples=[10240])
    modified: float = Field(examples=[1_720_000_000.0])


class FileListResponse(BaseModel):
    """A directory listing (dotfiles and document sidecars hidden)."""

    path: str = Field(examples=["/home/boltzagent/workspace"])
    entries: list[FileEntry]


class FileContentResponse(BaseModel):
    """A text file's contents."""

    path: str
    content: str


class WriteFileRequest(BaseModel):
    """Write UTF-8 text to a file (parents created)."""

    path: str = Field(
        description="File path (absolute within the workspace, or relative).", examples=["workspace/notes.md"]
    )
    content: str = Field(description="UTF-8 text content.", examples=["# Notes\n"])


class MkdirRequest(BaseModel):
    """Create a directory under a parent."""

    parent: str = Field(description="Parent directory.", examples=["workspace"])
    name: str = Field(description="New directory name (no slashes).", examples=["reports"])


class PathResponse(BaseModel):
    """A resolved path result."""

    path: str = Field(examples=["/home/boltzagent/workspace/reports"])
