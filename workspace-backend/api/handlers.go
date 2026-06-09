package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"workspace-backend/service"
)

type Handlers struct {
	manager  *service.Manager
	upgrader websocket.Upgrader
}

func NewHandlers(manager *service.Manager) *Handlers {
	return &Handlers{
		manager: manager,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

var _ StrictServerInterface = (*Handlers)(nil)

func (h *Handlers) GetHealth(_ context.Context, _ GetHealthRequestObject) (GetHealthResponseObject, error) {
	return GetHealth200JSONResponse{Status: "ok"}, nil
}

func (h *Handlers) ListAgents(_ context.Context, _ ListAgentsRequestObject) (ListAgentsResponseObject, error) {
	infos := h.manager.List()
	agents := make([]Agent, 0, len(infos))
	for _, info := range infos {
		agents = append(agents, infoToAgent(info))
	}
	return ListAgents200JSONResponse{Agents: agents}, nil
}

func (h *Handlers) CreateAgent(ctx context.Context, req CreateAgentRequestObject) (CreateAgentResponseObject, error) {
	if req.Body.ProjectDir == "" {
		return CreateAgent400JSONResponse{Error: "projectDir is required"}, nil
	}

	var sessionID string
	if req.Body.SessionID != nil {
		sessionID = *req.Body.SessionID
	}

	info, err := h.manager.Start(ctx, req.Body.ProjectDir, sessionID)
	if err != nil {
		return CreateAgent500JSONResponse{Error: err.Error()}, nil
	}

	agent := infoToAgent(*info)
	return CreateAgent201JSONResponse(agent), nil
}

func (h *Handlers) GetAgent(_ context.Context, req GetAgentRequestObject) (GetAgentResponseObject, error) {
	info, found := h.manager.Get(req.ID)
	if !found {
		return GetAgent404JSONResponse{Error: "agent not found"}, nil
	}
	return GetAgent200JSONResponse(infoToAgent(*info)), nil
}

func (h *Handlers) DeleteAgent(_ context.Context, req DeleteAgentRequestObject) (DeleteAgentResponseObject, error) {
	if err := h.manager.Stop(req.ID); err != nil {
		return DeleteAgent404JSONResponse{Error: err.Error()}, nil
	}
	return DeleteAgent204Response{}, nil
}

func (h *Handlers) HandleAgentChat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "agent id required", http.StatusBadRequest)
		return
	}

	agent, ok := h.manager.GetRunningAgent(id)
	if !ok {
		http.Error(w, "agent not found or not running", http.StatusNotFound)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	service.HandleChat(agent, conn)
}

func infoToAgent(info service.AgentInfo) Agent {
	a := Agent{
		ID:         info.ID,
		ProjectDir: info.ProjectDir,
		Status:     AgentStatus(info.Status),
		IsRunning:  info.IsRunning,
		CreatedAt:  info.CreatedAt,
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now()
	}
	if info.Title != "" {
		a.Title = &info.Title
	}
	if info.MessageCount > 0 {
		a.MessageCount = &info.MessageCount
	}
	if info.LastModified > 0 {
		a.LastModified = &info.LastModified
	}
	return a
}
