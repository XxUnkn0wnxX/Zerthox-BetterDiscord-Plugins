/**
 * @name BetterFolders
 * @version 3.8.1
 * @author Zerthox
 * @authorLink https://github.com/Zerthox
 * @description Adds new functionality to server folders. Custom Folder Icons. Close other folders on open.
 * @website https://github.com/Zerthox/BetterDiscord-Plugins
 * @source https://github.com/Zerthox/BetterDiscord-Plugins/tree/master/src/BetterFolders
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

const byName$1 = (name) => {
    return (target) => (target?.displayName ?? target?.constructor?.displayName) === name;
};
const byKeys$1 = (...keys) => {
    return (target) => target instanceof Object && keys.every((key) => key in target);
};
const bySource$1 = (...fragments) => {
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

const confirm = (title, content, options = {}) => BdApi.UI.showConfirmationModal(title, content, options);

const find = (filter, { resolve = true, entries = false } = {}) => BdApi.Webpack.getModule(filter, {
    defaultExport: resolve,
    searchExports: entries,
});
const byName = (name, options) => find(byName$1(name), options);
const byKeys = (keys, options) => find(byKeys$1(...keys), options);
const bySource = (contents, options) => find(bySource$1(...contents), options);
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

const COLOR = "#3a71c1";
const print = (output, ...data) => output(`%c[${getMeta().name}] %c${getMeta().version ? `(v${getMeta().version})` : ""}`, `color: ${COLOR}; font-weight: 700;`, "color: #666; font-size: .8em;", ...data);
const log = (...data) => print(console.log, ...data);
const warn = (...data) => print(console.warn, ...data);

let manualPatches = [];
const addManual = (cancel, name) => {
    manualPatches.push(cancel);
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
const after = (object, method, callback, options = {}) => patch("after", object, method, callback, options);
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

const inject = (styles) => {
    if (typeof styles === "string") {
        BdApi.DOM.addStyle(getMeta().name, styles);
    }
};
const clear = () => BdApi.DOM.removeStyle(getMeta().name);

const ClientActions = /* @__PURE__ */ byKeys(["toggleGuildFolderExpand"]);

const SortedGuildStore = /* @__PURE__ */ byName("SortedGuildStore");
const ExpandedGuildFolderStore =
/* @__PURE__ */ byName("ExpandedGuildFolderStore");

const { React } = BdApi;

const { Text, RadioInput, SwitchInput, SettingItem} = BdApi.Components;

const Button = /* @__PURE__ */ byKeys(["Colors", "Link"], { entries: true });

const Flex = /* @__PURE__ */ byKeys(["Child", "Justify", "Align"], { entries: true });

const FormDivider = /* @__PURE__ */ bySource(["marginTop:", (source) => /{className:.,gap:.}=/.test(source)], {
    entries: true,
});

const margins = /* @__PURE__ */ byKeys(["marginBottom40", "marginTop4"]);

const TextInput = /* @__PURE__ */ bySource(["placeholder", "maxLength", "clearable"], { entries: true });
const ImageInput = /* @__PURE__ */ find((target) => typeof target.defaultProps?.multiple === "boolean" && typeof target.defaultProps?.maxFileSizeBytes === "number");

