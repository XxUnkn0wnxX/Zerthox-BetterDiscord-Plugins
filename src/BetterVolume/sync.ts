import { Finder, Filters, Flux, Logger } from "dium";
import { Snowflake, Dispatcher, MediaEngineContext, AudioConvert } from "@dium/modules";
import { Settings, updateVolumeOverride as updateVolumeOverride, tryResetVolumeOverride } from "./settings";
import { Exports } from "@dium/require";

const enum ActionType {
    POST_CONNECTION_OPEN = "POST_CONNECTION_OPEN",
    AUDIO_SET_LOCAL_VOLUME = "AUDIO_SET_LOCAL_VOLUME",
    USER_SETTINGS_PROTO_UPDATE = "USER_SETTINGS_PROTO_UPDATE",
}

const MAX_VOLUME_PERC = 200;

const MAX_VOLUME_AMP = AudioConvert.perceptualToAmplitude(MAX_VOLUME_PERC);

export const dispatchVolumeOverrides = (): void => {
    Logger.log("Dispatching volume overrides");
    for (const [userId, contexts] of Object.entries(Settings.current.volumeOverrides)) {
        for (const [context, volume] of Object.entries(contexts)) {
            Dispatcher.dispatch<SetVolumeAction>({
                type: ActionType.AUDIO_SET_LOCAL_VOLUME,
                userId,
                context,
                volume,
            });
        }
    }
};

interface SetVolumeAction extends Flux.Action {
    type: ActionType.AUDIO_SET_LOCAL_VOLUME;
    userId: Snowflake;
    volume: number;
    context: MediaEngineContext;
}

const findAudioSettingsManager = (): AudioSettingsManager => {
    const hasSetVolume = Filters.byKeys(ActionType.AUDIO_SET_LOCAL_VOLUME);
    return Finder.find((exported: Exports) => exported.actions && hasSetVolume(exported.actions));
};

const handleAudioSettingsManager = (AudioSettingsManager: AudioSettingsManager): void => {
    const action = ActionType.AUDIO_SET_LOCAL_VOLUME;
    const original = AudioSettingsManager.actions[action];
    if (typeof original !== "function") {
        Logger.warn(`AudioSettingsManager ${ActionType.AUDIO_SET_LOCAL_VOLUME} handler not present`);
        return;
    }

    const subscriptions = Dispatcher._subscriptions[action];
    const binding = volumeHandlerBinding;

    // A connection event can arrive again while our wrapper remains installed.
    // Confirm both function identity and dispatcher membership before reusing it.
    if (binding?.original === original && subscriptions?.has(binding.wrapped)) {
        if (subscriptions.has(original)) {
            Dispatcher.unsubscribe(action, original);
        }
        syncVolumeOverrides();
        return;
    }

    if (!subscriptions?.has(original)) {
        Logger.warn(`AudioSettingsManager ${ActionType.AUDIO_SET_LOCAL_VOLUME} handler not present`);
        return;
    }

    const wrapped = createWrappedSettingsManagerHandler(original);
    const swapped = trySwapHandler(action, original, wrapped);
    if (!swapped || !hasSubscription(action, wrapped) || hasSubscription(action, original)) {
        if (hasSubscription(action, wrapped)) {
            Dispatcher.unsubscribe(action, wrapped);
        }
        if (!hasSubscription(action, original)) {
            Dispatcher.subscribe(action, original);
        }
        Logger.warn(`AudioSettingsManager ${ActionType.AUDIO_SET_LOCAL_VOLUME} handler not present`);
        return;
    }

    // Retire the previous wrapper after confirming its replacement is installed.
    if (binding && hasSubscription(action, binding.wrapped)) {
        Dispatcher.unsubscribe(action, binding.wrapped);
    }

    volumeHandlerBinding = { original, wrapped };
    Logger.log(`Replaced AudioSettingsManager ${ActionType.AUDIO_SET_LOCAL_VOLUME} handler`);
    syncVolumeOverrides();
};

const syncVolumeOverrides = (): void => {
    dispatchVolumeOverrides();
    if (subscribeOnce(ActionType.USER_SETTINGS_PROTO_UPDATE, dispatchVolumeOverrides)) {
        Logger.log(`Subscribed to ${ActionType.USER_SETTINGS_PROTO_UPDATE} events`);
    }
};

const postConnectionOpenHandler = (_action: Flux.Action): void => {
    Logger.log(`Received ${ActionType.POST_CONNECTION_OPEN}`);

    const AudioSettingsManager = findAudioSettingsManager();
    if (AudioSettingsManager) {
        handleAudioSettingsManager(AudioSettingsManager);
    } else {
        Logger.warn("Failed to find AudioSettingsManager");
    }
};

