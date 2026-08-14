/**
 * @name DevTools
 * @version 0.5.3
 * @author Zerthox
 * @authorLink https://github.com/Zerthox
 * @description Utilities for development.
 * @website https://github.com/Zerthox/BetterDiscord-Plugins
 * @source https://github.com/Zerthox/BetterDiscord-Plugins/tree/master/src/DevTools
**/
/*@cc_on @if (@_jscript)
var pluginName = WScript.ScriptName.split(".")[0];
var shell = WScript.CreateObject("WScript.Shell");
shell.Popup(
    "Do NOT run scripts from the internet with the Windows Script Host!\nMove this file to your BetterDiscord plugins folder.",
    0,
    pluginName + ": Warning!",
    0x1030,
);
var fso = new ActiveXObject("Scripting.FileSystemObject");
var pluginsPath = shell.expandEnvironmentStrings("%appdata%\\BetterDiscord\\plugins");
if (!fso.FolderExists(pluginsPath)) {
    var popup = shell.Popup(
        "Unable to find BetterDiscord on your computer.\nOpen the download page of BetterDiscord?",
        0,
        pluginName + ": BetterDiscord not found",
        0x34,
    );
    if (popup === 6) {
        shell.Exec('explorer "https://betterdiscord.app"');
    }
} else if (WScript.ScriptFullName === pluginsPath + "\\" + WScript.ScriptName) {
    shell.Popup(
        'This plugin is already in the correct folder.\nNavigate to the "Plugins" settings tab in Discord and enable it there.',
        0,
        pluginName,
        0x40,
    );
} else {
    var popup = shell.Popup("Open the BetterDiscord plugins folder?", 0, pluginName, 0x34);
    if (popup === 6) {
        shell.Exec("explorer " + pluginsPath);
    }
}
WScript.Quit();
@else @*/

'use strict';

let meta;
const getMeta = () => {
    if (meta) {
        return meta;
    }
    else {
        throw Error("Accessing meta before initialization");
    }
};
const setMeta = (newMeta) => {
    meta = newMeta;
};

const load = (key) => BdApi.Data.load(getMeta().name, key);
const save = (key, value) => BdApi.Data.save(getMeta().name, key, value);
const deleteEntry = (key) => BdApi.Data.delete(getMeta().name, key);

const data = {
    __proto__: null,
    deleteEntry,
    load,
    save
};

const join = (...filters) => {
    return ((...args) => filters.every((filter) => filter(...args)));
};
const query$2 = ({ filter, name, keys, protos, source }) => {
    const filters = [
        ...[filter].flat(),
        typeof name === "string" ? byName$2(name) : null,
        keys instanceof Array ? byKeys$2(...keys) : null,
        protos instanceof Array ? byProtos$2(...protos) : null,
        source instanceof Array ? bySource$2(...source) : null,
    ].filter(Boolean);
    return join(...filters);
};
const checkObjectValues = (target) => target !== window && target instanceof Object && target.constructor?.prototype !== target;
const byEntry = (filter, every = false) => {
    return ((target, ...args) => {
        if (checkObjectValues(target)) {
            const values = Object.values(target);
            return values.length > 0 && values[every ? "every" : "some"]((value) => filter(value, ...args));
        }
        else {
            return false;
        }
    });
};
const byName$2 = (name) => {
    return (target) => (target?.displayName ?? target?.constructor?.displayName) === name;
};
const byKeys$2 = (...keys) => {
    return (target) => target instanceof Object && keys.every((key) => key in target);
};
const byProtos$2 = (...protos) => {
    return (target) => target instanceof Object
        && target.prototype instanceof Object
        && protos.every((proto) => proto in target.prototype);
};
const bySource$2 = (...fragments) => {
    return (target) => {
        while (target instanceof Object && "$$typeof" in target) {
            target = target.render ?? target.type;
        }
        if (target instanceof Function) {
            const source = target.toString();
            const renderSource = target.prototype?.render?.toString();
            return fragments.every((fragment) => typeof fragment === "string"
                ? source.includes(fragment) || renderSource?.includes(fragment)
                : fragment(source) || (renderSource && fragment(renderSource)));
        }
        else {
            return false;
        }
    };
};
const byClassNames$1 = (...classNames) => {
    return (target) => target instanceof Object
        && classNames.every((prefix) => Object.values(target).some((value) => typeof value === "string" && value.startsWith(prefix)));
};

const filters = {
    __proto__: null,
    byClassNames: byClassNames$1,
    byEntry,
    byKeys: byKeys$2,
    byName: byName$2,
    byProtos: byProtos$2,
    bySource: bySource$2,
    checkObjectValues,
    join,
    query: query$2
};

const hasOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const alert = (title, content) => BdApi.UI.alert(title, content);
const confirm = (title, content, options = {}) => BdApi.UI.showConfirmationModal(title, content, options);
const toast = (content, options) => BdApi.UI.showToast(content, options);
const mappedProxy = (target, mapping) => {
    const map = new Map(Object.entries(mapping));
    return new Proxy(target, {
        get(target, prop) {
            return target[map.get(prop) ?? prop];
        },
        set(target, prop, value) {
            target[map.get(prop) ?? prop] = value;
            return true;
        },
        deleteProperty(target, prop) {
            delete target[map.get(prop) ?? prop];
            map.delete(prop);
            return true;
        },
        has(target, prop) {
            return map.has(prop) || prop in target;
        },
        ownKeys() {
            return [...map.keys(), ...Object.keys(target)];
        },
        getOwnPropertyDescriptor(target, prop) {
            return Object.getOwnPropertyDescriptor(target, map.get(prop) ?? prop);
        },
        defineProperty(target, prop, attributes) {
            Object.defineProperty(target, map.get(prop) ?? prop, attributes);
            return true;
        },
    });
};

const find$1 = (filter, { resolve = true, entries = false } = {}) => BdApi.Webpack.getModule(filter, {
    defaultExport: resolve,
    searchExports: entries,
});
const query$1 = (query, options) => find$1(query$2(query), options);
const byEntries = (...filters$1) => find$1(join(...filters$1.map((filter) => byEntry(filter))));
const byName$1 = (name, options) => find$1(byName$2(name), options);
const byKeys$1 = (keys, options) => find$1(byKeys$2(...keys), options);
const byProtos$1 = (protos, options) => find$1(byProtos$2(...protos), options);
const bySource$1 = (contents, options) => find$1(bySource$2(...contents), options);
const all$1 = {
    find: (filter, { resolve = true, entries = false } = {}) => BdApi.Webpack.getModule(filter, {
        first: false,
        defaultExport: resolve,
        searchExports: entries,
    }) ?? [],
    query: (query, options) => all$1.find(query$2(query), options),
    byName: (name, options) => all$1.find(byName$2(name), options),
    byKeys: (keys, options) => all$1.find(byKeys$2(...keys), options),
    byProtos: (protos, options) => all$1.find(byProtos$2(...protos), options),
    bySource: (contents, options) => all$1.find(bySource$2(...contents), options),
};
const resolveKey = (target, filter) => [
    target,
    (target ? Object.entries(target).find(([, value]) => filter(value))?.[0] : null),
];
const findWithKey = (filter) => resolveKey(find$1(byEntry(filter)), filter);
const demangle = (mapping, required, proxy = false) => {
    const req = required ?? Object.keys(mapping);
    const found = find$1((target) => checkObjectValues(target)
        && req.every((req) => Object.values(target).some((value) => mapping[req](value))));
    return proxy
        ? mappedProxy(found, Object.fromEntries(Object.entries(mapping).map(([key, filter]) => [
            key,
            Object.entries(found ?? {}).find(([, value]) => filter(value))?.[0],
        ])))
        : Object.fromEntries(Object.entries(mapping).map(([key, filter]) => [
            key,
            Object.values(found ?? {}).find((value) => filter(value)),
        ]));
};
let controller = new AbortController();
const waitFor = (filter, { resolve = true, entries = false } = {}) => BdApi.Webpack.waitForModule(filter, {
    signal: controller.signal,
    defaultExport: resolve,
    searchExports: entries,
});
const waitForChecked = async (filter, options = {}, callback) => {
    const signal = controller.signal;
    const result = await waitFor(filter, options);
    if (!signal.aborted) {
        return callback(result);
    }
};
const abort = () => {
    controller.abort();
    controller = new AbortController();
};
const byClassNames = (...classNames) => find$1(byClassNames$1(...classNames), { entries: true });

const finder = {
    __proto__: null,
    abort,
    all: all$1,
    byClassNames,
    byEntries,
    byKeys: byKeys$1,
    byName: byName$1,
    byProtos: byProtos$1,
    bySource: bySource$1,
    demangle,
    find: find$1,
    findWithKey,
    query: query$1,
    resolveKey,
    waitFor,
    waitForChecked
};

const COLOR = "#3a71c1";
const print = (output, ...data) => output(`%c[${getMeta().name}] %c${getMeta().version ? `(v${getMeta().version})` : ""}`, `color: ${COLOR}; font-weight: 700;`, "color: #666; font-size: .8em;", ...data);
const log = (...data) => print(console.log, ...data);
const warn = (...data) => print(console.warn, ...data);
const error = (...data) => print(console.error, ...data);

