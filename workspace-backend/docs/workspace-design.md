# Workspace Design

This document describes the workspace subsystem in **flowinfra**: what a workspace
is, how the **workspace-backend** (aka `boltzagent`) fits in, and how workspaces
are provisioned at startup and later updated / redeployed.

All code lives under `flowinfra/internal/workspace/`, with domain types in
`flowinfra/domain/workspace.go`.

---

## 1. Concepts

A **workspace** is a user's isolated dev environment. It is not a VM of its own —
it is an **Incus (LXC) container** running on a shared **workspace host** (a GCE
VM). One host runs several workspaces.

| Entity | What it is | Domain type |
|---|---|---|
| **Workspace host** | A GCE VM running Incus; hosts up to `MaxWorkspaces` containers | `domain.WorkspaceHost` |
| **Workspace** | One Incus container on a host, owned by a user | `domain.Workspace` |
| **workspace-backend** (`boltzagent`) | A FastAPI/uvicorn server running *inside* the container on port **18789** | deployed from `domain.BackendVersion` |
| **bzcode** | The Boltzbit CLI installed inside the container, invoked by the backend | tracked by `Workspace.BzcodeVersion` |

Key ports and paths (see `service.go` and `startup_script.go`):

- `workspaceBackendPort = 18789` — the backend listens here inside the container.
- **Host port** (`HostPort`) — a per-workspace TCP port on the host VM, allocated
  from the range **20000–29999** (`allocateHostPort`), bridged into the container's
  18789 by an Incus proxy device.
- Incus API listens on the host's internal IP `:8443` (mTLS).
- `/opt/boltzagent` — backend install dir (owned by the `boltzagent` user).
- `/home/boltzagent/workspace` — the user's working dir (`BZCODE_CWD`).
- `/home/boltzagent/.boltzbit/api_keys.json` — where the backend reads `BZ_API_KEY`.
- `/usr/local/bin/bzcode` — the bzcode CLI.

The whole subsystem is gated by the `ENABLE_WORKSPACE` config flag (`main.go`);
when off, noop Incus/compute/api-key clients are wired in.

### Two things a workspace runs

1. **workspace-backend / `boltzagent`** — a Python FastAPI app, versioned and
   distributed as a **zip in GCS** (`domain.BackendVersion`). This is the
   long-running service the platform proxies HTTP/WebSocket traffic to. Managed by
   the `boltzagent` systemd unit (`startup_script.go:137`).

2. **bzcode** — the CLI the backend shells out to. Installed by downloading a
   tarball from the appstore (`boltzhub.com/bz-appstore-api/v1/bzcode/download`),
   versioned independently of the backend.

These are the **two independently updatable components** of a workspace
(`version_user.go:21` — `updateTargetBackend` and `updateTargetBzcode`).

---

## 2. How workspace-backend fits in (request path)

The workspace-backend never faces the internet directly. flowinfra fronts it with
a **subdomain reverse proxy** running on its own Echo server (`WORKSPACE_PROXY_PORT`,
default **8081**), which serves a wildcard `*.<subdomainSuffix>` catch-all:

```
Browser / API client
   │  https://<workspaceID>[-<port>].<subdomainSuffix>/...
   ▼
flowinfra proxy server (8081) → AuthMiddleware → HandleSubdomainProxy (proxy.go:231)
   │  1. ParseWorkspaceSubdomain → workspaceID (+ optional port-preview port)
   │  2. AuthMiddleware: platform JWT → workspace-scoped HMAC session cookie
   │  3. resolveWorkspaceForProxy → workspace + host (ownership-checked, must be ready)
   │  4. targetAddr = host.ExternalIP : workspace.HostPort
   ▼
GCE host (external IP : HostPort)
   │  Incus "gateway" proxy device (type: proxy):
   │    listen  tcp:0.0.0.0:<HostPort>
   │    connect tcp:127.0.0.1:18789      (created at provision time)
   ▼
boltzagent (uvicorn) inside the container, port 18789
```

Notable design points:

- **Auth** (`AuthMiddleware`, `proxy.go:49`): a platform JWT (header or `?token=`)
  is exchanged **once** for a longer-lived, workspace-scoped HMAC cookie
  (`wssession.Sign`). Subsequent requests — including long-lived WebSockets and
  port-preview tabs — authenticate off the cookie alone, so they survive the short
  JWT expiry. The cookie is **bound to a single workspace** (defense-in-depth
  against cross-workspace replay; known multi-workspace limitation documented at
  `proxy.go:255`).
- **Port previews**: a host like `ws_abc-8080.<suffix>` proxies to port 8080
  inside the container instead of the backend, via the `X-Target-Port` header
  (`proxy.go:319`, `ParseWorkspaceSubdomain` at `proxy.go:441`).
