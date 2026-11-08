import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const actionTypes = {
    connection: "POST_CONNECTION_OPEN",
    volume: "AUDIO_SET_LOCAL_VOLUME",
    settings: "USER_SETTINGS_PROTO_UPDATE",
};

const syncSource = readFileSync(new URL("../src/BetterVolume/sync.ts", import.meta.url), "utf8");
const compiledSync = ts.transpileModule(syncSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const createHarness = () => {
    const logs = { warnings: [], logs: [] };
    const dispatched = [];
    const settings = { current: { volumeOverrides: {} } };
    const dispatcher = {
        _subscriptions: {
            [actionTypes.connection]: new Set(),
            [actionTypes.volume]: new Set(),
            [actionTypes.settings]: new Set(),
        },
        subscribe(type, handler) {
            this._subscriptions[type] ??= new Set();
            this._subscriptions[type].add(handler);
        },
        unsubscribe(type, handler) {
            this._subscriptions[type]?.delete(handler);
        },
        dispatch(action) {
            dispatched.push(action);
            for (const handler of [...(this._subscriptions[action.type] ?? [])]) handler(action);
        },
    };

    const hasOverride = (userId, context) => context in (settings.current.volumeOverrides[userId] ?? {});
    const updateVolumeOverride = (userId, volume, context) => {
        const isNew = !hasOverride(userId, context);
        settings.current.volumeOverrides[userId] ??= {};
        settings.current.volumeOverrides[userId][context] = volume;
        return isNew;
    };
    const tryResetVolumeOverride = (userId, context) => {
        if (!hasOverride(userId, context)) return false;
        delete settings.current.volumeOverrides[userId][context];
        if (!Object.keys(settings.current.volumeOverrides[userId]).length) delete settings.current.volumeOverrides[userId];
        return true;
    };

    let manager;
    const dependencies = {
        "dium": {
            Finder: { find: () => manager },
            Filters: { byKeys: (...keys) => (value) => keys.every((key) => key in value) },
            Logger: {
                log: (message) => logs.logs.push(message),
                warn: (message) => logs.warnings.push(message),
            },
        },
        "@dium/modules": {
            Dispatcher: dispatcher,
            AudioConvert: {
                perceptualToAmplitude: (value) => value / 100,
                amplitudeToPerceptual: (value) => value * 100,
            },
        },
        "./settings": { Settings: settings, updateVolumeOverride, tryResetVolumeOverride },
    };
    const module = { exports: {} };
    runInNewContext(compiledSync, {
        exports: module.exports,
        module,
        Function,
        require: (name) => {
            assert.ok(dependencies[name], `Unexpected module import ${name}`);
            return dependencies[name];
        },
    });

    return {
        dispatcher,
        dispatched,
        logs,
        settings,
        sync: module.exports,
        setManager: (value) => {
            const previous = manager?.actions?.[actionTypes.volume];
            if (previous && dispatcher._subscriptions[actionTypes.volume]?.has(previous)) {
                dispatcher.unsubscribe(actionTypes.volume, previous);
            }
            manager = value;
            const next = value?.actions?.[actionTypes.volume];
            if (next instanceof Function) dispatcher.subscribe(actionTypes.volume, next);
        },
    };
};

const createManager = (original) => ({ actions: { [actionTypes.volume]: original } });
const subscribers = (harness, type) => harness.dispatcher._subscriptions[type] ?? new Set();
const volumeAction = (volume) => ({ type: actionTypes.volume, userId: "user", context: "voice", volume });

test("repeated connection events reuse the installed wrapper and replay overrides once per event", () => {
    const harness = createHarness();
    const forwarded = [];
    const original = (action) => forwarded.push(action);
    harness.settings.current.volumeOverrides = { saved: { voice: 3 } };
    harness.setManager(createManager(original));

    harness.sync.handleVolumeSync();
    harness.dispatcher.dispatch({ type: actionTypes.connection });
    harness.dispatcher.dispatch({ type: actionTypes.connection });

    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.settings).size, 1);
    assert.equal(subscribers(harness, actionTypes.connection).size, 1);
    assert.equal(harness.logs.warnings.length, 0);
    assert.equal(forwarded.length, 0);
    assert.equal(harness.dispatched.filter((action) => action.userId === "saved").length, 3);

    subscribers(harness, actionTypes.volume).delete([...subscribers(harness, actionTypes.volume)][0]);
    subscribers(harness, actionTypes.volume).add(original);
    delete harness.dispatcher._subscriptions[actionTypes.settings];
    harness.dispatcher.dispatch({ type: actionTypes.connection });
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.settings).size, 1);
    assert.equal(harness.logs.warnings.length, 0);
});

