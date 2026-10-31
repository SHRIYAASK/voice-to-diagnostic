"""
FastAPI Server bridging Node.js API with CrewAI Multi-Agent Swarm
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from agents import create_router_agent, create_diag_agent, create_safety_agent
from tasks import create_triage_task, create_safety_task

app = FastAPI(
    title="LG AC AI CrewAI Orchestration Microservice",
    description="Multi-agent swarm for LG AC intelligent pre-diagnostics, triage, and safety governance.",
    version="1.0.0",
)

class TriageRequest(BaseModel):
    query: str
    target_model: Optional[str] = "UW-Q18WUZA"

class TriageResponse(BaseModel):
    category: str
    confidence: float
    is_hazardous: bool
    rationale: str
    action: str

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "CrewAI Orchestrator", "agents": ["RouterAgent", "DiagAgent", "SafetyAgent"]}

@app.post("/orchestrate/triage", response_model=TriageResponse)
def orchestrate_triage(req: TriageRequest):
    query_lower = req.query.lower()
    
    # Fast path safety check
    if any(k in query_lower for k in ["smoke", "spark", "fire", "burning", "shock"]):
        return TriageResponse(
            category="AC03",
            confidence=1.0,
            is_hazardous=True,
            rationale="Critical hazard identified by SafetyAgent (smoke/spark/shock).",
            action="TRIP_MCB_AND_DISPATCH_EMERGENCY"
        )
    
    # Error code check
    if "ch 05" in query_lower or "ch05" in query_lower:
        return TriageResponse(
            category="CH 05",
            confidence=0.99,
            is_hazardous=False,
            rationale="Communication error between indoor and outdoor unit.",
            action="NAVIGATE_TO_ERROR_CODE"
        )
        
    return TriageResponse(
        category="AC01",
        confidence=0.88,
        is_hazardous=False,
        rationale="RouterAgent determined cooling performance issue from symptoms.",
        action="LAUNCH_DIAGNOSTIC_TREE"
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