- **WebSockets** are proxied with a dedicated bidirectional pump
  (`proxyWebSocket`, `proxy.go:332`); plain HTTP uses `httputil.ReverseProxy`.
- The **host↔container** hop is an **Incus proxy device** created during
  provisioning (`CreateProxyDevice`, `service.go:446`) mapping the host's
  allocated `HostPort` to container port 18789.

---

## 3. Startup / provisioning

Provisioning is asynchronous. `createWorkspace` (`service.go:108`) validates,
allocates DB rows and a host port, then returns immediately (202-style) while a
forked goroutine does the slow work.

### 3.1 Host selection / creation

`createWorkspace`:

1. `findAvailableHost` (`service.go:191`) — pick a ready host with spare capacity
   (`count < MaxWorkspaces`).
2. If none: create a new `WorkspaceHost` DB record and set `needsNewHost`.
3. Allocate a `HostPort` on the chosen host (`allocateHostPort`).
4. Create the `Workspace` DB row, stamping the **current default backend version**
   (`GetDefaultBackendVersion`, `service.go:157`).
5. Fork a goroutine: `provisionWorkspaceWithNewHost` or `provisionWorkspace`.

### 3.2 New host boot (GCE + Incus)

If a new host is needed, `provisionNewHost` (`service.go:261`):

1. `computeClient.CreateInstance` with a **generated startup script**
   (`generateStartupScript`, `startup_script.go:10`).
2. `WaitForInstanceReady`, then `waitForIncusCerts` (polls instance metadata until
   the startup script has published the Incus mTLS certs).
3. Persist host status `ready` + external/internal IP + Incus client/server certs.

The startup script (`startup_script.go`) runs on the GCE VM and:

- Installs and initializes **Incus** with a hardened default profile
  (unprivileged, `security.nesting=false`, `idmap.isolated`, mem/cpu/process
  limits).
- Applies host **iptables hardening** (blocks container→metadata server, blocks
  inter-container traffic on the bridge).
- Generates **mTLS client/server certs** and stores them in GCE instance metadata,
  which flowinfra reads back to talk to Incus over the network.

### 3.3 Container provisioning

`provisionWorkspace` (`service.go:358`) connects to the host's Incus API and:

1. `CreateContainer` from image `ubuntu/24.04` with the `default` profile.
2. `StartContainer`.
3. `installWorkspaceBinaries` (`service.go:861`):
   - `installBzcode` — download + install the bzcode CLI and bundled `rg`.
   - Create the `boltzagent` user, extract the backend zip into `/opt/boltzagent`,
     `pip install -r requirements.txt`, set ownership.
   - Install the `boltzagent` **systemd unit** and `enable` it (not started yet).
4. `captureBzcodeVersion` — record `bzcode --version` on the workspace
   (best-effort; `service.go:1002`).
5. `ensureWorkspaceApiKey` — push `api_keys.json` into the container and
   (re)start `boltzagent` so it comes up **with** its key.
6. `CreateProxyDevice` — add the Incus `gateway` proxy device wiring host
   `HostPort` → container `18789` (removed again on stop/delete via
   `RemoveProxyDevice`).
7. `waitForWorkspaceHealth` (best-effort — polls `http://<internalIP>:<HostPort>/api/health`
   for up to 60s), then mark the workspace `ready`.

Status transitions during this flow:
`creating → ready` (or `failed` with a diagnostic `StatusMessage` at any step).

---

## 4. Update / redeploy

There are **two entry points** that both converge on the same in-container deploy
logic. The key shared primitive is `deployBackendVersion` (`version.go:355`).

### 4.1 Version status (what's outdated?)

`getWorkspaceVersionStatus` (`version_user.go:50`) reports, per workspace:

- **Backend**: is the workspace's stamped `BackendVersionID` behind the current
  **default** backend version? (`backendOutdated`, `version_user.go:103`).
- **bzcode**: is the workspace's recorded `BzcodeVersion` behind the **latest**
  reported by the appstore (`bzcodeClient.LatestVersion`, `version.go:36`)?
  Degrades gracefully — a flaky appstore just reports "not outdated" rather than
  failing the whole call.

The `bzcode_version` column was added in migration
`20260722104924_add_workspace_bzcode_version.sql` so this comparison can be made
without shelling into the container.

### 4.2 User-triggered update (auto-update flow)

`updateWorkspace` (`version_user.go:117`) — the flow this branch adds. Lets the
**owner** update one or both components:

1. Validate targets (`backend`, `bzcode`).
2. **Atomically claim** the workspace via `TransitionWorkspaceStatus` from
   `{ready, stopped, failed} → upgrading`. This CAS prevents two concurrent
   requests from both spawning update goroutines (`version_user.go:160`).
3. Fork `performWorkspaceUpdate` and return the upgrading workspace.

