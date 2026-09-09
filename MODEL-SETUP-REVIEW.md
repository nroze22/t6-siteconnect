# Local model installation review

September 8, 2026. This is an improved alpha setup flow, not a completed offline installer or a certified deployment system.

## What is implemented

Model setup is now directly available in Data COUNTS without opening the clinical database. It recommends a model from total memory, refreshes memory and disk checks immediately before setup, reuses installed weights, starts or installs Ollama, downloads the selected local model, configures it and verifies a nonempty inference response. Browser installation is disabled rather than reporting simulated success.

Model weights and Ollama are downloaded on demand. They are not bundled with the distributed app. The bundle resource declaration for `models/*` does not itself provision a working model.

The current conservative memory policy recommends Gemma 4 E2B at 16 GiB and E4B at 24 GiB, with a legacy 1B fallback below that where at least 4 GiB is available. Larger models are manually selectable but blocked below their declared memory policy. These are planning thresholds, not GPU compatibility or performance benchmarks. Catalog download sizes are approximate decimal GB; measured memory and space are binary GiB.

Disk checks resolve the model directory from inherited OLLAMA_MODELS or the standard platform location. On Unix, statvfs measures blocks available to the current user on the actual filesystem, including macOS firmlinks. New downloads reserve the estimated model size plus 5 GiB working space. Reuse of an installed model requires a 2 GiB operating reserve. Native pull commands also enforce space and memory checks. A separately configured Ollama service can have a different environment; the UI displays the checked directory and explains this limitation.

The download stream now rejects server errors, malformed records and end-of-stream without verified success. A successful pull must also leave the exact model in Ollama's model list. The UI awaits the command directly, avoiding a completion-event race. Progress describes the current layer rather than claiming it represents the whole multi-layer model.

A failed response check no longer produces Setup complete. Downloaded and verified are separate states, and retry reuses an installed model. The inference check allows up to three minutes for cold startup and checks for nonempty response content; it is not a clinical accuracy evaluation.

The macOS installer now stages extraction in a unique temporary directory, asks macOS to assess the downloaded app signature, and refuses to overwrite or delete an existing Ollama.app. Download connection and overall time limits are explicit. System permission may still require the official installer.

## Verification

239 frontend tests passed, including low/unknown hardware, working-space reserve, installed-model reuse, refreshed disk checks and failed inference not becoming successful setup. 110 Rust tests passed, including rejection of malformed/error pull records. The Apple Silicon debug build completed and Model setup was opened on the actual Mac: 16 GiB RAM, 17.3 GiB available space and E2B recommendation. Selecting E4B was blocked before installation by its 24 GiB memory policy.

No full runtime installation, multi-gigabyte model pull or live model inference was completed in this review. No Windows or Linux installer was exercised. Automated mocks demonstrate control flow, not a successful real download.

## Remaining acceptance work before calling setup rock solid

- Clean-device install, first response, synthetic-note extraction, quit/reopen and model reactivation on every supported platform.
- Interrupted download, connection loss, process termination, full disk during transfer, service restart and update-required recovery with real Ollama.
- Model-drive configuration agreement for separately managed services; permissions and available space for both model storage and runtime staging/install destinations.
- Persistent setup orchestration across navigation/app restarts, explicit cancel/resume controls, and persisted selected-model configuration. Keep the current setup panel open during installation; no durable setup job is claimed.
- GPU/architecture compatibility and actual memory pressure, latency and extraction-quality benchmarks across target machines.
- Signed/version-pinned runtime distribution, verified Windows installer provenance, supported enterprise proxy certificates, approved offline packaging and model-license distribution review.
- No unattended production updater or rollback is implemented. The existing Windows flow opens the official installer; Linux retains its earlier official install-script route. Neither is certified by this pass.

Official references: [Ollama model catalog](https://ollama.com/library/gemma4), [model pull endpoint](https://docs.ollama.com/api/pull), and [Ollama configuration and storage FAQ](https://docs.ollama.com/faq). Service environment and storage configuration were checked against these sources.
