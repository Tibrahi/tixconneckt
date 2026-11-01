# MASTER ENGINEERING DIRECTIVE: STRICT LIGHTWEIGHT CODE, HIGH PERFORMANCE, STORAGE EFFICIENCY, SECURITY, AND FAST COMPILATION

Act as a senior software architect, performance engineer, security engineer, and code optimization specialist.

Your task is to audit and enforce a strict engineering standard across the entire existing application.

**THE ONLY OBJECTIVE OF THIS TASK IS TO MAKE THE CODEBASE LIGHTWEIGHT, FAST, EFFICIENT, SECURE, MAINTAINABLE, AND RESOURCE-EFFICIENT.**

Do not redesign the UI, introduce new features, or change the application's business functionality. Focus exclusively on code quality, execution speed, compilation speed, storage efficiency, resource consumption, security, and maintainability.

## 1. STRICTLY AVOID HEAVY AND UNNECESSARY CODE

- Do not introduce unnecessarily large libraries or frameworks.
- Avoid dependencies that provide functionality already available in the existing stack.
- Eliminate duplicate code and unnecessary abstractions.
- Avoid deeply nested logic and unnecessarily complicated implementations.
- Do not create multiple components, services, or utilities that perform the same task.
- Prefer simple, direct, efficient solutions.
- Avoid unnecessary background processes.
- Avoid excessive event listeners and subscriptions.
- Avoid unnecessary middleware.
- Avoid redundant API calls.
- Avoid unnecessary database operations.
- Avoid memory-intensive algorithms when simpler alternatives exist.

Every line of code must serve a clear purpose.

## 2. MAXIMIZE APPLICATION EXECUTION SPEED

Optimize the application for fast execution and minimal resource consumption.

- Use efficient algorithms and appropriate data structures.
- Reduce unnecessary loops and repeated computations.
- Avoid synchronous operations that block the main execution thread.
- Use asynchronous processing appropriately.
- Prevent unnecessary component re-rendering.
- Avoid repeatedly calculating identical results.
- Cache expensive computations when caching is beneficial.
- Avoid excessive object creation and memory allocation.
- Release resources when they are no longer needed.
- Prevent memory leaks.
- Optimize API request frequency and payload sizes.

Prioritize actual performance improvements over complicated optimization techniques.

## 3. MINIMIZE STORAGE AND DISK USAGE

Treat storage efficiency as a mandatory engineering requirement.

- Remove unused files and obsolete assets after verifying they are not referenced.
- Eliminate duplicate dependencies and duplicated assets.
- Avoid storing unnecessary generated files.
- Avoid unnecessarily large images, fonts, and media.
- Optimize asset formats and compression.
- Remove obsolete build artifacts and temporary files where safe.
- Avoid storing duplicated database information.
- Minimize unnecessary local storage and browser storage.
- Set appropriate retention policies for logs and temporary data.
- Avoid unnecessary database columns and redundant records.
- Use efficient data serialization.
- Store only information required by the application.

Never delete user data, production records, migrations, or files without verifying that removal is safe.

## 4. KEEP THE CODEBASE SMALL AND MAINTAINABLE

Enforce clean and maintainable architecture.

- Prefer small, focused functions.
- Keep components and services responsible for clearly defined tasks.
- Reuse existing utilities where appropriate.
- Avoid unnecessary architectural layers.
- Avoid overengineering.
- Avoid excessive configuration.
- Remove dead code.
- Eliminate unused imports and variables.
- Maintain consistent naming conventions.
- Keep dependencies and integrations organized.
- Avoid circular dependencies.
- Reduce unnecessary coupling between modules.

Do not sacrifice readability for shorter code.

The goal is efficient code that another developer can understand and maintain easily.

## 5. OPTIMIZE COMPILATION AND BUILD SPEED

The development and production build processes must remain fast.

Investigate and optimize:

- Dependency installation.
- TypeScript compilation.
- JavaScript bundling.
- Module resolution.
- Build configuration.
- Asset processing.
- Code generation.
- Test execution.
- Development server startup.

Requirements:

- Avoid unnecessary build plugins.
- Avoid processing unchanged files.
- Use incremental compilation where supported.
- Configure appropriate build caching.
- Remove unused build dependencies.
- Minimize unnecessary transpilation.
- Optimize module imports.
- Avoid unnecessarily large bundles.
- Use tree-shaking and dead-code elimination.
- Split code appropriately.
- Prevent expensive build operations from running unnecessarily.

Do not disable type checking, security checks, or essential validation simply to make compilation faster.

## 6. ENFORCE FAST API AND DATABASE OPERATIONS

Keep backend execution lightweight and responsive.

