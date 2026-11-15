---
name: fab0-pipelines
description: Writes and changes fab0 pipelines, one at a time, from a person's description, a recipe this plugin ships or a pipeline fab0 already holds. Validates each draft with the fab0 MCP tools until no error is left, puts it, reports each warning with what to do (a secret to set, with the command the person runs before the put), and, when the person keeps their pipelines in a repository, commits the pipeline's file (.fab0/pipelines/<name>.yml) through a pull request and, once it is merged, puts every pipelines file itself and offers to retire the pipelines no file holds any more. Use when the person asks to write, change, fix or explain a fab0 pipeline or a pipelines file, describes how work should move between people, agents and their GitHub issues and pull requests (steps, reviews, approvals, loops, children), names a fab0 recipe, or asks why a pipeline is invalid or what a validation warning means.
license: MIT
compatibility: Needs the fab0 MCP server, from the fab0 plugin 3.0.0 or later, which fab0-setup installs, and a fab0 server on contract v4. Committing the file needs git and the GitHub CLI (gh) signed in as the person; setting a secret needs curl in the person's own shell.
metadata:
  version: "6"
  plugin: "3.0.0"
---

# Write a fab0 pipeline

fab0 holds a team's pipelines and their runs. A pipeline is a state machine written as one YAML document: its states fire steps at executors the team owns (a Claude Code routine, their own service, or a person's queue) and wait for signals from people, agents and GitHub. This skill writes or changes one pipeline with the person, validates it with fab0 until it has no error, and puts it. When the person keeps their pipelines in a repository, it also commits the file through a pull request, puts the repository's pipelines files once it is merged, and retires, with the person's yes, the pipelines no file holds any more.

[reference.md](reference.md) is the format: the file, every key, executor, state key and signal, the GitHub signals and their fields, the limits, and every validation code with its fix, ending with whole pipelines that validate. Read it before you write.

## Rules

- Write only what reference.md describes. Never invent a key, a signal, a field or a value. If the person asks for something a pipeline can't say (an expression, a template, fab0 writing to GitHub), tell them, and offer the nearest thing it can.
- One pipeline at a time: one YAML document. In a file of several, leave every other document exactly as it is, byte for byte: each document's text is its pipeline's version.
- fab0 decides nothing. Every decision is a state that waits for a signal; ask the person who sends it, and name them in `by`.
- A secret's value never passes through you. Never ask for it, read it, print it, or put it in a file, a tool call or a command you run. The person sets it from their own shell, with the command you give them (3).
- Retire a pipeline only when the person says yes to it by name. `remove_pipeline` stops new runs of it at once.
- Use the person's own `git` and `gh`. For every change on GitHub, use the REST API (`gh api`), never GraphQL. Never push to the default branch unless the person tells you to.

## 1. Understand

Call `whoami`. Its `tenants` are the GitHub accounts, organizations or users, that the person's pipelines live in; each has an `id`, a `login` and `admin`. Use the tenant the person names when there are several. Only the tenant's admin, the owner of a user account or an `admin` of the organization, can put or retire a pipeline or set a secret: if the person isn't one, say so now, and that an admin will have to put it.

Start from one of:

- **The person's description**, or their raw ideas.
- **A recipe**, a tested pipeline this plugin ships. List them with `ls ${CLAUDE_PLUGIN_ROOT}/recipes/`, and read one from there. A recipe names the people, repositories and skills it was tested with (`your-login`, `reviewer-login`): replace each with the person's own, and name only skills their repository holds or will hold. Change as little else as you can.
- **A pipeline fab0 holds**, to change. fab0 keeps its text where it came from: a file of the repository (6), or the file the person put. Read that text. Call `validate_pipeline` with `tenant` and `name` for the report fab0 stored for its active version: its `version`, and the errors and warnings it was put with. Then call `validate_pipeline` with the text (as in 3): when its document's `version` equals the stored one, the text is what runs. If they differ, or the person has no text, tell them, and write the pipeline again from the description.

