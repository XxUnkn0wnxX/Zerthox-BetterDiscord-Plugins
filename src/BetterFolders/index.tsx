import { createPlugin, Logger, Filters, Finder, Patcher, Utils, React, Fiber } from "dium";
import { ClientActions, ExpandedGuildFolderStore } from "@dium/modules";
import { BD } from "@dium/components";
import { Settings } from "./settings";
import { FolderSettingsClass, mountFolderSettingsPatch, renderFolderSettingsPatch } from "./settings-modal";
import styles, { css } from "./styles.module.scss";

const guildStyles = Finder.byKeys(["guilds", "base"]);
const folderListItemPrefix = "guildsnav___";
const customIconSelector = "[data-better-folders-custom-icon]";

let syncFrame: number | null = null;
let folderObserver: MutationObserver | null = null;
let removeSettingsListener: (() => void) | null = null;

const getGuildsOwner = () => {
    const node = document.getElementsByClassName(guildStyles.guilds)?.[0];
    if (node) {
        const owner = Utils.findOwner(Utils.getFiber(node));
        if (!owner) {
            Logger.warn("Unable to find guilds owner");
        }
        return owner;
    } else {
        Logger.warn("Unable to find guilds node");
    }
    return null;
};

const triggerRerender = async (guildsFiber: Fiber | null) => {
    if (guildsFiber && (await Utils.forceFullRerender(guildsFiber))) {
        console.log("Rerendered guilds");
    } else {
        console.warn("Unable to rerender guilds");
    }
};

const getFolderId = (button: Element): number | null => {
    const listItemId = button.getAttribute("data-list-item-id");
    if (!listItemId?.startsWith(folderListItemPrefix)) {
        return null;
    }

    const folderId = Number(listItemId.slice(folderListItemPrefix.length));
    return Number.isFinite(folderId) ? folderId : null;
};

const resetIconContainer = (container: Element | null): void => {
    const customIcon = container?.querySelector(customIconSelector);
    customIcon?.remove();
    for (const child of Array.from(container?.children ?? [])) {
        (child as HTMLElement).style.display = "";
    }
};

const getFolderFrame = (button: Element): HTMLElement | null => {
    return Array.from(button.children).find((child): child is HTMLElement => {
        if (!(child instanceof HTMLElement)) {
            return false;
        }

        return child.className.includes("wrapper_") && Boolean(child.style.width || child.style.height);
    }) ?? null;
};

const hasRenderedFolderSize = (frame: HTMLElement): boolean => {
    const rect = frame.getBoundingClientRect();
    const width = rect.width || Number.parseFloat(frame.style.width);
    const height = rect.height || Number.parseFloat(frame.style.height);
    return width > 0 && height > 0;
};

const resetIconFrame = (frame: HTMLElement | null): void => {
    resetIconContainer(frame);
    if (frame?.dataset.betterFoldersPositioned) {
        frame.style.position = "";
        delete frame.dataset.betterFoldersPositioned;
    }
};

const applyIconFrame = (
    frame: HTMLElement | null,
    icon: string,
    enabled: boolean,
): void => {
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
        .find((child): child is HTMLElement => child instanceof HTMLElement && child.matches(customIconSelector)) ?? null;
    if (!customIcon) {
        customIcon = document.createElement("div");
        customIcon.className = styles.customIcon;
        customIcon.setAttribute("data-better-folders-custom-icon", "true");
        frame.append(customIcon);
    }

    customIcon.style.backgroundImage = `url(${icon})`;
    for (const child of Array.from(frame.children)) {
        if (child !== customIcon) {
            (child as HTMLElement).style.display = "none";
        }
    }
};

const syncFolderButton = (button: Element): void => {
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

const syncFolderIcons = (): void => {
    document.querySelectorAll(`[data-list-item-id^="${folderListItemPrefix}"][aria-owns^="folder-items-"]`)
        .forEach(syncFolderButton);
};

const scheduleFolderIconSync = (): void => {
    if (syncFrame !== null) {
        return;
    }

    syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        syncFolderIcons();
    });
};

const stopFolderIconSync = (): void => {
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

const startFolderIconSync = (): void => {
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

export default createPlugin({
    start() {
        const guildsOwner = getGuildsOwner();
        startFolderIconSync();
        triggerRerender(guildsOwner);

        // patch folder expand
        Patcher.after(ClientActions, "toggleGuildFolderExpand", ({ original, args: [folderId] }) => {
            if (Settings.current.closeOnOpen) {
                for (const id of ExpandedGuildFolderStore.getExpandedFolders()) {
                    if (id !== folderId) {
                        original(id);
                    }
                }
            }
        });

        // patch folder settings class
        Finder.waitForChecked(
            Filters.bySource(".folderName", ".onClose"),
            { entries: true },
            (FolderSettings: FolderSettingsClass) => {
                Patcher.after(FolderSettings.prototype, "render", renderFolderSettingsPatch, {
                    name: "FolderSettings render",
                });
                Patcher.after(FolderSettings.prototype, "componentDidMount", mountFolderSettingsPatch, {
                    name: "FolderSettings mount",
                    force: true,
                });
            },
        );
    },
    stop() {
        stopFolderIconSync();
        triggerRerender(getGuildsOwner());
    },
    styles: css,
    Settings,
    SettingsPanel: () => {
        const [{ closeOnOpen }, setSettings] = Settings.useState();

        return (
            <BD.SettingItem
                id="closeOnOpen"
                name="Close on open"
                note="Close other folders when opening a new folder"
                inline
            >
                <BD.SwitchInput
                    id="closeOnOpen"
                    value={closeOnOpen}
                    onChange={(checked) => {
                        if (checked) {
                            // close all folders except one
                            for (const id of Array.from(ExpandedGuildFolderStore.getExpandedFolders()).slice(1)) {
                                ClientActions.toggleGuildFolderExpand(id);
                            }
                        }
                        setSettings({ closeOnOpen: checked });
                    }}
                />
            </BD.SettingItem>
        );
    },
});
