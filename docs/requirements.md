# AI API Migration Reviewer — Requirements

Status: Updated in place from the approved requirements interview. This document records product requirements only; it does not authorize architecture design or implementation.

## 1. Product Overview

AI API Migration Reviewer is a local-first, AI-assisted application for an internal pilot using the team's real Lumen 11.0 to NestJS 11.0.1 migration. It helps backend engineers compare implementation behavior and prepare tests.

Users select two local repositories, discover and map endpoints, and select mapping groups for batch static review. The application presents code evidence, provisional findings, coverage limitations, and editable test suggestions. It does not execute requests against source or migrated API environments or run repository code. Approved OpenAI analysis requests are permitted.

The product aims to reduce manual review time and detect migration defects within its stated scope. Review completion does not certify full migration correctness or runtime behavior.

## 2. Problem Statement

Migration reviews require engineers to trace request validation, authentication, authorization, business logic, database operations, error handling, and response contracts across implementations. Manual comparison and test preparation are time-consuming and can miss defects.

The MVP focuses on missing validation or defaults, changed response contracts, reordered business operations, changed database behavior, incomplete exception handling, and undocumented intentional changes. Cache, messaging, external-integration, and logging behavior can also affect correctness, but their comparison is deferred and relevant exclusions must remain visible.

## 3. Target Users and Pilot Boundary

- The first release serves the user's own team and a specific real migration.
- The primary user is the backend engineer performing the migration.
- Source: Lumen 11.0. Target: NestJS 11.0.1.
- Initial support focuses on conventional routes, controllers, services, and database access patterns.
- The pilot contains up to 50 endpoints; acceptance testing must reflect that scale.
- The team's documented migration defects and reviewed endpoints provide the evaluation starting point.

## 4. User Flow

1. Start the local application through a terminal command and open the browser UI.
2. Enter an OpenAI API key for the application session.
3. Create or open a local project containing one source and one target repository.
4. Validate paths, identify frameworks, and discover routes by reading files.
5. Review deterministic one-to-one matches, correct mappings, and manually define split or merged mapping groups.
6. Describe intended behavioral correspondence for split/merged groups, including call order and data handoff where applicable.
7. Manually enter missed routes and select their handlers and supporting files when needed.
8. Select mapping groups for a batch, choose a validated OpenAI model, and set or review per-group and total-batch spending limits.
9. Inspect collected, sanitized context organized by mapping group; include relevant context or exclude content within the repository boundary.
10. Review the spending estimate and approve the batch context before transmission.
11. Follow analysis progress; approve any additional or changed content before it is shared.
12. Review provisional findings, evidence, suggested severity, and coverage limitations.
13. Verify findings, record intentional differences or false positives, and resolve outstanding findings. Reported fixes require reanalysis and human verification.
14. Review, add, edit, disable, or remove baseline and finding-specific test suggestions.
15. Export a Markdown test checklist and preview a Markdown report, choosing whether to include sanitized code excerpts.
16. Revisit results, retry incomplete groups, or delete individual reviews or projects.

## 5. Functional Requirements

### 5.1 Project configuration

- Each project must contain exactly one local Lumen repository and one local NestJS repository.
- Accept repository paths, validate existence and readability, and show detected frameworks.
- Restrict repository/context reads to the two selected repository roots; additional dependency directories are outside scope. Application-owned local storage and user-selected report export destinations are separately permitted for persistence and export, not as additional analysis inputs.
- Do not read repository paths or symbolic links that resolve outside the selected roots. Report blocked dependencies as context gaps. Application operations must not write into either reviewed repository.
- Analyze current files on disk, including uncommitted changes.
- Identify captured file versions in reports and record the Git revision when available.

### 5.2 Endpoint discovery and mapping

