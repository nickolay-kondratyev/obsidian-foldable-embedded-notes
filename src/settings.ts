import { App, PluginSettingTab, Setting } from 'obsidian';
import FoldableEmbeddedNotesPlugin from './main';

export interface FoldableEmbeddedNotesSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: FoldableEmbeddedNotesSettings = {
	mySetting: 'default',
};

export class FoldableEmbeddedNotesSettingTab extends PluginSettingTab {
	plugin: FoldableEmbeddedNotesPlugin;

	constructor(app: App, plugin: FoldableEmbeddedNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
