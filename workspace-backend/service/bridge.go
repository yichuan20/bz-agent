package service

import (
	"encoding/json"
	"log"

	"github.com/gorilla/websocket"
)

func HandleChat(agent *Agent, conn *websocket.Conn) {
	agent.AddClient(conn)
	defer func() {
		agent.RemoveClient(conn)
		conn.Close()
	}()

	log.Printf("[agent:%s:bridge] connected", agent.ID)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseNoStatusReceived) {
				log.Printf("[agent:%s:bridge:recv] read error: %v", agent.ID, err)
			}
			break
		}

		var envelope struct {
			Type string `json:"type"`
		}
		msgType := "unknown"
		if json.Unmarshal(msg, &envelope) == nil && envelope.Type != "" {
			msgType = envelope.Type
		}
		log.Printf("[agent:%s:bridge:recv] type=%s", agent.ID, msgType)

		if err := agent.WriteStdin(msg); err != nil {
			log.Printf("[agent:%s:bridge:recv] stdin error: %v", agent.ID, err)
			break
		}
	}

	log.Printf("[agent:%s:bridge] disconnected", agent.ID)
}