- Discover routes by reading files, without running repository code or framework commands.
- Show each discovered endpoint's method, normalized path, handler, source file, and framework.
- Use deterministic method-and-path matching for straightforward one-to-one mappings, with manual correction.
- Distinguish matched, missing, additional, and uncertain endpoints and report unresolved routes.
- Allow manual entry of missed routes and selection of handlers and supporting files.
- Support one-to-one, one-to-many, and many-to-one mapping groups, including renamed paths.
- Require users to define split/merged groups manually and describe intended behavioral correspondence, including call order and data handoff where applicable.
- Mark ambiguous correspondence incomplete rather than claim equivalence.
- An unmatched endpoint is a deterministic inventory observation, not proof that behavior is missing. Users must confirm absence or provide a mapping. Unmatched endpoints remain outside mapped analysis; report their count and disposition separately, and never imply that all discovered endpoints were reviewed. Source-only semantic reviews and source-only scenario generation are not part of this MVP.
- Split/merged reviews compare only the finite set of user-selected handlers and described correspondence. They do not establish cross-request runtime equivalence, data availability, or transaction atomicity. Unspecified required order, input/output handoffs, or responsibility allocation must be reported as gaps.

### 5.3 Batch selection and context approval

- Allow selection of multiple mapping groups in a batch.
- Analyze selected groups and relevant dependencies only within the selected repositories.
- Show selected files and symbols; allow users to add relevant context or exclude unrelated content.
- Obtain one approval for the batch's collected, sanitized context, organized by mapping group.
- Require fresh approval before transmitting additional or changed content. Reuse of approved content within that review does not require approval for every request.
- Identify unresolved dependencies, omitted context, and coverage limitations.

### 5.4 Findings and human review

- Use Lumen behavior as the default source of truth, subject to explicitly approved intentional differences.
- Provide relevant file, class, method, or symbol references and source/target evidence wherever available.
- Keep all AI findings provisional until explicitly verified by a user.
- Separate evidence strength, severity, and human review status.
- AI suggests High, Medium, or Low severity with rationale, or Unassessed when impact cannot be supported. Users can override severity.
- Allow verified-defect, intentional-difference, false-positive, and unresolved dispositions.
- Keep approved exceptions visible and reuse them only while the affected group's captured context and user-defined correspondence are unchanged. Changes to either require renewed approval. If this cannot be checked, mark approval as requiring review rather than silently reuse it.
- Record a reported fix as “fix reported” until changed code is reanalyzed and a human verifies closure.
- Require disposition of every finding and resolution of outstanding findings and context gaps affecting in-scope judgments before review completion.
- “Review complete” means complete within MVP scope. Deferred behavior remains prominently excluded; it blocks completion only when it leaves in-scope behavior unassessable.
- Never present incomplete analysis as a pass. Allow incomplete reports to be exported.
- Track analysis progress, human triage, and defect resolution separately. Analysis may finish with defects. Human triage finishes when every finding has an explicit disposition; unresolved findings may be recorded but remain open. Under the agreed completion policy, an unfixed verified defect, an unresolved finding, or a fix awaiting verification blocks “review complete.” Fixed-and-verified, approved intentional differences, and false positives are resolved dispositions.
- Batch completion requires completion of every selected mapping group. Failed, canceled, outdated, or incomplete groups prevent a batch-wide completion claim without hiding completed groups. Completion never means the entire repository is defect-free.

### 5.5 Test-scenario management

- Generate baseline suggestions for every reviewed endpoint plus finding-specific scenarios, even when no defect is found.
- Include happy-path and applicable validation, authorization, and error cases supported by code.
- Allow users to add, edit, disable, and remove suggestions.
- Label all scenarios unexecuted suggestions and identify missing context.
- Include preconditions, inputs, expected behavior, and linked findings where applicable.
- Request details may include method, path, headers, query/path parameters, body, and expected status.
- Use explicit placeholders for unknown credentials and business data; do not represent code-inferred values as valid runtime data.
- Export suggestions as Markdown checklists for the team's existing testing workflow.

### 5.6 Budgets, batch failures, and cancellation