A step's `with` is the pipeline's message to whoever works it. When a step should follow one of the repository's skills, name it, as `with: { skill: <name> }`, from the folders of `.claude/skills/` in the person's checkout, or in another repository with `gh api repos/<owner>/<repo>/contents/.claude/skills --jq '.[].name'`. A step needs no `with`.

Ask only what the start doesn't answer and reference.md can't default:

- what starts a run: a person (`on: api`), a GitHub event, with the label or issue type it needs, or a signed webhook from another service (`ext.*`). `github.*` signals reach fab0 only from repositories where the fab0 GitHub App is installed; without the App, a source's signed webhook (`ext.*`) is the way in;
- each step: who or what works it (a routine, a service, or people's queue), and what its `with` tells them, if anything;
- each decision: who makes it, as GitHub logins, and where it leads;
- what ends a run, as success and as failure.

Tell the person which defaults you used for everything else.

## 2. Write

Write one document, from the start you chose and reference.md:

- A new file begins with the modeline, `# yaml-language-server: $schema=https://schema.fab0.dev/pipeline.v2.json`, on its first line. Keep it in a file that has one, and add it to one that doesn't.
- The document begins with `version: 2` and its `name`. A new pipeline gets a file of its own, `.fab0/pipelines/<name>.yml`, holding only its document. A changed one is edited in place, in the file that holds it, which may be the legacy `.fab0/pipelines.yml` of several documents. In a repository, no other file may define the pipeline's name (6).
- Every state with `run` handles `done` and `failed`. Every state that waits on people has a `timeout` and handles it, unless a person always answers.
- Give every decision its `by`, and name groups of people under `people`.
- A state that waits for a pull request's events needs a step before it that links the pull request (reference.md section 6).
- A merge that closes the run's issue sends `github.issues.closed` (`state_reason: completed`) and `github.pull_request.closed` in no set order. So in a pipeline that waits on a pull request's events, never end a run on `github.issues.closed` without `where: { state_reason: … }` that leaves out `completed`: the close a merge makes would end the run before the merge reached it.
- Give a step `outputs` when a later transition branches on its result, and branch with `where` on the field.
- Name each secret by `secret: NAME`. Never write a value.

## 3. Validate until clean

1. Call `validate_pipeline` with `tenant` and `text` when the person is an admin of the tenant, otherwise with `text` alone. `text` is the whole file, not only your document, so names are checked across documents. With `tenant`, fab0 adds the store's warnings (`secret-unset`, `unknown-pipeline`) to each valid document, as `put_pipeline` would, and stores nothing; a member is refused `forbidden`, so use `text` alone for them.
2. If the answer has `problems`, a YAML error or a file cap, it has no documents: fix those first.
3. For each error of your document, go to its `path` (and its `line`), and apply its `fix`. `adapter-signal` and `adapter-field` list the signals or fields to choose from. When a fix leaves a choice, take it from the code's row in reference.md section 9, or ask the person.
4. Call `validate_pipeline` again, the same way. Repeat until your document has no error.

If an error is still there after you applied its fix twice, stop, and show it to the person with what you tried. Show the person any errors in documents you didn't change, and leave them: they are another change.

**Before the put**, give the person the secrets command for each `secret-unset` warning, so the secret is set when the pipeline goes live, not after. Give them this command to run in their own shell:

```bash
pbpaste | curl -fsS -X PUT "https://<host>/api/v1/secrets/<NAME>?tenant=<tenant id>&origin=<origin>" \
  -H "Authorization: Bearer $(gh auth token)" --data-binary @-
```

Fill in `<NAME>`, `<origin>`, `<tenant id>` and `<host>`: `<NAME>` is the executor's `secret`; `<origin>` is its `url`'s scheme and host, with the port only when it isn't 443 (`https://api.anthropic.com` for a routine); `<tenant id>` is the tenant's `id` from `whoami`; `<host>` is the fab0 server's, `mcp.fab0.dev`. Leave the value to the person's shell: the command reads it from their clipboard with `pbpaste` (on macOS), or they pipe in the output of another command that prints it, such as their password manager's. Never ask for the value, read it, or run the command yourself. If the person pastes a value into the conversation, don't repeat or use it, and tell them to make a new one, since this one was exposed. The person must be the tenant's admin, and their token must show it: fab0 reads who they are from GitHub's `/user` and, for an organization, their membership with the role `admin` from the token's own list of memberships (`gh auth token`'s can read it), and keeps nothing of the token. The message says when the secret is set for another origin: the same command sets it for this one.

