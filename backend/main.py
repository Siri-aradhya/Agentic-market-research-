import json
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from tavily import TavilyClient
except Exception:
    TavilyClient = None

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "research.db"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
OPENROUTER_FALLBACKS = [
    x.strip() for x in os.getenv(
        "OPENROUTER_FALLBACKS",
        "openrouter/free"
    ).split(",") if x.strip()
]
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="MarketPilot Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=5000)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            report_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """)
        conn.commit()


init_db()


def call_openrouter(messages: list[dict[str, str]], temperature: float = 0.2) -> str:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is missing. Add it to backend/.env.")

    models = [OPENROUTER_MODEL] + [
        m for m in OPENROUTER_FALLBACKS if m != OPENROUTER_MODEL
    ]
    payload = {
        "model": models[0],
        "models": models[1:] if len(models) > 1 else [],
        "messages": messages,
        "temperature": temperature,
    }
    payload = {k: v for k, v in payload.items() if v != []}

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("APP_URL", "http://localhost:5173"),
            "X-Title": "MarketPilot - Agentic Market Research",
        },
        json=payload,
        timeout=90,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenRouter {response.status_code}: {response.text[:500]}")
    data = response.json()
    return data["choices"][0]["message"]["content"]


def parse_json(text: str, fallback: Any) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"(\{.*\}|\[.*\])", text, flags=re.S)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass
    return fallback


def plan_research(query: str) -> dict:
    prompt = f"""
You are the research planner for an autonomous market-intelligence product.
Turn the user's research goal into a compact, high-signal research plan.

USER GOAL:
{query}

Return ONLY valid JSON:
{{
  "market": "market/category being studied",
  "intent": "what decision this research supports",
  "queries": ["3 precise web-search queries"],
  "angles": ["3 analysis angles"],
  "entities": ["important companies/products/technologies to investigate"]
}}
Rules:
- Queries must be concrete and searchable.
- Cover market/demand, competitors, trends/technology, and risks/opportunities.
- Return exactly 3 high-signal queries; avoid duplicate queries.
"""
    fallback = {
        "market": query,
        "intent": "Understand the market and identify opportunities",
        "queries": [query, f"{query} market size trends competitors", f"{query} trends risks opportunities"],
        "angles": ["market", "competition", "trends and opportunities"],
        "entities": []
    }
    return parse_json(call_openrouter([{"role": "user", "content": prompt}]), fallback)


def web_search(queries: list[str]) -> list[dict]:
    if not TAVILY_API_KEY or TavilyClient is None:
        return [{
            "title": "Demo mode — add TAVILY_API_KEY",
            "url": "https://tavily.com/",
            "content": "Web research is disabled until TAVILY_API_KEY is configured.",
            "score": 0.0,
        }]

    # Run independent Tavily searches concurrently. This is the largest
    # latency improvement because the old implementation waited for each
    # search to finish before starting the next one.
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def run_one_search(q: str) -> list[dict]:
        try:
            # A client per worker avoids sharing mutable client state between
            # threads and keeps the implementation simple.
            client = TavilyClient(api_key=TAVILY_API_KEY)
            response = client.search(
                query=q,
                search_depth="basic",
                max_results=4,
                include_answer=False,
                include_raw_content=False,
            )
            return [
                {
                    "title": item.get("title", "Untitled source"),
                    "url": item.get("url", ""),
                    "content": item.get("content", ""),
                    "score": item.get("score", 0),
                }
                for item in response.get("results", [])
                if item.get("url")
            ]
        except Exception as exc:
            return [{
                "title": f"Search warning: {q}",
                "url": "",
                "content": str(exc),
                "score": 0,
            }]

    unique_queries = list(dict.fromkeys(q.strip() for q in queries[:3] if q.strip()))
    results = []

    with ThreadPoolExecutor(max_workers=min(3, len(unique_queries) or 1)) as executor:
        futures = [executor.submit(run_one_search, q) for q in unique_queries]
        for future in as_completed(futures):
            results.extend(future.result())

    # Deduplicate and keep only the strongest evidence for the synthesis call.
    deduped = []
    seen = set()
    for item in sorted(results, key=lambda x: x.get("score", 0), reverse=True):
        url = item.get("url", "")
        if url and url not in seen:
            seen.add(url)
            deduped.append(item)

    return deduped[:10]


