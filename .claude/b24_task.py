#!/usr/bin/env python3
"""Задачи Битрикс24 по ходу работы с Claude.

Только стандартная библиотека: работает и на сервере, и на ноутбуке с Windows.

    python3 .claude/b24_task.py start "Заголовок" "Что делаем и зачем"   → печатает id задачи
    python3 .claude/b24_task.py comment <id> "Что сделано"
    python3 .claude/b24_task.py done <id> "Итог"

Адрес входящего вебхука с правами на задачи — в B24_TASKS_WEBHOOK, а если её
нет — в B24_WEBHOOK_URL, основном вебхуке моста greencof-b24-bridge (он задачи
ставить умеет). Вид: https://<портал>.bitrix24.ru/rest/<user>/<code>/. Ответственный —
B24_RESPONSIBLE_ID (по умолчанию 71, Андрей Попов). Нет вебхука — скрипт
говорит об этом и выходит с кодом 2, ничего не ломая.
"""

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_RESPONSIBLE = 71
TAG = "claude"
DEADLINE_DAYS = 1


def _webhook() -> str:
    url = (os.environ.get("B24_TASKS_WEBHOOK") or os.environ.get("B24_WEBHOOK_URL") or "").strip()
    if not url:
        sys.exit("Нет ни B24_TASKS_WEBHOOK, ни B24_WEBHOOK_URL — задача в Битриксе не поставлена.")
    return url.rstrip("/") + "/"


def call(method: str, params: dict) -> dict:
    req = urllib.request.Request(
        _webhook() + method + ".json",
        data=json.dumps(params).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as exc:
        body = json.loads(exc.read() or b"{}")
    if "error" in body:
        sys.exit(f"Битрикс отказал в {method}: {body.get('error')}: {body.get('error_description', '')}")
    return body.get("result")


def _responsible() -> int:
    return int(os.environ.get("B24_RESPONSIBLE_ID") or DEFAULT_RESPONSIBLE)


def start(title: str, description: str = "") -> int:
    deadline = dt.date.today() + dt.timedelta(days=DEADLINE_DAYS)
    result = call("tasks.task.add", {"fields": {
        "TITLE": title,
        "DESCRIPTION": description,
        "RESPONSIBLE_ID": _responsible(),
        "TAGS": [TAG],
        "DEADLINE": f"{deadline.isoformat()}T18:00:00+03:00",
    }})
    return int(result["task"]["id"])


def comment(task_id: int, text: str) -> None:
    # Комментарии живут в старом семействе методов: tasks.task.* их не знает,
    # имена параметров в верхнем регистре.
    call("task.commentitem.add", {"TASKID": task_id, "FIELDS": {"POST_MESSAGE": text}})


def done(task_id: int, summary: str = "") -> None:
    if summary:
        comment(task_id, summary)
    task = (call("tasks.task.get", {"taskId": task_id, "select": ["ID", "STATUS"]}) or {}).get("task", {})
    if str(task.get("status") or "") != "5":     # 5 — уже завершена; повторное закрытие портал отбивает
        call("tasks.task.complete", {"taskId": task_id})


def main(argv: list[str]) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    usage = "start <заголовок> [описание] | comment <id> <текст> | done <id> [итог]"
    if len(argv) < 2:
        sys.exit(usage)
    cmd, args = argv[0], argv[1:]
    if cmd == "start":
        print(start(args[0], args[1] if len(args) > 1 else ""))
    elif cmd == "comment" and len(args) == 2:
        comment(int(args[0]), args[1])
    elif cmd == "done":
        done(int(args[0]), args[1] if len(args) > 1 else "")
    else:
        sys.exit(usage)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except SystemExit as exc:
        if isinstance(exc.code, str):
            print(exc.code, file=sys.stderr)
            sys.exit(2)
        raise
