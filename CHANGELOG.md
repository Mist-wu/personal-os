# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-06-04

### Added

- `memory_add` now accepts `attachments` (local file paths): signs via `/api/v1/object/sign`, uploads to S3, and links them as multimodal `ContentItem`s on the latest user message (image: jpg/jpeg/png/gif/webp; doc: pdf/doc/txt/html/htm/eml; audio: mp3/wav).
- `memory_search` exposes `method` (keyword/vector/hybrid/agentic), `radius`, and `include_original_data`.
- `agent_record` supports faithful tool traces: assistant `tool_calls` and `tool` messages with `tool_call_id` (OpenAI format), in addition to the existing summarize-into-assistant style.

### Notes

- Verified against the cloud API on 2026-06-04: search/get still reject the `foresight` and `eventlog` memory types (HTTP 422) even though the latest docs list them, so `memory_foresight` keeps its episodic+profile fallback.

## [0.1.0] - 2026-06-02

### Added

- Pi extension with 9 EverOS-backed tools: `memory_search`, `memory_add`, `memory_profile`, `memory_episodes`, `memory_foresight`, `memory_delete`, `agent_skills`, `agent_cases`, `agent_record`.
- EverOS REST client (`fetch`), config loader (`EVEROS_API_KEY` / `.env` walk-up), and shared tool prompt guidelines.
- `pi-package` manifest for `pi install npm:pi-everos-memory` and [pi.dev/packages](https://pi.dev/packages) discovery.
- Unit tests for package manifest and smoke checks.

[Unreleased]: https://github.com/Mist-wu/pi-everos-memory/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Mist-wu/pi-everos-memory/releases/tag/v0.2.0
[0.1.0]: https://github.com/Mist-wu/pi-everos-memory/releases/tag/v0.1.0
