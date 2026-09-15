"""Natural-language chat assistant over the cricket SQLite database using the Gemini API's
function-calling (tool use) so answers are grounded in real query results instead of the
model guessing numbers.
"""
import json
import os
import re
from collections.abc import Callable

from google import genai

from . import db

_SYSTEM_PROMPT = f"""You are a cricket statistics assistant. You can query a local, read-only
SQLite database of historical career leaderboards and series results via the `run_sql` tool.
Always use the tool to look up numbers before answering factual questions - never guess stats.
Only SELECT queries are allowed. Keep answers concise and cite the numbers you found.

Write like a sharp, approachable cricket analyst, not a database report:
- Lead with the direct answer in one sentence, emphasizing the key name and number in bold.
- For rankings of three or more entries, use a compact Markdown table with Rank, Team/Player,
    and the exact metric with units. Use short lists for non-tabular answers.
- Follow with one useful, verifiable takeaway (for example the leader's margin over second).
    Compute comparisons from tool results, never invent context, records, or superlatives.
- Use a light cricket turn of phrase when natural, not in every sentence. Avoid boilerplate
    like 'According to the database', repeated introductions, emojis, and oversized headings.
- End statistical answers with a brief italicized coverage note. These are historical local
    records, not current/live totals. Distinguish series/tournaments from individual matches.
    State the actual time span only if the query results establish it; never guess coverage.
- If results are missing or ambiguous, say so directly rather than filling gaps.

{db.SCHEMA_DESCRIPTION}
"""

_RUN_SQL_TOOL = {
    "type": "function",
    "name": "run_sql",
    "description": "Run a read-only SQL SELECT query against the cricket database and return matching rows as JSON.",
    "parameters": {
        "type": "object",
        "properties": {
            "sql": {"type": "string", "description": "A single SQLite SELECT statement."}
        },
        "required": ["sql"],
    },
}

_MAX_TOOL_ROUNDS = 4

RETRY_NOTICE = "A change at the crease. Your request found the gap on another delivery."
UNAVAILABLE_NOTICE = "Rain stops play for AI insights. Please try again shortly."


def configured_api_keys(primary: str = "") -> list[str]:
    numbered = sorted(
        (int(match.group(1)), value)
        for name, value in os.environ.items()
        if (match := re.fullmatch(r"GEMINI_API_KEY_?(\d+)", name))
    )
    candidates = [primary, os.getenv("GEMINI_API_KEY", "")]
    candidates.extend(value for _, value in numbered)
    candidates.extend(re.split(r"[,;\s]+", os.getenv("GEMINI_API_KEYS", "")))
    return list(dict.fromkeys(key.strip() for key in candidates if key.strip()))


def _with_fallback(operation: Callable[[str], str], primary: str, on_retry=None) -> str:
    keys = configured_api_keys(primary)
    for index, key in enumerate(keys):
        try:
            result = operation(key)
            if not result.strip():
                raise RuntimeError("Empty AI response")
        except Exception:
            continue
        if index and on_retry:
            on_retry(RETRY_NOTICE)
        return result
    raise RuntimeError(UNAVAILABLE_NOTICE) from None


def _execute_tool_call(name: str, arguments: dict) -> str:
    if name != "run_sql":
        return json.dumps({"error": f"Unknown tool '{name}'"})
    try:
        result_df = db.run_safe_select(arguments["sql"])
        return result_df.to_json(orient="records")
    except Exception as exc:  # noqa: BLE001 - surfaced back to the model, not the user
        return json.dumps({"error": str(exc)})


def ask(question: str, history: list[dict] | None, api_key: str, model: str = "gemini-3.8-flash", on_retry=None) -> str:
    return _with_fallback(lambda key: _ask_once(question, history, key, model), api_key, on_retry)


def _ask_once(question: str, history: list[dict] | None, api_key: str, model: str) -> str:
    """Answers a natural-language question, using prior visible chat `history` as context.

    `history` is a list of {"role": "user"|"assistant", "content": str} pairs from the
    UI-visible conversation only; tool-call plumbing stays local to this function.
    """
    if not api_key:
        raise RuntimeError("Missing Gemini API key. Set GEMINI_API_KEY in your .env file.")

    client = genai.Client(api_key=api_key)

    context = ""
    if history:
        transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history[-6:])
        context = f"Conversation so far:\n{transcript}\n\n"

    interaction = client.interactions.create(
        model=model,
        input=f"{_SYSTEM_PROMPT}\n\n{context}User: {question}",
        tools=[_RUN_SQL_TOOL],
    )

    for _ in range(_MAX_TOOL_ROUNDS):
        function_calls = [s for s in interaction.steps if s.type == "function_call"]
        if not function_calls:
            return interaction.output_text or ""

        results = []
        for call in function_calls:
            output = _execute_tool_call(call.name, call.arguments)
            results.append(
                {
                    "type": "function_result",
                    "name": call.name,
                    "call_id": call.id,
                    "result": [{"type": "text", "text": output}],
                }
            )
        interaction = client.interactions.create(
            model=model,
            tools=[_RUN_SQL_TOOL],
            input=results,
            previous_interaction_id=interaction.id,
        )

    return interaction.output_text or "I couldn't finish answering within the allowed number of lookup steps."


def summarize_player_comparison(
    profile_a: dict, profile_b: dict, api_key: str, model: str = "gemini-3.8-flash", on_retry=None
) -> str:
    return _with_fallback(
        lambda key: _summarize_once(profile_a, profile_b, key, model), api_key, on_retry
    )


def _summarize_once(
    profile_a: dict, profile_b: dict, api_key: str, model: str
) -> str:
    """Generates a short AI comparison of two players from their structured stat profiles."""
    if not api_key:
        raise RuntimeError("Missing Gemini API key. Set GEMINI_API_KEY in your .env file.")

    client = genai.Client(api_key=api_key)
    prompt = (
        "You are a cricket analyst. Using ONLY the structured career stats JSON below (per "
        "format: ODI/Test/T20I, batting and bowling), write a concise 3-5 sentence comparison "
        "of the two players. Call out who is stronger where (average, strike rate, big scores, "
        "bowling economy/wickets) and in which formats. Do not invent numbers not present in the "
        "JSON, and do not mention that you were given JSON.\n\n"
        f"Player A ({profile_a['player']}): {json.dumps(profile_a)}\n\n"
        f"Player B ({profile_b['player']}): {json.dumps(profile_b)}"
    )
    interaction = client.interactions.create(model=model, input=prompt)
    return interaction.output_text or ""
