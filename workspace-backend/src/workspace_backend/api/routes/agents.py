"""Agent routes — the core agent lifecycle.

One ``agent`` resource. The durable record and the live runtime are the same resource
to the client; runtime state is a field and start/stop are sub-path actions:

    POST   /api/v1/agents                 create (record + config)
    GET    /api/v1/agents                 list
    GET    /api/v1/agents/status          ops snapshot of live runtimes
    GET    /api/v1/agents/{id}            single record
    PATCH  /api/v1/agents/{id}            update (title)
    DELETE /api/v1/agents/{id}            delete the durable record
    GET    /api/v1/agents/{id}/messages   transcript
    POST   /api/v1/agents/{id}/connect    start/attach the runtime → handshake
    POST   /api/v1/agents/{id}/stop       kill the runtime, keep the record
    GET    /api/v1/agents/{id}/events     SSE stream of agent output
    POST   /api/v1/agents/{id}/messages   send a message / permission reply

History vs. live turn — the two are separate sources:

* ``GET /messages`` returns **committed history** (the ``.jsonl`` transcript). bzcode
  writes a completed round (user + assistant) to disk *before* emitting that turn's
  final ``status: idle``, so once you've seen ``result``/``idle`` the round is in
  ``GET /messages``.
* The ``/events`` SSE stream carries the **current in-flight turn** only: the seeded
  user prompt, streaming ``delta``s, ``assistant``, tool/prompt events, and ``result``.
  It does not replay prior turns.

**Reconnect ordering:** open ``/events`` first, then ``GET /messages``. The stream
covers any in-flight turn (and, mid-turn, replays it), while ``GET /messages`` gives
the settled history — together they leave no gap even if a turn is being written as
you reconnect. Note: bzcode's resume ``session`` message also contains a ``messages``
array, but this backend does not surface it — always use ``GET /messages`` for history.

An agent reaped by the idle sweeper respawns transparently on the next ``connect``
(``--resume`` restores its history from disk); the client just reconnects.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import StreamingResponse

from workspace_backend.api.deps import (
    get_agent_service,
    get_credential_service,
    get_mode_service,
    get_pool,
)
from workspace_backend.api.schemas import (
    AgentListResponse,
    AgentRuntimeStatus,
    AgentSummary,
    ConnectRequest,
    ConnectResponse,
    CreateAgentRequest,
    CreateAgentResponse,
    MessagesResponse,
    OkResponse,
    PoolStatusResponse,
    SendMessageRequest,
    UpdateAgentRequest,
)
from workspace_backend.api.sse import sse_stream
from workspace_backend.domain.models import Agent
from workspace_backend.errors import AgentDead, AgentNotFound, AgentRuntimeNotLive, CredentialsMissing
from workspace_backend.services.agent_pool.pool import AgentPool
from workspace_backend.services.agent_service import AgentService
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.mode_service import ModeService

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # disable proxy buffering so events flush immediately
}


async def _to_summary(agent: Agent, svc: AgentService) -> AgentSummary:
    """Build an AgentSummary, relativizing working_dir for client display.

    ``default_marker`` is looked up on the raw stored dir; only the displayed
    ``working_dir`` is relativized (stripped of the parent-of-default-cwd prefix).
    """
    default_id = await svc.default_marker(agent.working_dir)
    return AgentSummary(
        id=agent.id,
        working_dir=svc.relativize_cwd(agent.working_dir),
        mode=agent.mode,
        title=agent.title,
        model=agent.model,
        message_count=agent.message_count,
        last_message=agent.last_message,
        last_modified=agent.last_modified,
        is_default=default_id == agent.id,
    )


@router.get(
    "",
    response_model=AgentListResponse,
    summary="List agents",
    description=(
        "List durable agent records, newest first. Filter by `cwd` to scope to one "
        "workspace. `working_dir` is returned relative to the server's workspace root "
        "when under it (e.g. `workspace/proj`), absolute otherwise."
    ),
)
async def list_agents(
    cwd: str = Query("", description="Optional working-directory filter."),
    svc: AgentService = Depends(get_agent_service),
) -> AgentListResponse:
    agents = await svc.list_all(cwd or None)
    return AgentListResponse(agents=[await _to_summary(a, svc) for a in agents])


@router.post(
    "",
    response_model=CreateAgentResponse,
    summary="Create an agent",
    description=(
        "Mint a new agent id and write its session config. Does not start the runtime "
        "— call `POST /api/v1/agents/{id}/connect` next. `cwd` blank/relative resolves "
        "against the server's default working directory."
    ),
)
async def create_agent(
    body: CreateAgentRequest = Body(default_factory=CreateAgentRequest),
    svc: AgentService = Depends(get_agent_service),
) -> CreateAgentResponse:
    agent_id = await svc.create(cwd=body.cwd, mode=body.mode)
    return CreateAgentResponse(id=agent_id)


@router.get(
    "/status",
    response_model=PoolStatusResponse,
    summary="Live runtime status",
    description="Ops snapshot of every live agent runtime in the pool (not the durable records).",
)
async def pool_status(pool: AgentPool = Depends(get_pool)) -> PoolStatusResponse:
    return PoolStatusResponse(agents=[AgentRuntimeStatus(**s) for s in pool.status()])


@router.get(
    "/{agent_id}",
    response_model=AgentSummary,
    summary="Get an agent",
    description="Return a single durable agent record, including its `is_default` marker.",
)
async def get_agent(
    agent_id: str,
    svc: AgentService = Depends(get_agent_service),
) -> AgentSummary:
    agent = await svc.get(agent_id)
    if agent is None:
        raise AgentNotFound(agent_id)
    return await _to_summary(agent, svc)


@router.patch(
    "/{agent_id}",
    response_model=OkResponse,
    summary="Update an agent",
    description="Update mutable fields (currently the title). Model switching is done via a `/model <id>` message.",
)
async def update_agent(
    agent_id: str,
    body: UpdateAgentRequest,
    svc: AgentService = Depends(get_agent_service),
) -> OkResponse:
    if body.title is not None:
        await svc.set_title(agent_id, body.title)
    return OkResponse()


@router.delete(
    "/{agent_id}",
    response_model=OkResponse,
    summary="Delete an agent",
    description="Delete the durable agent record (its transcript). Stop the runtime first if it's live.",
)
async def delete_agent(
    agent_id: str,
    svc: AgentService = Depends(get_agent_service),
) -> OkResponse:
    if not await svc.delete(agent_id):
        raise AgentNotFound(agent_id)
    return OkResponse()


@router.get(
    "/{agent_id}/messages",
    response_model=MessagesResponse,
    summary="Get transcript",
    description=(
        "Return the agent's **committed** conversation history (the persisted "
        "transcript). A completed round is written to disk before its turn's final "
        "`status: idle`, so once you've seen `result`/`idle` on the stream the round "
        "is here. This is the source of truth for history — on reconnect, open "
        "`/events` first, then call this. In-flight (not-yet-finished) turns are on "
        "the `/events` stream, not here."
    ),
)
async def get_messages(
    agent_id: str,
    svc: AgentService = Depends(get_agent_service),
) -> MessagesResponse:
    return MessagesResponse(messages=await svc.load_transcript(agent_id))


@router.post(
    "/{agent_id}/connect",
    response_model=ConnectResponse,
    summary="Connect to an agent",
    description=(
        "Start the agent's bzcode runtime (or re-attach if already live) and return the "
        "handshake: runtime status, session mode, advertised modes and slash commands. "
        "The body is optional — cwd/mode come from the agent's record (set at create); "
        "send `{}` for a normal (re)connect, or a field to override it. Requires a "
        "configured BZ_API_KEY (401 otherwise). Idempotent — safe to call on every "
        "page load / reconnect (an idle-reaped agent is respawned via `--resume`)."
    ),
    responses={401: {"description": "No BZ_API_KEY configured."}},
)
async def connect_agent(
    agent_id: str,
    body: ConnectRequest = Body(default_factory=ConnectRequest),
    svc: AgentService = Depends(get_agent_service),
    creds: CredentialService = Depends(get_credential_service),
    modes: ModeService = Depends(get_mode_service),
    pool: AgentPool = Depends(get_pool),
) -> ConnectResponse:
    if not await creds.api_key_present():
        raise CredentialsMissing("no BZ_API_KEY configured")

    effective_cwd = await svc.resolve_connect_cwd(agent_id, body.cwd)
    # Resolve mode: explicit override → stored meta → default.
    mode = body.mode
    if not mode:
        meta = await svc.get(agent_id)
        mode = meta.mode if meta else await modes.default_mode()

    # Write/refresh session config so bzcode picks up identity/soul/settings on resume.
    compiled = await svc.write_config(agent_id, mode, working_dir=effective_cwd)

    runtime = await pool.get_or_create(agent_id, effective_cwd, mode, session_mode=compiled.session_mode)
    # Note: modes/commands are best-effort here — on a fresh spawn bzcode's `session`
    # message may not be dispatched yet, so they can be empty. The client reads them
    # (and the current mode, from the follow-up `status: idle`) off the /events stream,
    # which replays the buffered session message on subscribe. This matches the
    # original server's connect behavior.
    return ConnectResponse(
        id=agent_id,
        cwd=effective_cwd,
        mode=mode,
        runtime_status=runtime.state.status,
        session_mode=runtime.state.session_mode,
        pid=runtime.pid,
        modes=runtime.state.available_modes,
        commands=runtime.state.available_commands,
    )


@router.post(
    "/{agent_id}/stop",
    response_model=OkResponse,
    summary="Stop an agent runtime",
    description="Kill the agent's bzcode process but keep its durable record. A later connect respawns it.",
)
async def stop_agent(
    agent_id: str,
    pool: AgentPool = Depends(get_pool),
) -> OkResponse:
    await pool.remove(agent_id)
    return OkResponse()


@router.get(
    "/{agent_id}/events",
    summary="Stream agent events (SSE)",
    description=(
        "Server-Sent-Events stream of the agent's output. Each event is a `data:` line "
        "carrying one bzcode protocol message (`session|status|delta|assistant|tool|"
        "prompt|result|system`). Carries the **current in-flight turn** only (seeded "
        "user prompt → deltas → assistant → result → status); prior turns come from "
        "`GET /messages`. Reconnecting mid-turn replays the in-flight turn. `: ping` "
        "comments keep the connection alive. Requires the runtime to be live (connect "
        "first).\n\n"
        "**Not testable via Swagger's Execute** — this is an infinite stream, and "
        "Swagger UI waits for the whole response before rendering, so it just spins. "
        "Test with a streaming client instead, e.g. `curl -N "
        "http://<host>/api/v1/agents/{id}/events` (and POST a message from another "
        "terminal), or an `EventSource` / `fetch`+`ReadableStream` client."
    ),
    responses={
        200: {"content": {"text/event-stream": {}}, "description": "SSE stream of protocol messages."},
        409: {"description": "Agent runtime is not live — connect first."},
        410: {"description": "Agent process is dead."},
    },
)
async def stream_events(
    agent_id: str,
    pool: AgentPool = Depends(get_pool),
) -> StreamingResponse:
    runtime = pool.get(agent_id)
    if runtime is None:
        raise AgentRuntimeNotLive(agent_id)
    if runtime.is_dead:
        raise AgentDead(agent_id)
    return StreamingResponse(sse_stream(runtime), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.post(
    "/{agent_id}/messages",
    response_model=OkResponse,
    summary="Send a message",
    description=(
        "Send a user turn or a permission/input reply to a live agent. Pass `content` "
        "for a plain turn (a `/model <id>` switches the model), or a full message with "
        "`type`/`subtype` for replies. Output arrives on the `/events` stream."
    ),
    responses={
        409: {"description": "Agent runtime is not live — connect first."},
        410: {"description": "Agent process is dead."},
    },
)
async def send_message(
    agent_id: str,
    body: SendMessageRequest,
    pool: AgentPool = Depends(get_pool),
) -> OkResponse:
    runtime = pool.get(agent_id)
    if runtime is None:
        raise AgentRuntimeNotLive(agent_id)
    if runtime.is_dead:
        raise AgentDead(agent_id)

    fields = body.model_dump(exclude_none=True)
    client_id = fields.pop("clientId", None)
    if "type" in fields:
        msg = fields
    else:
        content = fields.get("content", "")
        msg = {"type": "user", "content": content}

    # Seed a new user turn into the replay buffer so a mid-turn reconnect renders it.
    if msg.get("type") == "user" and not msg.get("subtype"):
        import json

        echo = dict(msg)
        if client_id is not None:
            echo["clientId"] = client_id
        runtime.seed_user_turn(json.dumps(echo))

    await runtime.send(msg)
    return OkResponse()