- Require users to set both per-mapping-group and total-batch spending limits before their first review. Save these limits locally and display them before subsequent batches.
- Reuse a user-set default per-group limit that users can adjust.
- Show a spending estimate before analysis; do not represent it as a guaranteed final charge.
- Mark unfinished group analysis incomplete when its limit prevents further work. Stop further AI requests across the batch when the total budget is reached.
- Continue unaffected groups when another group fails or lacks context.
- Show each group's status and allow retry of incomplete groups.
- Cancellation stops further work, preserves completed results, and marks unfinished groups canceled. Requests already sent may still incur charges.
- Retry requires fresh budget and context checks.
- Spending limits govern application-authorized usage calculated from recorded model pricing, not a guarantee about the provider's final invoice. Before dispatch, the application must reserve the estimated maximum charge for the request, including bounded output, against both limits. Recorded charges plus all outstanding reservations must fit both limits; otherwise do not send the request.
- On receiving usage, reconcile its charge with the reservation. If pricing or usage is unknown, do not release the reservation or silently assume zero cost. Stop new paid requests for the affected batch when safe accounting cannot be established and show the reason. Unexpected reported overage must be visible and stop further batch requests.
- Durably record each request's reservation against its group and batch before dispatch; if saving fails, do not send the request. Preserve reservations and accounted usage across crashes and restarts for retained reviews. A restart must not restore previously consumed allowance or treat an interrupted request as free.
- For a request with unavailable final usage, retain its full reserved amount as an unknown-cost allowance charge. Before resuming, show the unresolved request, reserved amount, and remaining budgets. The user may explicitly accept this conservative accounting and retry only if valid recorded pricing and the remaining group and batch allowances permit it. This acknowledgment does not erase the charge or establish the provider's actual bill. If a safe reservation was not established or pricing cannot be validated, keep the batch blocked; a separately initiated batch requires a new displayed allowance and disclosure of the prior unresolved spending.
- Reconcile a reserved amount only when attributable provider usage becomes available; prevent double-counting and label unresolved amounts separately from known charges. Reconciliation alone must not restart analysis. These recovery rules do not override explicit deletion: deleted work cannot be resumed or recreated, and any remaining non-deleted batch must conservatively account for the deleted group's outstanding reservation within its aggregate allowance.
- All AI calls, including context assessment, scenario generation, and retries, count toward these limits. Retrying within a batch uses its remaining allowance and the group's remaining allowance; it must not reset either. A user-started new batch has a new explicitly displayed allowance and retains the prior batch's cost history.
- No automatic paid retries are required in the MVP. Retry is user-initiated after the failure reason, available results, and budget checks are shown.

### 5.7 Results and reporting

- Review captured, approved code. Relevant subsequent file changes mark affected results outdated rather than silently changing review evidence.
- Require fresh sharing approval to review changed content.
- Show findings, evidence, code references, coverage gaps, approved exceptions, severity, and review status.
- Do not imply runtime verification by the MVP.
- Export review reports as Markdown with a preview.
- Include code references by default and let users choose whether to include sanitized code excerpts.
- Retain coverage limits and provisional finding labels in exports.
- Exported copies are outside application-managed storage; project deletion does not delete them.
- Capture context before approval and record the file versions and mapping description used. If collection detects changes before the captured set is finalized, discard the affected capture and recollect it; do not submit it for approval as a consistent version. The application cannot promise a transactionally consistent snapshot of a repository being edited concurrently and must not claim one.
- Compare captured file versions and mapping descriptions before starting analysis, before declaring review completion, and when reopening a review. Changed or unavailable inputs mark affected results outdated or unverifiable; preserve the old evidence. Check captured dependencies as well as handlers. Continuous filesystem monitoring is not required.
- At these freshness checks, repeat supported route and dependency discovery within the approved repository boundaries, including when prior results or exception approvals would be reused. Compare the discovered route, dependency, and registration/configuration inputs with the prior review; checking only previously captured files is insufficient. Newly added, removed, renamed, or changed inputs that alter a group's supported dependency or route set invalidate its current results and require renewed exception approval. Preserve historical evidence and decisions as historical records.
- If rediscovery cannot establish whether a change affects a group, mark its freshness unverifiable and do not reuse its completion claim or exception approval as current. Report unresolved patterns as coverage gaps. Rediscovery is local, read-only work; it does not authorize transmitting newly discovered content. Fresh sharing approval is required before that content is sent for reanalysis.
- Cite and validate evidence against the captured review context, not a newer live file. Reanalysis produces a new evidence version; it must not silently overwrite prior human decisions or edited scenarios.

