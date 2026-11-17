# fab0-setup

[fab0](https://fab0.dev) keeps the runs of your team's pipelines. A pipeline is a state machine you write as code and put to fab0. You don't need this plugin to start: add fab0 to Claude, say "set up fab0", and fab0 itself walks you through your first pipeline and your first run by chat ([fab0.dev](https://fab0.dev)). This plugin is for what a chat can't do: it keeps your pipelines in your repository, one per file in `.fab0/pipelines/<name>.yml`, and prepares your GitHub for them.

## What it installs

- **The `fab0-pipelines` skill,** which writes and changes your pipelines with you, one at a time, and opens a pull request for each one's file. It reads the pipeline format, the validation codes and the recipes from fab0's own guide, the `guide` tool, so it always writes what your fab0 server takes. It checks each draft with fab0 until no error is left, puts it, and tells you what each warning asks of you. Once you merge the pull request, the skill puts every pipelines file of your repository, including a legacy `.fab0/pipelines.yml`, and refuses a pipeline name that two files define. fab0 reads no file of your repository itself, so a pipeline you take out of a file stays live until it is retired: the skill names each one the merge took out, and each live pipeline no file holds, and retires those you say yes to (`remove_pipeline`).
- **The setup script,** which makes the issue types and status labels your pipelines use in your GitHub, and, when you don't install the fab0 GitHub App, adds the webhook that sends your GitHub's events to fab0.

It ships no copy of the pipeline format and no recipes: both are fab0's own, served by `guide`, where "set up the github-issue recipe" finds them.

It needs the `fab0` plugin, which connects Claude Code to fab0, and installs it with it. The skill calls the `fab0` plugin's tools, so you sign in once, there. This version, 4.0.0, needs the `fab0` plugin 3.0.0 or later and a fab0 server on contract v5, as `mcp.fab0.dev` is: an earlier server has no `guide` tool for the skill to read. Putting or retiring a pipeline, or setting a secret, needs the account's admin: the owner of a user account, or an `admin` of the organization.

## Install

In Claude Code:

```
/plugin marketplace add fabtend/claude-plugin
/plugin install fab0-setup@fab0
```

Then run `/mcp`, choose the fab0 plugin's server, and sign in with GitHub.

If another plugin carries a `fab0-pipelines` skill too, ask for this plugin's by name: `fab0-setup:fab0-pipelines`.

## Write a pipeline

In a checkout of your repository, describe how work should flow: "write a fab0 pipeline where a routine plans each Feature and a person approves the plan". Or start from a recipe: "set up the github-issue recipe". The skill reads the recipe from fab0's guide, replaces its people and repositories with yours, checks the result with fab0, puts it, and opens a pull request for its file. After you merge it, say "put my pipelines": the skill puts every file of the default branch.

## Prepare GitHub

A pipeline whose runs start on a label or an issue type needs them in your GitHub. The plugin's setup script makes them, and the skill gives you its command once your pipeline is written:

```
node <plugin folder>/scripts/fab0-setup.mjs <owner> <repository> --labels <labels> --types <types>
```

The skill fills in the plugin's folder, where Claude Code installed it. `<labels>` and `<types>` are comma-separated, or `""` for none of that kind. Only organizations have issue types, so on a user account pass `--types ""`.

It runs as you, with your own `gh` sign-in or `GH_TOKEN`, never as fab0, which only reads your GitHub. Issue types need an organization owner, and labels a person who may write to the repository. Run it first without `--apply`: it reads what exists and prints its plan. Then run it again with `--apply`, and it makes only what is missing. The skill never runs it with `--apply` for you.

### GitHub's events without the fab0 GitHub App

A pipeline that waits on GitHub's events (`github.` signals) gets them in one of two ways. Install the fab0 GitHub App on your account, and it sends the events of every repository it is installed on. Or keep your account without the App and add a webhook of your own, which the same script does:

```
node <plugin folder>/scripts/fab0-setup.mjs <owner> <repository> --webhook
```

Name every repository whose issues and pull requests your pipelines wait on, or none, to wire a whole organization with one webhook. Without `--apply` it prints its plan and makes no request. With `--apply` it makes a random secret in your shell, sets it as the secret of a `github` source of your account on fab0 (`--source <name>`, `github` unless you say), and adds a webhook with that secret to each repository, or updates the one that already posts there. The secret is never shown and never saved: fab0 and GitHub each hold it, and nobody else needs it.

It needs GitHub CLI (`gh`) signed in as you. You must be your account's admin on fab0, and an admin of each repository; an organization's webhook needs an owner whose token has the `admin:org_hook` scope (`gh auth refresh -h github.com -s admin:org_hook`). A source has one secret and each run gives it a new one, so name every repository of a source in one run. To undo it, delete the webhook on GitHub and the source on fab0: `curl -fsS -X DELETE "https://mcp.fab0.dev/api/v1/sources/<name>?tenant=<your account's id>" -H "Authorization: Bearer $(gh auth token)"`.

## Update

```
/plugin update fab0-setup@fab0
```

Then start a new session: a session started before the update keeps the old skill.

## License

MIT. See [LICENSE](LICENSE).
