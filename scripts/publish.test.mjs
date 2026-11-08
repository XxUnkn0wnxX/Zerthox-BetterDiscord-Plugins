import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyDistribution, assertSource, checkFreshness, inputs, listPlugins, stageDistribution, writeReceipt } from "./publish.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const put = (root, file, value = file) => {
    const dest = path.join(root, file);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, value);
};
const packageJson = (name, published = true) => JSON.stringify({ name, version: "1.0.0", description: `${name} plugin`, betterdiscord: { publish: published } });
const fixture = (t) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "plugin-publish-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, "source"), master = path.join(root, "master"), stage = path.join(root, "stage");
    for (const dir of [source, master, stage]) mkdirSync(dir);
    for (const repo of [source, master]) {
        git(repo, "init", "-q");
        git(repo, "config", "user.name", "Test");
        git(repo, "config", "user.email", "test@example.invalid");
        git(repo, "config", "commit.gpgsign", "false");
    }
    put(source, ".gitignore", "/dist/\n.DS_Store\n");
    put(source, "LICENSE", "license");
    put(source, ".github/workflows/build-plugins.yml", "workflow");
    put(source, ".github/.DS_Store", "local Finder metadata");
    for (const name of ["Alpha", "Beta"]) {
        put(source, `src/${name}/package.json`, packageJson(name));
        put(source, `dist/bd/${name}.plugin.js`, `built ${name}`);
    }
    put(master, "src/old.js", "old source");
    put(master, "dist/bd/Stale.plugin.js", "stale");
    git(master, "add", "-A"); git(master, "commit", "-qm", "old mixed tree");
    git(source, "add", "-A"); git(source, "commit", "-qm", "source");
    const sha = git(source, "rev-parse", "HEAD");
    writeReceipt(source);
    return { source, master, stage, sha, url: "https://github.com/example/repo" };
};

test("stages the complete distribution, removes old source and stale outputs, and remains idempotent", (t) => {
    const f = fixture(t);
    assert.match(git(f.source, "check-ignore", "dist/bd/Alpha.plugin.js"), /Alpha\.plugin\.js/);
    stageDistribution(f.source, f.stage, f.sha, f.url);
    assert.throws(() => readFileSync(path.join(f.stage, ".github/.DS_Store")));
    applyDistribution(f.master, f.stage);
    assert.deepEqual(readdirSync(path.join(f.master, "dist", "bd")).sort(), ["Alpha.plugin.js", "Beta.plugin.js", "README.md"]);
    assert.throws(() => readFileSync(path.join(f.master, "src/old.js")));
    assert.match(readFileSync(path.join(f.master, "README.md"), "utf8"), new RegExp(f.sha));
    assert.match(readFileSync(path.join(f.master, "dist/bd/README.md"), "utf8"), /Alpha.*v1\.0\.0.*Alpha plugin/);
    git(f.master, "add", "-A");
    assert.match(git(f.master, "diff", "--cached", "--name-only"), /dist\/bd\/Alpha\.plugin\.js/);
    git(f.master, "commit", "-qm", "published");
    rmSync(f.stage, { recursive: true }); mkdirSync(f.stage);
    stageDistribution(f.source, f.stage, f.sha, f.url);
    applyDistribution(f.master, f.stage);
    assert.equal(git(f.master, "status", "--porcelain", "--ignored", "--untracked-files=all"), "");
});

test("missing, empty, modified, or missing-receipt output fails before master changes", (t) => {
    const f = fixture(t);
    const output = path.join(f.source, "dist/bd/Alpha.plugin.js");
    const original = readFileSync(output);
    for (const value of [null, Buffer.alloc(0), Buffer.from("modified")]) {
        if (value === null) rmSync(output); else writeFileSync(output, value);
        assert.throws(() => stageDistribution(f.source, f.stage, f.sha, f.url));
        assert.equal(git(f.master, "status", "--porcelain"), "");
        assert.throws(() => applyDistribution(f.master, f.stage));
        writeFileSync(output, original);
    }
    rmSync(path.join(f.source, "dist/bd/.publication-receipt.json"));
    assert.throws(() => stageDistribution(f.source, f.stage, f.sha, f.url));
    assert.equal(git(f.master, "status", "--porcelain"), "");
});

test("rejects wrong SHA and dirty tracked or untracked source inputs", (t) => {
    const f = fixture(t);
    assert.throws(() => stageDistribution(f.source, f.stage, "a".repeat(40), f.url));
    put(f.source, "src/Alpha/package.json", packageJson("Alpha") + " ");
    assert.throws(() => assertSource(f.source, f.sha), /dirty/);
    git(f.source, "checkout", "--", "src/Alpha/package.json");
    put(f.source, "scripts/new.mjs", "new");
    assert.throws(() => stageDistribution(f.source, f.stage, f.sha, f.url), /dirty/);
    assert.equal(git(f.master, "status", "--porcelain"), "");
});

test("changing publication selection removes the prior plugin", (t) => {
    const f = fixture(t);
    stageDistribution(f.source, f.stage, f.sha, f.url); applyDistribution(f.master, f.stage);
    git(f.master, "add", "-A"); git(f.master, "commit", "-qm", "published");
    put(f.source, "src/Beta/package.json", packageJson("Beta", false));
    git(f.source, "add", "src/Beta/package.json"); git(f.source, "commit", "-qm", "unpublish");
    const nextSha = git(f.source, "rev-parse", "HEAD");
    writeReceipt(f.source);
    assert.deepEqual(listPlugins(f.source).map(({ name }) => name), ["Alpha"]);
    rmSync(f.stage, { recursive: true }); mkdirSync(f.stage);
    stageDistribution(f.source, f.stage, nextSha, f.url); applyDistribution(f.master, f.stage);
    assert.deepEqual(readdirSync(path.join(f.master, "dist/bd")).sort(), ["Alpha.plugin.js", "README.md"]);
});

test("freshness permits irrelevant descendants, rejects changed inputs, divergence and git errors", (t) => {
    const f = fixture(t);
    put(f.source, "README.md", "docs"); git(f.source, "add", "README.md"); git(f.source, "commit", "-qm", "docs");
    assert.doesNotThrow(() => checkFreshness(f.source, f.sha, "HEAD"));
    assert.throws(() => writeReceipt(f.source, f.sha), /HEAD does not match/);
    put(f.source, "src/Alpha/package.json", packageJson("Alpha") + " ");
    git(f.source, "add", "src/Alpha/package.json"); git(f.source, "commit", "-qm", "code");
    assert.throws(() => checkFreshness(f.source, f.sha, "HEAD"));
    assert.throws(() => checkFreshness(f.source, git(f.source, "rev-parse", "HEAD"), f.sha));
    assert.throws(() => checkFreshness(f.source, f.sha, "missing-ref"));
});

test("workflow trigger matches freshness inputs and no-op publication still reaches release", () => {
    const yaml = readFileSync(new URL("../.github/workflows/build-plugins.yml", import.meta.url), "utf8");
    const paths = [...yaml.matchAll(/^ {12}- "([^"]+)"$/gm)].map((match) => match[1]);
    assert.deepEqual(paths, inputs);
    assert.match(yaml, /github\.ref == 'refs\/heads\/develop'/);
    assert.match(yaml, /Distribution already matches source commit/);
    assert.ok(yaml.indexOf("name: Refresh rolling fork release") > yaml.indexOf("Distribution already matches source commit"));
    assert.doesNotMatch(yaml, /\|\| true/);
});
