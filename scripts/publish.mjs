import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep this list identical to the workflow's push paths.
export const inputs = [
    "src/**", "packages/**", "scripts/**", "package.json", "package-lock.json",
    "rollup.config.ts", "tsconfig.json", "global.d.ts", "eslint.config.mjs",
    ".mocharc.json", ".github/**", "LICENSE", ".gitignore",
];

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const required = (file) => {
    if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
    return file;
};
const pluginName = (name) => {
    if (typeof name !== "string" || !/^[A-Za-z0-9]+$/.test(name)) throw new Error(`Invalid plugin name: ${name}`);
    return name;
};
const outputPath = (source, name) => path.join(source, "dist", "bd", `${pluginName(name)}.plugin.js`);
export const receiptPath = (source) => path.join(source, "dist", "bd", ".publication-receipt.json");

export function listPlugins(source) {
    const entries = readdirSync(path.join(source, "src"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));
    const plugins = entries.map(({ name }) => {
        pluginName(name);
        const pkg = JSON.parse(readFileSync(path.join(source, "src", name, "package.json"), "utf8"));
        if (pkg.name !== name || typeof pkg.version !== "string" || !pkg.version || typeof pkg.description !== "string") {
            throw new Error(`Invalid package metadata for ${name}`);
        }
        return { name, version: pkg.version, description: pkg.description, published: pkg.betterdiscord?.publish !== false };
    }).filter((plugin) => plugin.published);
    if (!plugins.length) throw new Error("No published plugins found");
    return plugins;
}

export function assertSource(source, expected = undefined) {
    const head = git(source, "rev-parse", "HEAD");
    if (!/^[0-9a-f]{40}$/.test(head) || (expected && head !== expected)) throw new Error("Source HEAD does not match expected full SHA");
    const dirty = git(source, "status", "--porcelain", "--untracked-files=all", "--", ...inputs.map((p) => `:(glob)${p}`));
    if (dirty) throw new Error(`Source publication inputs are dirty:\n${dirty}`);
    return head;
}

export function checkFreshness(repo, built, current) {
    if (!/^[0-9a-f]{40}$/.test(built)) throw new Error("Expected full source SHA");
    git(repo, "merge-base", "--is-ancestor", built, current);
    const result = spawnSync("git", ["diff", "--quiet", built, current, "--", ...inputs.map((p) => `:(glob)${p}`)], { cwd: repo });
    if (result.error || result.status !== 0) throw new Error(`Publication inputs changed or git diff failed (status ${result.status})`);
}

export function writeReceipt(source, expected = undefined) {
    const sha = assertSource(source, expected);
    const plugins = listPlugins(source).map(({ name }) => {
        const output = required(outputPath(source, name));
        if (!statSync(output).isFile() || !statSync(output).size) throw new Error(`Empty plugin output: ${name}`);
        return { name, sha256: hash(output) };
    });
    writeFileSync(receiptPath(source), JSON.stringify({ sha, plugins }, null, 2) + "\n");
}

function verifiedReceipt(source, sha) {
    const receipt = JSON.parse(readFileSync(required(receiptPath(source)), "utf8"));
    const plugins = listPlugins(source);
    if (receipt.sha !== sha || !Array.isArray(receipt.plugins) || receipt.plugins.length !== plugins.length) {
        throw new Error("Publication receipt does not match source and published plugins");
    }
    for (const [index, { name }] of plugins.entries()) {
        const entry = receipt.plugins[index];
        const file = required(outputPath(source, name));
        if (entry?.name !== name || !statSync(file).isFile() || !statSync(file).size || entry.sha256 !== hash(file)) {
            throw new Error(`Publication output does not match receipt: ${name}`);
        }
    }
    return { plugins, receipt };
}

