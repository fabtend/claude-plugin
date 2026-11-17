#!/usr/bin/env node
// plugins/fab0-setup/scripts/fab0-setup.mjs: prepares GitHub for a fab0 pipeline (ARCHITECTURE O.1; agent interface
// section 10.5): the issue types its items take, in an organization, and in each repository the status labels its steps
// move them through. Either kind may be "" for none, but not both; a user account, which has no issue types (K.1), gets
// labels only. It makes no label of fab0's own: pause and cancel are tools, not labels (ADR 0027). It reads what exists
// first, makes only what is missing, and changes nothing that exists, so a second run writes nothing. It prints its
// plan, and writes only with --apply.
//
// With --webhook it wires GitHub's events to fab0 for a tenant without the fab0 App (ADR 0052 decisions 4 and 18;
// github adapter section 10.1): it makes a random secret in this process, sets it as a `github` source's secret on
// fab0, and adds a webhook with that secret to each repository named, or to the organization when none is. The
// webhook is the person's own: the script creates it as them, with `gh api`, and fab0 writes nothing to GitHub
// (B.14). The secret is never printed, never written to a file, and never an argument of a command: it goes to fab0
// as a request's body and to `gh` on its standard input (J.4). Without --apply this mode makes no request at all.
//
// It runs as a person who may make issue types and labels (an organization owner, or for labels alone a person who may
// write to the repository), never as the fab0 App, which only reads (B.14). The token comes from GH_TOKEN or `gh auth
// token` and is never printed (M.2). It needs Node alone: no package to install; --webhook needs GitHub CLI too.
// Released with the fab0-setup plugin, and to fabtend/home's setup/ (development section 2).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const USAGE = `Usage: node fab0-setup.mjs <owner> <repository> [<repository> ...] [options]
       node fab0-setup.mjs <owner> [<repository> ...] --webhook [--source <name>] [--apply]

Prepares GitHub for a fab0 pipeline: the issue types its items take, in the
owner's organization, and in each repository the status labels its steps move
them through. It reads what exists, plans what is missing, and changes nothing
that exists. Nothing is written without --apply.

Options:
  --labels <a,b,...>  the status labels (default: Ready); "" for none
  --types <a,b,...>   the issue types (default: Feature,Story,Task); "" for none
  --apply             make the changes the plan lists
  --help              show this help

--labels "" and --types "" together ask for nothing, and are refused. Only
organizations have issue types: for a user account, pass --types "".

Run it as an organization owner, or for labels alone as a person who may write
to the repositories. It takes the token from GH_TOKEN, or from
\`gh auth token\` when GitHub CLI is signed in, and never prints it.

With --webhook it sends GitHub's events to fab0 without the fab0 GitHub App:
it sets a github source for the tenant <owner> on fab0, with a random secret
made here, and adds a webhook with that secret to each repository named, or to
the organization when no repository is named. The secret is never shown and
never saved. Without --apply it prints the plan and makes no request.

  --webhook           wire a github source and its webhook
  --source <name>     the source's name (default: github)

A source has one secret, and each run with --apply gives it a new one: name
every repository of the source in one run. A webhook of the source the run
names is updated in place; one it doesn't name stops verifying. Run it as an
admin of the repositories, or as an organization owner whose token has the
admin:org_hook scope, with GitHub CLI signed in.`;

const DEFAULT_LABELS = ["Ready"];
const DEFAULT_TYPES = ["Feature", "Story", "Task"];
const STATUS_COLORS = ["c5def5", "bfdadc", "fef2c0", "d4c5f9", "c2e0c6"];

const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
const PAGE = 100;

// fab0's host: its API and a source's URL are on the one host of an environment (platform design section 2). The
// plugin is for `prod`; FAB0_HOST names another environment's host, for fab0's own tests.
const FAB0_HOST = process.env.FAB0_HOST || "mcp.fab0.dev";
const DEFAULT_SOURCE = "github";
// A source's name, as the sources route takes it (agent interface section 9.2).
const SOURCE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
// The events fab0's GitHub adapter keeps (github adapter section 2), by the names GitHub's API gives them: exactly
// the fab0 App's own subscriptions. A test keeps this equal to the adapter's table.
const WEBHOOK_EVENTS = [
  "issue_comment",
  "issue_dependencies",
  "issues",
  "pull_request",
  "pull_request_review",
  "sub_issues",
];

