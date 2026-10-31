# voice-to-diagnostic

Intelligent Conversational Appliance Pre-Diagnostic System powered by Voice & Multi-tier Intent Classification.

## Overview
Voice-to-Diagnostic provides an intelligent conversational diagnostic workflow for home appliances (including LG Air Conditioners, Single & Double-Door Refrigerators, and Washing Machines). It bridges voice input and natural language (English, Hindi, Hinglish) with decision trees and agentic orchestration to troubleshoot issues and generate structured pre-diagnostic reports.

## Architecture
- **Frontend**: Next.js / React with TypeScript and Tailwind CSS.
- **Backend**: Node.js & Express API engine with regex / NLP triage, session management, and decision tree routing.
- **CrewAI Service**: Python-based multi-agentic orchestration service for deep reasoning and diagnostic summaries.
- **Diagnostic Trees & Knowledge Base**: Comprehensive diagnostic trees, error codes, and appliance maintenance knowledge base in `docs/`.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- npm

### Backend Setup
```bash
cd backend
npm install
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### CrewAI Service Setup
```bash
cd crewai_service
pip install -r requirements.txt
python main.py
```
