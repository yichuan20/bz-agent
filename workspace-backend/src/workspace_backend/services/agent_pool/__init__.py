"""The agent pool: bzcode process lifecycle decoupled from client connections.

- :mod:`buffer` — TurnBuffer (pure): per-turn replay so reconnecting clients catch up.
- :mod:`dispatcher` — the stdout state machine (pure): decides state + forwarding.
- :mod:`runtime` — AgentRuntime: one live bzcode process + subscribers + buffer.
- :mod:`pool` — AgentPool: registry of runtimes, get_or_create, idle sweeper, status.
"""