const logger = {
    __proto__: null,
    error,
    log,
    print,
    warn
};

let manualPatches = [];
const addManual = (cancel, name) => {
    manualPatches.push(cancel);
    if (name) {
        log(`Patched ${name}`);
    }
};
const patch = (type, object, method, callback, options) => {
    const original = object?.[method];
    const name = options.name ?? String(method);
    if (!(original instanceof Function)) {
        if (options.force && !original) {
            warn(`Forcing patch on ${name}`);
            object[method] = function noop() { };
            addManual(() => {
                object[method] = original;
            });
        }
        else {
            throw TypeError(`patch target ${name} is ${original} not function`);
        }
    }
    const cancel = BdApi.Patcher[type](getMeta().name, object, method, options.once
        ? (context, args, result) => {
            const newResult = callback({ cancel, original, context, args, result });
            cancel();
            return newResult;
        }
        : (context, args, result) => callback({ cancel, original, context, args, result }));
    if (!options.silent) {
        log(`Patched ${name}`);
    }
    return cancel;
};
const instead = (object, method, callback, options = {}) => patch("instead", object, method, callback, options);
const before = (object, method, callback, options = {}) => patch("before", object, method, callback, options);
const after = (object, method, callback, options = {}) => patch("after", object, method, callback, options);
const contextMenu = (navId, callback, options = {}) => {
    const cancel = BdApi.ContextMenu.patch(navId, options.once
        ? (tree) => {
            const result = callback(tree);
            cancel();
            return result;
        }
        : callback);
    manualPatches.push(cancel);
    if (!options.silent) {
        log(`Patched ${options.name ?? `"${navId}"`} context menu`);
    }
    return cancel;
};
const unpatchAll = () => {
    if (manualPatches.length + BdApi.Patcher.getPatchesByCaller(getMeta().name).length > 0) {
        BdApi.Patcher.unpatchAll(getMeta().name);
        for (const cancel of manualPatches) {
            cancel();
        }
        manualPatches = [];
        log("Unpatched all");
    }
};

const patcher = {
    __proto__: null,
    addManual,
    after,
    before,
    contextMenu,
    instead,
    unpatchAll
};

const inject = (styles) => {
    if (typeof styles === "string") {
        BdApi.DOM.addStyle(getMeta().name, styles);
    }
};
const clear = () => BdApi.DOM.removeStyle(getMeta().name);
const suffix = (...classNames) => {
    const result = {};
    for (const className of classNames) {
        Object.defineProperty(result, className, {
            get: () => {
                const value = className + "-" + getMeta().name;
                Object.defineProperty(result, className, {
                    value,
                    configurable: true,
                    enumerable: true,
                });
                return value;
            },
            configurable: true,
            enumerable: true,
        });
    }
    return result;
};

const styles = {
    __proto__: null,
    clear,
    inject,
    suffix
};

const ChannelStore = /* @__PURE__ */ byName$1("ChannelStore");
const ChannelActions = /* @__PURE__ */ byKeys$1(["selectChannel"], { entries: true });
const SelectedChannelStore = /* @__PURE__ */ byName$1("SelectedChannelStore");
const VoiceStateStore = /* @__PURE__ */ byName$1("VoiceStateStore");

const Platforms = /* @__PURE__ */ find$1(byEntry(byKeys$2("WINDOWS", "WEB")));
const ClientActions = /* @__PURE__ */ byKeys$1(["toggleGuildFolderExpand"]);
const UserSettings = /* @__PURE__ */ find$1(byEntry(byKeys$2("updateSetting"), true));
const UserSettingsProtoStore = /* @__PURE__ */ byName$1("UserSettingsProtoStore");
const LocaleStore = /* @__PURE__ */ byName$1("LocaleStore");
const ThemeStore = /* @__PURE__ */ byName$1("ThemeStore");

const { ComponentDispatch, ComponentDispatcher } = /* @__PURE__ */ demangle({
    ComponentDispatch: byKeys$2("dispatchToLastSubscribed"),
    ComponentDispatcher: byProtos$2("dispatchToLastSubscribed"),
});

const Dispatcher$1 = /* @__PURE__ */ byKeys$1(["dispatch", "subscribe"], { entries: true });

const ExperimentStore = /* @__PURE__ */ byName$1("ExperimentStore");