class Refusal extends Error {}

let token = "";
// The source's secret, while a run with --webhook holds one: taken out of any text from outside before it is printed.
let secret = "";

// A text from outside, GitHub's, fab0's or gh's, without the token and the secret should it hold either.
const clean = (text) => [token, secret].reduce((all, hidden) => (hidden ? all.split(hidden).join("***") : all), text);

// A webhook-mode step that failed, with what to tell the person.
class WebhookError extends Error {}

class GitHubError extends Error {
  constructor(method, path, status, message) {
    // GitHub's message is the one text from outside that is printed: the token is taken out should it hold it.
    super(`GitHub answered ${status} to ${method} ${path}: ${clean(message)}`);
    this.status = status;
  }
}

const say = (text = "") => process.stdout.write(`${text}\n`);
const complain = (text) => process.stderr.write(`${text}\n`);

function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

async function request(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "fab0-setup",
      "x-github-api-version": "2022-11-28",
      ...(body && { "content-type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) throw new GitHubError(method, path, response.status, String(answer.message ?? response.statusText));
  return answer;
}

// Every page of a list: a page shorter than a full one is the last.
async function list(path) {
  const all = [];
  for (let page = 1; ; page++) {
    const items = await request("GET", `${path}?per_page=${PAGE}&page=${page}`);
    all.push(...items);
    if (items.length < PAGE) return all;
  }
}

// GitHub's 404 for a read, said as what is missing.
const missing = (message) => (error) => {
  throw error.status === 404 ? new Refusal(message) : error;
};

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
// The names, once each as GitHub counts them, case aside.
const names = (all) =>
  all.map((name) => name.trim()).filter((name, i, each) => name && each.findIndex((other) => same(other, name)) === i);

function readArguments() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        labels: { type: "string" },
        types: { type: "string" },
        webhook: { type: "boolean", default: false },
        source: { type: "string" },
        apply: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    throw new Refusal(`${error.message}\n\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.help) return null;
  const [org, ...given] = positionals;
  const repos = given.map((repo) => {
    const name = repo.startsWith(`${org}/`) ? repo.slice(org.length + 1) : repo;
    if (name.includes("/")) throw new Refusal(`${repo} is not a repository of ${org}.`);
    return name;
  });
  if (values.webhook) {
    if (!org) throw new Refusal(`Name the owner.\n\n${USAGE}`);
    if (values.labels !== undefined || values.types !== undefined) {
      throw new Refusal("--webhook makes no label or issue type: run it without --labels and --types.");
    }
    const source = values.source ?? DEFAULT_SOURCE;
    if (!SOURCE_NAME.test(source)) {
      throw new Refusal("A source's name is 1 to 32 characters of a-z, 0-9 and -, starting with a letter.");
    }
    return { webhook: true, org, repos: names(repos), source, apply: values.apply };
  }
  if (values.source !== undefined) throw new Refusal("--source names the source of --webhook: pass --webhook too.");
  if (!org || given.length === 0) throw new Refusal(`Name the owner and at least one repository.\n\n${USAGE}`);
  const labels = values.labels === undefined ? DEFAULT_LABELS : names(values.labels.split(","));
  const types = values.types === undefined ? DEFAULT_TYPES : names(values.types.split(","));
  if (labels.length === 0 && types.length === 0) {
    throw new Refusal('--labels "" and --types "" together ask for nothing: name at least one label or issue type.');
  }
  return { org, repos: names(repos), labels, types, apply: values.apply };
}

// Each step is a name fab0 wants, what GitHub has under it (`found`, matched case aside), and what to do.
async function plan({ org, repos, labels, types }) {
  const account = await request("GET", `/users/${encodeURIComponent(org)}`).catch(
    missing(`There is no GitHub account named ${org}.`),
  );
  if (account.type !== "Organization" && types.length > 0) {
    throw new Refusal(`${org} is a user account, and only organizations have issue types: pass --types "".`);
  }

  const existingTypes = types.length > 0 ? await list(`/orgs/${encodeURIComponent(org)}/issue-types`) : [];
  const typeSteps = types.map((name) => {
    const found = existingTypes.find((each) => same(each.name, name));
    return { name, found, action: !found ? "create" : found.is_enabled === false ? "enable" : "exists" };
  });

  const wanted = labels.map((name, i) => ({
    name,
    color: STATUS_COLORS[i % STATUS_COLORS.length],
    description: `fab0 pipeline status, ${i + 1} of ${labels.length}`,
  }));
  const labelSteps = [];
  for (const repo of wanted.length > 0 ? repos : []) {
    const path = `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/labels`;
    const existing = await list(path).catch(
      missing(`There is no repository ${org}/${repo}, or the token can't read it.`),
    );
    for (const label of wanted) {
      const found = existing.find((each) => same(each.name, label.name));
      labelSteps.push({ name: label.name, found, action: found ? "exists" : "create", repo, path, label });
    }
  }
  return { typeSteps, labelSteps };
}