## 6. Ownership and AI Responsibilities

The application must deterministically enforce repository boundaries, secret blocking, sharing approval, spending admission, execution prohibitions, captured-reference validation, and persisted review states. These controls must not depend on AI compliance. Deterministic validation establishes that evidence exists, not that an AI interpretation is correct.

The AI proposes findings, severity, context requests, and test suggestions. It does not grant permissions, change budgets, approve exceptions, mark human verification, or decide review completion.

The user selects mappings and context, approves sharing and spending, verifies findings, approves intentional differences, and verifies fixes. The application records these actions and calculates completion from the stated rules.

Repository content, user-supplied analysis descriptions, and model output are untrusted analysis data, not authority to execute commands, access other paths, contact targets, or bypass approval. Rendered findings and Markdown previews must not execute embedded scripts or commands or automatically fetch embedded remote resources.

The AI must assess context sufficiency, identify additional relevant context needed, compare behavior within the approved scope, explain possible compatibility impact with evidence, and state uncertainty. It must preserve supported findings when other areas remain incomplete and generate unexecuted test suggestions without inventing runtime data.

The AI must not:

- Treat citations alone as human verification or label its own conclusions confirmed.
- Access files outside the two selected repositories.
- Transmit additional or changed content without fresh approval.
- Include detected secrets in analysis context or reports.
- Run repository code, framework commands, or API tests.
- Modify repositories or override approved source-of-truth decisions.

## 7. Local Application and AI Access

- Run locally as a Node.js/TypeScript application with a browser UI.
- Install and start through a terminal command; Node.js is required. Reviews take place in the browser.
- Support macOS and Linux.
- Use OpenAI only, directly accessed with each user's company-approved API key.
- Provide masked API-key entry in the browser UI after startup.
- Keep keys session-only: never persist them or include them in logs, reports, or AI analysis context. There is no Remember key feature.
- An API-key session lasts only for the running local application process. Closing a browser tab does not end that process or erase its in-memory key. Shutdown or restart ends the session and requires key re-entry. Closing the UI does not grant pending approvals; work using already approved context may continue within its budgets.
- Offer a small validated list of OpenAI models, each evaluated for quality, cost, and review time.
- Clearly show when approved context will leave the computer.
- Expose scan/analysis progress and cancellation; handle unavailable files, unsupported syntax, provider errors, and interruption gracefully.
- Persist project configuration, reports, references, scenarios, decisions, and sanitized analysis context locally.
- Retain reviews and context until user deletion; support individual-review and entire-project deletion.

### 7.1 Required failure outcomes