def synthesize(query: str, plan: dict, sources: list[dict]) -> dict:
    # Keep the evidence packet compact. Sending 20 x 4500 characters to the
    # synthesis model can dominate latency and token usage.
    evidence = "\n\n".join(
        f"[SOURCE {i+1}] {s['title']}\nURL: {s['url']}\n{s['content'][:3000]}"
        for i, s in enumerate(sources[:10])
    )

    prompt = f"""
You are the senior market-intelligence analyst inside MarketPilot.
Produce a decision-ready market research report. Be precise and transparent:
never invent statistics, company facts, or citations. If evidence is weak, say so.

USER QUESTION:
{query}

RESEARCH PLAN:
{json.dumps(plan, ensure_ascii=False)}

WEB EVIDENCE:
{evidence}

Return ONLY valid JSON with this exact shape:
{{
  "headline": "one-line conclusion",
  "executive_summary": "2-4 paragraph concise synthesis",
  "market_snapshot": [
    {{"label":"Market signal","value":"...","detail":"..."}},
    {{"label":"Demand","value":"...","detail":"..."}},
    {{"label":"Competition","value":"...","detail":"..."}},
    {{"label":"Risk","value":"...","detail":"..."}}
  ],
  "key_trends": [
    {{"title":"...","impact":"High|Medium|Low","evidence":"..."}}
  ],
  "competitive_landscape": [
    {{"name":"...","positioning":"...","strength":"...","watchout":"..."}}
  ],
  "opportunities": ["...","...","..."],
  "risks": ["...","...","..."],
  "recommended_next_steps": ["...","...","..."],
  "confidence": 0,
  "sources": [
    {{"title":"exact source title","url":"exact source URL","why_it_matters":"..."}}
  ]
}}

Keep the report practical for a founder or product team. confidence is an integer 0-100 based on source quality and consistency.
"""
    fallback = {
        "headline": "Research completed with limited synthesis.",
        "executive_summary": "The evidence collection step completed, but the analyst could not produce the full structured report.",
        "market_snapshot": [],
        "key_trends": [],
        "competitive_landscape": [],
        "opportunities": [],
        "risks": [],
        "recommended_next_steps": [],
        "confidence": 35,
        "sources": [{"title": s["title"], "url": s["url"], "why_it_matters": "Collected during research."} for s in sources[:8]],
    }
    report = parse_json(call_openrouter([{"role": "user", "content": prompt}], temperature=0.15), fallback)

    # Ensure source traceability even if the model omits sources.
    if not report.get("sources"):
        report["sources"] = [
            {"title": s["title"], "url": s["url"], "why_it_matters": "Source collected by the research agent."}
            for s in sources[:8]
        ]
    return report


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "openrouter": bool(OPENROUTER_API_KEY),
        "tavily": bool(TAVILY_API_KEY),
        "model": OPENROUTER_MODEL,
    }


@app.get("/api/history")
def history():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, query, created_at, report_json FROM reports ORDER BY id DESC LIMIT 25"
        ).fetchall()
    return [{
        "id": r["id"],
        "query": r["query"],
        "created_at": r["created_at"],
        "headline": json.loads(r["report_json"]).get("headline", ""),
    } for r in rows]


@app.get("/api/reports/{report_id}")
def get_report(report_id: int):
    with db() as conn:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Report not found")
    return {
        "id": row["id"],
        "query": row["query"],
        "created_at": row["created_at"],
        "report": json.loads(row["report_json"]),
    }


@app.post("/api/research")
def research(request: ResearchRequest):
    started = time.perf_counter()
    query = request.query.strip()
    try:
        plan_start = time.perf_counter()
        plan = plan_research(query)
        plan_ms = int((time.perf_counter() - plan_start) * 1000)

        search_start = time.perf_counter()
        sources = web_search(plan.get("queries", []))
        search_ms = int((time.perf_counter() - search_start) * 1000)

        analysis_start = time.perf_counter()
        report = synthesize(query, plan, sources)
        analysis_ms = int((time.perf_counter() - analysis_start) * 1000)

        created_at = datetime.now(timezone.utc).isoformat()
        metadata = {
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "plan_ms": plan_ms,
            "search_ms": search_ms,
            "analysis_ms": analysis_ms,
            "sources_found": len(sources),
            "model": OPENROUTER_MODEL,
        }

        with db() as conn:
            cur = conn.execute(
                "INSERT INTO reports(query, report_json, created_at) VALUES (?, ?, ?)",
                (query, json.dumps(report, ensure_ascii=False), created_at),
            )
            report_id = cur.lastrowid
            conn.commit()

        return {
            "id": report_id,
            "query": query,
            "created_at": created_at,
            "plan": plan,
            "report": report,
            "metadata": metadata,
        }
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.get("/")
def root():
    return {"name": "MarketPilot Agent API", "status": "running"}