import { React } from "dium";
import { GuildsTreeFolder } from "@dium/modules";
import { BD, Flex, Button, ImageInput, margins } from "@dium/components";
import { FolderData } from "./settings";
import { renderIcon } from "./icon";

export interface BetterFolderUploaderProps extends FolderData {
    folderNode: GuildsTreeFolder;
    onChange(data: FolderData): void;
}

export const BetterFolderUploader = ({ icon, always, onChange }: BetterFolderUploaderProps): React.JSX.Element => {
    const Components = {
        Flex: Flex as typeof Flex | undefined,
        Button: Button as typeof Button | undefined,
        SwitchInput: BD.SwitchInput as typeof BD.SwitchInput | undefined,
        Text: BD.Text as React.ComponentType<any> | undefined,
        ImageInput: ImageInput as typeof ImageInput | undefined,
        margins: margins as typeof margins | undefined,
        SettingItem: BD.SettingItem as typeof BD.SettingItem | undefined,
    };

    return (
        <>
        {Components.Flex && Components.Button && Components.ImageInput && Components.Text && Components.margins
            ? (
                <Components.Flex align={Components.Flex.Align.CENTER} className={Components.margins.marginBottom20}>
                    <Components.Button color={Components.Button.Colors.WHITE} look={Components.Button.Looks.OUTLINED}>
                        Upload Image
                        <Components.ImageInput onChange={(img: string) => onChange({ icon: img, always })} />
                    </Components.Button>
                    <Components.Text variant="text-sm/normal" style={{ color: "var(--text-muted)", margin: "0 10px 0 40px" }}>
                        Preview:
                    </Components.Text>
                    {renderIcon({ icon, always: true })}
                </Components.Flex>
            )
            : renderIcon({ icon, always: true })}
        {Components.SwitchInput && Components.SettingItem
            ? (
                <Components.SettingItem id="alwaysDisplayIcon" name="Always display icon" inline>
                    <Components.SwitchInput
                        id="alwaysDisplayIcon"
                        value={always}
                        onChange={(checked) => onChange({ icon, always: checked })}
                    />
                </Components.SettingItem>
            )
            : null}
        </>
    );
};