const { default: Legacy, Dispatcher, Store, BatchedStoreListener, useStateFromStores, } = /* @__PURE__ */ demangle({
    default: byKeys$2("Store", "connectStores"),
    Dispatcher: byProtos$2("dispatch"),
    Store: byProtos$2("emitChange"),
    BatchedStoreListener: byProtos$2("attach", "detach"),
    useStateFromStores: bySource$2("useStateFromStores"),
}, ["Store", "Dispatcher", "useStateFromStores"]);
const SnapshotStore = /* @__PURE__ */ byProtos$1(["readSnapshot"]);

const flux = {
    __proto__: null,
    BatchedStoreListener,
    Dispatcher,
    Legacy,
    SnapshotStore,
    Store,
    useStateFromStores
};

const intl = /* @__PURE__ */ byKeys$1(["IntlManager", "FormatBuilder"]);
const locale = /* @__PURE__ */ byKeys$1(["intl", "getSystemLocale"]);

const GuildStore = /* @__PURE__ */ byName$1("GuildStore");
const GuildActions = /* @__PURE__ */ byKeys$1(["requestMembers"]);
const GuildMemberStore = /* @__PURE__ */ byName$1("GuildMemberStore");
const SortedGuildStore = /* @__PURE__ */ byName$1("SortedGuildStore");
const ExpandedGuildFolderStore =
/* @__PURE__ */ byName$1("ExpandedGuildFolderStore");

const MediaEngineStore = /* @__PURE__ */ byName$1("MediaEngineStore");
const MediaEngineActions = /* @__PURE__ */ byKeys$1(["setLocalVolume"]);

const MessageStore = /* @__PURE__ */ byName$1("MessageStore");
const MessageActions = /* @__PURE__ */ byKeys$1(["jumpToMessage", "_sendMessage"]);

const { React } = BdApi;
const { ReactDOM } = BdApi;
const ReactSpring = /* @__PURE__ */ byKeys$1([
    "SpringContext",
    "animated",
]);
const classNames = /* @__PURE__ */ find$1((exports) => exports instanceof Object && exports.default === exports && Object.keys(exports).length === 1);
const EventEmitter = /* @__PURE__ */ find$1((exports) => exports.prototype instanceof Object
    && Object.prototype.hasOwnProperty.call(exports.prototype, "prependOnceListener"));
const lodash = /* @__PURE__ */ byKeys$1(["cloneDeep", "flattenDeep"]);
const Immutable = /* @__PURE__ */ byKeys$1(["OrderedSet"]);
const semver = /* @__PURE__ */ byKeys$1(["SemVer"]);
const moment = /* @__PURE__ */ byKeys$1(["utc", "months"]);
const SimpleMarkdown = /* @__PURE__ */ byKeys$1([
    "parseBlock",
    "parseInline",
]);
const hljs = /* @__PURE__ */ byKeys$1([
    "highlight",
    "highlightBlock",
]);
const platform = /* @__PURE__ */ byKeys$1(["os", "manufacturer"]);
const lottie = /* @__PURE__ */ byKeys$1(["setSubframeRendering"]);

const PopoutWindowStore = /* @__PURE__ */ byName$1("PopoutWindowStore");

const mapping$1 = {
    Redirect: bySource$2(".computedMatch", ".to"),
    Route: bySource$2(".computedMatch", ".location"),
    Router: byKeys$2("computeRootMatch"),
    Switch: bySource$2(".cloneElement"),
    useLocation: bySource$2(").location"),
    useParams: bySource$2(".params:"),
    withRouter: bySource$2("withRouter("),
    __RouterContext: byName$2("Router"),
};
const Router = /* @__PURE__ */ demangle(mapping$1, ["withRouter"]);

const UserStore = /* @__PURE__ */ byName$1("UserStore");
const PresenceStore = /* @__PURE__ */ byName$1("PresenceStore");
const RelationshipStore = /* @__PURE__ */ byName$1("RelationshipStore");

const AudioConvert = /* @__PURE__ */ demangle({
    amplitudeToPerceptual: bySource$2("Math.log10"),
    perceptualToAmplitude: bySource$2("Math.pow(10"),
});

