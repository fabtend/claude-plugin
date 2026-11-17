---
name: fab0-pipelines
description: Keeps a team's fab0 pipelines in their repository. Writes or changes one pipeline at a time from the person's description, a recipe fab0's guide holds or a pipeline fab0 already holds, reading the format from fab0's guide tool; validates it with fab0 until no error is left and puts it; commits its file (.fab0/pipelines/<name>.yml) through a pull request; once it is merged, puts every pipelines file of the repository and offers to retire the pipelines no file holds any more; and gives the setup script's commands for the labels, issue types and GitHub webhook the pipelines need. Use when the person keeps or wants their fab0 pipelines in a repository, asks to write, change, fix or explain a fab0 pipeline or a pipelines file there, asks to put a repository's pipelines after a merge or to retire one, or asks to prepare their GitHub for fab0.
license: MIT
compatibility: Needs the fab0 MCP server, from the fab0 plugin 3.0.0 or later, which fab0-setup installs, and a fab0 server on contract v5, whose guide tool it reads. Committing the file needs git and the GitHub CLI (gh) signed in as the person; setting a secret needs curl in the person's own shell, and adding a webhook Node and gh there.
metadata:
  version: "9"
  plugin: "4.0.0"
---

# Write a fab0 pipeline

fab0 holds a team's pipelines and their runs. A pipeline is a state machine written as one YAML document: its states fire steps at executors the team owns (a Claude Code routine, their own service, or a person's queue) and wait for signals from people, agents and GitHub. This skill writes or changes one pipeline with the person, validates it with fab0 until it has no error, and puts it. When the person keeps their pipelines in a repository, it also commits the file through a pull request, puts the repository's pipelines files once it is merged, and retires, with the person's yes, the pipelines no file holds any more.

fab0's own server teaches fab0: a person can set fab0 up and write a pipeline by chat with the fab0 connector alone. What this skill adds is what needs a shell or a repository: the pipeline's file committed through a pull request (6), every file put after a merge and the retired ones named (6), and the setup script, which makes labels and issue types and adds a GitHub webhook (7).

**The format is fab0's guide.** This skill holds no copy of it. Call the fab0 plugin's `guide` tool (`mcp__plugin_fab0_fab0__guide`) with a `topic`, and read the answer before you write:

| Topic | Read it for |
| --- | --- |
| `pipelines` | the file, every top-level key, states, transitions and signals, `start`, the limits, and a whole pipeline that validates |
| `executors` | `manual`, `http` and `claude-routine`, the step id, a routine's setup |
| `github` | how GitHub's events reach a tenant, every `github.` signal and its fields, linking, and the rules for a merge |
| `rights` | what an agent's step id may do, and `executor:<name>` in `by` |
| `secrets` | the command a person runs to set a secret |
| `problems` | every validation code, what it means and its fix |
| `recipes`, `recipes/<name>` | the tested pipelines, and each one's file |

Always read `pipelines`. Read the others when the pipeline uses them. `guide` needs no sign-in; `whoami`, `validate_pipeline`, `put_pipeline` and `remove_pipeline`, the other fab0 tools this skill calls, need the person signed in on the fab0 plugin's server.

## Rules

- Write only what `guide` describes. Never invent a key, a signal, a field or a value, and don't write fab0's format from memory: it changes with the server, and `guide` answers what the server takes. If the person asks for something a pipeline can't say (an expression, a template, fab0 writing to GitHub), tell them, and offer the nearest thing it can.
- One pipeline at a time: one YAML document. In a file of several, leave every other document exactly as it is, byte for byte: each document's text is its pipeline's version.
- fab0 decides nothing. Every decision is a state that waits for a signal; ask the person who sends it, and name them in `by`.
- A secret's value never passes through you. Never ask for it, read it, print it, or put it in a file, a tool call or a command you run. The person sets it from their own shell, with the command you give them (3).
- Retire a pipeline only when the person says yes to it by name. `remove_pipeline` stops new runs of it at once.
- Use the person's own `git` and `gh`. For every change on GitHub, use the REST API (`gh api`), never GraphQL. Never push to the default branch unless the person tells you to.

## 1. Understand

Call `whoami`. Its `tenants` are the GitHub accounts, organizations or users, that the person's pipelines live in; each has an `id`, a `login` and `admin`. Use the tenant the person names when there are several. Only the tenant's admin, the owner of a user account or an `admin` of the organization, can put or retire a pipeline or set a secret: if the person isn't one, say so now, and that an admin will have to put it.

Its `accounts` are the GitHub accounts the person is an admin of that hold no pipelines yet: their own user account, and each organization where their role is `admin`. Each is a place their pipelines can go, with no GitHub App to install: the first `put_pipeline` that names one as its `tenant`, by its `login` or `id`, and stores a pipeline, makes it a tenant (4). When the person's pipelines belong in one of them, such as the repository's owner, use it as the tenant: name it as `tenant` in every call, also when the person has a single tenant elsewhere. Never tell the person to install the App to make an account a tenant, or that they must install it at all: the App is one of the two ways GitHub's events reach a tenant, and a webhook of the person's own is the other (`github-without-app`, 5 and 7). An organization that restricts OAuth Apps is in neither list until one of its owners approves fab0.