## 4. Put

Show the person the document, and say in a few lines what it does: what starts a run, what each step does and who or what works it, who decides each decision and where it leads, and what ends a run. Change it until they agree, validating again after each change (3).

Call `put_pipeline` with `text`, the whole file, and `tenant` when the person has several. Each valid document becomes its pipeline's active version; the answer gives each document's `status` and `version`. On `forbidden`, the person isn't the tenant's admin: tell them the tenant's admin puts it, the owner of a user account or an `admin` of the organization, or puts it once the pull request is merged (6).

When the person keeps the file in a repository and wants its review there before it runs, don't put it: go to 6, where you put the repository's files once the pull request is merged.

## 5. Report

Report each warning by its `path`, not by its `line`: a store warning's line is its document's first line. Give the code, what it means from reference.md section 9, and what the person can do:

- `unbounded-wait`: a state may wait for ever. Ask whether a person always answers, or every child always ends; if not, add a `timeout`, handle it, and validate and put again.
- `unknown-pipeline`: the child pipeline isn't in the tenant yet. Write and put it too; until then, the step can't start that child.
- `ext-unchecked`: the pipeline takes an `ext.` signal, whose fields fab0 can't check. Ask the person which fields the source's sender puts in its payload, and make each `where` name only those.
- `github-without-app`: the pipeline waits on a `github.` signal, but the fab0 GitHub App isn't installed on the tenant, so GitHub sends it none. Tell the person to install the App on the account, or to send the event through the signed webhook as an `ext.` signal and change the pipeline to take it.
- `secret-unset`: the executor at the path (`executors.<name>.secret`) has no secret set for its origin, so its steps fail with cause `refused` until the person sets it. Runs already started keep the version they began with; new runs use the one just put.

## 6. Commit

When the person keeps their pipelines in a repository, they live in any number of files: one pipeline per file in `.fab0/pipelines/<name>.yml`, the convention for every new one, and the legacy `.fab0/pipelines.yml`, which may hold several. A repository may have both. What its default branch holds is what you put. Commit the file through a pull request:

1. Create a branch (`git switch -c pipelines/<name>`), commit only the pipeline's file, and push the branch.
2. Open the pull request with `gh api -X POST repos/<owner>/<repo>/pulls -f head=<branch> -f base=<default branch> -f title=<title> -f body=<body>`, not `gh pr create`. The default branch is `gh api repos/<owner>/<repo> --jq .default_branch`, and the body says what the pipeline does, as you described it in 4. Show the person its link.
3. Once it is merged, put the repository's pipelines yourself, as below. A pipeline put in 4 and the same text put again are one version: the put changes nothing.

**Put the repository's pipelines.** fab0 takes a repository's pipelines from you, through `put_pipeline`, and reads no file of the repository itself. A pipeline stays active until it is retired with `remove_pipeline`: a put never retires a name its file leaves out.