// A name GitHub already has, in another case.
const differs = (step) => step.found !== undefined && step.found.name !== step.name;
const WORDS = { create: "to create", enable: "to enable (it is disabled)", exists: "exists" };

function show({ org, repos }, { typeSteps, labelSteps }) {
  const all = [...typeSteps, ...labelSteps];
  const width = Math.max(...all.map((step) => step.name.length)) + 2;
  const line = (step) =>
    `  ${step.name.padEnd(width)}${WORDS[step.action]}${differs(step) ? `, named ${step.found.name} on GitHub` : ""}`;
  say(`fab0 setup for ${org}`);
  if (typeSteps.length > 0) {
    say();
    say("Issue types");
    for (const step of typeSteps) say(line(step));
  }
  for (const repo of labelSteps.length > 0 ? repos : []) {
    say();
    say(`Labels in ${org}/${repo}`);
    for (const step of labelSteps.filter((each) => each.repo === repo)) say(line(step));
  }
  say();
  if (all.some(differs)) {
    say("fab0 matches names exactly, but GitHub holds a name only once whatever its case, so these");
    say("can't be added: rename them on GitHub, or use GitHub's names in the pipeline.");
    say();
  }
}

function summary(typeSteps, labelSteps) {
  const tally = (steps, action) => steps.filter((step) => step.action === action).length;
  const count = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return [
    ["create", tally(typeSteps, "create"), "issue type"],
    ["enable", tally(typeSteps, "enable"), "issue type"],
    ["create", tally(labelSteps, "create"), "label"],
  ]
    .filter(([, n]) => n > 0)
    .map(([verb, n, noun]) => `${verb} ${count(n, noun)}`)
    .join(", ");
}

// The writes made so far: a failure after one leaves what was made.
let made = 0;

async function apply({ org }, { typeSteps, labelSteps }) {
  const types = `/orgs/${encodeURIComponent(org)}/issue-types`;
  for (const step of typeSteps) {
    if (step.action === "create") {
      await request("POST", types, { name: step.name, is_enabled: true });
      say(`Created the issue type ${step.name}`);
    } else if (step.action === "enable") {
      // An update takes the type whole: its description and colour are sent back as they are.
      const { id, name, description, color } = step.found;
      const body = { name, is_enabled: true, ...(description != null && { description }), ...(color && { color }) };
      await request("PUT", `${types}/${id}`, body);
      say(`Enabled the issue type ${step.name}`);
    } else {
      continue;
    }
    made++;
  }
  for (const step of labelSteps) {
    if (step.action !== "create") continue;
    await request("POST", step.path, step.label);
    say(`Created the label ${step.name} in ${org}/${step.repo}`);
    made++;
  }
}

// What a run with --webhook wires: the organization's webhook when no repository is named, else each repository's.
function webhookTargets({ org, repos }) {
  const owner = encodeURIComponent(org);
  if (repos.length === 0) return [{ name: `the organization ${org}`, hooks: `orgs/${owner}/hooks`, org: true }];
  return repos.map((repo) => ({ name: `${org}/${repo}`, hooks: `repos/${owner}/${encodeURIComponent(repo)}/hooks` }));
}

const sourceUrl = (tenant, source) => `https://${FAB0_HOST}/ext/${tenant}/${source}`;
// The sources route's command for a source, for the person's own shell (agent interface section 9.2).
const sourceCommand = (method, tenant, source) =>
  `curl -fsS -X ${method} "https://${FAB0_HOST}/api/v1/sources/${source}?tenant=${tenant}" -H "Authorization: Bearer $(gh auth token)"`;

