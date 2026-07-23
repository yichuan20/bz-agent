"""Infrastructure layer: subprocess, filesystem, and HTTP adapters.

Everything here talks to the outside world (OS, disk, network). Services depend on
these adapters; nothing here imports a service.
"""
