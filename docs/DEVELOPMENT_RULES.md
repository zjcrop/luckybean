# Lucky Bean Development Rules

## Core Principles

1. Core brewing functions must run locally and must not depend on AI availability.
2. No new paid API, paid model, paid cloud service, or paid third-party dependency may be introduced.
3. AI is an enhancement layer only and must not block brewing workflow.
4. New data structures must maintain backward compatibility.

## AI Boundary

Allowed:
- Tasting text analysis
- Share copy generation
- Optional OCR assistance
- Recipe explanation

Not allowed:
- Directly generating final brewing parameters
- Blocking calculation workflow
- Replacing deterministic calculation engines

## Architecture Layers

- Data layer: bean, brewer, recipe, tasting records
- Decision layer: matching and recommendation
- Calculation layer: brewing simulation and optimization
- Execution layer: timer, voice, animation
- AI layer: optional enhancement