// The plan of a run with --webhook, from its arguments alone: no request is made, and no token read.
function showWebhook({ org, source }, targets) {
  say(`fab0 webhook setup for ${org}`);
  say();
  say(`On fab0 (${FAB0_HOST})`);
  say(`  set the github source ${source} of the tenant ${org}, with a new random secret`);
  say();
  say("On GitHub");
  for (const target of targets) say(`  add a webhook to ${target.name}, or update the one that posts to the source`);
  say(`    payload URL   ${sourceUrl(`<the id of ${org}'s GitHub account>`, source)}`);
  say("    content type  application/json");
  say("    secret        the source's: made in this shell, shown nowhere, saved nowhere");
  say(`    events        ${WEBHOOK_EVENTS.join(", ")}`);
  say();
  say("A source has one secret, and this gives it a new one: a webhook of the source that this run");
  say("doesn't name stops verifying. Name every repository of the source, or give the others a source");
  say("of their own with --source.");
  say();
}

// `gh api`, as the person: GitHub CLI's own sign-in, or GH_TOKEN. A body goes on its standard input, never as an
// argument, so the secret is in no process's command line. What it prints is answered; what it complains of is the
// error's message, cleaned.
function gh(args, body) {
  try {
    return execFileSync("gh", ["api", ...args, ...(body === undefined ? [] : ["--input", "-"])], {
      encoding: "utf8",
      input: body === undefined ? "" : JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Refusal("--webhook needs GitHub CLI: install gh, and sign in with `gh auth login`.");
    throw new WebhookError(clean(String(error.stderr ?? "").trim() || `gh exited with ${error.status}`));
  }
}

// The webhooks a target has, as { id, url }: its admin alone may read them, so this is also the check that the person
// administers it, made before anything is changed.
function hooksOf(target) {
  let listed;
  try {
    listed = gh(["--paginate", target.hooks, "--jq", ".[] | [.id, .config.url] | @tsv"]);
  } catch (error) {
    if (!(error instanceof WebhookError)) throw error;
    const needs = target.org
      ? "Its webhooks need an organization owner, whose token has the admin:org_hook scope: `gh auth refresh -h github.com -s admin:org_hook`."
      : "Its webhooks need an admin of the repository.";
    throw new Refusal(`Can't read the webhooks of ${target.name}: ${error.message}\n${needs}\nNothing was changed.`);
  }
  return listed
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id, url = ""] = line.split("\t");
      return { id, url };
    });
}

// Sets the source's secret on fab0, as the person: their GitHub token is the bearer, as for the secrets route (J.4).
async function putSource(tenant, source) {
  let response;
  try {
    response = await fetch(`https://${FAB0_HOST}/api/v1/sources/${source}?tenant=${tenant}&kind=github`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "user-agent": "fab0-setup" },
      body: secret,
    });
  } catch (error) {
    throw new Refusal(
      `fab0 (${FAB0_HOST}) couldn't be reached: ${clean(String(error.cause?.code ?? error.message))}. Nothing was changed.`,
    );
  }
  if (response.ok) return (await response.json().catch(() => ({}))).replaced === true;
  const answer = await response.json().catch(() => ({}));
  const said = clean(String(answer.message ?? response.statusText));
  const why =
    response.status === 403
      ? "\nSetting a source needs the tenant's admin: the owner of a user account, or an organization's admin. An account becomes a tenant with its first put_pipeline."
      : response.status === 401
        ? "\nThe token was refused. Check GH_TOKEN, or sign in again with `gh auth login`."
        : "";
  throw new Refusal(`fab0 answered ${response.status} to the source's PUT: ${said}${why}\nNothing was changed.`);
}