const Modules = {
    __proto__: null,
    AudioConvert,
    ChannelActions,
    ChannelStore,
    ClientActions,
    ComponentDispatch,
    ComponentDispatcher,
    Dispatcher: Dispatcher$1,
    EventEmitter,
    ExpandedGuildFolderStore,
    ExperimentStore,
    Flux: flux,
    GuildActions,
    GuildMemberStore,
    GuildStore,
    Immutable,
    LocaleStore,
    MediaEngineActions,
    MediaEngineStore,
    MessageActions,
    MessageStore,
    Platforms,
    PopoutWindowStore,
    PresenceStore,
    React,
    ReactDOM,
    ReactSpring,
    RelationshipStore,
    Router,
    SelectedChannelStore,
    SimpleMarkdown,
    SortedGuildStore,
    ThemeStore,
    UserSettings,
    UserSettingsProtoStore,
    UserStore,
    VoiceStateStore,
    classNames,
    hljs,
    intl,
    locale,
    lodash,
    lottie,
    moment,
    platform,
    semver
};

const { Button: Button$1, Flex: Flex$1, Spinner, Text: Text$1, ErrorBoundary, ColorInput, DropdownInput, KeybindInput, NumberInput, RadioInput, SearchInput, SliderInput, SwitchInput, TextInput: TextInput$1, SettingItem, SettingGroup, } = BdApi.Components;

const betterdiscord = {
    __proto__: null,
    Button: Button$1,
    ColorInput,
    DropdownInput,
    ErrorBoundary,
    Flex: Flex$1,
    KeybindInput,
    NumberInput,
    RadioInput,
    SearchInput,
    SettingGroup,
    SettingItem,
    SliderInput,
    Spinner,
    SwitchInput,
    Text: Text$1,
    TextInput: TextInput$1
};

const Button = /* @__PURE__ */ byKeys$1(["Colors", "Link"], { entries: true });

const Clickable = /* @__PURE__ */ bySource$1(["ignoreKeyPress:", "onKeyPress:"], {
    entries: true,
});

const Common = /* @__PURE__ */ byKeys$1(["Button", "Checkbox"]);

const Embed = /* @__PURE__ */ byProtos$1(["renderSuppressButton"], { entries: true });

const Flex = /* @__PURE__ */ byKeys$1(["Child", "Justify", "Align"], { entries: true });

const FormItem = /* @__PURE__ */ bySource$1(["titleClassName:", "required:"], { entries: true });
const FormSwitch = /* @__PURE__ */ bySource$1(["checked:", "onChange:", "layout:"], {
    entries: true,
});
const FormDivider = /* @__PURE__ */ bySource$1(["marginTop:", (source) => /{className:.,gap:.}=/.test(source)], {
    entries: true,
});
const FormSection = /* @__PURE__ */ bySource$1(["children:", "title:", "description:"], {
    entries: true,
});
const FormText = /* @__PURE__ */ bySource$1(["type:", "style:", "disabled:", "variant:", ".DEFAULT"], {
    entries: true,
});

const GuildsNav = /* @__PURE__ */ bySource$1(["guildsnav"], { entries: true });

const IconArrow = /* @__PURE__ */ bySource$1(['d:"M5.3 9.'], {
    entries: true,
});

const mapping = {
    Link: bySource$2(".component", ".to"),
    BrowserRouter: bySource$2("this.history"),
};
const { Link, BrowserRouter } = /* @__PURE__ */ demangle(mapping, [
    "Link",
    "BrowserRouter",
]);

const margins = /* @__PURE__ */ byKeys$1(["marginBottom40", "marginTop4"]);

const { Menu, Group: MenuGroup, Item: MenuItem, Separator: MenuSeparator, CheckboxItem: MenuCheckboxItem, RadioItem: MenuRadioItem, ControlItem: MenuControlItem, } = BdApi.ContextMenu;

const MediaItemFilter =  bySource$2("getObscureReason", "isSingleMosaicItem");
const MessageFooterFilter =  byProtos$2("renderRemoveAttachmentConfirmModal");

