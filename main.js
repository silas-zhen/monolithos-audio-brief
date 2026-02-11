var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AudioBriefPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/views/AudioView.ts
var import_obsidian = require("obsidian");
var AUDIO_VIEW_TYPE = "audio-brief-view";
var API_ENDPOINT = "/audio/brief";
var AUDIO_FOLDER = "MONOLITHOS_Audio";
var STATE_FILE = `${AUDIO_FOLDER}/audio-state.json`;
var HISTORY_FILE = `${AUDIO_FOLDER}/audio-history.json`;
var LANGUAGES = [
  { label: "Chinese (Mandarin)", value: "cn" },
  { label: "English", value: "en" },
  { label: "Chinese (Simplified)", value: "zh-CN" },
  { label: "Chinese (Traditional)", value: "zh-TW" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
  { label: "Portuguese", value: "pt" },
  { label: "Arabic", value: "ar" },
  { label: "Russian", value: "ru" }
];
var PROTOCOLS = [
  { label: "Deep Trace", value: "deep" },
  { label: "Boardroom", value: "boardroom" },
  { label: "Briefing", value: "brief" },
  { label: "Roast", value: "roast" }
];
var MAX_FILES = 5;
var REQUEST_TIMEOUT = 6e5;
var AudioView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.themeObserver = null;
    this.clickOutsideHandler = null;
    // State
    this.state = {
      selectedFiles: [],
      language: "en",
      protocol: "deep",
      inputText: "",
      status: "idle",
      lastPlayedFile: null,
      lastPlayedTitle: null,
      lastPlayedDuration: 0,
      generatingStartTime: null
    };
    this.history = [];
    this.audioUnsubscribers = [];
    // UI Elements
    this.logoImg = null;
    this.fileTagsContainer = null;
    this.languageLabel = null;
    this.languageDropdown = null;
    this.protocolButtons = /* @__PURE__ */ new Map();
    this.inputField = null;
    this.transmitBtn = null;
    this.playerContainer = null;
    this.historyDropdown = null;
    this.visualImg = null;
    this.progressFill = null;
    this.progressThumb = null;
    this.currentTimeEl = null;
    this.durationEl = null;
    this.playerTitleEl = null;
    this.playBtn = null;
    // Inline file search
    this.fileSearchMenu = null;
    this.fileSearchInput = null;
    this.fileSearchResults = null;
    this.isMobile = false;
    // ✦ Mastered toggle
    this.masteredToggle = null;
    this.masteredLabel = null;
    this.plugin = plugin;
    this.isMobile = this.app.isMobile || window.innerWidth < 768;
  }
  getViewType() {
    return AUDIO_VIEW_TYPE;
  }
  getDisplayText() {
    return "Audio Brief";
  }
  getIcon() {
    return "audio-lines";
  }
  // ═══════════════════════════════════════════════════════════════════════
  // ASSET PATH
  // ═══════════════════════════════════════════════════════════════════════
  getAssetUrl(filename) {
    const adapter = this.app.vault.adapter;
    const pluginDir = this.plugin.manifest.dir;
    const relativePath = `${pluginDir}/assets/${filename}`;
    if (typeof adapter.getResourcePath === "function") {
      return adapter.getResourcePath(relativePath);
    }
    const basePath = adapter.basePath || "";
    return `app://local/${encodeURIComponent(basePath + "/" + relativePath).replace(/%2F/g, "/")}`;
  }
  // ═══════════════════════════════════════════════════════════════════════
  // STATE PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════
  async loadState() {
    try {
      const file = this.app.vault.getAbstractFileByPath(STATE_FILE);
      if (file instanceof import_obsidian.TFile) {
        const content = await this.app.vault.read(file);
        const parsed = JSON.parse(content);
        this.state = { ...this.state, ...parsed };
        if (this.state.status === "generating" && this.state.generatingStartTime) {
          const elapsed = Date.now() - this.state.generatingStartTime;
          if (elapsed > 15 * 60 * 1e3) {
            this.state.status = "idle";
            this.state.generatingStartTime = null;
          }
        }
      }
    } catch (e) {
      console.log("[Audio Brief] No saved state found, using defaults");
    }
  }
  async saveState() {
    try {
      await this.ensureAudioFolder();
      const content = JSON.stringify(this.state, null, 2);
      const file = this.app.vault.getAbstractFileByPath(STATE_FILE);
      if (file instanceof import_obsidian.TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(STATE_FILE, content);
      }
    } catch (e) {
      console.error("[Audio Brief] Failed to save state:", e);
    }
  }
  async loadHistory() {
    try {
      const file = this.app.vault.getAbstractFileByPath(HISTORY_FILE);
      if (file instanceof import_obsidian.TFile) {
        const content = await this.app.vault.read(file);
        this.history = JSON.parse(content);
      }
    } catch (e) {
      this.history = [];
    }
  }
  async saveHistory() {
    try {
      if (this.history.length > 50)
        this.history = this.history.slice(0, 50);
      await this.ensureAudioFolder();
      const content = JSON.stringify(this.history, null, 2);
      const file = this.app.vault.getAbstractFileByPath(HISTORY_FILE);
      if (file instanceof import_obsidian.TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(HISTORY_FILE, content);
      }
    } catch (e) {
      console.error("[Audio Brief] Failed to save history:", e);
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("audio-brief-container");
    await this.ensureAudioFolder();
    await this.loadState();
    await this.loadHistory();
    this.renderTopSpacer(container);
    this.renderHeader(container);
    this.renderMainContent(container);
    this.renderBottomSection(container);
    this.renderHistoryDropdown(container);
    this.renderLanguageDropdown(container);
    this.setupThemeObserver();
    this.setupClickOutsideHandler();
    this.setupAudioManagerListeners();
    this.updateIconsForTheme();
    this.restoreUIState();
    await this.loadLastPlayedAudio();
    this.syncUIWithAudioState();
  }
  async onClose() {
    await this.saveState();
    if (this.themeObserver)
      this.themeObserver.disconnect();
    if (this.clickOutsideHandler) {
      document.removeEventListener("click", this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    this.audioUnsubscribers.forEach((unsub) => unsub());
    this.audioUnsubscribers = [];
  }
  async ensureAudioFolder() {
    const folder = this.app.vault.getAbstractFileByPath(AUDIO_FOLDER);
    if (!folder)
      await this.app.vault.createFolder(AUDIO_FOLDER);
  }
  // ═══════════════════════════════════════════════════════════════════════
  // UI RENDERING
  // ═══════════════════════════════════════════════════════════════════════
  renderTopSpacer(container) {
    container.createDiv({ cls: "audio-brief-top-spacer" });
  }
  renderHeader(container) {
    const header = container.createDiv({ cls: "audio-brief-header" });
    this.logoImg = header.createEl("img", { cls: "audio-brief-header-logo" });
    this.logoImg.onclick = () => window.open("https://monolithos.ai", "_blank");
    const rightSection = header.createDiv({ cls: "audio-brief-header-right" });
    rightSection.createDiv({ cls: "audio-brief-header-title", text: "AUDIO BRIEF" });
    const historyBtn = rightSection.createDiv({ cls: "audio-brief-history-btn", text: "[ HISTORY ]" });
    historyBtn.onclick = () => this.toggleHistoryDropdown();
  }
  renderMainContent(container) {
    const main = container.createDiv({ cls: "audio-brief-main" });
    const controlsLayer = main.createDiv({ cls: "audio-brief-controls-layer" });
    const leftControls = controlsLayer.createDiv({ cls: "audio-brief-left-controls" });
    this.fileTagsContainer = leftControls.createDiv({ cls: "audio-brief-file-tags" });
    this.renderFileTags();
    this.fileSearchMenu = leftControls.createDiv({ cls: "audio-brief-file-search-panel" });
    this.fileSearchMenu.style.display = "none";
    this.buildFileSearchMenu();
    const rightControls = controlsLayer.createDiv({ cls: "audio-brief-right-controls" });
    const langRow = rightControls.createDiv({ cls: "audio-brief-lang-row" });
    this.languageLabel = langRow.createSpan({ cls: "audio-brief-lang-label", text: "Language" });
    langRow.createSpan({ cls: "audio-brief-lang-arrow", text: ">" });
    langRow.onclick = () => this.toggleLanguageDropdown();
    rightControls.createDiv({ cls: "audio-brief-protocol-label", text: "Protocol" });
    const protocolBtns = rightControls.createDiv({ cls: "audio-brief-protocol-btns" });
    for (const proto of PROTOCOLS) {
      const btn = protocolBtns.createDiv({ cls: "audio-brief-protocol-btn", text: proto.label });
      if (proto.value === this.state.protocol)
        btn.addClass("selected");
      btn.onclick = () => this.selectProtocol(proto.value);
      this.protocolButtons.set(proto.value, btn);
    }
    this.renderMasteredToggle(rightControls);
    const visualCenter = main.createDiv({ cls: "audio-brief-visual-center" });
    this.visualImg = visualCenter.createEl("img", { cls: "audio-brief-visual-img" });
  }
  renderMasteredToggle(container) {
    const row = container.createDiv({ cls: "audio-brief-mastered-row" });
    const labelSpan = row.createSpan({ cls: "audio-brief-mastered-label", text: "\u2726 Mastered" });
    this.masteredToggle = row.createDiv({ cls: "audio-brief-mastered-toggle" });
    const track = this.masteredToggle.createDiv({ cls: "audio-brief-mastered-track" });
    track.createDiv({ cls: "audio-brief-mastered-thumb" });
    const remaining = this.plugin.settings.masteredRemaining;
    const isAvailable = remaining > 0;
    if (isAvailable && this.plugin.settings.masteredEnabled) {
      this.masteredToggle.addClass("active");
    }
    if (!isAvailable) {
      this.masteredToggle.addClass("disabled");
    }
    this.masteredToggle.onclick = () => {
      if (!isAvailable) {
        new import_obsidian.Notice("No \u2726 Mastered generations remaining this month.");
        return;
      }
      this.plugin.settings.masteredEnabled = !this.plugin.settings.masteredEnabled;
      this.masteredToggle?.toggleClass("active", this.plugin.settings.masteredEnabled);
      this.updateMasteredLabel();
      this.plugin.saveSettings();
    };
    this.masteredLabel = row.createDiv({ cls: "audio-brief-mastered-status" });
    this.updateMasteredLabel();
  }
  updateMasteredLabel() {
    if (!this.masteredLabel)
      return;
    const remaining = this.plugin.settings.masteredRemaining;
    if (remaining === -1) {
      this.masteredLabel.textContent = "\u2726 Unlimited";
      this.masteredLabel.removeClass("exhausted");
    } else if (remaining > 0) {
      this.masteredLabel.textContent = `\u2726 ${remaining} remaining`;
      this.masteredLabel.removeClass("exhausted");
    } else {
      this.masteredLabel.empty();
      this.masteredLabel.textContent = "\u2726 0 remaining \u2192 ";
      const link = this.masteredLabel.createEl("a", { text: "Upgrade", href: "https://audio.monolithos.ai/register" });
      link.setAttr("target", "_blank");
      this.masteredLabel.addClass("exhausted");
    }
  }
  renderBottomSection(container) {
    const bottom = container.createDiv({ cls: "audio-brief-bottom" });
    const inputWrapper = bottom.createDiv({ cls: "audio-brief-input-wrapper" });
    this.inputField = inputWrapper.createEl("textarea", {
      cls: "audio-brief-input",
      attr: { placeholder: "Direct the conversation...", rows: "1" }
    });
    this.inputField.oninput = () => this.handleInputChange();
    this.inputField.onfocus = () => inputWrapper.addClass("focused");
    this.inputField.onblur = () => inputWrapper.removeClass("focused");
    this.transmitBtn = bottom.createDiv({ cls: "audio-brief-transmit-btn", text: "[ TRANSMIT ]" });
    this.transmitBtn.onclick = () => this.handleTransmit();
    this.playerContainer = bottom.createDiv({ cls: "audio-brief-player show" });
    this.renderPlayer();
  }
  renderPlayer() {
    if (!this.playerContainer)
      return;
    const header = this.playerContainer.createDiv({ cls: "audio-brief-player-header" });
    this.currentTimeEl = header.createSpan({ cls: "audio-brief-player-time", text: "0:00" });
    this.playBtn = header.createSpan({ cls: "audio-brief-player-play", text: "\u25B6" });
    this.playBtn.onclick = () => this.togglePlayback();
    this.durationEl = header.createSpan({ cls: "audio-brief-player-time", text: "0:00" });
    const progressTrack = this.playerContainer.createDiv({ cls: "audio-brief-player-progress" });
    this.progressFill = progressTrack.createDiv({ cls: "audio-brief-player-progress-fill" });
    this.progressThumb = progressTrack.createDiv({ cls: "audio-brief-player-progress-thumb" });
    this.setupProgressDrag(progressTrack);
    this.playerTitleEl = this.playerContainer.createDiv({ cls: "audio-brief-player-title", text: "No audio loaded" });
    const downloadBtn = this.playerContainer.createDiv({ cls: "audio-brief-player-download", text: "[ DOWNLOAD ]" });
    downloadBtn.onclick = () => this.downloadCurrentAudio();
  }
  setupProgressDrag(track) {
    let isDragging = false;
    const updateProgress = (clientX) => {
      const audioManager = this.plugin.audioManager;
      if (!audioManager || !audioManager.hasAudio())
        return;
      const rect = track.getBoundingClientRect();
      let pct = (clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      audioManager.seekPercent(pct * 100);
      this.updateProgressUI(pct * 100);
    };
    track.onmousedown = (e) => {
      isDragging = true;
      updateProgress(e.clientX);
    };
    document.addEventListener("mousemove", (e) => {
      if (isDragging)
        updateProgress(e.clientX);
    });
    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
    track.ontouchstart = (e) => {
      isDragging = true;
      if (e.touches[0])
        updateProgress(e.touches[0].clientX);
    };
    document.addEventListener("touchmove", (e) => {
      if (isDragging && e.touches[0])
        updateProgress(e.touches[0].clientX);
    });
    document.addEventListener("touchend", () => {
      isDragging = false;
    });
  }
  renderHistoryDropdown(container) {
    this.historyDropdown = container.createDiv({ cls: "audio-brief-history-dropdown" });
    this.updateHistoryDropdown();
  }
  updateHistoryDropdown() {
    if (!this.historyDropdown)
      return;
    this.historyDropdown.empty();
    if (this.history.length === 0) {
      this.historyDropdown.createDiv({ cls: "audio-brief-history-empty", text: "No history yet" });
      return;
    }
    for (const item of this.history) {
      const historyItem = this.historyDropdown.createDiv({ cls: "audio-brief-history-item" });
      const truncatedTitle = item.title.length > 35 ? item.title.substring(0, 32) + "..." : item.title;
      historyItem.createDiv({ cls: "audio-brief-history-title" }).textContent = truncatedTitle;
      historyItem.createDiv({ cls: "audio-brief-history-info" }).textContent = `${this.formatTime(item.duration)} \xB7 ${item.mode}`;
      historyItem.onclick = () => this.playHistoryItem(item);
    }
  }
  renderLanguageDropdown(container) {
    this.languageDropdown = container.createDiv({ cls: "audio-brief-language-dropdown" });
    for (const lang of LANGUAGES) {
      const item = this.languageDropdown.createDiv({ cls: "audio-brief-language-item", text: lang.label });
      if (lang.value === this.state.language)
        item.addClass("selected");
      item.onclick = () => this.selectLanguage(lang.value, lang.label);
    }
  }
  renderFileTags() {
    if (!this.fileTagsContainer)
      return;
    this.fileTagsContainer.empty();
    for (const filePath of this.state.selectedFiles) {
      const tag = this.fileTagsContainer.createDiv({ cls: "audio-brief-file-tag" });
      const name = filePath.split("/").pop() || filePath;
      tag.createSpan({ cls: "audio-brief-file-tag-icon", text: "@" });
      tag.createSpan({ cls: "audio-brief-file-tag-name", text: name });
      const removeBtn = tag.createSpan({ cls: "audio-brief-file-tag-remove", text: "\xD7" });
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeFile(filePath);
      };
    }
    if (this.state.selectedFiles.length < MAX_FILES) {
      const addBtn = this.fileTagsContainer.createDiv({ cls: "audio-brief-add-file" });
      addBtn.createSpan({ cls: "audio-brief-add-file-icon", text: "@" });
      addBtn.createSpan({ cls: "audio-brief-add-file-text", text: "File" });
      addBtn.onclick = () => this.openFileSelector();
    }
  }
  restoreUIState() {
    const langItem = LANGUAGES.find((l) => l.value === this.state.language);
    if (langItem && this.languageLabel)
      this.languageLabel.textContent = langItem.label;
    if (this.inputField && this.state.inputText) {
      this.inputField.value = this.state.inputText;
      const wrapper = this.inputField.closest(".audio-brief-input-wrapper");
      if (wrapper && this.state.inputText.length > 0)
        wrapper.addClass("has-content");
    }
    this.renderFileTags();
    if (this.state.lastPlayedTitle && this.playerTitleEl)
      this.playerTitleEl.textContent = this.state.lastPlayedTitle;
    if (this.state.lastPlayedDuration > 0 && this.durationEl)
      this.durationEl.textContent = this.formatTime(this.state.lastPlayedDuration);
    if (this.state.status === "generating" && this.transmitBtn) {
      this.transmitBtn.textContent = "[ GENERATING... ]";
      this.transmitBtn.addClass("loading");
    }
  }
  setupClickOutsideHandler() {
    this.clickOutsideHandler = (e) => {
      const target = e.target;
      if (this.languageDropdown?.hasClass("show")) {
        if (!this.languageDropdown.contains(target) && !target.closest(".audio-brief-lang-row")) {
          this.languageDropdown.removeClass("show");
        }
      }
      if (this.historyDropdown?.hasClass("show")) {
        if (!this.historyDropdown.contains(target) && !target.closest(".audio-brief-history-btn")) {
          this.historyDropdown.removeClass("show");
        }
      }
      if (this.fileSearchMenu && this.fileSearchMenu.style.display !== "none") {
        if (!this.fileSearchMenu.contains(target) && !target.closest(".audio-brief-add-file")) {
          this.hideFileSearch();
        }
      }
    };
    document.addEventListener("click", this.clickOutsideHandler);
  }
  // ═══════════════════════════════════════════════════════════════════════
  // THEME
  // ═══════════════════════════════════════════════════════════════════════
  setupThemeObserver() {
    this.themeObserver = new MutationObserver(() => this.updateIconsForTheme());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  updateIconsForTheme() {
    const isLight = document.body.classList.contains("theme-light");
    if (this.logoImg) {
      this.logoImg.src = this.getAssetUrl(isLight ? "logo_black.png" : "logo.png");
    }
    if (this.visualImg) {
      this.visualImg.src = this.getAssetUrl(isLight ? "bg_audio_dark.png" : "bg_audio.png");
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // FILE SELECTION
  // ═══════════════════════════════════════════════════════════════════════
  openFileSelector() {
    if (this.state.selectedFiles.length >= MAX_FILES) {
      new import_obsidian.Notice(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }
    this.showFileSearch();
  }
  buildFileSearchMenu() {
    if (!this.fileSearchMenu)
      return;
    this.fileSearchMenu.empty();
    this.fileSearchInput = this.fileSearchMenu.createEl("input", {
      cls: "audio-brief-file-search-input",
      attr: { type: "text", placeholder: "Search files...", autocomplete: "off" }
    });
    this.fileSearchInput.style.cssText = "width:100%;min-width:200px;box-sizing:border-box;";
    this.fileSearchInput.addEventListener("input", () => this.searchFilesAndFolders(this.fileSearchInput.value));
    this.fileSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape")
        this.hideFileSearch();
    });
    this.fileSearchInput.addEventListener("click", (e) => e.stopPropagation());
    this.fileSearchInput.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    this.fileSearchInput.addEventListener("focus", (e) => e.stopPropagation());
    this.fileSearchResults = this.fileSearchMenu.createDiv({ cls: "audio-brief-file-search-results" });
  }
  showFileSearch() {
    if (!this.fileSearchMenu || !this.fileSearchInput)
      return;
    this.fileSearchMenu.style.display = "flex";
    this.fileSearchMenu.classList.add("active");
    this.fileSearchInput.value = "";
    this.searchFilesAndFolders("");
    setTimeout(() => {
      this.fileSearchInput?.focus();
      if (this.isMobile)
        this.fileSearchInput?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
  hideFileSearch() {
    if (!this.fileSearchMenu)
      return;
    this.fileSearchMenu.classList.remove("active");
    this.fileSearchMenu.style.display = "none";
    this.fileSearchInput?.blur();
  }
  searchFilesAndFolders(query) {
    if (!this.fileSearchResults)
      return;
    this.fileSearchResults.empty();
    const results = [];
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && (activeFile.extension === "md" || activeFile.extension === "pdf")) {
      results.push({ item: activeFile, type: "active" });
    }
    const allFiles = this.app.vault.getFiles().filter((f) => f.extension === "md" || f.extension === "pdf");
    const q = query.toLowerCase().trim();
    if (q === "") {
      allFiles.filter((f) => !activeFile || f.path !== activeFile.path).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 15).forEach((f) => results.push({ item: f, type: "file" }));
    } else {
      allFiles.filter((f) => (!activeFile || f.path !== activeFile.path) && (f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))).sort((a, b) => {
        const as = a.basename.toLowerCase().startsWith(q);
        const bs = b.basename.toLowerCase().startsWith(q);
        return as && !bs ? -1 : !as && bs ? 1 : a.basename.localeCompare(b.basename);
      }).slice(0, 15).forEach((f) => results.push({ item: f, type: "file" }));
    }
    if (results.length === 0) {
      this.fileSearchResults.createDiv({ cls: "audio-brief-file-search-empty", text: "No files found" });
      return;
    }
    results.forEach((result) => {
      const item = this.fileSearchResults.createDiv({ cls: "audio-brief-file-search-item" });
      const filePath = result.item.path;
      const isAlreadySelected = this.state.selectedFiles.includes(filePath);
      if (isAlreadySelected)
        item.addClass("selected");
      let icon = "\u{1F4C4}";
      if (result.item.extension === "pdf")
        icon = "\u{1F4D5}";
      else if (result.type === "active")
        icon = "\u2726";
      item.createSpan({ cls: "audio-brief-file-search-icon", text: icon });
      item.createSpan({ cls: "audio-brief-file-search-name", text: result.item.basename });
      const parent = result.item.parent;
      if (parent && parent.path !== "/" && parent.path !== "") {
        item.createSpan({ cls: "audio-brief-file-search-path", text: parent.path });
      }
      if (result.type === "active")
        item.createSpan({ cls: "audio-brief-file-search-tag active", text: "ACTIVE" });
      if (isAlreadySelected)
        item.createSpan({ cls: "audio-brief-file-search-check", text: "\u2713" });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isAlreadySelected) {
          this.state.selectedFiles = this.state.selectedFiles.filter((p) => p !== filePath);
        } else if (this.state.selectedFiles.length < MAX_FILES) {
          this.state.selectedFiles.push(filePath);
        } else {
          new import_obsidian.Notice(`Maximum ${MAX_FILES} files allowed.`);
          return;
        }
        this.renderFileTags();
        this.saveState();
        this.hideFileSearch();
      });
    });
  }
  removeFile(filePath) {
    this.state.selectedFiles = this.state.selectedFiles.filter((f) => f !== filePath);
    this.renderFileTags();
    this.saveState();
  }
  // ═══════════════════════════════════════════════════════════════════════
  // INTERACTION
  // ═══════════════════════════════════════════════════════════════════════
  toggleLanguageDropdown() {
    this.languageDropdown?.toggleClass("show", !this.languageDropdown.hasClass("show"));
    this.historyDropdown?.removeClass("show");
  }
  selectLanguage(value, label) {
    this.state.language = value;
    if (this.languageLabel)
      this.languageLabel.textContent = label;
    this.languageDropdown?.querySelectorAll(".audio-brief-language-item").forEach((item) => {
      item.removeClass("selected");
      if (item.textContent === label)
        item.addClass("selected");
    });
    this.languageDropdown?.removeClass("show");
    this.saveState();
  }
  selectProtocol(value) {
    this.state.protocol = value;
    this.protocolButtons.forEach((btn, v) => btn.toggleClass("selected", v === value));
    this.saveState();
  }
  toggleHistoryDropdown() {
    this.updateHistoryDropdown();
    this.historyDropdown?.toggleClass("show", !this.historyDropdown.hasClass("show"));
    this.languageDropdown?.removeClass("show");
  }
  handleInputChange() {
    if (this.inputField) {
      this.state.inputText = this.inputField.value;
      const wrapper = this.inputField.closest(".audio-brief-input-wrapper");
      wrapper?.toggleClass("has-content", this.inputField.value.length > 0);
      this.saveState();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // AUDIO GENERATION
  // ═══════════════════════════════════════════════════════════════════════
  async handleTransmit() {
    if (this.state.status === "generating")
      return;
    let content = "";
    for (const filePath of this.state.selectedFiles) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof import_obsidian.TFile) {
        if (file.extension === "md") {
          content += "\n\n---\n\n" + await this.app.vault.read(file);
        } else if (file.extension === "pdf") {
          content += `

[PDF: ${file.path}]

`;
        }
      }
    }
    if (!content.trim() && !this.state.inputText.trim()) {
      new import_obsidian.Notice("Please enter a directive or select files.");
      return;
    }
    this.setGeneratingState();
    const submittedText = this.state.inputText;
    this.state.inputText = "";
    if (this.inputField) {
      this.inputField.value = "";
      const wrapper = this.inputField.closest(".audio-brief-input-wrapper");
      wrapper?.removeClass("has-content");
    }
    try {
      const result = await this.generateAudio(content, submittedText);
      if (result.status === "success") {
        const title = result.title || this.extractTitle(result.script, result.mode);
        const filePath = await this.saveAudioToVault(result.audio_base64, title);
        try {
          await this.saveScriptToVault(result.script, filePath, result.mode);
        } catch (e) {
          console.error("[Audio Brief] Failed to save script:", e);
          new import_obsidian.Notice(`Script save failed: ${e.message}`, 1e4);
        }
        if (this.plugin.settings.masteredRemaining === 0) {
          this.plugin.settings.masteredEnabled = false;
          this.masteredToggle?.toggleClass("active", false);
          this.masteredToggle?.addClass("disabled");
          await this.plugin.saveSettings();
        }
        this.updateMasteredLabel();
        this.state.status = "ready";
        this.state.lastPlayedFile = filePath;
        this.state.lastPlayedTitle = title;
        this.state.lastPlayedDuration = result.duration_seconds;
        await this.addToHistory({
          id: Date.now().toString(),
          title,
          duration: result.duration_seconds,
          date: (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          filePath,
          mode: result.mode,
          lang: this.state.language
        });
        this.updatePlayerDisplay(title, result.duration_seconds);
        await this.loadAudioFromVault(filePath);
        new import_obsidian.Notice("Audio generated successfully!");
      } else {
        throw new Error(result.error || "Generation failed");
      }
      this.resetTransmitButton();
      await this.saveState();
    } catch (error) {
      this.state.status = "idle";
      this.resetTransmitButton();
      new import_obsidian.Notice(`Generation failed: ${error.message}`, 1e4);
      await this.saveState();
    }
  }
  setGeneratingState() {
    this.state.status = "generating";
    this.state.generatingStartTime = Date.now();
    if (this.transmitBtn) {
      this.transmitBtn.textContent = "[ GENERATING... ]";
      this.transmitBtn.addClass("loading");
    }
    this.saveState();
  }
  resetTransmitButton() {
    this.state.generatingStartTime = null;
    if (this.transmitBtn) {
      this.transmitBtn.textContent = "[ TRANSMIT ]";
      this.transmitBtn.removeClass("loading");
    }
  }
  async generateAudio(content, instruction = "") {
    const serverUrl = this.plugin.settings.serverUrl || "https://audio.monolithos.ai";
    const apiKey = this.plugin.settings.apiKey || "";
    const url = `${serverUrl}${API_ENDPOINT}`;
    if (!apiKey)
      throw new Error("License key not configured. Please set it in Settings.");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          content,
          mode: this.state.protocol,
          lang: this.state.language,
          instruction,
          tts_tier: this.plugin.settings.masteredEnabled ? "pro" : "flash"
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        if (errData.quota_exhausted) {
          throw new Error(errData.error || "Quota exhausted. Please upgrade.");
        }
        throw new Error(errData.error || "Access denied.");
      }
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (data.quota) {
        if (data.quota.unlimited) {
          this.plugin.settings.masteredRemaining = -1;
          this.plugin.settings.masteredMonthlyQuota = -1;
        } else {
          this.plugin.settings.masteredRemaining = data.quota.mastered_remaining ?? data.quota.remaining;
          this.plugin.settings.masteredMonthlyQuota = data.quota.mastered_limit ?? data.quota.total_limit;
        }
        this.updateMasteredLabel();
        await this.plugin.saveSettings();
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError")
        throw new Error("Request timed out (10 min limit)");
      throw error;
    }
  }
  extractTitle(script, mode) {
    const lines = script.split("\n").filter((l) => l.trim());
    if (lines.length > 0) {
      let firstLine = lines[0].replace(/^(Host_[AB]|Exec_[AB]|Critic_[AB]|Anchor):\s*/i, "");
      if (firstLine.length > 50)
        firstLine = firstLine.substring(0, 47) + "...";
      return firstLine;
    }
    const modeNames = { "deep": "Deep Trace Session", "boardroom": "Boardroom Brief", "brief": "Quick Briefing", "roast": "The Roast" };
    return modeNames[mode] || "Audio Brief";
  }
  async saveAudioToVault(base64, title) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").substring(0, 30);
    const filePath = `${AUDIO_FOLDER}/${safeName}_${timestamp}.wav`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++)
      bytes[i] = binaryString.charCodeAt(i);
    await this.app.vault.createBinary(filePath, bytes);
    return filePath;
  }
  async saveScriptToVault(script, audioFilePath, mode) {
    const mdPath = audioFilePath.replace(/\.wav$/, ".md");
    const modeLabel = { "deep": "Deep Trace", "boardroom": "Boardroom", "brief": "Briefing", "roast": "Roast" };
    const now = /* @__PURE__ */ new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const mdContent = `---
mode: ${modeLabel[mode] || mode}
date: ${dateStr} ${timeStr}
audio: ${audioFilePath.split("/").pop()}
---

${script}
`;
    await this.app.vault.create(mdPath, mdContent);
    return mdPath;
  }
  async addToHistory(item) {
    this.history = this.history.filter((h) => h.filePath !== item.filePath);
    this.history.unshift(item);
    await this.saveHistory();
  }
  // ═══════════════════════════════════════════════════════════════════════
  // AUDIO PLAYBACK
  // ═══════════════════════════════════════════════════════════════════════
  async loadLastPlayedAudio() {
    const audioManager = this.plugin.audioManager;
    if (audioManager && audioManager.hasAudio()) {
      const state = audioManager.getState();
      if (state.filePath === this.state.lastPlayedFile) {
        this.syncUIWithAudioState();
        return;
      }
    }
    if (this.state.lastPlayedFile) {
      try {
        await this.loadAudioFromVault(this.state.lastPlayedFile);
        this.updatePlayerDisplay(this.state.lastPlayedTitle || "Audio", this.state.lastPlayedDuration);
      } catch (e) {
        this.state.lastPlayedFile = null;
        this.state.lastPlayedTitle = null;
        this.state.lastPlayedDuration = 0;
      }
    }
  }
  async loadAudioFromVault(filePath) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof import_obsidian.TFile))
      throw new Error("Audio file not found");
    const arrayBuffer = await this.app.vault.readBinary(file);
    const blob = new Blob([arrayBuffer], { type: "audio/wav" });
    const audioManager = this.plugin.audioManager;
    if (audioManager)
      await audioManager.loadFromBlob(blob, filePath, this.state.lastPlayedTitle || "Audio");
  }
  setupAudioManagerListeners() {
    const audioManager = this.plugin.audioManager;
    if (!audioManager)
      return;
    const unsubTime = audioManager.onTimeUpdate((state) => {
      this.updateProgressUI(state.currentTime / state.duration * 100);
      if (this.currentTimeEl)
        this.currentTimeEl.textContent = this.formatTime(state.currentTime);
    });
    this.audioUnsubscribers.push(unsubTime);
    const unsubEnded = audioManager.onEnded(() => {
      this.state.status = "ready";
      if (this.playBtn)
        this.playBtn.textContent = "\u25B6";
      this.updateProgressUI(0);
    });
    this.audioUnsubscribers.push(unsubEnded);
    const unsubLoaded = audioManager.onLoaded((state) => {
      if (this.durationEl)
        this.durationEl.textContent = this.formatTime(state.duration);
    });
    this.audioUnsubscribers.push(unsubLoaded);
  }
  syncUIWithAudioState() {
    const audioManager = this.plugin.audioManager;
    if (!audioManager || !audioManager.hasAudio())
      return;
    const state = audioManager.getState();
    if (this.playBtn)
      this.playBtn.textContent = state.isPlaying ? "\u2590\u2590" : "\u25B6";
    this.updateProgressUI(state.currentTime / state.duration * 100);
    if (this.currentTimeEl)
      this.currentTimeEl.textContent = this.formatTime(state.currentTime);
    if (this.durationEl)
      this.durationEl.textContent = this.formatTime(state.duration);
    if (this.playerTitleEl && state.title)
      this.playerTitleEl.textContent = state.title;
  }
  updatePlayerDisplay(title, duration) {
    if (this.playerTitleEl)
      this.playerTitleEl.textContent = title;
    if (this.durationEl)
      this.durationEl.textContent = this.formatTime(duration);
    if (this.currentTimeEl)
      this.currentTimeEl.textContent = "0:00";
    this.updateProgressUI(0);
  }
  togglePlayback() {
    const audioManager = this.plugin.audioManager;
    if (!audioManager || !audioManager.hasAudio()) {
      new import_obsidian.Notice("No audio loaded");
      return;
    }
    const state = audioManager.getState();
    if (state.isPlaying) {
      audioManager.pause();
      this.state.status = "paused";
      if (this.playBtn)
        this.playBtn.textContent = "\u25B6";
    } else {
      audioManager.play();
      this.state.status = "playing";
      if (this.playBtn)
        this.playBtn.textContent = "\u2590\u2590";
    }
  }
  updateProgressUI(pct) {
    if (this.progressFill)
      this.progressFill.style.width = `${pct}%`;
    if (this.progressThumb)
      this.progressThumb.style.left = `${pct}%`;
  }
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  async playHistoryItem(item) {
    this.historyDropdown?.removeClass("show");
    try {
      this.state.lastPlayedFile = item.filePath;
      this.state.lastPlayedTitle = item.title;
      this.state.lastPlayedDuration = item.duration;
      await this.loadAudioFromVault(item.filePath);
      this.updatePlayerDisplay(item.title, item.duration);
      this.state.status = "ready";
      await this.saveState();
      const audioManager = this.plugin.audioManager;
      if (audioManager && audioManager.hasAudio()) {
        audioManager.play();
        this.state.status = "playing";
        if (this.playBtn)
          this.playBtn.textContent = "\u2590\u2590";
      }
    } catch (e) {
      new import_obsidian.Notice("Could not load audio file");
    }
  }
  downloadCurrentAudio() {
    if (!this.state.lastPlayedFile) {
      new import_obsidian.Notice("No audio to download");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(this.state.lastPlayedFile);
    if (file instanceof import_obsidian.TFile)
      this.app.openWithDefaultApp(this.state.lastPlayedFile);
  }
};

