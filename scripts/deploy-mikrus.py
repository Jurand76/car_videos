#!/usr/bin/env python3
"""Wdrożenie poprawek na Mikrus (bob133) — upload plików + rebuild Docker."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Brak paramiko — zainstaluj: pip install paramiko", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
HOST = os.environ.get("MIKRUS_HOST", "bob133.mikrus.xyz")
PORT = int(os.environ.get("MIKRUS_SSH_PORT", "10133"))
USER = os.environ.get("MIKRUS_SSH_USER", "root")
PASSWORD = os.environ.get("MIKRUS_SSH_PASS", "")
APP_DIR = os.environ.get("MIKRUS_APP_DIR", "/opt/car_videos")

FILES = [
    "panel/app.js",
    "panel/index.html",
    "service/app.js",
    "service/index.html",
    "service/styles.css",
    "scripts/patch-remotion-content-length.js",
    "scripts/patch-remotion-node-env.js",
    "scripts/patch-remotion-process-update.js",
    "scripts/patch-remotion-index-html.js",
    "docker/nginx-studio.conf",
    "docker/studio-entrypoint.sh",
    "Dockerfile.gateway",
    "docker-compose.mikrus.yml",
    "package.json",
    "server/index.ts",
    "server/videoProjects.ts",
    "server/videoAuth.ts",
    "server/generate.ts",
    "server/syncProject.ts",
    "server/renderExport.ts",
    "src/videoDefaults.ts",
    "src/renderDefaults.ts",
    "remotion.config.ts",
    "photos/api/app/database.py",
    "photos/api/app/models/repair.py",
    "photos/api/app/routers/service_repairs.py",
    "photos/api/app/schemas/service.py",
    "photos/web/next.config.ts",
]


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> int:
    print(f"\n>>> {cmd}")
    chan = client.get_transport().open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    chunks: list[str] = []
    while True:
        if chan.recv_ready():
            chunks.append(chan.recv(65535).decode("utf-8", "replace"))
        if chan.exit_status_ready():
            while chan.recv_ready():
                chunks.append(chan.recv(65535).decode("utf-8", "replace"))
            break
        time.sleep(0.3)
    out = "".join(chunks)
    code = chan.recv_exit_status()
    if out.strip():
        print(out.rstrip()[-8000:])
    print(f"[exit {code}]")
    return code


def main() -> int:
    if not PASSWORD:
        print(
            "Ustaw hasło SSH: export MIKRUS_SSH_PASS='...'  (albo zmienna w CI)",
            file=sys.stderr,
        )
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Łączenie z {HOST}:{PORT} jako {USER}...")
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    print("Połączono.")

    sftp = client.open_sftp()
    for rel in FILES:
        local = ROOT / rel
        if not local.exists():
            print(f"POMINIĘTO (brak lokalnie): {rel}")
            continue
        remote = f"{APP_DIR}/{rel.replace(chr(92), '/')}"
        remote_dir = os.path.dirname(remote)
        run(client, f"mkdir -p {remote_dir}", timeout=30)
        print(f"UPLOAD {rel}")
        sftp.put(str(local), remote)
    sftp.close()

    build_code = run(
        client,
        f"cd {APP_DIR} && docker compose -f docker-compose.mikrus.yml --env-file project.env build {os.environ.get('MIKRUS_BUILD_SERVICES', 'gateway studio web api')}",
        timeout=1800,
    )
    if build_code != 0:
        client.close()
        return build_code

    up_code = run(
        client,
        f"cd {APP_DIR} && docker compose -f docker-compose.mikrus.yml --env-file project.env up -d gateway studio web api",
        timeout=600,
    )
    run(
        client,
        "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'gateway|studio|web' || docker ps",
        timeout=60,
    )
    client.close()
    print("\nGotowe.")
    return up_code


if __name__ == "__main__":
    sys.exit(main())