| Failure or interruption | Required observable outcome |
| --- | --- |
| Invalid/revoked key or unavailable selected model | Stop affected paid work; show the cause without credentials. Allow key replacement or another validated model and explicit retry. Do not silently fall back to another model. |
| Provider timeout, rate limit, or transport failure | Preserve completed results; mark the affected group failed/incomplete. Show that cost may be unknown and apply section 5.6 before user retry. |
| Malformed AI output or invalid evidence reference | Reject affected findings as usable evidence; show a validation failure and mark affected analysis incomplete. Preserve independently valid results. |
| Missing/unreadable files or unsupported syntax | Show affected paths/patterns and coverage gaps; continue unaffected groups. Do not infer missing behavior from a failed read. |
| Local persistence failure, including disk full | Stop scheduling new paid work; show that current results are not safely saved. Do not claim durable completion. Preserve already saved records and require user action before retry. |
| Application crash or restart | Keep durably saved results and budget reservations. Mark previously active work interrupted when reopened; do not automatically resume paid requests. Key entry, section 5.6 unknown-cost recovery where applicable, and explicit retry are required. |
| Cancellation with requests in flight | Send no subsequent requests. Keep pre-cancellation completed results; late responses must not revive canceled analysis or mark it complete. Account for late usage when available. |
| Deletion of an active review or project | Stop its work before deleting managed records. Late responses must not recreate deleted records. Warn that already submitted requests cannot be recalled and may still incur charges. A non-deleted containing batch retains only the aggregate allowance charge needed to avoid restoring spent/reserved budget, not the deleted group's code or results. Deleting the entire batch/project removes its managed budget history too; that deleted work cannot be resumed. |
| Export write failure | Report failure without claiming export succeeded; retain the saved review for another export attempt. |

User edits to scenarios and finding dispositions must survive ordinary navigation and reopening once saved. A retry must not silently replace those edits.

## 8. Static Code Analysis Requirements

### 8.1 Supported inputs

- Conventional Lumen 11.0 and NestJS 11.0.1 projects.
- JSON REST APIs, including query parameters, path parameters, and headers.
- Explicitly mark unsupported body formats outside coverage.
- Report dependencies outside the two repositories as missing context.
- “Conventional” is not a promise of universal framework support. Before implementing discovery and tracing, inventory the pilot's actual route registration, dependency resolution, authentication, and database-access patterns and record a supported-pattern matrix with representative examples. Unlisted or unresolved patterns must yield explicit gaps, not guessed coverage. Dependency-directory exclusions remain in force; do not assume excluded library implementation is known from a symbol name.

### 8.2 In-scope analysis

- Route methods, paths, controllers, and handlers.
- Request validation and defaults.
- Authentication, authentication-derived values, middleware, guards, and authorization.
- Services, business-flow dependencies, conditional rules, and operation ordering.
- Database reads and writes and statically visible transactions.
- Response fields, types, transformers, resources, serializers, and mappers.
- Status codes, error structures, exception handling, and relevant request/response headers.

Cache/Redis, queues/events, external integrations, and logging comparisons are deferred. Report relevant exclusions. If omitted context prevents an in-scope judgment, mark that assessment incomplete.

### 8.3 Context boundaries and limits

- Begin with deterministic route and handler resolution, with manual recovery as described in section 5.2.
- Collect relevant files and symbols instead of transmitting complete repositories.
- Apply documented limits on tracing depth, file count, context size, and AI iterations. Values must be determined through pilot testing before acceptance; user-adjustable resource limits are outside MVP scope.
- Expose omitted context and affected coverage when a limit is reached.
- Validate AI-referenced files and symbols against the captured review index; this does not prove the behavioral conclusion.
- Allow users to add context within the repository boundary and rerun incomplete reviews, subject to sharing approval and budgets.

### 8.4 Evidence and verification

- Show evidence strength separately from severity and human review status.
- Keep AI findings provisional even when code evidence is available.
- Require explicit user verification for Human-verified status.
- Disclose incomplete context and any need for runtime verification.
- Reanalysis and human verification of a fix remain static review, not proof from execution.
- Evidence categories are: Supported static hypothesis (valid captured citations support an interpretation), Needs runtime verification (static evidence cannot settle behavior), and Incomplete context (required context is unavailable). None is a confirmation of correctness. Invalid citations are validation failures rather than an evidence category. Unresolved context or required verification that prevents an in-scope judgment must block completion.

## 9. Quality and Pilot Acceptance

