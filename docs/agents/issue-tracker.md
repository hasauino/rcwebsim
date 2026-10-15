# Issue tracker

Issues live on GitHub at `hasauino/rcwebsim`. Use the `gh` CLI, which is authenticated as `hasauino`:

- **Read:** `gh issue view <n> -R hasauino/rcwebsim --comments`
- **List:** `gh issue list -R hasauino/rcwebsim`
- **Create:** `gh issue create -R hasauino/rcwebsim --title … --body …`

Commits and PRs reference issues as `#<n>` (`Closes #<n>` closes the issue on merge). When an issue specifies behaviour, it is the spec for review. Otherwise, the agreed design is recorded in `docs/agents/context.md` and `docs/adr/`.