const { RadioGroup, getRadioAttributes } = /* @__PURE__ */ demangle({
    RadioGroup: bySource$2((source) => /{label:.,description:.,required:./.test(source)),
    getRadioAttributes: bySource$2(`role:"radio"`),
});

const SingleSelectFilter =  bySource$2('"single"', "isSelected", "maxVisibleItems", ".serialize");

const Slider = /* @__PURE__ */ bySource$1(["markerPositions:", "asValueChanges:"], {
    entries: true,
});

const Switch = /* @__PURE__ */ bySource$1(["checked:", "reducedMotion:"], { entries: true });

const ChannelTextArea = bySource$1(["pendingReply"]);

const TextInput = /* @__PURE__ */ bySource$1(["placeholder", "maxLength", "clearable"], { entries: true });
const ImageInput = /* @__PURE__ */ find$1((target) => typeof target.defaultProps?.multiple === "boolean" && typeof target.defaultProps?.maxFileSizeBytes === "number");

const Text = /* @__PURE__ */ bySource$1(["lineClamp:", "variant:", "tabularNumbers:"], { entries: true });

const Components = {
    __proto__: null,
    BD: betterdiscord,
    BrowserRouter,
    Button,
    ChannelTextArea,
    Clickable,
    Common,
    Embed,
    Flex,
    FormDivider,
    FormItem,
    FormSection,
    FormSwitch,
    FormText,
    GuildsNav,
    IconArrow,
    ImageInput,
    Link,
    MediaItemFilter,
    Menu,
    MenuCheckboxItem,
    MenuControlItem,
    MenuGroup,
    MenuItem,
    MenuRadioItem,
    MenuSeparator,
    MessageFooterFilter,
    RadioGroup,
    SingleSelectFilter,
    Slider,
    Switch,
    Text,
    TextInput,
    getRadioAttributes,
    margins
};

const EMPTY = Symbol();
const useOnceRef = (init) => {
    const ref = React.useRef(EMPTY);
    if (ref.current === EMPTY) {
        ref.current = init();
    }
    return ref;
};
const FCHook = ({ children: { type, props }, callback }) => {
    const result = type(props);
    return callback(result, props) ?? result;
};
const hookFunctionComponent = (target, callback) => {
    const props = {
        children: { ...target },
        callback,
    };
    target.props = props;
    target.type = FCHook;
    return target;
};
const replaceElement = (target, replace) => {
    target.type = replace.type;
    target.key = replace.key ?? target.key;
    target.props = replace.props;
};
const queryTree = (node, predicate) => {
    const worklist = [node].flat();
    while (worklist.length !== 0) {
        const node = worklist.shift();
        if (React.isValidElement(node)) {
            if (predicate(node)) {
                return node;
            }
            const children = node?.props?.children;
            if (children) {
                worklist.push(...[children].flat());
            }
        }
    }
    return null;
};
const queryTreeAll = (node, predicate) => {
    const result = [];
    const worklist = [node].flat();
    while (worklist.length !== 0) {
        const node = worklist.shift();
        if (React.isValidElement(node)) {
            if (predicate(node)) {
                result.push(node);
            }
            const children = node?.props?.children;
            if (children) {
                worklist.push(...[children].flat());
            }
        }
    }
    return result;
};
const queryTreeForParent = (tree, predicate) => {
    let childIndex = -1;
    const parent = queryTree(tree, (node) => {
        const children = node?.props?.children;
        if (children instanceof Array) {
            const index = children.findIndex(predicate);
            if (index > -1) {
                childIndex = index;
                return true;
            }
        }
        return false;
    });
    return [parent, childIndex];
};
const getFiber = (node) => {
    const key = Object.keys(node).find((key) => key.startsWith("__reactFiber"));
    return node?.[key];
};
const queryFiber = (fiber, predicate, direction = "up" , depth = 30) => {
    if (depth < 0) {
        return null;
    }
    if (predicate(fiber)) {
        return fiber;
    }
    if (direction === "up"  || direction === "both" ) {
        let count = 0;
        let parent = fiber.return;
        while (parent && count < depth) {
            if (predicate(parent)) {
                return parent;
            }
            count++;
            parent = parent.return;
        }
    }
    if (direction === "down"  || direction === "both" ) {
        let child = fiber.child;
        while (child) {
            const result = queryFiber(child, predicate, "down" , depth - 1);
            if (result) {
                return result;
            }
            child = child.sibling;
        }
    }
    return null;
};
const findOwner = (fiber, depth = 50) => {
    return queryFiber(fiber, (node) => node?.stateNode instanceof React.Component, "up" , depth);
};
const forceUpdateOwner = (fiber) => new Promise((resolve) => {
    const owner = findOwner(fiber);
    if (owner) {
        owner.stateNode.forceUpdate(() => resolve(true));
    }
    else {
        resolve(false);
    }
});
const forceFullRerender = (fiber) => new Promise((resolve) => {
    const owner = findOwner(fiber);
    if (owner) {
        const { stateNode } = owner;
        instead(stateNode, "render", () => null, { once: true, silent: true });
        stateNode.forceUpdate(() => stateNode.forceUpdate(() => resolve(true)));
    }
    else {
        resolve(false);
    }
});

const index$1 = {
    __proto__: null,
    alert,
    confirm,
    findOwner,
    forceFullRerender,
    forceUpdateOwner,
    getFiber,
    hasOwnProperty,
    hookFunctionComponent,
    mappedProxy,
    queryFiber,
    queryTree,
    queryTreeAll,
    queryTreeForParent,
    replaceElement,
    sleep,
    toast,
    useOnceRef
};

const SettingsContainer = ({ name, children, onReset }) => (React.createElement("div", null,
    children,
    onReset ? (React.createElement(React.Fragment, null,
        React.createElement(FormDivider, { gap: 20 }),
        React.createElement(Flex, { justify: Flex.Justify.END },
            React.createElement(Button, { size: Button.Sizes.SMALL, onClick: () => confirm(name, "Reset all settings?", {
                    onConfirm: onReset,
                }) }, "Reset")))) : null));

class SettingsStore {
    defaults;
    current;
    onLoad;
    listeners = new Set();
    constructor(defaults, onLoad) {
        this.defaults = defaults;
        this.current = { ...defaults };
        this.onLoad = onLoad;
    }
    load() {
        this.current = { ...this.defaults, ...load("settings") };
        this.onLoad?.();
        this._dispatch(false);
    }
    _dispatch(save$1) {
        for (const listener of this.listeners) {
            listener(this.current);
        }
        if (save$1) {
            save("settings", this.current);
        }
    }
    getCurrent = () => this.current;
    update = (settings) => {
        const update = typeof settings === "function" ? settings(this.current) : settings;
        this.current = { ...this.current, ...update };
        this._dispatch(true);
    };
    reset() {
        this.current = { ...this.defaults };
        this._dispatch(true);
    }
    delete(...keys) {
        this.current = { ...this.current };
        for (const key of keys) {
            delete this.current[key];
        }
        this._dispatch(true);
    }
    useCurrent() {
        return React.useSyncExternalStore(this.addListenerEffect, this.getCurrent);
    }
    useSelector(selector, deps, compare = Object.is) {
        const state = useOnceRef(() => selector(this.current));
        const snapshot = React.useCallback(() => {
            const next = selector(this.current);
            if (!compare(state.current, next)) {
                state.current = next;
            }
            return state.current;
        }, deps ?? [selector]);
        return React.useSyncExternalStore(this.addListenerEffect, snapshot);
    }
    useState() {
        const current = this.useCurrent();
        return [current, this.update];
    }
    useStateWithDefaults() {
        const current = this.useCurrent();
        return [current, this.defaults, this.update];
    }
    useListener(listener, deps) {
        React.useEffect(() => this.addListenerEffect(listener), deps ?? [listener]);
    }
    addListener(listener) {
        this.listeners.add(listener);
        return listener;
    }
    addListenerEffect = (listener) => {
        this.addListener(listener);
        return () => this.removeListener(listener);
    };
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    removeAllListeners() {
        this.listeners.clear();
    }
    addReactChangeListener = this.addListener;
    removeReactChangeListener = this.removeListener;
}
const createSettings = (defaults, onLoad) => new SettingsStore(defaults, onLoad);

const ReactInternals = React
    ?.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const ReactDOMInternals = ReactDOM
    ?.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const version = "0.6.3";

const createPlugin = (plugin) => (meta) => {
    setMeta(meta);
    const { start, stop, styles: styles$1, Settings, SettingsPanel } = plugin instanceof Function ? plugin(meta) : plugin;
    Settings?.load();
    return {
        start() {
            log("Enabled");
            inject(styles$1);
            start?.();
        },
        stop() {
            abort();
            unpatchAll();
            clear();
            stop?.();
            log("Disabled");
        },
        getSettingsPanel: SettingsPanel
            ? () => (React.createElement(SettingsContainer, { name: meta.name, onReset: Settings ? () => Settings.reset() : undefined },
                React.createElement(SettingsPanel, null)))
            : undefined,
    };
};

const dium = {
    __proto__: null,
    Data: data,
    Filters: filters,
    Finder: finder,
    Flux: flux,
    Logger: logger,
    Patcher: patcher,
    React,
    ReactDOM,
    ReactDOMInternals,
    ReactInternals,
    SettingsStore,
    Styles: styles,
    Utils: index$1,
    createPlugin,
    createSettings,
    getMeta,
    setMeta,
    version
};

const getWebpackRequire = () => {
    const chunkName = Object.keys(window).find((key) => key.startsWith("webpackChunk"));
    const chunk = window[chunkName];
    let webpackRequire = undefined;
    try {
        chunk.push([
            [Symbol()],
            {},
            (require) => {
                webpackRequire = require;
                throw Error();
            },
        ]);
    }
    catch {
    }
    return webpackRequire;
};
const webpackRequire = getWebpackRequire();
const byExportsFilter = (exported) => {
    return (target) => target === exported;
};
const byModuleSourceFilter = (contents) => {
    return (_, module) => {
        const factory = module?.id ? factoryOf(module.id) : undefined;
        const source = factory?.toString();
        return source ? contents.every((content) => source.includes(content)) : false;
    };
};
const applyFilter = (filter, keys = ["default", "Z", "ZP"]) => (module) => {
    const { exports } = module;
    const check = typeof keys === "boolean" ? (keys ? Object.keys(exports ?? {}) : []) : keys;
    return (filter(exports, module, String(module.id))
        || (exports instanceof Object
            && check.some((key) => key in exports && filter(exports[key], module, String(module.id)))));
};
const cache = () => {
    const cache = {};
    BdApi.Webpack.getModules(((_, module) => {
        cache[module.id] = module;
        return false;
    }));
    return cache;
};
const modules = () => Object.values(cache());
const sources = () => Object.values(webpackRequire.m);
const idOf = (exported) => modules().find((module) => module.exports == exported)?.id;
const factoryOf = (id) => webpackRequire.m[id];
const find = (filter, keys) => modules().find(applyFilter(filter, keys));
const query = (query, keys) => find(query$2(query), keys);
const byId = (id) => cache()[id];
const byExports = (exported, keys) => find(byExportsFilter(exported), keys);
const byName = (name, keys) => find(byName$2(name), keys);
const byKeys = (props, keys) => find(byKeys$2(...props), keys);
const byProtos = (protos, keys) => find(byProtos$2(...protos), keys);
const bySource = (contents, keys) => find(bySource$2(...contents), keys);
const byModuleSource = (contents) => find(byModuleSourceFilter(contents));
const all = {
    find: (filter, keys) => modules().filter(applyFilter(filter, keys)),
    query: (query, keys) => all.find(query$2(query), keys),
    byExports: (exported, keys) => all.find(byExportsFilter(exported), keys),
    byName: (name, keys) => all.find(byName$2(name), keys),
    byKeys: (keys, checkKeys) => all.find(byKeys$2(...keys), checkKeys),
    byProtos: (protos, keys) => all.find(byProtos$2(...protos), keys),
    bySource: (contents, keys) => all.find(bySource$2(...contents), keys),
    byModuleSource: (contents) => all.find(byModuleSourceFilter(contents)),
};
const resolveImportIds = (module) => {
    const factory = factoryOf(module.id);
    if (factory) {
        const source = factory.toString();
        const match = source.match(/^(?:function)?\s*\(\w+,\w+,(\w+)\)\s*(?:=>)?\s*{/);
        if (match) {
            const requireName = match[1];
            const calls = Array.from(source.matchAll(new RegExp(`\\W${requireName}\\("?(\\d+)"?\\)`, "g")));
            return calls.map((call) => parseInt(call[1]));
        }
        else {
            error("Failed to find require in module factory");
        }
    }
    return [];
};
const resolveImports = (module) => resolveImportIds(module).map((id) => byId(id));
const resolveStyles = (module) => resolveImports(module).filter((imported) => imported instanceof Object
    && "exports" in imported
    && Object.values(imported.exports).every((value) => typeof value === "string")
    && Object.entries(imported.exports).find(([key, value]) => new RegExp(`^${key}-([a-zA-Z0-9-_]){6}(\\s.+)$`).test(value)));
const resolveUsersById = (id) => all.find((_, user) => (user ? resolveImportIds(user).includes(id) : false));
const resolveUsers = (module) => resolveUsersById(module.id);

const DevFinder = {
    __proto__: null,
    all,
    byExports,
    byId,
    byKeys,
    byModuleSource,
    byName,
    byProtos,
    bySource,
    cache,
    factoryOf,
    find,
    idOf,
    modules,
    query,
    require: webpackRequire,
    resolveImportIds,
    resolveImports,
    resolveStyles,
    resolveUsers,
    resolveUsersById,
    sources
};

const { Logger } = dium;
const diumGlobal = {
    ...dium,
    Finder: { ...finder, dev: DevFinder },
    Modules,
    Components,
};
const checkForMissing = (type, toCheck) => {
    const missing = Object.entries(toCheck)
        .filter(([, value]) => value === undefined || value === null)
        .map(([key]) => key);
    if (missing.length > 0) {
        Logger.warn(`Missing ${type}: ${missing.join(", ")}`);
    }
    else {
        Logger.log(`All ${type} found`);
    }
};
const index = createPlugin({
    start() {
        window.dium = diumGlobal;
        checkForMissing("modules", Modules);
        checkForMissing("components", Components);
    },
    stop() {
        delete window.dium;
    },
});

module.exports = index;
/*@end @*/