- Detect at least 80% of known in-scope benchmark defects.
- At least 80% of reported defects must be judged valid by human review.
- Reduce median time to completed human triage by at least 30% compared with manual review, including finding verification and false-alarm handling. This metric does not use the stricter “review complete” status as its stopping point.
- Report missed high-severity defects separately.
- Use the team's documented defects and reviewed endpoints as the benchmark starting point. Document benchmark composition and measurement procedures before acceptance.
- Target approximately five minutes per typical mapping group, excluding user approval time. Validate this target on the pilot repositories; it is not a guarantee.
- Finalize and validate model choices and numerical resource limits before pilot acceptance against agreed quality, spending-control, and timing criteria.
- Freeze benchmark membership and expected in-scope defects before measuring acceptance. Count unique defects, not repeated descriptions; document how findings are matched to reference defects. Known defects in skipped, failed, or incomplete selected benchmark groups remain in the detection denominator.
- Calculate finding validity on unique reported defects before users filter or dismiss them. Report duplicate counts separately. Human adjudication must distinguish false alarms, valid previously unknown defects, and unresolved claims; unresolved claims do not count as valid. Report raw counts with percentages; a zero denominator is not a passing score.
- Compare equivalent endpoint/mapping-group tasks and code versions with and without assistance. Measure from the start of task-specific setup through completion of human triage: every finding has an explicit disposition, including unresolved where applicable. Include context/mapping correction, approvals, analysis waiting time, finding verification, and false-alarm handling. Open verified defects do not extend this timer. Record unresolved dispositions and unfinished tasks separately and do not silently omit them. Document reviewer familiarity and order effects.
- Exclude implementing fixes and subsequent fix reanalysis/verification from the 30% triage-time metric; measure and report those separately. This measurement boundary does not relax review-completion rules: unfixed verified defects, unresolved findings, and fixes awaiting verification still block “review complete.” Apply the same triage boundary to manual and assisted benchmark tasks.
- Report timing separately for one-to-one, split, and merged groups, identifying the benchmark subset considered typical. Report per-model quality and time; pooled results must not conceal a model that fails acceptance.

## 10. Security and Privacy

- Keep source local except explicitly approved, sanitized context sent directly to OpenAI.
- Obtain batch-context approval and fresh approval for additional or changed content.
- Exclude environment files, credentials, tokens, private keys, dependency directories, generated files, and logs by default.
- Redact detected secrets or exclude affected content before transmission and report storage. Do not allow override to send a detected value.
- Show sanitized context and redaction-related coverage gaps. Redaction cannot guarantee detection of every secret.
- Use the provider API key for authentication only; never put it in analysis context, logs, reports, or persistent storage.
- Bind the local server to 127.0.0.1 by default and protect UI communication against unauthorized local requests.
- Apply the distinct repository-read, application-storage, and export permissions in section 5.1. Reject outside-root traversal and link resolution for context collection.
- Maintain local analysis history and allow deletion of individual reviews and projects, including stored context.
- Preview report exports with optional sanitized code excerpts.
- External-provider data handling must satisfy the team's approval requirements. No hosted AI gateway is included.
- Unauthorized browser origins and unauthenticated local callers must not read project data, submit an API key, start analysis, approve sharing, or delete records. Rejected requests must cause no protected action or data disclosure. Binding to loopback alone is not authorization.
- Apply secret checks to user-entered scenario content, model output, persisted evidence, and exports as well as repository input. Keep detected values out of error messages and logs. Code-excerpt opt-out applies to prose and scenario content too; if content still includes source excerpts, disclose and remove them before export without excerpts.

## 11. Confirmed MVP Scope

- Local browser application started through a terminal command on macOS and Linux.
- One Lumen 11.0 and one NestJS 11.0.1 repository per project, including uncommitted files.
- File-only route discovery, manual recovery, deterministic one-to-one mapping, and manual split/merged mapping groups.
- Batch static review with context inspection, sanitization, sharing approval, spending limits, progress, cancellation, and partial results.
- Request/response, authentication/authorization, business-logic, and database-operation comparison within coverage limits.
- Provisional findings, suggested severity, human verification, approved exceptions, outdated-result indicators, and fix reanalysis.
- Editable baseline and finding-specific test suggestions and Markdown checklists.
- Markdown reports with preview and optional sanitized code excerpts.
- OpenAI access with session-only key entry and a small validated model list.
- Local configuration, evidence, results, scenarios, and decisions retained until user deletion.