const text = (value) => value.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "");
export function stageDistribution(source, stage, sha, repository) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Expected full source SHA");
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository URL");
    if (readdirSync(stage).length) throw new Error("Staging directory must be empty");
    assertSource(source, sha);
    const { plugins, receipt } = verifiedReceipt(source, sha);
    const listing = plugins.map(({ name, version, description }) =>
        `- [${name}](./${name}.plugin.js) — v${text(version)}: ${text(description)}`,
    ).join("\n");
    mkdirSync(path.join(stage, "dist", "bd"), { recursive: true });
    for (const { name } of plugins) cpSync(outputPath(source, name), path.join(stage, "dist", "bd", `${name}.plugin.js`));
    cpSync(required(path.join(source, "LICENSE")), path.join(stage, "LICENSE"));
    const workflowFiles = git(source, "ls-files", "-z", "--", ".github").split("\0").filter(Boolean);
    for (const file of workflowFiles) {
        const destination = path.join(stage, file);
        mkdirSync(path.dirname(destination), { recursive: true });
        cpSync(required(path.join(source, file)), destination);
    }
    writeFileSync(path.join(stage, ".gitignore"), "node_modules/\ntmp/\nAGENTS.md\nAGENTS.MD\n.venv/\n");
    writeFileSync(path.join(stage, "README.md"), `# BetterDiscord Plugins downloads\n\nBuilt from [source commit ${sha}](${repository}/tree/${sha}). This fork is based on [Zerthox/BetterDiscord-Plugins](https://github.com/Zerthox/BetterDiscord-Plugins). Source and build instructions are on [develop](${repository}/tree/develop).\n\nDownload plugins from [dist/bd](dist/bd/) and place the plugin files in BetterDiscord's plugins folder.\n`);
    writeFileSync(path.join(stage, "dist", "bd", "README.md"), `# Plugins\n\nBuilt from [source commit ${sha}](${repository}/tree/${sha}).\n\n${listing}\n`);
    writeFileSync(path.join(stage, "build-info.json"), JSON.stringify(receipt, null, 2) + "\n");
}

export function applyDistribution(master, stage) {
    if (git(master, "status", "--porcelain", "--ignored", "--untracked-files=all")) throw new Error("Distribution checkout must be clean, including ignored files");
    for (const file of [".github/workflows/build-plugins.yml", "README.md", "dist/bd/README.md", "LICENSE", ".gitignore"]) required(path.join(stage, file));
    const manifest = JSON.parse(readFileSync(required(path.join(stage, "build-info.json")), "utf8"));
    if (!/^[0-9a-f]{40}$/.test(manifest.sha) || !Array.isArray(manifest.plugins) || !manifest.plugins.length) throw new Error("Invalid staged manifest");
    const names = new Set();
    for (const entry of manifest.plugins) {
        const name = pluginName(entry.name);
        if (names.has(name)) throw new Error(`Duplicate staged plugin: ${name}`);
        names.add(name);
        const file = required(path.join(stage, "dist", "bd", `${name}.plugin.js`));
        if (!statSync(file).isFile() || !statSync(file).size || hash(file) !== entry.sha256) throw new Error(`Invalid staged plugin: ${name}`);
    }
    const stagedPlugins = readdirSync(path.join(stage, "dist", "bd")).filter((f) => f.endsWith(".plugin.js"));
    if (stagedPlugins.length !== names.size || stagedPlugins.some((f) => !names.has(f.slice(0, -".plugin.js".length)))) throw new Error("Unexpected staged plugin files");
    const tracked = git(master, "ls-files", "-z").split("\0").filter(Boolean);
    for (const file of tracked) rmSync(path.join(master, file), { force: true });
    const dirs = new Set();
    for (const file of tracked) {
        let dir = path.dirname(file);
        while (dir !== ".") { dirs.add(dir); dir = path.dirname(dir); }
    }
    for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
        try { rmdirSync(path.join(master, dir)); }
        catch (error) { if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error; }
    }
    for (const entry of readdirSync(stage)) cpSync(path.join(stage, entry), path.join(master, entry), { recursive: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [command, ...args] = process.argv.slice(2);
    if (command === "list" && args.length === 1) console.log(listPlugins(args[0]).map(({ name }) => name).join("\n"));
    else if (command === "stage" && args.length === 4) stageDistribution(...args);
    else if (command === "apply" && args.length === 2) applyDistribution(...args);
    else if (command === "fresh" && args.length === 3) checkFreshness(...args);
    else throw new Error("Usage: publish.mjs list SOURCE | stage SOURCE STAGE SHA REPOSITORY | apply MASTER STAGE | fresh REPO BUILT CURRENT");
}
