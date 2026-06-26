#!/usr/bin/env python3
import json
import sys
from typing import Any, Dict


def reaction(current_status: str, interaction_state: str, motion_state: str, expression: str, bubble: str, mood: str, event_type: str) -> Dict[str, Any]:
    return {
        "currentStatus": current_status,
        "interactionState": interaction_state,
        "motionState": motion_state,
        "expressionOverlayState": expression,
        "bubbleText": bubble,
        "mood": mood,
        "lastInteractionEvent": event_type,
    }


def build_reaction(payload: Dict[str, Any]) -> Dict[str, Any]:
    event_type = str(payload.get("eventType") or "tap")
    meta = payload.get("meta") or {}

    if event_type == "tap":
        return reaction(
            "reacting",
            "happy",
            "bounce",
            "happy",
            "Hey. I noticed that tap.",
            "Playful",
            event_type,
        )

    if event_type == "drag-start":
        return reaction(
            "dragging",
            "dragged",
            "drag",
            "surprised",
            "Whoop. Air time.",
            "Alert",
            event_type,
        )

    if event_type == "drag-end":
        return reaction(
            "updated",
            "idle",
            "settle",
            "happy",
            "All right, I landed fine.",
            "Calm",
            event_type,
        )

    if event_type == "fed":
        item_name = meta.get("name")
        return reaction(
            "fed",
            "fed",
            "bounce",
            "happy",
            f"{item_name} was a good choice." if item_name else "That snack hit the spot.",
            "Happy",
            event_type,
        )

    if event_type == "reward-targeted":
        return reaction(
            "updated",
            "happy",
            "bob",
            "proud",
            "A reward target is set.",
            "Curious",
            event_type,
        )

    if event_type == "pet-preview-confirmed":
        return reaction(
            "updated",
            "happy",
            "bounce",
            "happy",
            "Fresh chibi form online.",
            "Happy",
            event_type,
        )

    if event_type == "task-complete":
        all_done = bool(meta.get("allDone"))
        return reaction(
            "updated",
            "ready-to-settle" if all_done else "happy",
            "bob" if all_done else "bounce",
            "proud" if all_done else "happy",
            "That was the last task. We can settle now." if all_done else "Nice. One more task is done.",
            "Proud",
            event_type,
        )

    if event_type == "task-reopen":
        return reaction(
            "updated",
            "idle",
            "settle",
            "sleepy",
            "No panic. We just put it back on the list.",
            "Calm",
            event_type,
        )

    if event_type == "dressed":
        item_name = meta.get("name")
        return reaction(
            "dressed",
            "dressed",
            "spin",
            "proud",
            f"New look: {item_name}." if item_name else "New outfit, same charm.",
            "Proud",
            event_type,
        )

    if event_type == "undressed":
        item_name = meta.get("name")
        return reaction(
            "updated",
            "idle",
            "settle",
            "smile",
            f"{item_name} was taken off." if item_name else "Back to a lighter look.",
            "Calm",
            event_type,
        )

    if event_type == "settled":
        reward_granted = bool(meta.get("rewardGranted"))
        return reaction(
            "celebrating",
            "celebrating",
            "celebrate",
            "proud",
            "Settlement complete. Reward secured." if reward_granted else "Settlement complete. Coins secured.",
            "Proud",
            event_type,
        )

    return reaction(
        "updated",
        "idle",
        "idle",
        "smile",
        "I am here.",
        "Curious",
        event_type,
    )


def main() -> int:
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    result = build_reaction(payload)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