`performWorkspaceUpdate` (`version_user.go:188`):

1. Resolve host + Incus client.
2. `ensureContainerRunning` — start the container if stopped, wait for systemd.
3. Run each target sequentially:
   - `updateWorkspaceBackend` → `deployBackendVersion(default version)` + stamp
     the new `BackendVersionID`.
   - `updateWorkspaceBzcode` → `installBzcode` + `captureBzcodeVersion`.
4. Restore resting state: a container that **we** started is stopped again
   (`stopped`); otherwise `ready`. A previously-`failed` workspace is resolved to
   healthy on success. On any failure → `failed` with a diagnostic message.

### 4.3 Admin-triggered upgrade (pin to a specific version)

`upgradeWorkspace` (`version.go:171`) — admin path, targets **backend only** and
lets the caller pick an **explicit** `BackendVersion` (not just the default):

1. Validate; require status `ready | stopped | failed`.
2. Set `upgrading`, fork `performUpgrade`.
3. `performUpgrade` (`version.go:231`): start container if stopped → wait for
   systemd → `deployBackendVersion` → stamp version → restore prior status. If it
   started the container and the upgrade fails, it stops it again (deferred at
   `version.go:288`).

### 4.4 The shared redeploy step

`deployBackendVersion` (`version.go:355`) is the single place the backend zip is
laid down in a **running** container. It does **not** touch workspace status or the
stored version stamp — callers own that. Steps:

1. `systemctl stop boltzagent` (and legacy `workspace-backend`).
2. Download the versioned zip from GCS (`version.GCSPath`).
3. Push to `/tmp/workspace-backend.zip`, then a setup command that:
   - Wipes `/opt/boltzagent` **except** `.venv` and `server_data` (preserves the
     virtualenv and user data across redeploys).
   - Unzips, copies in, `pip install -r requirements.txt`.
   - Fixes ownership, migrates the old `workspace-backend.service` unit to
     `boltzagent.service`.
4. `daemon-reload` → `enable boltzagent` → `restart boltzagent`.
5. `ensureWorkspaceApiKey` (best-effort backfill for workspaces provisioned before
   API-key provisioning existed).

### 4.5 Backend version management

Backend versions are uploaded and managed separately (`version.go`):

- `uploadBackendVersion` — validates the upload is a real zip, stores it at
  `<binsPrefix>/versions/<id>/workspace-backend.zip` in GCS, records a
  `BackendVersion` row (auto-incrementing `Version`), and — if `setDefault` — also
  copies it to the legacy `<binsPrefix>/workspace-backend.zip` path.
- `setDefaultBackendVersion` / `listBackendVersions` / `deleteBackendVersion`
  (delete is blocked while any workspace still references the version).

New workspaces and the user-update `backend` target both pull the **default**
version; the admin `upgradeWorkspace` path can pin any specific version.

---

## 5. State model

Workspace statuses (`domain/workspace.go:35`):

```
creating ──▶ ready ◀──▶ stopped
   │           │  ▲         │
   │           ▼  │         │
   │       upgrading ───────┘        (update/upgrade in progress)
   │           │
   ▼           ▼
 failed ◀──────┘                     (any step can fail with a StatusMessage)
   │
   ▼
deleting                              (teardown)
```

- Only `ready | stopped | failed` workspaces can be updated/upgraded.
- `upgrading` is a transient state held for the duration of the async job; it also
  serves as the concurrency lock (the CAS transition in `updateWorkspace`).

---

## 6. Design rationale & trade-offs

- **Shared hosts, isolated containers**: packing multiple unprivileged Incus
  containers onto one GCE VM keeps per-workspace cost low while the hardened Incus
  profile + host iptables provide isolation. Capacity is bounded by
  `MaxWorkspaces` per host.
- **Backend as a versioned GCS artifact**: decouples backend releases from
  container images. Redeploy = download new zip + restart, with `.venv` and
  `server_data` preserved, so it's fast and non-destructive.
- **Two independent update targets**: backend and bzcode version separately and
  can be updated together or independently.
- **Async + status-as-lock**: every slow operation forks a goroutine, returns
  immediately, and uses the `upgrading` status transition as an idempotency guard.
- **Proxy with cookie exchange**: the JWT→HMAC-cookie exchange is what makes long
  WebSocket sessions and port-preview tabs survive short JWT lifetimes.

### Known gaps (from the code)

- `performUpgrade` has a `TODO` about occasional empty `statusMessage` on failure —
  ignored `UpdateWorkspaceStatus` errors may silently drop the message
  (`version.go:228`).
- The workspace-scoped session cookie is domain-wide, so a user with two
  workspaces open can dead-end on a 403 when the cookie rebinds to the last-opened
  workspace (`proxy.go:255`). The security property (no cross-workspace replay)
  still holds.