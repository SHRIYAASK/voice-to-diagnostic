"""
CrewAI Tasks for LG AC Diagnostic Orchestration
"""

from crewai import Task, Agent

def create_triage_task(agent: Agent, user_query: str, target_model: str) -> Task:
    return Task(
        description=f"""Analyze the customer inquiry: "{user_query}" for LG AC model: {target_model}.
        Determine:
        1. Is there an exact LG error code mentioned (e.g., CH 05, CH 38, CL, FL)?
        2. Which issue category best applies: AC01 (Cooling), AC02 (Power), AC03 (Tripping), AC04 (Leaking),
           AC05 (Odor), AC06 (Noise), AC07 (Airflow), AC08 (Remote), AC09 (Frost), AC10 (Cycling),
           AC11 (Display), AC12 (Filter), AC13 (Sensor), AC14 (Cabinet), AC15 (Install), AC16 (Escalation)?
        3. Is there any immediate hazard (fire, sparks, smoke)?
        Provide output as structured JSON with keys: category, confidence, is_hazardous, rationale.""",
        expected_output="A structured JSON object with category, confidence, is_hazardous, and rationale.",
        agent=agent,
    )

def create_safety_task(agent: Agent, category: str, observation: str) -> Task:
    return Task(
        description=f"""Evaluate safety boundaries for category {category} with observation: "{observation}".
        Rules:
        - NEVER instruct customer to open electrical panels, touch 230V terminals, test capacitors, or handle R32 gas.
        - If safety flag applies, output MUST state: "SAFETY OVERRIDE: AUTHORIZED TECHNICIAN REQUIRED".
        Provide clear customer advisory.""",
        expected_output="A safety assessment verdict with allow_diy (boolean) and safety_advisory (string).",
        agent=agent,
    )