test("a re-added original is removed while retaining one wrapper", () => {
    const harness = createHarness();
    const original = () => {};
    harness.setManager(createManager(original));
    harness.sync.handleVolumeSync();

    subscribers(harness, actionTypes.volume).add(original);
    harness.dispatcher.dispatch({ type: actionTypes.connection });

    assert.equal(subscribers(harness, actionTypes.volume).has(original), false);
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(harness.logs.warnings.length, 0);
});

test("a replacement manager is wrapped without restoring the obsolete handler", () => {
    const harness = createHarness();
    const oldCalls = [];
    const newCalls = [];
    const oldOriginal = (action) => oldCalls.push(action);
    const newOriginal = (action) => newCalls.push(action);
    harness.setManager(createManager(oldOriginal));
    harness.sync.handleVolumeSync();

    harness.setManager(createManager(newOriginal));
    subscribers(harness, actionTypes.volume).add(newOriginal);
    harness.dispatcher.dispatch({ type: actionTypes.connection });
    harness.dispatcher.dispatch(volumeAction(1));
    harness.sync.resetVolumeSync();

    assert.equal(oldCalls.length, 0);
    assert.equal(newCalls.length, 1);
    assert.equal(subscribers(harness, actionTypes.volume).has(oldOriginal), false);
    assert.equal(subscribers(harness, actionTypes.volume).has(newOriginal), true);
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
});

test("normal volume, capped overrides, saved replay, and reset retain existing behavior", () => {
    const harness = createHarness();
    const forwarded = [];
    const original = (action) => forwarded.push(action);
    harness.setManager(createManager(original));
    harness.sync.handleVolumeSync();

    harness.dispatcher.dispatch(volumeAction(1));
    harness.dispatcher.dispatch(volumeAction(4));
    assert.equal(forwarded[0].volume, 1);
    assert.equal(forwarded[1].volume, 2);
    assert.equal(harness.settings.current.volumeOverrides.user.voice, 4);

    harness.settings.current.volumeOverrides = { saved: { voice: 3 } };
    harness.dispatcher.dispatch({ type: actionTypes.settings });
    assert.equal(forwarded.length, 2);

    harness.sync.resetVolumeSync();
    assert.equal(subscribers(harness, actionTypes.volume).has(original), true);
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.settings).size, 0);
});

test("stop before setup and repeated stop tolerate missing subscription sets", () => {
    const harness = createHarness();
    harness.sync.resetVolumeSync();
    harness.dispatcher._subscriptions[actionTypes.volume] = undefined;
    harness.sync.resetVolumeSync();

    assert.equal(harness.logs.warnings.length, 0);
    assert.equal(subscribers(harness, actionTypes.connection).size, 0);
});

test("stop and re-enable restore exactly one original and one owned wrapper", () => {
    const harness = createHarness();
    const original = () => {};
    harness.setManager(createManager(original));

    harness.sync.handleVolumeSync();
    harness.sync.resetVolumeSync();
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.volume).has(original), true);

    harness.sync.handleVolumeSync();
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.volume).has(original), false);
    harness.sync.resetVolumeSync();
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(subscribers(harness, actionTypes.volume).has(original), true);
    assert.equal(subscribers(harness, actionTypes.connection).size, 0);
    assert.equal(subscribers(harness, actionTypes.settings).size, 0);
});

test("a missing candidate leaves the active binding and its original handler intact", () => {
    const harness = createHarness();
    const forwarded = [];
    const original = (action) => forwarded.push(action);
    const manager = createManager(original);
    harness.setManager(manager);
    harness.sync.handleVolumeSync();

    manager.actions[actionTypes.volume] = undefined;
    harness.dispatcher.dispatch({ type: actionTypes.connection });
    harness.dispatcher.dispatch(volumeAction(1));
    harness.sync.resetVolumeSync();

    assert.equal(forwarded.length, 1);
    assert.equal(subscribers(harness, actionTypes.volume).has(original), true);
    assert.equal(subscribers(harness, actionTypes.volume).size, 1);
    assert.equal(harness.logs.warnings.length, 1);
});
