package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

var sessionsDir = filepath.Join(os.Getenv("HOME"), ".boltzbit", "sessions")

type AgentStatus string

const (
	StatusStarting AgentStatus = "starting"
	StatusRunning  AgentStatus = "running"
	StatusStopped  AgentStatus = "stopped"
	StatusError    AgentStatus = "error"
)

type Agent struct {
	ID         string      `json:"id"`
	ProjectDir string      `json:"projectDir"`
	Status     AgentStatus `json:"status"`
	CreatedAt  time.Time   `json:"createdAt"`

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	cancel context.CancelFunc
	done   chan struct{} // closed when the process exits

	mu             sync.Mutex
	clients        map[*websocket.Conn]struct{}
	sessionMessage []byte // raw session JSON, sent to clients on connect
}

type AgentInfo struct {
	ID           string      `json:"id"`
	ProjectDir   string      `json:"projectDir"`
	Status       AgentStatus `json:"status"`
	IsRunning    bool        `json:"isRunning"`
	Title        string      `json:"title,omitempty"`
	MessageCount int         `json:"messageCount"`
	LastModified float64     `json:"lastModified,omitempty"`
	CreatedAt    time.Time   `json:"createdAt"`
}

type Manager struct {
	mu         sync.RWMutex
	agents     map[string]*Agent
	bzcodePath string
}

func NewManager(bzcodePath string) *Manager {
	return &Manager{
		agents:     make(map[string]*Agent),
		bzcodePath: bzcodePath,
	}
}

func (m *Manager) Start(_ context.Context, projectDir string, sessionID string) (*AgentInfo, error) {
	if projectDir == "" {
		return nil, fmt.Errorf("projectDir is required")
	}

	if sessionID != "" {
		m.mu.RLock()
		if _, exists := m.agents[sessionID]; exists {
			m.mu.RUnlock()
			return nil, fmt.Errorf("agent %s is already running", sessionID)
		}
		m.mu.RUnlock()
	}

	agentCtx, cancel := context.WithCancel(context.Background())

	args := []string{"--stdio"}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}

	cmd := exec.CommandContext(agentCtx, m.bzcodePath, args...)
	cmd.Dir = projectDir
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start bzcode: %w", err)
	}

	agent := &Agent{
		ProjectDir: projectDir,
		Status:     StatusStarting,
		CreatedAt:  time.Now(),
		cmd:        cmd,
		stdin:      stdin,
		stdout:     stdout,
		cancel:     cancel,
		done:       make(chan struct{}),
		clients:    make(map[*websocket.Conn]struct{}),
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)

	extractedID, err := m.waitForSessionID(scanner, agent)
	if err != nil {
		cancel()
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("waiting for session ID: %w", err)
	}

	agent.ID = extractedID
	agent.Status = StatusRunning

	m.mu.Lock()
	m.agents[extractedID] = agent
	m.mu.Unlock()

	go func() {
		s := bufio.NewScanner(stderrPipe)
		for s.Scan() {
			log.Printf("[agent:%s:stderr] %s", agent.ID, s.Text())
		}
	}()
	go m.readLoop(scanner, agent)
	go m.waitForExit(agent)

	log.Printf("[agent:start] id=%s pid=%d dir=%s", agent.ID, cmd.Process.Pid, projectDir)

	return m.agentToInfo(agent, true), nil
}

type sessionResult struct {
	id  string
	raw []byte
}

func (m *Manager) waitForSessionID(scanner *bufio.Scanner, agent *Agent) (string, error) {
	deadline := time.After(10 * time.Second)
	ch := make(chan sessionResult, 1)
	errCh := make(chan error, 1)

	go func() {
		for scanner.Scan() {
			line := scanner.Bytes()
			var msg struct {
				Type      string `json:"type"`
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(line, &msg); err != nil {
				continue
			}
			if msg.Type == "session" && msg.SessionID != "" {
				raw := make([]byte, len(line))
				copy(raw, line)
				ch <- sessionResult{id: msg.SessionID, raw: raw}
				return
			}
			agent.broadcast(line)
		}
		if err := scanner.Err(); err != nil {
			errCh <- err
		} else {
			errCh <- fmt.Errorf("bzcode exited before sending session ID")
		}
	}()

	select {
	case result := <-ch:
		agent.sessionMessage = result.raw
		return result.id, nil
	case err := <-errCh:
		return "", err
	case <-deadline:
		return "", fmt.Errorf("timeout waiting for session ID from bzcode")
	}
}

func (m *Manager) readLoop(scanner *bufio.Scanner, agent *Agent) {
	log.Printf("[agent:%s:stdout] started", agent.ID)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		log.Printf("[agent:%s:send] clients=%d msg=%s", agent.ID, len(agent.clients), string(line[:min(len(line), 120)]))
		agent.broadcast(line)
	}
	log.Printf("[agent:%s:stdout] ended err=%v", agent.ID, scanner.Err())
}

func (agent *Agent) broadcast(msg []byte) {
	agent.mu.Lock()
	defer agent.mu.Unlock()

	for conn := range agent.clients {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			log.Printf("[agent:%s:send] write error: %v", agent.ID, err)
			conn.Close()
			delete(agent.clients, conn)
		}
	}
}