// src/audio/AudioManager.ts
var AudioManager = class {
  constructor() {
    this.objectUrl = null;
    this.currentFilePath = null;
    this.currentTitle = "";
    this.onTimeUpdateCallbacks = [];
    this.onEndedCallbacks = [];
    this.onLoadedCallbacks = [];
    this.audioElement = new Audio();
    this.setupAudioEvents();
  }
  setupAudioEvents() {
    this.audioElement.ontimeupdate = () => {
      const state = this.getState();
      this.onTimeUpdateCallbacks.forEach((cb) => cb(state));
    };
    this.audioElement.onended = () => {
      const state = this.getState();
      this.onEndedCallbacks.forEach((cb) => cb(state));
    };
    this.audioElement.onloadedmetadata = () => {
      const state = this.getState();
      this.onLoadedCallbacks.forEach((cb) => cb(state));
    };
  }
  async loadFromBlob(blob, filePath, title) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.objectUrl = URL.createObjectURL(blob);
    this.currentFilePath = filePath;
    this.currentTitle = title;
    this.audioElement.src = this.objectUrl;
    return new Promise((resolve) => {
      this.audioElement.onloadedmetadata = () => {
        const state = this.getState();
        this.onLoadedCallbacks.forEach((cb) => cb(state));
        resolve();
      };
    });
  }
  play() {
    if (this.audioElement.src) {
      this.audioElement.play();
    }
  }
  pause() {
    this.audioElement.pause();
  }
  toggle() {
    if (this.audioElement.paused) {
      this.play();
    } else {
      this.pause();
    }
  }
  seek(time) {
    if (this.audioElement.duration) {
      this.audioElement.currentTime = Math.max(0, Math.min(time, this.audioElement.duration));
    }
  }
  seekPercent(percent) {
    if (this.audioElement.duration) {
      const time = percent / 100 * this.audioElement.duration;
      this.seek(time);
    }
  }
  getState() {
    return {
      isPlaying: !this.audioElement.paused,
      currentTime: this.audioElement.currentTime || 0,
      duration: this.audioElement.duration || 0,
      title: this.currentTitle,
      filePath: this.currentFilePath
    };
  }
  hasAudio() {
    return !!this.audioElement.src && this.audioElement.src !== "";
  }
  onTimeUpdate(callback) {
    this.onTimeUpdateCallbacks.push(callback);
    return () => {
      this.onTimeUpdateCallbacks = this.onTimeUpdateCallbacks.filter((cb) => cb !== callback);
    };
  }
  onEnded(callback) {
    this.onEndedCallbacks.push(callback);
    return () => {
      this.onEndedCallbacks = this.onEndedCallbacks.filter((cb) => cb !== callback);
    };
  }
  onLoaded(callback) {
    this.onLoadedCallbacks.push(callback);
    return () => {
      this.onLoadedCallbacks = this.onLoadedCallbacks.filter((cb) => cb !== callback);
    };
  }
  destroy() {
    this.audioElement.pause();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.onTimeUpdateCallbacks = [];
    this.onEndedCallbacks = [];
    this.onLoadedCallbacks = [];
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  apiKey: "",
  serverUrl: "https://audio.monolithos.ai",
  masteredEnabled: false,
  masteredRemaining: 5,
  masteredMonthlyQuota: 5
};
var AudioBriefSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("audio-brief-settings");
    const signalSection = containerEl.createDiv({ cls: "audio-brief-signal-section" });
    signalSection.createEl("h2", { text: "MONOLITHOS SIGNAL" });
    signalSection.createEl("p", {
      text: "Your API key connects this plugin to the Monolithos intelligence network. All processing happens through your sovereign endpoint \u2014 your vault content is never stored on our servers.",
      cls: "audio-brief-signal-desc"
    });
    const keyRow = signalSection.createDiv({ cls: "audio-brief-key-row" });
    const keyInput = keyRow.createEl("input", {
      cls: "audio-brief-key-input",
      type: "text",
      placeholder: "UFO-XXXX-XXXX-XXXX-XXXX",
      value: this.plugin.settings.apiKey
    });
    const validateBtn = keyRow.createEl("button", {
      text: "VALIDATE",
      cls: "audio-brief-validate-btn"
    });
    const statusEl = signalSection.createDiv({ cls: "audio-brief-signal-status" });
    if (this.plugin.settings.apiKey) {
      statusEl.setText("\u2726 Signal Locked");
      statusEl.addClass("is-locked");
    } else {
      statusEl.setText("\u2727 No Signal");
      statusEl.addClass("is-unlocked");
    }
    validateBtn.addEventListener("click", async () => {
      const key = keyInput.value.trim();
      this.plugin.settings.apiKey = key;
      await this.plugin.saveSettings();
      if (!key) {
        statusEl.setText("\u2727 No Signal");
        statusEl.removeClass("is-locked");
        statusEl.addClass("is-unlocked");
        new import_obsidian2.Notice("\u2727 No Signal \u2014 enter your API key");
        return;
      }
      validateBtn.setText("...");
      validateBtn.disabled = true;
      try {
        const resp = await fetch(`${this.plugin.settings.serverUrl}/audio/brief`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify({ validate_only: true })
        });
        if (resp.ok || resp.status === 400) {
          try {
            const data = await resp.json();
            if (data.remaining !== void 0 && data.remaining !== -1) {
              this.plugin.settings.masteredRemaining = data.mastered_remaining ?? data.remaining;
              this.plugin.settings.masteredMonthlyQuota = data.mastered_limit ?? data.total_limit;
            } else {
              this.plugin.settings.masteredRemaining = -1;
              this.plugin.settings.masteredMonthlyQuota = -1;
            }
            await this.plugin.saveSettings();
            if (masteredInfoDesc) {
              if (this.plugin.settings.masteredRemaining === -1) {
                masteredInfoDesc.setText("Pro-quality TTS with studio-grade voice synthesis. Unlimited generations.");
              } else {
                masteredInfoDesc.setText(`Pro-quality TTS with studio-grade voice synthesis. ${this.plugin.settings.masteredRemaining} of ${this.plugin.settings.masteredMonthlyQuota} generations remaining.`);
              }
            }
          } catch {
          }
          statusEl.setText("\u2726 Signal Locked");
          statusEl.removeClass("is-unlocked");
          statusEl.addClass("is-locked");
          new import_obsidian2.Notice("\u2726 Signal Locked");
        } else if (resp.status === 401 || resp.status === 403) {
          statusEl.setText("\u2727 No Signal");
          statusEl.removeClass("is-locked");
          statusEl.addClass("is-unlocked");
          new import_obsidian2.Notice("\u2727 No Signal \u2014 invalid key");
        } else {
          statusEl.setText("\u2727 No Signal");
          statusEl.removeClass("is-locked");
          statusEl.addClass("is-unlocked");
          new import_obsidian2.Notice("\u2727 No Signal \u2014 server error");
        }
      } catch {
        statusEl.setText("\u2727 No Signal");
        statusEl.removeClass("is-locked");
        statusEl.addClass("is-unlocked");
        new import_obsidian2.Notice("\u2727 No Signal \u2014 connection failed");
      } finally {
        validateBtn.setText("VALIDATE");
        validateBtn.disabled = false;
      }
    });
    const keyLink = signalSection.createEl("a", {
      text: "Get your key \u2192 audio.monolithos.ai",
      cls: "audio-brief-key-link",
      href: "https://audio.monolithos.ai/register"
    });
    keyLink.setAttr("target", "_blank");
    const masteredInfo = containerEl.createDiv({ cls: "audio-brief-mastered-info" });
    masteredInfo.createEl("h3", { text: "\u2726 Mastered Mode" });
    const masteredInfoDesc = masteredInfo.createEl("p", { cls: "setting-item-description" });
    if (this.plugin.settings.masteredRemaining === -1) {
      masteredInfoDesc.setText("Pro-quality TTS with studio-grade voice synthesis. Unlimited generations.");
    } else {
      masteredInfoDesc.setText(`Pro-quality TTS with studio-grade voice synthesis. ${this.plugin.settings.masteredRemaining} of ${this.plugin.settings.masteredMonthlyQuota} generations remaining.`);
    }
    containerEl.createEl("hr");
    const promoContainer = containerEl.createDiv({ cls: "audio-brief-promo" });
    promoContainer.createEl("h3", { text: "THE FULL SYSTEM" });
    promoContainer.createEl("p", {
      text: "Audio Brief is one module of MONOLITHOS \u2014 a sovereign Life Operating System with six AI intelligences, presentation forge, mobile capture, and more. All Pro quality. All local.",
      cls: "audio-brief-promo-desc"
    });
    const exploreBtn = promoContainer.createEl("a", {
      text: "Explore Monolithos \u2197",
      cls: "audio-brief-promo-btn",
      href: "https://monolithos.ai"
    });
    exploreBtn.setAttr("target", "_blank");
  }
};
var AudioBriefPlugin = class extends import_obsidian2.Plugin {
  async onload() {
    console.log("\u{1F399}\uFE0F Audio Brief: Loading...");
    await this.loadSettings();
    this.audioManager = new AudioManager();
    this.addSettingTab(new AudioBriefSettingTab(this.app, this));
    this.registerView(
      AUDIO_VIEW_TYPE,
      (leaf) => new AudioView(leaf, this)
    );
    this.addRibbonIcon("audio-lines", "Audio Brief", () => {
      this.showAudioView();
    });
    this.addCommand({
      id: "open-audio-brief",
      name: "Open Audio Brief",
      callback: () => this.showAudioView()
    });
    this.addCommand({
      id: "open-audio-brief-settings",
      name: "Open Audio Brief Settings",
      callback: () => {
        this.app.setting.open();
        this.app.setting.openTabById("monolithos-audio-brief");
      }
    });
    console.log("\u{1F399}\uFE0F Audio Brief: Ready!");
  }
  async onunload() {
    console.log("\u{1F399}\uFE0F Audio Brief: Unloading...");
    if (this.audioManager) {
      this.audioManager.destroy();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ═══════════════════════════════════════════════════════════════════════
  // VIEW ACTIVATION
  // ═══════════════════════════════════════════════════════════════════════
  async showAudioView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(AUDIO_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: AUDIO_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
};