interface AudioSettingsManager {
    actions: Record<string, Flux.ActionHandler> & {
        AUDIO_SET_LOCAL_VOLUME: Flux.ActionHandler<SetVolumeAction>;
    };
    initializedCount: number;
    stores: Map<any, any>;
}

interface VolumeHandlerBinding {
    original: Flux.ActionHandler<SetVolumeAction>;
    wrapped: Flux.ActionHandler<SetVolumeAction>;
}

let volumeHandlerBinding: VolumeHandlerBinding | null = null;

const createWrappedSettingsManagerHandler = (
    originalHandler: Flux.ActionHandler<SetVolumeAction>,
): Flux.ActionHandler<SetVolumeAction> => (action) => {
    const { userId, volume, context } = action;
    const isOverride = volume > MAX_VOLUME_AMP;
    if (isOverride) {
        const isNew = updateVolumeOverride(userId, volume, context);
        if (isNew) {
            Logger.log(
                `New volume override ${AudioConvert.amplitudeToPerceptual(volume)} for user ${userId} context ${context}`,
            );
            originalHandler({ ...action, volume: MAX_VOLUME_AMP });
        }
    } else {
        const wasRemoved = tryResetVolumeOverride(userId, context);
        if (wasRemoved) {
            Logger.log(`Removed volume override for user ${userId} context ${context}`);
        }
        originalHandler(action);
    }
};

const hasSubscription = (action: string, handler: Flux.ActionHandler): boolean =>
    Dispatcher._subscriptions[action]?.has(handler) ?? false;

const subscribeOnce = (action: string, handler: Flux.ActionHandler): boolean => {
    const wasSubscribed = hasSubscription(action, handler);
    if (!wasSubscribed) Dispatcher.subscribe(action, handler);
    return !wasSubscribed && hasSubscription(action, handler);
};

const trySwapHandler = <A extends Flux.Action>(
    action: Flux.Action["type"],
    prev: Flux.ActionHandler<A>,
    next: Flux.ActionHandler<A>,
): boolean => {
    const isPresent = Dispatcher._subscriptions[action]?.has(prev) ?? false;
    if (isPresent) {
        Dispatcher.unsubscribe(action, prev);
        Dispatcher.subscribe(action, next);
    }
    return isPresent;
};

export const handleVolumeSync = (): void => {
    if (subscribeOnce(ActionType.POST_CONNECTION_OPEN, postConnectionOpenHandler)) {
        Logger.log(`Subscribed to ${ActionType.POST_CONNECTION_OPEN} events`);
    }

    const AudioSettingsManager = findAudioSettingsManager();
    if (AudioSettingsManager) {
        handleAudioSettingsManager(AudioSettingsManager);
    } else {
        Logger.log(`AudioSettingsManager not found, waiting for ${ActionType.POST_CONNECTION_OPEN}`);
    }
};

export const resetVolumeSync = (): void => {
    if (hasSubscription(ActionType.POST_CONNECTION_OPEN, postConnectionOpenHandler)) {
        Dispatcher.unsubscribe(ActionType.POST_CONNECTION_OPEN, postConnectionOpenHandler);
    }
    Logger.log(`Unsubscribed from ${ActionType.POST_CONNECTION_OPEN} events`);

    if (hasSubscription(ActionType.USER_SETTINGS_PROTO_UPDATE, dispatchVolumeOverrides)) {
        Dispatcher.unsubscribe(ActionType.USER_SETTINGS_PROTO_UPDATE, dispatchVolumeOverrides);
    }
    Logger.log(`Unsubscribed from ${ActionType.USER_SETTINGS_PROTO_UPDATE} events`);

    const binding = volumeHandlerBinding;
    if (binding && hasSubscription(ActionType.AUDIO_SET_LOCAL_VOLUME, binding.wrapped)) {
        Dispatcher.unsubscribe(ActionType.AUDIO_SET_LOCAL_VOLUME, binding.wrapped);
        if (!hasSubscription(ActionType.AUDIO_SET_LOCAL_VOLUME, binding.original)) {
            Dispatcher.subscribe(ActionType.AUDIO_SET_LOCAL_VOLUME, binding.original);
        }
        Logger.log(`Reset ${ActionType.AUDIO_SET_LOCAL_VOLUME} handler`);
    }
    volumeHandlerBinding = null;
};
