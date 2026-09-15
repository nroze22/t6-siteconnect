# Model setup — current status

The native setup job now persists its model and phase in the synthetic operations journal. It continues across UI navigation, exposes a cancel action, and presents an explicit resume after application restart. Installed weights are reused, and reopening requires response verification before readiness. Cancellation preserves files and stops this client request; it does not terminate unrelated Ollama users or forcibly kill an external installer.

On the actual Mac, the official runtime downloaded, passed the macOS assessment step, installed and started. The E2B model download was started, cancelled, resumed, interrupted by app restart, and resumed again. The selected model and interruption state restored correctly. The download completed and the native job passed its real model response check at 2026-09-09 02:34:11 UTC. This is a setup smoke test, not a clinical extraction benchmark. The final verification completed in the backend while the Mac was locked; the completed screen was not visually rechecked.

The hardware checks, model selection limits, download-success verification and native installer protections from the prior review remain. Models are downloaded on demand, not embedded in the app. Windows/Linux clean installs, GPU-specific performance, enterprise proxy configuration and a fully offline signed distribution remain unverified. Disk checks use the app-visible model directory; separately configured service environments still need validation.

The working-space policy remains conservative and can require extra free space when resuming partial downloads. The app has not implemented generic reclamation or deletion of unrelated model files.

See OPERATIONS-REFINEMENT.md for implementation scope, journal boundaries and production acceptance gates. Official references: [Ollama FAQ](https://docs.ollama.com/faq), [model pull](https://docs.ollama.com/api/pull), [model catalog](https://ollama.com/library/gemma4).