func (agent *Agent) AddClient(conn *websocket.Conn) {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	agent.clients[conn] = struct{}{}
	if len(agent.sessionMessage) > 0 {
		_ = conn.WriteMessage(websocket.TextMessage, agent.sessionMessage)
	}
}

func (agent *Agent) RemoveClient(conn *websocket.Conn) {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	delete(agent.clients, conn)
}

func (agent *Agent) WriteStdin(data []byte) error {
	if data[len(data)-1] != '\n' {
		data = append(data, '\n')
	}
	_, err := agent.stdin.Write(data)
	return err
}

func (m *Manager) waitForExit(agent *Agent) {
	err := agent.cmd.Wait()
	close(agent.done)

	m.mu.Lock()
	defer m.mu.Unlock()

	if err != nil {
		agent.Status = StatusError
		log.Printf("[agent:%s:exit] %v", agent.ID, err)
	} else {
		agent.Status = StatusStopped
		log.Printf("[agent:%s:exit] clean", agent.ID)
	}

	delete(m.agents, agent.ID)
}

func (m *Manager) Get(id string) (*AgentInfo, bool) {
	m.mu.RLock()
	agent, running := m.agents[id]
	m.mu.RUnlock()

	if running {
		return m.agentToInfo(agent, true), true
	}

	info := m.readSessionFile(id)
	if info != nil {
		return info, true
	}

	return nil, false
}

func (m *Manager) List() []AgentInfo {
	m.mu.RLock()
	runningIDs := make(map[string]*Agent, len(m.agents))
	for id, a := range m.agents {
		runningIDs[id] = a
	}
	m.mu.RUnlock()

	var result []AgentInfo

	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		for _, agent := range runningIDs {
			result = append(result, *m.agentToInfo(agent, true))
		}
		return result
	}

	seen := make(map[string]bool)
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		sessionID := entry.Name()[:len(entry.Name())-len(".jsonl")]

		if agent, ok := runningIDs[sessionID]; ok {
			result = append(result, *m.agentToInfo(agent, true))
			seen[sessionID] = true
			continue
		}

		info := m.readSessionFile(sessionID)
		if info != nil {
			result = append(result, *info)
			seen[sessionID] = true
		}
	}

	for id, agent := range runningIDs {
		if !seen[id] {
			result = append(result, *m.agentToInfo(agent, true))
		}
	}

	return result
}

func (m *Manager) Stop(id string) error {
	m.mu.RLock()
	agent, exists := m.agents[id]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("agent %s not found or not running", id)
	}

	if agent.cmd.Process != nil {
		_ = agent.cmd.Process.Signal(syscall.SIGTERM)

		select {
		case <-agent.done:
		case <-time.After(5 * time.Second):
			_ = agent.cmd.Process.Kill()
			<-agent.done
		}
	} else {
		agent.cancel()
	}

	log.Printf("[agent:%s:stop]", id)
	return nil
}

func (m *Manager) StopAll() {
	m.mu.RLock()
	ids := make([]string, 0, len(m.agents))
	for id := range m.agents {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		if err := m.Stop(id); err != nil {
			log.Printf("[agent:%s:stop] error: %v", id, err)
		}
	}
}

func (m *Manager) GetRunningAgent(id string) (*Agent, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	agent, ok := m.agents[id]
	return agent, ok
}

func (m *Manager) agentToInfo(agent *Agent, isRunning bool) *AgentInfo {
	return &AgentInfo{
		ID:         agent.ID,
		ProjectDir: agent.ProjectDir,
		Status:     agent.Status,
		IsRunning:  isRunning,
		CreatedAt:  agent.CreatedAt,
	}
}

func (m *Manager) readSessionFile(sessionID string) *AgentInfo {
	path := filepath.Join(sessionsDir, sessionID+".jsonl")
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	if !scanner.Scan() {
		return nil
	}

	var header struct {
		Type       string `json:"type"`
		SessionID  string `json:"sessionId"`
		WorkingDir string `json:"workingDir"`
		Created    string `json:"created"`
	}
	if err := json.Unmarshal(scanner.Bytes(), &header); err != nil || header.Type != "session" {
		return nil
	}

	info := &AgentInfo{
		ID:           header.SessionID,
		ProjectDir:   header.WorkingDir,
		Status:       StatusStopped,
		IsRunning:    false,
		LastModified: float64(stat.ModTime().Unix()),
	}

	if t, err := time.Parse(time.RFC3339, header.Created); err == nil {
		info.CreatedAt = t
	}

	msgCount := 0
	title := ""
	for scanner.Scan() {
		var msg struct {
			Role    string `json:"role"`
			Content any    `json:"content"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue
		}
		if msg.Role == "user" {
			msgCount++
			text := extractText(msg.Content)
			if title == "" && text != "" {
				if len(text) > 60 {
					title = text[:60]
				} else {
					title = text
				}
			}
		}
	}

	info.MessageCount = msgCount
	info.Title = title

	return info
}

func extractText(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		for _, block := range v {
			if m, ok := block.(map[string]any); ok {
				if m["type"] == "text" {
					if text, ok := m["text"].(string); ok {
						return text
					}
				}
			}
		}
	}
	return ""
}
