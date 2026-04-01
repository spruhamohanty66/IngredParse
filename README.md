# IngredParse

AI-powered food label analyzer that scans ingredient and nutrition labels to detect allergens, flag harmful additives, and provide persona-based health verdicts for kids and health-conscious consumers.

## What It Does

Upload or scan a photo of a packaged food label and IngredParse will:

- **Extract text** from ingredient and nutrition labels using OCR (GPT-4 Vision / EasyOCR)
- **Parse ingredients** with agentic AI — handles compound ingredients, E-numbers, INS codes, and OCR typos
- **Match to database** — exact and fuzzy matching against a curated Supabase ingredient database
- **Detect allergens** — flags Milk, Egg, Peanut, and Gluten with ingredient-level mapping
- **Analyze nutrition** — rule-based nutrient flagging with WHO-aligned daily reference values
- **Generate verdicts** — persona-aware recommendations (Kids / Clean Eating) powered by GPT-4

## Personas

| Persona | Focus |
|---|---|
| **Kids** | Safety for children — flags artificial colors, sweeteners, caffeine, multiple sugar sources |
| **Clean Eating** | Additives, preservatives, processed ingredients — highlights whole grains, fiber, natural oils |

## Label Modes

| Mode | Input | Output |
|---|---|---|
| Ingredient Only | Ingredients label photo | Ingredient analysis, allergen detection, safety summary |
| Nutrition Only | Nutrition label photo | Calorie/nutrient analysis, persona-based flagging |
| Combined | Both labels in one photo | Full ingredient + nutrition analysis |

## Key Features

- **Ingredient Concentration Chart** — top ingredients ranked by weight order
- **Macronutrient Dominance** — inferred macro profile (Carb/Fat/Protein/Balanced) per ingredient
- **Nutrient Map & Daily Intake** — interactive bar chart with category drill-down (Carbs, Protein, Fat, Vitamins, Minerals)
- **Spoon Breakdown** — sugar, fat, and sodium shown in everyday spoon units
- **Energy Card** — calories with persona-aware activity equivalence (minutes to burn)
- **Per Serving / Full Pack toggle** — single toggle controls all nutrition views
- **SME Review Queue** — GPT-4 fallback data flagged for human expert validation before entering the database
- **Guardrails** — no medical claims, no fear-based language, WHO/FSSAI benchmarks only

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, Recharts |
| Database | Supabase (PostgreSQL) |
| AI | GPT-4 (OpenAI) — parsing, analysis, verdicts |
| OCR | GPT-4 Vision (production), EasyOCR (development) |

## Project Structure

```
backend/
  main.py                  # FastAPI app & pipeline orchestration
  agents/                  # Agentic pipeline steps (ingredient, nutrition, analysis)
  services/                # Core services (OCR, parser, DB, classifier, etc.)
  services/validation/     # Validation layer (ingredient, nutrition, output)
  prompts/                 # All LLM prompts in one file
  config/                  # Analysis rules & thresholds
  data/                    # Banned ingredients list
frontend/
  src/app/                 # Next.js pages (home, SME dashboard)
  src/components/          # UI components (upload, results, SME review)
  src/components/results/  # Result visualizations (charts, cards, verdict)
  src/components/sme/      # SME review queue & DB browser
  src/hooks/               # React hooks (decision signals)
  src/lib/                 # Types, utilities, brand config
evals/
  decision_signal_service.py  # North star metric tracking
```

## Data Flow

```
Image Upload → OCR → Classifier → Parser (ingredient/nutrition/both)
  → Validation (retry 1x on fail)
  → DB Matching → GPT-4 Fallback (unmapped ingredients)
  → Allergen Detection → Persona Analysis → Verdict
  → Output Validation (guardrails)
  → Frontend
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenAI API key
- Supabase project (with `ingredonly` and `ingredient_review` tables)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/spruhamohanty66/IngredParse.git
   cd IngredParse
   ```

2. **Backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Frontend**
   ```bash
   cd frontend
   npm install
   ```

4. **Environment variables**
   ```bash
   cp .env.example .env
   # Fill in OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY, etc.
   ```

5. **Run**
   ```bash
   # Terminal 1 — Backend
   cd backend
   uvicorn main:app --reload --port 8000

   # Terminal 2 — Frontend
   cd frontend
   npm run dev
   ```

## Evals & Observability

- **Token tracking** — per-agent token and LLM call counts
- **Response time** — pipeline duration displayed in results
- **Output validation** — regex + AI fallback for guardrail compliance
- **Decision signals** — tracks user engagement (time on screen, chart interactions, scan count) to measure % of informed decisions
- **Scan logging** — full pipeline data stored in Supabase `observability` table

## Guardrails

All outputs follow these principles:

1. No medical advice — informational insights only
2. WHO and FSSAI benchmarks — standardized and transparent
3. Explainability first — every insight linked to underlying data
4. No fear-based messaging — calm, factual, neutral language
5. Context-aware — tied to serving size and consumption context
6. No brand bias — marketing terms ignored, data-driven only
7. Guidance, not judgment — "not recommended" instead of "don't eat"
