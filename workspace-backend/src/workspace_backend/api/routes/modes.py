"""Modes, models, classification, and defaults routes.

- ``GET /api/v1/modes`` — the agent mode / persona catalog.
- ``POST /api/v1/modes/classify`` — LLM-route a free-text request to a base mode
  (used by the Home composer to pre-select a mode).
- ``GET /api/v1/models`` — available models + the current model for an agent (the FE
  renders the model picker from this; switching is a `/model` message).
- ``PUT /api/v1/defaults`` — set/clear the default agent for a working directory.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from workspace_backend.api.deps import (
    get_agent_service,
    get_credential_service,
    get_mode_service,
    get_model_service,
)
from workspace_backend.api.schemas import (
    ClassifyRequest,
    ClassifyResponse,
    ModeInfo,
    ModelInfo,
    ModelsResponse,
    ModesResponse,
    OkResponse,
    SetDefaultRequest,
)
from workspace_backend.services.agent_service import AgentService
from workspace_backend.services.credential_service import CredentialService
from workspace_backend.services.mode_service import ModeService
from workspace_backend.services.model_service import ModelService

router = APIRouter(prefix="/api/v1", tags=["Modes"])


@router.get(
    "/modes",
    response_model=ModesResponse,
    summary="List agent modes",
    description="Return the agent mode / persona catalog and the default mode id.",
)
async def list_modes(modes: ModeService = Depends(get_mode_service)) -> ModesResponse:
    cfg = await modes.load_config()
    infos = [
        ModeInfo(
            id=mode_id,
            label=entry.get("label", mode_id),
            icon=entry.get("icon", ""),
            description=entry.get("description", ""),
        )
        for mode_id, entry in (cfg.get("modes") or {}).items()
    ]
    return ModesResponse(default=cfg.get("default", "general"), modes=infos)


@router.post(
    "/modes/classify",
    response_model=ClassifyResponse,
    summary="Classify a request into a mode",
    description=(
        "Use an LLM to route a free-text request to one of the base modes "
        "(general / widget / worker / coder). Falls back to 'general' with no key or on "
        "any failure — this is a convenience, never a hard dependency."
    ),
)
async def classify_mode(
    body: ClassifyRequest,
    modes: ModeService = Depends(get_mode_service),
    creds: CredentialService = Depends(get_credential_service),
) -> ClassifyResponse:
    api_key = await creds.get_api_key() or ""
    mode = await modes.classify(body.message, api_key)
    return ClassifyResponse(mode=mode)


@router.get(
    "/models",
    response_model=ModelsResponse,
    summary="List models",
    description=(
        "Return the available model catalog and, if `agentId` is given, that agent's "
        "current model. The FE renders the model picker from this; selecting a model is "
        "done by sending a `/model <id>` message, not a REST call."
    ),
)
async def list_models(
    agentId: str = Query("", description="Optional agent id to report its current model."),
    models: ModelService = Depends(get_model_service),
    creds: CredentialService = Depends(get_credential_service),
    agents: AgentService = Depends(get_agent_service),
) -> ModelsResponse:
    api_key = await creds.get_api_key() or ""
    catalog = await models.list_models(api_key)
    current = ""
    if agentId:
        agent = await agents.get(agentId)
        if agent:
            current = agent.model
    return ModelsResponse(
        models=[ModelInfo(id=m.id, displayName=m.display_name) for m in catalog],
        current=current,
    )


@router.put(
    "/defaults",
    response_model=OkResponse,
    tags=["Agents"],
    summary="Set default agent for a directory",
    description="Set the default agent id for a working directory, or clear it when `agent_id` is blank.",
)
async def set_default(
    body: SetDefaultRequest,
    agents: AgentService = Depends(get_agent_service),
) -> OkResponse:
    if body.agent_id:
        await agents.set_default(body.cwd, body.agent_id)
    else:
        await agents.clear_default(body.cwd)
    return OkResponse()
