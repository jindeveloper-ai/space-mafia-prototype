#!/usr/bin/env python3
"""Run project validation commands from codex-validation.json."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROFILE_NAME = "codex-validation.json"
LEGACY_PROFILE = Path(".codex") / "validation-profile.json"
REPORTS_DIR = "validation-reports"


def load_profile(root: Path) -> tuple[dict[str, Any], Path]:
    candidates = (root / PROFILE_NAME, root / LEGACY_PROFILE)
    path = next((candidate for candidate in candidates if candidate.exists()), None)
    if path is None:
        raise SystemExit(
            "Missing codex-validation.json. Run the project validation bootstrap first."
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict):
            raise ValueError("profile root must be a JSON object")
        return data, path
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(f"Invalid validation profile at {path}: {exc}") from exc


def command_available(command: str) -> bool:
    first = command.strip().split()[0] if command.strip() else ""
    return bool(first and shutil.which(first) is not None)


def selected_checks(profile: dict[str, Any], mode: str) -> list[tuple[str, str, bool]]:
    commands = profile.get("commands", {})
    checks: list[tuple[str, str, bool]] = []

    base_order: list[str] = []
    if mode in {"quick", "full"}:
        base_order = ["lint", "typecheck", "test"]
        if mode == "full":
            base_order.append("build")

    for name in base_order:
        command = commands.get(name) if isinstance(commands, dict) else None
        if isinstance(command, str) and command.strip():
            checks.append((name, command, True))

    if mode in {"security", "full"}:
        security = profile.get("security", {})
        if isinstance(security, dict):
            for name in ("gitleaks", "osv", "semgrep"):
                item = security.get(name, {})
                command = item.get("command") if isinstance(item, dict) else None
                enabled = bool(item.get("enabled", False)) if isinstance(item, dict) else False
                required = bool(item.get("required", mode == "full")) if isinstance(item, dict) else mode == "full"
                if enabled and isinstance(command, str) and command.strip():
                    checks.append((name, command, required))

    return checks


def run_check(
    root: Path, reports: Path, name: str, command: str, timeout_seconds: int
) -> dict[str, Any]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    report = reports / f"{stamp}-{name}.log"
    started = time.monotonic()
    timed_out = False
    try:
        argv = (
            ["cmd.exe", "/d", "/s", "/c", command]
            if os.name == "nt"
            else ["/bin/sh", "-c", command]
        )
        proc = subprocess.run(
            argv,
            cwd=root,
            shell=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=os.environ.copy(),
            timeout=timeout_seconds,
        )
        output = proc.stdout or ""
        returncode = proc.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        returncode = 124
        captured = exc.stdout or ""
        output = captured if isinstance(captured, str) else captured.decode(errors="replace")
        output += f"\nTimed out after {timeout_seconds} seconds.\n"
    elapsed = round(time.monotonic() - started, 3)
    report.write_text(output, encoding="utf-8")
    tail = "\n".join(output.strip().splitlines()[-12:])
    return {
        "ok": returncode == 0,
        "returncode": returncode,
        "timed_out": timed_out,
        "elapsed_seconds": elapsed,
        "output_bytes": len(output.encode("utf-8")),
        "report": str(report.relative_to(root)),
        "tail": tail,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("quick", "security", "full"), nargs="?", default="quick")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    profile, profile_path = load_profile(root)
    reports = root / REPORTS_DIR
    reports.mkdir(parents=True, exist_ok=True)
    timeout_value = profile.get("timeout_seconds", 900)
    timeout_seconds = timeout_value if isinstance(timeout_value, int) and timeout_value > 0 else 900

    checks = selected_checks(profile, args.mode)
    if not checks:
        print(f"No checks configured for mode: {args.mode}")
        return 0

    failures: list[str] = []
    warnings: list[str] = []
    skipped_required: list[str] = []
    skipped_optional: list[str] = []
    results: list[dict[str, Any]] = []
    run_started = time.monotonic()
    print(f"Validation profile: {profile_path.relative_to(root)}")
    print(f"Validation mode: {args.mode}")

    for name, command, required in checks:
        if not command_available(command):
            print(f"[SKIP] {name}: command unavailable ({command.split()[0]})")
            if required:
                skipped_required.append(name)
            else:
                skipped_optional.append(name)
            results.append({"name": name, "status": "SKIP", "required": required})
            continue

        result = run_check(root, reports, name, command, timeout_seconds)
        if result["ok"]:
            status = "PASS"
        elif required:
            status = "FAIL"
            failures.append(name)
        else:
            status = "WARN"
            warnings.append(name)
        result.update({"name": name, "status": status, "required": required})
        results.append(result)
        print(
            f"[{status}] {name} ({result['elapsed_seconds']:.3f}s, "
            f"{result['output_bytes']} bytes)"
        )
        if not result["ok"] and result["tail"]:
            print(result["tail"])

    summary_stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    summary_path = reports / f"{summary_stamp}-{args.mode}-summary.json"
    summary = {
        "mode": args.mode,
        "profile": str(profile_path.relative_to(root)),
        "elapsed_seconds": round(time.monotonic() - run_started, 3),
        "results": [{key: value for key, value in item.items() if key != "tail"} for item in results],
        "failures": failures,
        "warnings": warnings,
        "skipped_required": skipped_required,
        "skipped_optional": skipped_optional,
    }
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Summary: {summary_path.relative_to(root)}")

    if failures or skipped_required:
        if failures:
            print("Failed checks:", ", ".join(failures))
        if skipped_required:
            print("Required checks not executed:", ", ".join(skipped_required))
        return 1
    if warnings or skipped_optional:
        details = []
        if warnings:
            details.append("warnings=" + ",".join(warnings))
        if skipped_optional:
            details.append("optional-unavailable=" + ",".join(skipped_optional))
        print("Validation completed with limitations: " + "; ".join(details))
    else:
        print("All applicable configured checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