Start from one of:

- **The person's description**, or their raw ideas.
- **A recipe**, a tested pipeline fab0's guide holds. `guide` with the topic `recipes` lists them, and `recipes/<name>` answers one with its pipelines file. A recipe names the people, repositories and skills it was tested with (`your-login`, `reviewer-login`): replace each with the person's own, and name only skills their repository holds or will hold. Change as little else as you can.
- **A pipeline fab0 holds**, to change. fab0 keeps its text where it came from: a file of the repository (6), or the file the person put. Read that text. Call `validate_pipeline` with `tenant` and `name` for the report fab0 stored for its active version: its `version`, and the errors and warnings it was put with. Then call `validate_pipeline` with the text (as in 3): when its document's `version` equals the stored one, the text is what runs. If they differ, or the person has no text, tell them, and write the pipeline again from the description.

A step's `with` is the pipeline's message to whoever works it. When a step should follow one of the repository's skills, name it, as `with: { skill: <name> }`, from the folders of `.claude/skills/` in the person's checkout, or in another repository with `gh api repos/<owner>/<repo>/contents/.claude/skills --jq '.[].name'`. A step needs no `with`.

Ask only what the start doesn't answer and `guide`'s `pipelines` topic can't default:

- what starts a run: a person (`on: api`), a GitHub event, with the label or issue type it needs, or a signed webhook from another service (`ext.*`). `github.*` signals reach fab0 from the repositories where the fab0 GitHub App is installed, and, with or without the App, from a repository or an organization whose own webhook posts to a `github` source of the tenant (7); another service sends `ext.*` signals through a `signed` source's signed webhook;
- each step: who or what works it (a routine, a service, or people's queue), and what its `with` tells them, if anything;
- each decision: who makes it, as GitHub logins, and where it leads;
- what ends a run, as success and as failure.

Tell the person which defaults you used for everything else.

## 2. Write

Write one document, from the start you chose and what `guide` answered:

- A new file begins with the modeline, `# yaml-language-server: $schema=https://schema.fab0.dev/pipeline.v2.json`, on its first line. Keep it in a file that has one, and add it to one that doesn't.
- The document begins with `version: 2` and its `name`. A new pipeline gets a file of its own, `.fab0/pipelines/<name>.yml`, holding only its document. A changed one is edited in place, in the file that holds it, which may be the legacy `.fab0/pipelines.yml` of several documents. In a repository, no other file may define the pipeline's name (6).
- Every state with `run` handles `done` and `failed`. Every state that waits on people has a `timeout` and handles it, unless a person always answers.
- Give every decision its `by`, and name groups of people under `people`.
- When the pipeline names a `github.` signal, follow `guide`'s `github` topic: a state that waits for a pull request's events needs a step before it that links the pull request, and a pipeline that waits on a pull request's events never ends a run on `github.issues.closed` without a `where` on `state_reason` that leaves out `completed`, since a merge closes the issue too.
- An executor gets `rights: runs`, and a `by` an `executor:<name>`, only when the person asks for an agent that moves runs. Read `guide`'s `rights` topic first, and tell the person what it lets that agent do.
- Give a step `outputs` when a later transition branches on its result, and branch with `where` on the field.
- Name each secret by `secret: NAME`. Never write a value.

## 3. Validate until clean

1. Call `validate_pipeline` with `tenant` and `text` when the person is an admin of the tenant, otherwise with `text` alone. `text` is the whole file, not only your document, so names are checked across documents. With `tenant`, fab0 adds the store's warnings (`secret-unset`, `unknown-pipeline`) to each valid document, as `put_pipeline` would, and stores nothing; a member is refused `forbidden`, so use `text` alone for them.
2. If the answer has `problems`, a YAML error or a file cap, it has no documents: fix those first.
3. For each error of your document, go to its `path` (and its `line`), and apply its `fix`. `adapter-signal` and `adapter-field` list the signals or fields to choose from. When a fix leaves a choice, take it from the code's row in `guide`'s `problems` topic, or ask the person.
4. Call `validate_pipeline` again, the same way. Repeat until your document has no error.

If an error is still there after you applied its fix twice, stop, and show it to the person with what you tried. Show the person any errors in documents you didn't change, and leave them: they are another change.

**Before the put**, give the person the secrets command for each `secret-unset` warning, so the secret is set when the pipeline goes live, not after. For an account that is no tenant yet (1), the secrets route answers `forbidden` until the first put makes it one: give the command right after that put instead, and tell the person that a step that runs before it is set fails. Call `guide` with the topic `secrets`, and give the person its command to set a secret, to run in their own shell, with what it tells you to fill in filled in: the secret's name, the executor's `secret`; the tenant's `id` from `whoami`; and the executor's origin, its `url`'s scheme and host, with the port only when it isn't 443 (`https://api.anthropic.com` for a routine). The command names the fab0 server that answered `guide`, so it sets the secret where the pipeline was put.

Leave the value to the person's shell: the command reads it as they paste it, from their clipboard, or from another command that prints it, such as their password manager's. Never ask for the value, read it, or run the command yourself. If the person pastes a value into the conversation, don't repeat or use it, and tell them to make a new one, since this one was exposed. The person must be the tenant's admin, and their token must show it: fab0 reads who they are from GitHub's `/user` and, for an organization, their membership with the role `admin` from the token's own list of memberships (`gh auth token`'s can read it), and keeps nothing of the token. The message says when the secret is set for another origin: the same command sets it for this one.

## 4. Put

Show the person the document, and say in a few lines what it does: what starts a run, what each step does and who or what works it, who decides each decision and where it leads, and what ends a run. Change it until they agree, validating again after each change (3).

With the document, say two things before the put, each as `guide` has it:

- When an agent works one of its steps, list what that agent needs outside fab0, from the `executors` topic's part "What an agent needs outside fab0", and say plainly that fab0 can't check these.
- When its last step builds or implements something in a repository and the run ends there, say what the `pipelines` topic says under "Ending a run", and offer the pull-request shape. Write the simpler line if the person wants it.

Call `put_pipeline` with `text`, the whole file, and `tenant` when the person has several, or when it is an account (1). Each valid document becomes its pipeline's active version; the answer gives each document's `status` and `version`. A put to an account that stores a pipeline makes it a tenant, without the App: `whoami` lists it with the tenants from then on. On `forbidden`, the person isn't the tenant's admin: tell them the tenant's admin puts it, the owner of a user account or an `admin` of the organization, or puts it once the pull request is merged (6).

When the person keeps the file in a repository and wants its review there before it runs, don't put it: go to 6, where you put the repository's files once the pull request is merged.

## 5. Report

Report each warning by its `path`, not by its `line`: a store warning's line is its document's first line. Give the code, what it means from `guide`'s `problems` topic, and what the person can do:

- `unbounded-wait`: a state may wait for ever. Ask whether a person always answers, or every child always ends; if not, add a `timeout`, handle it, and validate and put again.
- `unknown-pipeline`: the child pipeline isn't in the tenant yet. Write and put it too; until then, the step can't start that child.
- `ext-unchecked`: the pipeline takes an `ext.` signal, whose fields fab0 can't check. Ask the person which fields the source's sender puts in its payload, and make each `where` name only those.
- `github-without-app`: the pipeline waits on a `github.` signal, but the tenant has neither the fab0 GitHub App installed nor a `github` source, so GitHub's events don't reach it. There are two ways, and the person chooses: install the fab0 GitHub App on the account, which sends the events of every repository it is installed on, with nothing more to add; or, without the App, set a `github` source and add its webhook to the repository or the organization, with the setup script's command (7). Name both, and never tell the person they must install the App. The pipeline stays as it is either way: the signals are the same.
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

When no `start` rule names a label or an issue type, there are none to make.

**GitHub's events, without the App.** When the pipeline names a `github.` signal and the tenant has no App (`whoami` answers its `app` as false, or the put warned `github-without-app`), GitHub's events need a way in. Tell the person both ways (5): install the fab0 GitHub App, or keep the tenant without it and add a webhook of their own. For the webhook, give them the script's other command:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/fab0-setup.mjs <owner> <repository> --webhook
```

- `<owner>` is the tenant's `login`, and each `<repository>` one whose issues and pull requests the pipeline waits on. Name every repository in the one command. With no repository, it wires the whole organization with one webhook; a user account has none of its own, so its repositories are named.
- `--source <name>` names the source, `github` unless given. A source has one secret and each run gives it a new one, so a later run names every repository of the source again, or takes a source of its own.

Run without `--apply`, it prints what it would do and makes no request. Run again with `--apply`, it makes a random secret in the person's shell, sets it as the `github` source's secret on fab0, as the person, and adds a webhook with that secret to each repository, or updates the one that already posts to the source. The secret is shown nowhere and saved nowhere. You never see it, and never ask for it, make it or pass it (Rules). It needs GitHub CLI signed in as an admin of the repository, or, for an organization's webhook, as an owner whose token has the `admin:org_hook` scope (`gh auth refresh -h github.com -s admin:org_hook`), and the person must be the tenant's admin. As with the labels, never run it with `--apply` yourself. Once it is done, a webhook it added shows GitHub's ping green on its page; GitHub pings no webhook that was only updated, and for each of those the script prints the `gh api` command that sends a ping. A second `put_pipeline` of the same text no longer warns `github-without-app`.

A repository the App already reaches needs no webhook: fab0 drops a webhook's delivery for it, since the App delivers that event.
