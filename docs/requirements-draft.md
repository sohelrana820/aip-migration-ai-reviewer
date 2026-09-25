1. Product Overview
AI API Migration Reviewer is a local-first, AI-assisted application that helps engineering teams verify whether an API has been migrated correctly from one technology stack or codebase to another.
The user provides the local paths of the source and migrated repositories. The system scans both codebases, discovers their available API routes, maps corresponding endpoints, and allows the user to select the APIs they want to review.
For each selected API, the system analyzes the relevant implementation flow in both repositories and identifies missing, incomplete, inconsistent, incorrect, or ambiguous behavior in the migrated implementation. It presents a side-by-side comparison with supporting source-code evidence and highlights the affected files, methods, and code areas.
Based on the static analysis, the system prepares suggested API test scenarios. The user can review, add, edit, or remove scenarios. After explicit confirmation, the system can execute approved scenarios against both source and migrated API environments, compare their responses and observable behavior, and produce a combined static-analysis and runtime-validation report.
The product is intended to reduce manual migration-review effort and help teams determine whether the migrated API preserves the behavior of the source API.
2. Problem Statement
Engineering teams frequently migrate APIs from one framework, language, or architecture to another. During migration, developers must preserve request validation, authentication, business logic, database behavior, external integrations, events, error handling, response contracts, and status codes.
Under delivery pressure, teams may not have enough time to manually trace and compare every implementation path. They must also create test scenarios, execute both API versions, and compare the results manually. This process is repetitive, time-consuming, difficult to review consistently, and vulnerable to human error.
As a result, apparently completed migrations may contain subtle incompatibilities such as:
- Missing validation rules or default values
- Changed HTTP status codes or error structures
- Missing response fields or changed data types
- Reordered business operations
- Missing database, cache, queue, or external-service interactions
- Changed authentication or authorization behavior
- Incomplete exception handling
- Undocumented intentional changes
- Incorrect application logging format
AI API Migration Reviewer aims to make this verification process faster, more consistent, evidence-based, and easier to repeat before production release.
3. Target Users
Primary users
- Backend software engineers performing API migrations
- Technical leads reviewing migration completeness
- SQA engineers validating migrated APIs
- Automation test engineers preparing parity and regression tests
- Small and medium SaaS companies modernizing legacy applications
Initial niche
The initial product should focus on teams migrating REST APIs from Laravel or Lumen PHP applications to NestJS applications.
Support for other frameworks and migration directions may be considered after the initial product is validated.
4. Proposed User Flow
1. The user starts the local application and opens its browser-based UI.
2. The user creates a migration-review project.
3. The user selects the local path of the source repository.
4. The user selects the local path of the migrated repository.
5. The system validates the paths and detects the frameworks.
6. The system scans both repositories and discovers available API endpoints.
7. The system maps matching source and migrated endpoints.
8. The UI displays matched, missing, and uncertain endpoint mappings.
9. The user reviews or corrects the mappings.
10. The user selects one or more APIs for detailed analysis.
11. The system collects the relevant implementation context for each selected API.
12. The system shows which files and symbols were collected and allows the user to adjust the context when necessary.
13. The AI compares the source and migrated implementations.
14. The system displays evidence-based findings, affected code areas, severity, and confidence.
15. The system proposes runtime test scenarios based on the analysis.
16. The user reviews, adds, edits, disables, or removes test scenarios.
17. The user configures source and migrated runtime environments, headers, credentials, and test data.
18. The system shows the exact requests that will be executed.
19. The user explicitly confirms runtime execution.
20. The local application executes the approved scenarios against both API environments.
21. The system deterministically compares status codes, headers, response bodies, data types, response times, and configured observable behavior.
22. The AI explains the business or compatibility impact of confirmed differences.
23. The system produces a final report combining static findings and runtime evidence.
5. Functional Requirements
5.1 Project configuration
- The system must allow the user to create and manage a migration-review project.
- A project must contain a source repository and a migrated repository.
- The system must accept local repository paths selected or entered by the user.
- The system must validate that each selected path exists, is readable, and is a supported project.
- The system must identify the detected framework and show it to the user.
5.2 Endpoint discovery and mapping
- The system must discover API routes from both repositories.
- A discovered endpoint must include its HTTP method, normalized path, handler, source file, and framework.
- The system must map endpoints using deterministic method-and-path matching first.
- The system may suggest probable mappings when paths or versions differ.
- Suggested or uncertain mappings must require user confirmation.
- The UI must distinguish matched, missing, additional, and uncertain endpoints.
- The user must be able to modify endpoint mappings.
5.3 API selection and context review
- The user must be able to select one or more mapped APIs for detailed review.
- The system must analyze only the selected APIs and their relevant dependencies.
- The system must show the files and symbols selected for analysis.
- The user must be able to include missing relevant files or exclude unrelated files.
- The system must identify unresolved or dynamically resolved dependencies.
5.4 Static migration analysis
- The system must compare source and migrated implementations for behavior that may affect compatibility.
- Findings must contain source and migrated evidence wherever available.
- Findings must identify the relevant file, class, method, or symbol.
- Findings must be categorized by severity and confidence.
- The user must be able to mark a finding as accepted, intentional, fixed, false positive, or unresolved.
- The system must not silently treat an intentional migration change as an error after the user accepts it.
5.5 Test-scenario management
- The system must generate suggested test scenarios from static findings and detected request rules.
- Suggested scenarios must be editable before execution.
- The user must be able to add custom scenarios.
- A scenario may include method, path, headers, query parameters, path parameters, request body, expected status, and comparison rules.
- The system must support variables and placeholders for credentials and environment-specific data.
- AI-generated scenarios must be clearly identified as suggestions rather than verified facts.
5.6 Runtime execution
- Runtime execution must be optional.
- The user must configure separate source and migrated API base URLs.
- The system must display the full execution plan before sending requests.
- The system must require explicit confirmation before executing state-changing requests.
- The system must execute approved requests from the user's local environment.
- The system must capture status, headers, body, duration, timeout, and transport errors.
- Execution order must be configurable when calling both APIs could create conflicting side effects.
- The system must support ignore, normalization, and custom comparison rules for dynamic values.
5.7 Results and reporting
- The system must compare runtime results using deterministic comparison logic.
- The system must distinguish static predictions from runtime-confirmed findings.
- The final report must show matches, mismatches, unresolved areas, and accepted differences.
- The report must include enough evidence for a developer to reproduce each confirmed issue.
- The report should be exportable in at least one portable format, subject to MVP confirmation.
6. AI Agent Responsibilities
The AI agent should:
- Evaluate whether the collected context is sufficient to understand a selected endpoint.
- Request additional relevant symbols or files when material context is missing.
- Compare semantically equivalent implementations across PHP and TypeScript.
- Identify potential differences in validation, authentication, authorization, business rules, execution order, persistence, integrations, events, error handling, and response transformation.
- Explain the possible compatibility or business impact of each finding.
- Generate suggested runtime scenarios for findings that require execution evidence.
- Suggest likely causes and possible fixes without modifying source code in the initial version.
- Clearly state uncertainty and avoid presenting assumptions as confirmed facts.
The AI agent must not:
- Decide runtime execution without user confirmation.
- Access files outside explicitly approved project directories.
- send secrets, credentials, private keys, or environment files to an AI provider.
- Claim a code-level difference without verifiable evidence.
- Automatically modify either source repository in the MVP.
- Treat the migrated implementation as correct when it conflicts with the approved source-of-truth policy.
7. Local Application Requirements
- The product should run as a Node.js/TypeScript application on the user's computer.
- It should provide a browser-based UI served locally.
- The local backend should be responsible for filesystem access, scanning, context collection, secret redaction, runtime requests, and deterministic comparisons.
- The application should listen only on the local interface by default.
- The application should not require source repositories to be uploaded to a hosted server.
- The application should persist project configuration and reports locally.
- Long-running scans and analyses should expose progress and cancellation status.
- The application should recover gracefully from unavailable files, unsupported syntax, AI-provider errors, and interrupted analysis.
- The local application should clearly show when information will leave the user's computer for AI analysis.
8. Static Code Analysis Requirements
8.1 Initial supported frameworks
- Source: Laravel or Lumen PHP application
- Migrated target: NestJS TypeScript application
The exact framework versions supported by the MVP remain an open decision.
8.2 Analysis areas
For each selected API, the system should attempt to discover and compare:
- Route method and path
- Controller and handler
- Request validation and default values
- Middleware, guards, and authorization
- Authentication-derived values
- Services and direct business-flow dependencies
- Conditional business rules and operation ordering
- Database reads and writes
- Transactions where statically visible
- Cache keys, operations, and TTL where statically visible
- Redis implentation and it's usages
- Queue, event, and message publication where statically visible
- External API calls and mapped payloads
- Response transformers, resources, serializers, and mappers
- Status codes and error structures
- Exception handling
- Relevant logging and propagated headers
- Application logging
8.3 Context boundaries
- The system must begin with deterministic route and handler resolution.
- It must collect only relevant files and symbols instead of sending complete repositories to the AI.
- Dependency tracing must have configurable depth, file-count, size, iteration, and cost limits.
- The analysis must report unresolved dynamic dependencies.
- The system must show analysis coverage and context limitations.
- AI-referenced files and symbols must be validated against the local source index before findings are accepted.
8.4 Finding confidence
Each finding must use one of the following confidence states:
- Confirmed: Directly supported by code evidence or runtime results
- Likely: Strong static evidence exists, but runtime confirmation is unavailable
- Needs runtime verification: Execution is required to determine actual behavior
- Incomplete context: Required implementation context could not be resolved
9. Runtime API Comparison Requirements
- The system must not assume that values inferred from code are valid runtime data.
- It must generate a request draft from detected routes, validation rules, DTOs, and code context.
- Unknown business values such as product IDs, customer identities, tokens, OTPs, or active catalog IDs must be requested from the user.
- The user must be able to provide separate or shared headers and variables for both environments.
- Secret values must be masked in the UI, logs, stored data, and reports.
- The system must support safe timeouts, response-size limits, and concurrency limits.
- The system must warn or block production execution by default.
- State-changing methods must require explicit confirmation for each execution or approved batch.
- The system must support configurable sequential or parallel execution.
- The system must allow dynamic fields such as timestamps, request IDs, transaction IDs, and generated tokens to be ignored or normalized.
- Ignoring a field value should not automatically ignore the presence or data type of that field.
- The deterministic comparison must identify status, header, field-presence, value, and data-type differences.
- AI may explain differences after deterministic comparison, but it must not replace the deterministic result.
10. Security and Privacy
- Source code must remain local except for the minimum explicitly approved and sanitized context sent for AI analysis.
- The system must display which files or code symbols will be shared before the first AI request.
- .env files, credentials, API keys, tokens, private keys, dependency directories, generated files, and logs must be excluded by default.
- The system must redact detected secrets before external transmission or report storage.
- The local server must bind to 127.0.0.1 by default.
- Local UI-to-agent communication must be protected against unauthorized local requests.
- Filesystem access must be restricted to directories explicitly selected by the user.
- Runtime target hosts must be explicitly configured or approved.
- Runtime requests and reports must not expose unmasked secrets.
- Destructive or state-changing requests must never run automatically.
- The application must maintain a local audit history of analysis and runtime executions.
- Users must be able to delete locally stored projects, reports, credentials, and execution history.
- The retention policy for any hosted AI gateway remains an open decision.
11. MVP Scope
The proposed MVP should include:
- Local Node.js/TypeScript application
- Browser-based local UI
- Local project creation
- Source and migrated repository-path selection
- Framework detection for an approved Lumen/Laravel-to-NestJS combination
- REST API route discovery in both repositories
- Deterministic endpoint mapping with manual correction
- Selection of individual APIs for analysis
- Collection and preview of relevant code context
- Secret and sensitive-file exclusion
- AI-assisted static comparison
- Evidence-backed findings with severity and confidence
- AI-generated runtime test suggestions
- User editing of generated scenarios
- Local/sandbox or staging runtime configuration
- Explicit execution confirmation
- Dual API execution
- Deterministic response comparison
- Combined static and runtime report
- Local persistence of configuration and results
Suggested MVP constraints
- REST APIs with JSON requests and responses only
- One source repository and one migrated repository per project
- One approved migration direction initially
- Local, development, sandbox, and staging targets only
- No automatic code modification
- No production traffic replay
- No team collaboration or hosted dashboard
- Limited static analysis of dynamic framework behavior
12. Out of Scope
Unless later approved, the following should remain outside the MVP:
- Automatic migration or automatic source-code modification
- Pull-request creation or autonomous code fixes
- Universal support for all languages and frameworks
- GraphQL, gRPC, WebSocket, SOAP, and non-HTTP interfaces
- Mobile or desktop-native applications
- Cloud-based source repository hosting
- Production traffic capture and replay
- Automatic execution against production environments
- Full database-state comparison
- Full Redis-state comparison
- Full RabbitMQ or event-bus consumption verification
- Distributed tracing across external systems
- Team accounts, role management, collaboration, and billing
- CI/CD blocking and pull-request comments
- Self-hosted enterprise AI models
- Model training using customer source code
These items may be considered in later phases after the core workflow is validated.
13. Open Questions
The following questions should be resolved through the requirements interview before architecture and implementation planning:
Product and target market
1. Is the first release intended only for internal validation, a public developer tool, or a commercial SaaS product?
2. Which user is the primary decision-maker: backend developer, technical lead, SQA engineer, or engineering manager?
3. What measurable outcome defines MVP success: review-time reduction, defect detection rate, endpoint coverage, or willingness to pay?
Framework support
4. Should the first MVP support Lumen only, Laravel only, or both as source frameworks?
5. Which minimum and maximum framework versions must be supported?
6. Should the MVP support only conventional project structures, or must it support heavily customized architectures?
Source of truth and accepted changes
7. Is the source implementation always the behavioral source of truth?
8. How should intentional improvements or approved behavior changes be recorded?
9. Should accepted differences be reusable in future reviews?
AI provider and cost
10. Which AI provider and model should be used initially?
11. Will users provide their own API keys, or will the product provide managed AI usage?
12. What is the maximum allowed cost per endpoint review and per project?
13. Must users approve the exact code context before every AI request or only the first request?
Local application and persistence
14. Which operating systems must the MVP support: macOS only, or macOS, Windows, and Linux?
15. Should the application be distributed as an npm CLI, packaged desktop application, Docker container, or another format?
16. Is SQLite acceptable for local persistence?
17. Should users be able to use the product fully offline with a local model?
Runtime execution
18. Which environments are permitted in the MVP: local, development, sandbox, and staging?
19. Should production URLs be completely blocked or allowed after additional confirmation?
20. How will authentication tokens and environment-specific test data be supplied?
21. Should each environment use the same request payload or allow mapped values?
22. How should write operations be cleaned up, rolled back, or isolated?
23. Should the MVP support setup and teardown hooks for test scenarios?
24. Is database, Redis, RabbitMQ, or webhook observation required for the first release?
Reporting and workflow
25. Which export formats are required: Markdown, HTML, JSON, or PDF?
26. Should findings support statuses such as accepted, fixed, false positive, and unresolved?
27. Should reports be stored only locally or optionally synchronized to a hosted service?B
28. Should the MVP include CLI-based execution in addition to the browser UI?
Quality and validation
29. What minimum endpoint-discovery accuracy is acceptable?
30. What false-positive rate is acceptable for AI findings?
31. How will the reviewer be evaluated against known migration defects?
32. What should happen when the system cannot collect sufficient context?
Draft Review Notes
This document is intentionally a draft. It describes the proposed product direction but does not authorize architecture design or implementation. The open questions must be reviewed with the product owner, and the agreed decisions should be incorporated into a separate finalized product requirements document.