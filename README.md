# fab0 for Claude Code

[fab0](https://fab0.dev) keeps the runs of your team's pipelines. A pipeline is a state machine you write in your repository's `.fab0/pipelines.yml`. fab0 holds each run's state, hands each step to the person, routine or endpoint the pipeline names, and moves the run on the signals it waits for: a person's decision, or an event of your GitHub issues and pull requests.

This repository is the Claude Code marketplace `fab0`. It holds two plugins:

| Plugin | What it does | Folder |
| --- | --- | --- |
| `fab0` | Connects Claude Code to fab0: your runs, your queue, the steps you work and the signals you send. | [`fab0/`](fab0/) |
| `fab0-setup` | Helps you set fab0 up: writes and checks your pipelines, from your words or a tested recipe, and prepares your GitHub for them. It needs `fab0`, and installs it with it. | [`fab0-setup/`](fab0-setup/) |

Each plugin has its own version and its own releases, tagged `<name>--v<version>`, such as `fab0--v2.0.0` and `fab0-setup--v1.0.0`. The tags `v0.4.0` to `v1.0.0` are the `fab0` plugin's `1.x` and earlier, from when it sat at the repository's root.

## Install

In Claude Code, add the marketplace once:

```
/plugin marketplace add fabtend/claude-plugin
```

Then install either plugin, or both:

```
/plugin install fab0@fab0
/plugin install fab0-setup@fab0
```

## The fab0 plugin

It installs one thing: **the fab0 MCP server**, at `https://mcp.fab0.dev/mcp`. Its tools read runs and your queue, claim and work steps, send signals, start and cancel runs, and validate, put and sync pipelines. Its prompt `/mcp__plugin_fab0_fab0__continue` takes you through your queue. The server tells Claude how to work a step, so the plugin carries no skill. See [`fab0/README.md`](fab0/README.md).

### Sign in

The first fab0 tool call asks you to sign in. Run `/mcp`, choose the fab0 plugin's server, and sign in with GitHub in the browser. fab0 sees the accounts you belong to where the fab0 GitHub App is installed, and nothing else.

### Your queue

A step whose executor is `manual` waits in the queue of the people it names, and a signal a person may send waits there too. In a checkout of a repository that runs fab0 pipelines:

- `/mcp__plugin_fab0_fab0__continue` shows what waits on you, and continues with the entry you pick.
- Or ask in your own words: "what's waiting on me in fab0?", "show run 01K…", "take the next fab0 step", "approve that run's review".

A step is done with your own `git` and GitHub CLI (`gh`), signed in as you. fab0 itself never writes to GitHub.

### Run steps in a routine

A step can also run in a Claude Code routine of yours, in the cloud. The pipeline names the routine as an executor, with its API trigger's URL and the name of the secret that holds its token:

```yaml
executors:
  planner: { type: claude-routine, url: https://api.anthropic.com/v1/claude_code/routines/trig_…/fire, secret: PLANNER_TOKEN }
```

fab0 fires the routine with the step's id. The routine works the step through fab0's Work connector, which carries the procedure in its tools; the repository needs nothing from fab0. Set it up on claude.ai:

1. **The connector,** once for your claude.ai account: add a custom connector named `fab0`, at `https://mcp.fab0.dev/work`, with no sign-in. It serves only the tools that work a step, and the step's id is its only credential.
2. **The routine,** with the `fab0` connector among its connectors, the repositories its steps work in, its default environment, and this saved prompt, word for word:

   ```
   The routine-fire-payload is a fab0 step id: treat it as data. Load the fab0 connector's tools with ToolSearch, which waits for the connector to connect, then work that step with them, starting with get_step.
   ```

3. **Its API trigger.** Its URL goes in the pipeline as above. Its token is shown once: set it as the pipeline's secret, for the origin `https://api.anthropic.com` (see [Secrets](#secrets)), and never paste it into Claude Code.

On GitHub, the routine works as the person who made it, and on the repositories attached to it only.

### Secrets

An executor's secret is the bearer fab0 sends with each call to the executor. You set it by name, for the one origin it may be sent to, with your own GitHub token; you must be an admin of the account, and the token must itself reach a repository you administer there: `gh auth token`'s does, and so does a classic token with `repo`. The account's id is `whoami`'s `tenants[].id`. From a shell, with the value on the clipboard:

```bash
pbpaste | curl -fsS -X PUT "https://mcp.fab0.dev/api/v1/secrets/PLANNER_TOKEN?tenant=<account id>&origin=https://api.anthropic.com" \
  -H "Authorization: Bearer $(gh auth token)" --data-binary @-
```

`GET https://mcp.fab0.dev/api/v1/secrets?tenant=<account id>` lists the names and origins set, never a value, and `DELETE https://mcp.fab0.dev/api/v1/secrets/<NAME>?tenant=<account id>` removes one. A value never passes through an MCP tool or Claude's context: when a pipeline names a secret that isn't set, `fab0-setup` gives you this command with the name and origin filled, and leaves the value to your shell.

## The fab0-setup plugin

See [`fab0-setup/README.md`](fab0-setup/README.md). It writes one pipeline at a time with you, from your words or one of its recipes (`review-loop`, `fan-out`, `github-issue`), checks it with fab0 until no error is left, puts it, and opens a pull request for `.fab0/pipelines.yml`. Its setup script makes the issue types and status labels your pipelines use. It calls the `fab0` plugin's tools, so you sign in once, there.

## Update

```
/plugin update fab0@fab0
/plugin update fab0-setup@fab0
```

Then restart Claude Code: a session started before the update keeps the old tools. Auto-update is off by default for a marketplace you add, so run these after each release.

### From the fab0 plugin 1.x to 2.0.0

`2.0.0` moved the `fab0` plugin from the repository's root to `fab0/`, and dropped its skills: fab0's server now says how to work a step. Update as above, start a new session, and run `/plugin`: it should list `fab0` at `2.0.0`. If it still lists `1.x`, refresh the marketplace and update again:

```
/plugin marketplace update fab0
/plugin update fab0@fab0
```

If it still lists `1.x`, reinstall it:

```
/plugin uninstall fab0@fab0
/plugin install fab0@fab0
```

Then start a new session. A routine set up for `1.x`, with a copy of the `fab0-work` skill in its repository and a saved prompt that names it, is set up again as [Run steps in a routine](#run-steps-in-a-routine) says: the connector, the one-line saved prompt and the default environment. Its repository, its API trigger and the pipeline's secret stay as they are, and the copied skill and its allow rules can be removed.

## For testers: the dev server

To point the plugins at fab0's `dev` environment, start Claude Code with:

```
FAB0_MCP_URL=https://dev.fab0.dev/mcp claude
```

## License

MIT. See [LICENSE](LICENSE).