const EMPTY = Symbol();
const useOnceRef = (init) => {
    const ref = React.useRef(EMPTY);
    if (ref.current === EMPTY) {
        ref.current = init();
    }
    return ref;
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

const createPlugin = (plugin) => (meta) => {
    setMeta(meta);
    const { start, stop, styles, Settings, SettingsPanel } = plugin instanceof Function ? plugin(meta) : plugin;
    Settings?.load();
    return {
        start() {
            log("Enabled");
            inject(styles);
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

const Settings = createSettings({
    closeOnOpen: false,
    folders: {},
});

const css = ".customIcon-BetterFolders{box-sizing:border-box;display:block;flex:0 0 auto;width:40px;height:40px;border-radius:var(--radius-lg);background-size:cover;background-position:center;background-repeat:no-repeat}.customIcon-BetterFolders[data-better-folders-custom-icon]{position:absolute;inset:0;width:100%;height:100%}";
const styles = {
    customIcon: "customIcon-BetterFolders"
};

byKeys(["folderIcon", "folderIconWrapper", "folderPreviewWrapper"]);
const renderIcon = (data) => (React.createElement("div", { className: styles.customIcon, style: { backgroundImage: data?.icon ? `url(${data.icon})` : undefined } }));

const BetterFolderUploader = ({ icon, always, onChange }) => {
    const Components = {
        Flex: Flex,
        Button: Button,
        SwitchInput: SwitchInput,
        Text: Text,
        ImageInput: ImageInput,
        margins: margins,
        SettingItem: SettingItem,
    };
    return (React.createElement(React.Fragment, null,
        Components.Flex && Components.Button && Components.ImageInput && Components.Text && Components.margins
            ? (React.createElement(Components.Flex, { align: Components.Flex.Align.CENTER, className: Components.margins.marginBottom20 },
                React.createElement(Components.Button, { color: Components.Button.Colors.WHITE, look: Components.Button.Looks.OUTLINED },
                    "Upload Image",
                    React.createElement(Components.ImageInput, { onChange: (img) => onChange({ icon: img, always }) })),
                React.createElement(Components.Text, { variant: "text-sm/normal", style: { color: "var(--text-muted)", margin: "0 10px 0 40px" } }, "Preview:"),
                renderIcon({ icon})))
            : renderIcon({ icon}),
        Components.SwitchInput && Components.SettingItem
            ? (React.createElement(Components.SettingItem, { id: "alwaysDisplayIcon", name: "Always display icon", inline: true },
                React.createElement(Components.SwitchInput, { id: "alwaysDisplayIcon", value: always, onChange: (checked) => onChange({ icon, always: checked }) })))
            : null));
};

const mountFolderSettingsPatch = ({ context, }) => {
    const { props: { folderId }, state, } = context;
    if (state.iconType) {
        warn("FolderSettings already patched in mount");
        return;
    }
    const original = context.handleSubmit;
    context.handleSubmit = (...args) => {
        const result = original(...args);
        const currentState = context.state;
        const iconType = currentState.iconType ?? (currentState.icon ? "custom"  : "default" );
        const folders = { ...Settings.current.folders };
        if (iconType === "custom"  && currentState.icon) {
            folders[folderId] = { icon: currentState.icon, always: currentState.always };
            Settings.update({ folders });
        }
        else if ((iconType === "default"  || !currentState.icon) && folders[folderId]) {
            delete folders[folderId];
            Settings.update({ folders });
        }
        return result;
    };
    const { icon = null, always = false } = Settings.current.folders[folderId] ?? {};
    context.setState({
        iconType: icon ? "custom"  : "default" ,
        icon,
        always,
    });
};
const renderFolderSettingsPatch = ({ context, result, }) => {
    if (!SettingItem || !RadioInput) {
        warn("Unable to patch FolderSettings: missing modal components");
        return;
    }
    const { props: { folderId }, state, } = context;
    const iconType = state.iconType ?? (state.icon ? "custom"  : "default" );
    const [parent] = queryTreeForParent(result, (node) => node?.type === TextInput);
    if (!parent) {
        warn("Unable to find text input parent");
        return;
    }
    const { children } = parent.props;
    children.push(React.createElement(SettingItem, { id: "iconType", name: "Icon" },
        React.createElement(RadioInput, { key: iconType, name: "Icon", value: iconType, options: [
                { value: "default" , name: "Default Icon" },
                { value: "custom" , name: "Custom Icon" },
            ], onChange: (value) => context.setState({ iconType: value }) })));
    if (iconType === "custom" ) {
        const tree = SortedGuildStore.getGuildsTree();
        children.push(React.createElement(SettingItem, { id: "customIcon", name: "Custom Icon" },
            React.createElement(BetterFolderUploader, { icon: state.icon ?? "", always: state.always, folderNode: tree.nodes[folderId], onChange: ({ icon, always }) => context.setState({ icon, always }) })));
    }
};

const guildStyles = byKeys(["guilds", "base"]);
const folderListItemPrefix = "guildsnav___";
const customIconSelector = "[data-better-folders-custom-icon]";
let syncFrame = null;
let folderObserver = null;
let removeSettingsListener = null;
const getGuildsOwner = () => {
    const node = document.getElementsByClassName(guildStyles.guilds)?.[0];
    if (node) {
        const owner = findOwner(getFiber(node));
        if (!owner) {
            warn("Unable to find guilds owner");
        }
        return owner;
    }
    else {
        warn("Unable to find guilds node");
    }
    return null;
};
const triggerRerender = async (guildsFiber) => {
    if (guildsFiber && (await forceFullRerender(guildsFiber))) {
        console.log("Rerendered guilds");
    }
    else {
        console.warn("Unable to rerender guilds");
    }
};
const getFolderId = (button) => {
    const listItemId = button.getAttribute("data-list-item-id");
    if (!listItemId?.startsWith(folderListItemPrefix)) {
        return null;
    }
    const folderId = Number(listItemId.slice(folderListItemPrefix.length));
    return Number.isFinite(folderId) ? folderId : null;
};
const resetIconContainer = (container) => {
    const customIcon = container?.querySelector(customIconSelector);
    customIcon?.remove();
    for (const child of Array.from(container?.children ?? [])) {
        child.style.display = "";
    }
};
const getFolderFrame = (button) => {
    return Array.from(button.children).find((child) => {
        if (!(child instanceof HTMLElement)) {
            return false;
        }
        return child.className.includes("wrapper_") && Boolean(child.style.width || child.style.height);
    }) ?? null;
};
const hasRenderedFolderSize = (frame) => {
    const rect = frame.getBoundingClientRect();
    const width = rect.width || Number.parseFloat(frame.style.width);
    const height = rect.height || Number.parseFloat(frame.style.height);
    return width > 0 && height > 0;
};
const resetIconFrame = (frame) => {
    resetIconContainer(frame);
    if (frame?.dataset.betterFoldersPositioned) {
        frame.style.position = "";
        delete frame.dataset.betterFoldersPositioned;
    }
};
const applyIconFrame = (frame, icon, enabled) => {
    if (!frame) {
        return;
    }
    if (!enabled) {
        resetIconFrame(frame);
        return;
    }
    if (!hasRenderedFolderSize(frame)) {
        resetIconFrame(frame);
        return;
    }
    if (!frame.style.position) {
        frame.dataset.betterFoldersPositioned = "true";
        frame.style.position = "relative";
    }
    let customIcon = Array.from(frame.children)
        .find((child) => child instanceof HTMLElement && child.matches(customIconSelector)) ?? null;
    if (!customIcon) {
        customIcon = document.createElement("div");
        customIcon.className = styles.customIcon;
        customIcon.setAttribute("data-better-folders-custom-icon", "true");
        frame.append(customIcon);
    }
    customIcon.style.backgroundImage = `url(${icon})`;
    for (const child of Array.from(frame.children)) {
        if (child !== customIcon) {
            child.style.display = "none";
        }
    }
};
const syncFolderButton = (button) => {
    const folderId = getFolderId(button);
    if (!folderId) {
        return;
    }
    const data = Settings.current.folders[folderId];
    const frame = getFolderFrame(button);
    const content = button.querySelector('[class*="folderButtonContent"]');
    const iconWrapper = button.querySelector('[class*="folderIconWrapper"]');
    const previewWrapper = button.querySelector('[class*="folderPreviewWrapper"]');
    const expanded = button.getAttribute("aria-expanded") === "true";
    resetIconContainer(content);
    resetIconContainer(iconWrapper);
    resetIconContainer(previewWrapper);
    if (!data?.icon) {
        resetIconFrame(frame);
        return;
    }
    applyIconFrame(frame, data.icon, data.always || expanded);
};
const syncFolderIcons = () => {
    document.querySelectorAll(`[data-list-item-id^="${folderListItemPrefix}"][aria-owns^="folder-items-"]`)
        .forEach(syncFolderButton);
};
const scheduleFolderIconSync = () => {
    if (syncFrame !== null) {
        return;
    }
    syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        syncFolderIcons();
    });
};
const stopFolderIconSync = () => {
    if (syncFrame !== null) {
        window.cancelAnimationFrame(syncFrame);
        syncFrame = null;
    }
    folderObserver?.disconnect();
    folderObserver = null;
    removeSettingsListener?.();
    removeSettingsListener = null;
    document.querySelectorAll(`[data-list-item-id^="${folderListItemPrefix}"][aria-owns^="folder-items-"]`)
        .forEach((button) => {
        resetIconFrame(getFolderFrame(button));
        resetIconContainer(button.querySelector('[class*="folderButtonContent"]'));
        resetIconContainer(button.querySelector('[class*="folderIconWrapper"]'));
        resetIconContainer(button.querySelector('[class*="folderPreviewWrapper"]'));
    });
};
const startFolderIconSync = () => {
    stopFolderIconSync();
    syncFolderIcons();
    removeSettingsListener = Settings.addListenerEffect(() => scheduleFolderIconSync());
    folderObserver = new MutationObserver(() => scheduleFolderIconSync());
    folderObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-expanded", "aria-owns", "class", "data-list-item-id"],
    });
};
const index = createPlugin({
    start() {
        const guildsOwner = getGuildsOwner();
        startFolderIconSync();
        triggerRerender(guildsOwner);
        after(ClientActions, "toggleGuildFolderExpand", ({ original, args: [folderId] }) => {
            if (Settings.current.closeOnOpen) {
                for (const id of ExpandedGuildFolderStore.getExpandedFolders()) {
                    if (id !== folderId) {
                        original(id);
                    }
                }
            }
        });
        waitForChecked(bySource$1(".folderName", ".onClose"), { entries: true }, (FolderSettings) => {
            after(FolderSettings.prototype, "render", renderFolderSettingsPatch, {
                name: "FolderSettings render",
            });
            const originalComponentDidMount = FolderSettings.prototype.componentDidMount;
            if (!(originalComponentDidMount instanceof Function)) {
                const componentDidMountNoop = function componentDidMountNoop() { };
                FolderSettings.prototype.componentDidMount = componentDidMountNoop;
                addManual(() => {
                    if (originalComponentDidMount === undefined) {
                        delete FolderSettings.prototype.componentDidMount;
                    }
                    else {
                        FolderSettings.prototype.componentDidMount = originalComponentDidMount;
                    }
                });
            }
            after(FolderSettings.prototype, "componentDidMount", mountFolderSettingsPatch, {
                name: "FolderSettings mount",
            });
        });
    },
    stop() {
        stopFolderIconSync();
        triggerRerender(getGuildsOwner());
    },
    styles: css,
    Settings,
    SettingsPanel: () => {
        const [{ closeOnOpen }, setSettings] = Settings.useState();
        return (React.createElement(SettingItem, { id: "closeOnOpen", name: "Close on open", note: "Close other folders when opening a new folder", inline: true },
            React.createElement(SwitchInput, { id: "closeOnOpen", value: closeOnOpen, onChange: (checked) => {
                    if (checked) {
                        for (const id of Array.from(ExpandedGuildFolderStore.getExpandedFolders()).slice(1)) {
                            ClientActions.toggleGuildFolderExpand(id);
                        }
                    }
                    setSettings({ closeOnOpen: checked });
                } })));
    },
});

module.exports = index;

/*@end @*/
