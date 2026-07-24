import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import { FoldableEmbedsSettingsStore } from "./foldableEmbedsSettingsStore";

/**
 * The plugin's settings tab.
 *
 * ONE setting, so deliberately no headings and no restore-defaults affordance: a single
 * toggle already states its own scope, and a heading above a lone row would invent a
 * hierarchy that does not exist.
 */
export class FoldableEmbedsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: FoldableEmbedsSettingsStore,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Start embedded notes collapsed")
			.setDesc("Embedded notes render folded until you expand them. Takes effect the next time a note is rendered.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.get().startCollapsed)
					.onChange(async (startCollapsed) => {
						await this.settings.setStartCollapsed(startCollapsed);
					}),
			);
	}
}
