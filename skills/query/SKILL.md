---
name: query
version: 1.0.0
description: |
  Answer questions using the brain's knowledge with 3-layer search, synthesis,
  and citation propagation. Use when the user asks a question, wants a lookup,
  or needs information from the brain.
triggers:
  - "what do we know about"
  - "tell me about"
  - "who is"
  - "what happened"
  - "search for"
  - "look up"
tools:
  - search
  - query
  - get_page
  - list_pages
  - get_backlinks
  - traverse_graph
  - get_timeline
mutating: false
---

# Query Skill

Answer questions using the brain's knowledge with 3-layer search and synthesis.

## Contract

This skill guarantees:
- Every answer is grounded in brain content (no hallucination)
- Every claim is traceable back to brain content, even when the user-facing answer stays conversational
- Gaps are flagged explicitly ("the brain doesn't have information on X")
- Source precedence is respected (user statements > compiled truth > timeline > external)
- Conflicting sources are noted with both citations

## Phases

1. **Decompose the question** into search strategies:
   - Keyword search for specific names, dates, terms
   - Semantic query for conceptual questions
   - Structured queries (list by type, backlinks) for relational questions
2. **Execute searches:**
   - Keyword search gbrain for FTS matches (search)
   - Hybrid search gbrain for semantic+keyword with expansion (query)
   - List pages in gbrain by type or check backlinks for structural queries
3. **Read top results.** Read the top 3-5 pages from gbrain to get full context.
4. **Synthesize answer** from the brain. Keep provenance available, but default to a natural user-facing response.
5. **Flag gaps.** If the brain doesn't have info, say "the brain doesn't have information on X" rather than hallucinating.

## Anti-Patterns

- Answering from general knowledge when the brain has relevant content
- Hallucinating facts not in the brain
- Silently picking one source when sources conflict
- Loading full pages when search chunks are sufficient
- Ignoring source precedence (user statements are highest authority)

## Output Format

Answers should include:
- Direct response to the question
- Gap flags: "The brain doesn't have information on X"
- Conflict notes when sources disagree

Default user-facing style:
- Do not expose raw page slugs, filesystem paths, or `[Source: ...]` citations in ordinary chat answers
- Do not narrate internal process steps like "I checked memory search" or list which tools ran unless the user asks
- If provenance helps, mention it naturally: "From your workspace notes..." or "Based on your brain's notes about Alice..."
- Only surface exact page references, raw citations, or detailed retrieval/debugging traces when the user explicitly asks for sources, provenance, or diagnosis

## Quality Rules

- Never hallucinate. Only answer from brain content.
- Keep the answer conversational by default; grounding is mandatory, but raw citation syntax is optional and usually hidden
- Flag stale results: if a search result shows [STALE], note that the info may be outdated
- For "who" questions, use backlinks and typed links to find connections
- For "what happened" questions, use timeline entries
- For "what do we know" questions, read compiled_truth directly

## Token-Budget Awareness

Search returns **chunks**, not full pages. Read the excerpts first before deciding
whether to load a full page.

- `gbrain search` / `gbrain query` return ranked chunks with context snippets.
  These are often enough to answer the question directly.
- Only use `gbrain get <slug>` to load the full page when a chunk confirms the
  page is relevant and you need more context (e.g., compiled truth, timeline).
- **"Tell me about X"** -- get the full page (the user wants the complete picture).
- **"Did anyone mention Y?"** -- search results are enough (the user wants a yes/no with evidence).

### Source precedence

When multiple sources provide conflicting information, follow this precedence:

1. **User's direct statements** (highest authority -- what the user told you directly)
2. **Compiled truth** (the brain's synthesized, cited understanding)
3. **Timeline entries** (raw evidence, reverse-chronological)
4. **External sources** (web search, API enrichment -- lowest authority)

When sources conflict, note the contradiction with both citations. Don't silently
pick one.

## Citation in Answers

When referencing brain pages in your answer:
- Default to a clean synthesis without raw citation blocks
- Preserve provenance internally so you can produce exact citations on request
- When the user explicitly asks for sources, cite the relevant page(s) and propagate inline `[Source: ...]` citations as needed
- When you synthesize across multiple pages for a source-requesting user, cite all relevant sources

## Graph Traversal (v0.10.1+)

For relationship questions ("who knows who at X?", "connections between A and B",
"who works at Acme?", "who attended the standup?"), use the graph layer instead
of full-text search:

- `gbrain graph-query <slug> --type <link_type> --depth N --direction in|out|both`
- Available link types: `attended`, `works_at`, `invested_in`, `founded`, `advises`, `mentions`, `source`
- `--direction in` answers "who points to X?" (e.g., who works at company X)
- `--direction out` answers "what does X point to?" (default)
- `--depth N` controls multi-hop traversal (default 5)

Examples:
- "Who works at Acme?" → `gbrain graph-query companies/acme --type works_at --direction in`
- "Who attended Demo Day W26?" → `gbrain graph-query meetings/demo-day-w26 --type attended --direction out`
- "What companies has Emily advised?" → `gbrain graph-query people/emily --type advises --direction out`
- "Who has Alice met (via meetings)?" → `gbrain graph-query people/alice --type attended --depth 2`

Combine with `gbrain query` for queries that need BOTH semantic similarity AND
graph structure. Search results are ranked with a small backlink boost so well-
connected entities surface higher.

## Search Quality Awareness

If search results seem off (wrong results, missing known pages, irrelevant hits):
- Run `gbrain doctor --json` to check index health
- Check embedding coverage -- partial embeddings degrade hybrid search
- Compare keyword search (`gbrain search`) vs hybrid search (`gbrain query`)
  for the same query to isolate whether the issue is embedding-related
- Report search quality issues in the maintain workflow (see maintain skill)

## Tools Used

- Keyword search gbrain (search)
- Hybrid search gbrain (query)
- Read a page from gbrain (get_page)
- List pages in gbrain with filters (list_pages)
- Check backlinks in gbrain (get_backlinks)
- Traverse the link graph in gbrain (traverse_graph)
- View timeline entries in gbrain (get_timeline)
