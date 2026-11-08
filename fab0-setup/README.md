# fab0-setup

[fab0](https://fab0.dev) keeps the runs of your team's pipelines. A pipeline is a state machine you write in your repository's `.fab0/pipelines.yml`. This plugin helps you set fab0 up: it writes and checks your pipelines with you, from your own words or a tested recipe, and prepares your GitHub for them.

## What it installs

- **The `fab0-pipelines` skill,** which writes and changes your pipelines with you, one at a time. It checks each draft with fab0 until no error is left, puts it, tells you what each warning asks of you, and opens a pull request for `.fab0/pipelines.yml`.
- **Three recipes,** tested pipelines to start from: `review-loop`, `fan-out` and `github-issue`.
- **The setup script,** which makes the issue types and status labels your pipelines use in your GitHub.

It needs the `fab0` plugin, which connects Claude Code to fab0, and installs it with it. The skill calls the `fab0` plugin's tools, so you sign in once, there.

## Install

In Claude Code:

```
/plugin marketplace add fabtend/claude-plugin
/plugin install fab0-setup@fab0
```

Then run `/mcp`, choose the fab0 plugin's server, and sign in with GitHub.

Until fab0 `v0.3.0`, the `fab0` plugin also carries a `fab0-pipelines` skill of its own. To use this plugin's, ask for `fab0-setup:fab0-pipelines` by name.

## Write a pipeline

In a checkout of your repository, describe how work should flow: "write a fab0 pipeline where a routine plans each Feature and a person approves the plan". Or start from a recipe: "set up the github-issue recipe". The skill replaces the recipe's people and repositories with yours, checks the result with fab0, and puts it.

## Prepare GitHub

A pipeline whose runs start on a label or an issue type needs them in your GitHub. The plugin's setup script makes them, and the skill gives you its command once your pipeline is written:

```
node <plugin folder>/scripts/fab0-setup.mjs <owner> <repository> --labels <labels> --types <types>
```

The skill fills in the plugin's folder, where Claude Code installed it. `<labels>` and `<types>` are comma-separated, or `""` for none of that kind. Only organizations have issue types, so on a user account pass `--types ""`.

It runs as you, with your own `gh` sign-in or `GH_TOKEN`, never as fab0, which only reads your GitHub. Issue types need an organization owner, and labels a person who may write to the repository. Run it first without `--apply`: it reads what exists and prints its plan. Then run it again with `--apply`, and it makes only what is missing. The skill never runs it with `--apply` for you.

## Update

```
/plugin update fab0-setup@fab0
```

Then start a new session: a session started before the update keeps the old skill.

## License

MIT. See [LICENSE](LICENSE).
