## Code Review

Before finishing a session where code was changed, run `/review-pr` on the current branch's pull request. This uses the PR review toolkit to check for bugs, style issues, and adherence to project conventions before handoff.

## Git Commits

**Never create a git commit without explicitly asking the user for confirmation first.** Even if the user says "commit this", present the staged changes and proposed commit message, then wait for approval before running `git commit`.

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages. Format: `<type>(<optional scope>): <description>`.

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`.

## Don't

- Don't edit files in `gen/` directories - they are auto-generated
- Don't use `panic()` for error handling
- Don't commit credentials or `.env` files
- Don't add new utility packages without the `u` suffix convention
- Don't bypass the `capiu` package for inter-service calls (you'll lose auth/context propagation)
- Don't create context values without using `contextu` typed inserters/extractors
- Don't duplicate dependencies across service and adapter — if the service already holds a dependency, the adapter should not also hold it
- Don't put complex multi-step logic inside anonymous goroutines — extract into named methods
- Don't grow `response.go` with business logic — it's for handlers and converters only
