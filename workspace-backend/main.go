package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"workspace-backend/api"
	"workspace-backend/service"
)

//go:embed all:ui/dist
var uiFiles embed.FS

func main() {
	port := flag.Int("port", 18789, "listen port")
	bzcodePath := flag.String("bzcode", "bzcode", "path to bzcode binary")
	flag.Parse()

	manager := service.NewManager(*bzcodePath)
	handlers := api.NewHandlers(manager)

	mux := http.NewServeMux()
	strictHandler := api.NewStrictHandler(handlers, nil)
	api.HandlerWithOptions(strictHandler, api.StdHTTPServerOptions{BaseRouter: mux})

	mux.HandleFunc("GET /api/agents/{id}/chat", handlers.HandleAgentChat)

	uiFS, err := fs.Sub(uiFiles, "ui/dist")
	if err != nil {
		log.Fatalf("embedded ui: %v", err)
	}
	fileServer := http.FileServer(http.FS(uiFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try serving the file directly; fall back to index.html for SPA routing
		path := r.URL.Path
		if path == "/" {
			path = "index.html"
		}
		if _, err := fs.Stat(uiFS, path[1:]); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	topHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if targetPort := r.Header.Get("X-Target-Port"); targetPort != "" {
			http.Error(w, "port proxy not implemented", http.StatusNotImplemented)
			return
		}
		mux.ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", *port),
		Handler: topHandler,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("workspace-backend listening on :%d", *port)
		log.Printf("bzcode binary: %s", *bzcodePath)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	manager.StopAll()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
		os.Exit(1)
	}

	log.Println("stopped")
}
