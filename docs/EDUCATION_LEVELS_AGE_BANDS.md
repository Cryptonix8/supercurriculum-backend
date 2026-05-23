# School levels and age bands (client)

Single source of truth so the app and AI tutor can answer age/grade questions without manual lookup.

- **Primary school**: ages **6–12** (grades 1–6). Greek: Δημοτικό (dimotiko_1–dimotiko_6).
- **Junior high school**: ages **13–15** (grades 7–9). Greek: Γυμνάσιο (gymnasio_1–gymnasio_3).
- **Senior high school**: ages **16–18** (grades 10–12). Greek: Λύκειο (lykeio_1–lykeio_3).

Implementation: `backend/src/common/education-levels.ts`. The AI tutor system prompt includes this text so it can answer age/grade questions directly.