1. Read every pipelines file from the default branch: list `.fab0/pipelines/` with `gh api repos/<owner>/<repo>/contents/.fab0/pipelines --jq '.[] | select(.type == "file") | .path'`, keep the paths that end in `.yml`, and read each one, and the legacy `.fab0/pipelines.yml`, with `gh api repos/<owner>/<repo>/contents/<path> -H 'Accept: application/vnd.github.raw'`. A `404` means the repository has no such folder or file. In a checkout of the default branch, up to date with the merge, you may read the same files from disk.
2. Before any put, read each document's `name` in every file. When a name is defined in two files, put nothing: tell the person the name and both paths, and that one file must give it up, through a pull request (1). A name twice in one file is that file's `duplicate-name` error, which its put reports.
3. Call `put_pipeline` once per file, with `text`, the whole file, and `tenant` when the person has several. Put every file, not only those the merge changed: you have read them all for 2, the text of a file the merge didn't touch is the version already active, so its put changes nothing, and a file whose earlier put was missed or refused is put now. So what the default branch holds is what is active, and a pipeline retired while a file still holds it is active again: to retire it for good, take it out of its file. Report each answer as in 5, by its file: each document's `status` and `version`, and its warnings. A file whose answer has `problems` was refused whole, and an invalid document is not put: either way, the active versions stay. Show the person why, and fix them on a new branch (3).
4. Retire what the merge took out. List the pipelines files the merge deleted, edited or renamed: `gh api repos/<owner>/<repo>/pulls/<number>/files --paginate --jq '.[] | select(.status != "added") | [.status, (.previous_filename // .filename)] | @tsv'`, keeping the paths that are `.fab0/pipelines.yml` or end in `.yml` under `.fab0/pipelines/`. Read each one as it was before, at the pull request's base (`gh api repos/<owner>/<repo>/pulls/<number> --jq .base.sha`), with `gh api 'repos/<owner>/<repo>/contents/<path>?ref=<base sha>' -H 'Accept: application/vnd.github.raw'`, or `git show <base sha>:<path>` in a checkout. A name one of those files defined before that no file you read in 1 defines now was taken out. Name each one to the person, and ask whether to retire it. Call `remove_pipeline` with `name`, and `tenant` when the person has several, only for each name the person says yes to. Report each answer's `retired`: the version that was active and is retired now, or null when none was, which changed nothing. Runs already started finish on the version they began with; no new run starts from it; a later put of the name makes it active again. On `forbidden`, the person isn't the tenant's admin: tell them the tenant's admin retires it, the owner of a user account or an `admin` of the organization.
5. List the live pipelines no file holds. Claude Code reads the fab0 server's resources with `ListMcpResourcesTool`, with `server` `plugin:fab0:fab0`: each active pipeline of each of the person's tenants is a resource `fab0://pipelines/<tenant login>/<name>`, with `_meta` `{ tenant, version, source }`. Keep the tenant's, and leave out the names a file you read in 1 defines, and those you just retired. Show the person the rest, each with its version, and tell them that one may be another repository's, or put by hand: a tenant's names are shared by all its repositories. Offer to retire them, and call `remove_pipeline`, as in 4, only for each name the person names. If the resources can't be listed (no such tool, or the call fails), say so, and that the person sees the same list by typing `@` in Claude Code and choosing the fab0 server's `fab0://pipelines/` resources; never guess the list.

## 7. Prepare GitHub

When a `start` rule's `where` names a `label` or an `issue_type`, its runs start only once those exist on GitHub, and fab0 makes neither: it only reads GitHub. Give the person the setup script's command, which runs as them:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/fab0-setup.mjs <owner> <repository> --labels <labels> --types <types>
```

- `<owner>` and `<repository>` are those of the repository that holds the pipelines files.
- `<labels>` is the labels the `start` rules name, comma-separated, or `""` for none. `<types>` is the issue types they name, or `""`.
- On a user account (`gh api users/<owner> --jq .type` answers `User`), pass `--types ""`: only organizations have issue types.

The person runs it first without `--apply`, to read its plan: what exists, and what it would make. Then they run it again with `--apply` to make what is missing. It takes their own token, from `GH_TOKEN` or `gh auth token`. Never run it with `--apply` yourself: what it makes on GitHub is the person's own act.

When no `start` rule names a label or an issue type, there is nothing to prepare.