async function applyWebhook({ org, source }, targets) {
  token = readToken();
  if (!token) throw new Refusal("No GitHub token: set GH_TOKEN, or sign in to GitHub CLI with `gh auth login`.");

  // Reads first: the account, whose id is the tenant's (K.1), and each target's webhooks.
  let account;
  try {
    account = JSON.parse(gh([`users/${encodeURIComponent(org)}`]));
  } catch (error) {
    if (!(error instanceof WebhookError)) throw error;
    throw new Refusal(`Can't read the GitHub account ${org}: ${error.message}\nNothing was changed.`);
  }
  if (!Number.isSafeInteger(account.id)) throw new Refusal(`GitHub gave no id for ${org}. Nothing was changed.`);
  if (account.type !== "Organization" && targets.some((target) => target.org)) {
    throw new Refusal(`${org} is a user account, which has no webhook of its own: name its repositories.`);
  }
  const tenant = String(account.id);
  const url = sourceUrl(tenant, source);
  const steps = targets.map((target) => ({ target, existing: hooksOf(target).find((hook) => hook.url === url) }));

  secret = randomBytes(32).toString("hex");
  const replaced = await putSource(tenant, source);
  say(
    `${replaced ? "Gave the github source" : "Set the github source"} ${source} of the tenant ${org} ${replaced ? "a new secret" : "on fab0"}`,
  );

  const hook = {
    active: true,
    events: WEBHOOK_EVENTS,
    config: { url, content_type: "json", insecure_ssl: "0", secret },
  };
  let done = 0;
  try {
    for (const { target, existing } of steps) {
      if (existing) gh(["--method", "PATCH", `${target.hooks}/${existing.id}`], hook);
      else gh(["--method", "POST", target.hooks], { name: "web", ...hook });
      say(`${existing ? "Updated the webhook of" : "Added a webhook to"} ${target.name}`);
      done++;
    }
  } catch (error) {
    if (!(error instanceof WebhookError)) throw error;
    const failed = steps[done].target.name;
    const left = steps.slice(done + 1).map((step) => step.target.name);
    throw new Refusal(
      [
        `The source ${source} is set on fab0, but the webhook of ${failed} was not ${steps[done].existing ? "updated" : "added"}: ${error.message}`,
        left.length > 0 && `Not reached: ${left.join(", ")}.`,
        steps[done].existing && `Its webhook still holds the source's last secret, so fab0 answers its deliveries 401.`,
        "Run the same command again once that is fixed: it gives the source a new secret, and adds or updates each webhook.",
        `Or remove the source: ${sourceCommand("DELETE", tenant, source)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  say();
  say(`Done. Each webhook posts to ${url}`);
  // GitHub pings a webhook when it is created, and never when one is updated in place.
  const updated = steps.filter((step) => step.existing);
  if (updated.length < steps.length) {
    say("GitHub sends a new webhook a ping: a green ping under its Recent Deliveries says the URL and the");
    say("secret are right.");
  }
  if (updated.length > 0) {
    say("GitHub sends no ping to a webhook that was updated. To check one now, send it a ping yourself:");
    for (const { target, existing } of updated) say(`  gh api --method POST ${target.hooks}/${existing.id}/pings`);
    say("A green ping under its Recent Deliveries then says the URL and the new secret are right.");
  }
  say("fab0 drops a delivery for a repository the fab0 App already delivers.");
}

async function webhook(options) {
  const targets = webhookTargets(options);
  if (!options.apply) {
    showWebhook(options, targets);
    say("Nothing was read or written. Run again with --apply to make these changes.");
    return;
  }
  await applyWebhook(options, targets);
}

async function main() {
  const options = readArguments();
  if (!options) {
    say(USAGE);
    return;
  }
  if (options.webhook) return webhook(options);
  token = readToken();
  if (!token) {
    throw new Refusal("No GitHub token: set GH_TOKEN, or sign in to GitHub CLI with `gh auth login`.");
  }
  const steps = await plan(options);
  show(options, steps);
  const changes = summary(steps.typeSteps, steps.labelSteps);
  if (!changes) {
    const has = [
      options.types.length > 0 && `${options.org} has every issue type`,
      options.labels.length > 0 && "each repository has every label",
    ];
    say(`Nothing to do: ${has.filter(Boolean).join(", and ")}.`);
    return;
  }
  if (!options.apply) {
    say(`Plan: ${changes}.`);
    say("Nothing was written. Run again with --apply to make these changes.");
    return;
  }
  say(`Applying: ${changes}.`);
  await apply(options, steps);
  say("Done. A second run plans nothing.");
}

main().catch((error) => {
  if (error instanceof Refusal) {
    complain(error.message);
  } else if (error instanceof GitHubError) {
    complain(error.message);
    if (error.status === 401) complain("The token was refused. Check GH_TOKEN, or sign in again with `gh auth login`.");
    if (error.status === 403 || error.status === 404) {
      complain(
        "Making issue types needs an organization owner's token, and labels one that may write to the repository.",
      );
    }
    if (made > 0) complain("What was made before this stays; run again to make the rest.");
  } else {
    complain(`fab0 setup stopped: ${error.message}`);
  }
  process.exitCode = 1;
});