- Minimize database round trips.
- Eliminate N+1 queries.
- Retrieve only necessary fields.
- Use appropriate indexes.
- Avoid expensive queries without justification.
- Use efficient pagination.
- Reuse healthy database connections.
- Avoid opening unnecessary connections.
- Prevent connection leaks.
- Keep transactions short.
- Avoid blocking requests with unnecessary background work.
- Use efficient API payloads.
- Validate requests efficiently.
- Avoid repeated authentication or authorization lookups when safe caching is possible.

All optimizations must preserve data consistency and access permissions.

## 7. STRICT MEMORY AND CPU MANAGEMENT

Prevent unnecessary resource consumption.

- Identify memory leaks.
- Prevent unbounded arrays, caches, and queues.
- Avoid unnecessary polling.
- Avoid excessive timers.
- Clean up subscriptions and event listeners.
- Cancel obsolete requests.
- Avoid unnecessary worker processes.
- Prevent CPU-intensive work from blocking important operations.
- Set appropriate limits for background jobs.
- Avoid loading large datasets into memory.
- Process large collections in manageable batches.

The application must remain stable during extended usage and concurrent activity.

## 8. SECURITY MUST NEVER BE SACRIFICED FOR SPEED

Use secure, efficient implementation practices.

- Validate all untrusted inputs.
- Enforce authorization on the backend.
- Use parameterized database queries.
- Protect authentication and session handling.
- Secure sensitive configuration and environment variables.
- Avoid exposing secrets in client-side code.
- Apply appropriate rate limiting.
- Prevent injection vulnerabilities.
- Protect against cross-site scripting and request forgery where applicable.
- Avoid leaking sensitive information through logs.
- Use secure dependency versions.
- Audit third-party packages for vulnerabilities.
- Apply least-privilege access principles.

Never disable authentication, authorization, validation, encryption, or security checks to improve performance.

## 9. DEPENDENCY MANAGEMENT

Keep the dependency ecosystem lightweight.

Before introducing any package:

1. Determine whether the functionality already exists in the project.
2. Evaluate the package's size.
3. Evaluate its maintenance status.
4. Check its security history.
5. Determine whether a smaller alternative exists.
6. Assess its effect on build time and runtime performance.

Avoid packages that introduce excessive transitive dependencies.

Remove unnecessary packages only after confirming that no existing functionality depends on them.

## 10. ESTABLISH STRICT PERFORMANCE STANDARDS

Measure actual results instead of assuming optimizations work.

Track:

- Bundle size.
- Dependency size.
- Build duration.
- Development startup time.
- API response time.
- Database query duration.
- Memory consumption.
- CPU utilization.
- Storage consumption.
- Number of database queries.
- Network payload sizes.
- Frontend rendering performance.

Compare the original measurements with the optimized implementation.

Set realistic budgets based on the existing infrastructure and application requirements.

Prevent future changes from unnecessarily increasing resource consumption.

## 11. IMPLEMENTATION RULES

These requirements are mandatory:

1. Audit the existing codebase before making changes.
2. Identify unnecessary complexity and resource-heavy implementations.
3. Prioritize changes with measurable performance benefits.
4. Avoid rewriting working modules without a clear reason.
5. Do not add dependencies unnecessarily.
6. Do not introduce heavy abstractions.
7. Do not duplicate existing functionality.
8. Do not sacrifice security or maintainability.
9. Do not remove essential functionality.
10. Do not delete production data.
11. Do not use arbitrary optimizations without measuring their impact.
12. Test all modified functionality.
13. Keep the existing application architecture compatible.
14. Document important architectural changes.

## 12. FINAL ACCEPTANCE CRITERIA

The optimized codebase must demonstrate:

- Minimal unnecessary code.
- Minimal unnecessary dependencies.
- Efficient memory consumption.
- Lower unnecessary CPU usage.
- Reduced storage occupation.
- Smaller or appropriately optimized production bundles.
- Faster compilation and build processes.
- Efficient database operations.
- Lightweight API requests.
- No unnecessary background processing.
- No avoidable memory leaks.
- Strong security.
- Readable and maintainable code.
- No broken existing functionality.

## FINAL DIRECTIVE

**THINK LIGHTWEIGHT. BUILD EFFICIENTLY. EXECUTE QUICKLY. MAINTAIN SIMPLY. SECURE EVERYTHING.**

Never choose a heavy implementation when a simpler, faster, safer, and more maintainable solution can accomplish the same objective.

Do not optimize merely to reduce the number of lines of code. Optimize the actual execution, resource consumption, complexity, and long-term maintenance cost.

The final result must be a lean, production-ready codebase that responds quickly, compiles efficiently, occupies minimal unnecessary storage, consumes resources responsibly, and remains secure and maintainable.

Focus exclusively on this engineering objective. Do not introduce unrelated features or redesign the application.