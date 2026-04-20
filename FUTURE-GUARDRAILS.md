# Future Guardrails

This document describes a future guardrails architecture for Realtime.

It is not implemented in the current state of the repository.

The current repo already includes basic operational hardening such as app login, `HttpOnly` cookies, `Origin` validation, rate limiting, CSP, and optional Turnstile, but it does not yet include the sideband moderation and control flow described below.

[Inference] The best way to add guardrails without putting them on the voice critical path is a dual-path design: keep the user on the normal Realtime audio path, and attach your backend to the same Realtime session through a sideband control channel. OpenAI documents that sideband lets your server monitor the session, update instructions, and respond to tool calls while the client remains connected over WebRTC or SIP.

Use asynchronous input transcription and moderate the transcript, not the raw audio loop. Realtime supports transcription events such as `conversation.item.input_audio_transcription.delta` and `.completed`, and the moderation docs show `omni-moderation-latest` as the current moderation model for text and multimodal image-plus-text classification. That gives you a clean pattern: let audio flow, stream transcript chunks to your backend, and run moderation there in parallel.

For the normal case, do not block response creation. OpenAI's latency guide explicitly recommends speculative execution for classification-heavy flows such as moderation: start moderation and generation at the same time, then cancel if the classifier returns a bad result. The same guide also recommends chunking streamed output through the backend instead of waiting for the full answer before post-processing it.

Only switch to hard synchronous gating for turns that truly justify it, such as payments, writes and deletes, account changes, regulated content, or risky tool calls. Realtime supports keeping VAD enabled while disabling automatic response generation by setting `turn_detection.interrupt_response=false` and `turn_detection.create_response=false`, then sending `response.create` only after your validation passes. The docs explicitly say this pattern is useful for moderation or input validation, but with added latency. Session settings can be changed mid-session with `session.update`, so you can reserve this stricter mode for specific states only.

If your safety layer detects a problem after generation has started, interrupt instead of pre-blocking every turn. Realtime supports `response.cancel`, and the conversation guide shows `conversation.item.truncate` to remove unplayed audio from the conversation. In practice, that lets you replace the interrupted answer with a short canned refusal or escalation message, which is usually less damaging to UX than forcing all turns through a blocking check.

For prompt-injection and tool guardrails, keep untrusted transcript or user text out of developer instructions. The safety guide says untrusted input should go through user messages, not developer messages, and recommends structured outputs to constrain data flow. Realtime also lets you define tools at the session level or per response, which is useful for narrowing the callable surface when a turn becomes sensitive.

A practical setup would look like this: normal turns run with `create_response:true`, async transcription enabled, and sideband moderation running in parallel; sensitive turns temporarily switch to `create_response:false`, pass through validation, and only then call `response.create`; if a violation appears mid-stream, your server sends `response.cancel`, truncates unplayed audio, and injects a safe fallback. This design is consistent with the Realtime session controls, transcription events, interruption controls, and latency guidance in the docs.

Two small optimizations matter here as well: keep instructions and tool definitions as stable as possible during a session, because changing them mid-session reduces prompt caching; and tune VAD for responsiveness with shorter `silence_duration_ms` on `server_vad`, or use `semantic_vad` with higher eagerness if that fits your UX.

A useful next step would be to map this into a concrete WebRTC plus sideband event flow for this app.