## 12. Deferred and Out-of-Scope Capabilities

### 12.1 Deferred from the draft or interview alternatives

- Runtime API execution, runtime environment configuration, execution approvals, scheduling, cleanup, and setup/teardown behavior.
- Deterministic runtime response comparison, normalization/ignore rules, and combined static/runtime reports.
- Runtime observation of database, Redis, messaging, webhook, or other side effects.
- Cache/Redis, queue/event, external-integration, and logging comparisons.
- Laravel, other framework versions or migration directions, and broad support for heavily customized/dynamic structures.
- Multipart and other non-JSON body formats.
- Windows, Docker distribution, and packaged desktop applications.
- Anthropic, coding-agent account access, managed AI access, local models, and offline AI review.
- Persistent API keys, operating-system credential storage, and encrypted credential-file fallback.
- AI-suggested split/merged groups, additional dependency directories, and user-configurable context resource limits.
- Postman collections and HTML, JSON, or PDF report exports.

### 12.2 Other capabilities remaining outside scope

- Automatic migration, source modification, autonomous fixes, and pull-request creation.
- GraphQL, gRPC, WebSocket, SOAP, and non-HTTP interfaces.
- Production traffic capture/replay and execution against production environments.
- Distributed tracing and full external-system state verification.
- Hosted source repositories, dashboards, report synchronization, team accounts, collaboration, role management, and billing.
- CI/CD blocking, pull-request comments, and terminal-based reviews beyond starting the application.
- Model training using customer source code.

Deferral does not approve future implementation or settle runtime safety policies.

## 13. Remaining Open Questions and Release Prerequisites

### 13.1 Prerequisites before implementing discovery and tracing

- Verify actual repository framework versions and document the supported pilot-pattern matrix required by section 8.1, including representative split/merged mapping examples. Do not silently broaden framework support if the repositories differ from the stated versions.
- Specify the supported Node.js and macOS/Linux versions. These compatibility details are not determined by the operating-system names alone.

### 13.2 Evaluation-dependent release prerequisites

1. Which OpenAI models meet the agreed criteria and belong in the validated list?
2. What tracing-depth, file-count, context-size, and AI-iteration limits are supported by pilot testing?
3. Which benchmark endpoints and defects will be used, and how will validity judgments and manual-versus-assisted review times be measured?
4. What endpoint-discovery accuracy is acceptable? The defect-detection target does not separately define this threshold.

### 13.3 Remaining details requiring confirmation

5. Document the team's approved OpenAI data-handling requirements before any real repository content is transmitted.
6. Validate model pricing and available usage reporting against the spending contract in section 5.6 before enabling a model. Unsupported accounting must block its use, not weaken the budget policy.

Persistence technology remains a later architecture decision, not an approved requirement. Runtime-environment, production-access, authentication, data-isolation, and cleanup policies are deferred with execution.

## Review Notes

The user approved the interview summary and MVP scope and authorized this in-place update. Superseded decisions are not active requirements: both source frameworks became Lumen only; single-endpoint review became batch review; one-to-one-only mapping expanded to split/merged groups; dual providers became OpenAI only; remembered credentials became session-only keys.

No separate finalized document, architecture, or implementation plan is authorized by this update. Release prerequisites must be resolved before pilot acceptance.

The subsequent critical-review revision clarifies enforcement ownership, storage boundaries, spending admission, completion states, evidence invalidation, failure outcomes, and evaluation procedures. It preserves the approved MVP capabilities and deferred scope; it does not claim that release evaluation or repository compatibility checks have already passed.
