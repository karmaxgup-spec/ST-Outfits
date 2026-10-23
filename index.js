import { getContext, extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

console.log("[OutfitTracker] Starting extension loading...");

async function initializeExtension() {
    const MODULE_NAME = 'outfit_tracker';
    const CLOTHING_SLOTS = [
        'headwear',
        'topwear',
        'topunderwear',
        'bottomwear',
        'bottomunderwear',
        'footwear',
        'footunderwear'
    ];
    
    const ACCESSORY_SLOTS = [
        'head-accessory',
        'ears-accessory',
        'eyes-accessory',
        'mouth-accessory',
        'neck-accessory',
        'body-accessory',
        'arms-accessory',
        'hands-accessory',
        'waist-accessory',
        'bottom-accessory',
        'legs-accessory',
        'foot-accessory'
    ];

    const { BotOutfitManager } = await import("./src/BotOutfitManager.js");
    const { BotOutfitPanel } = await import("./src/BotOutfitPanel.js");
    const { UserOutfitManager } = await import("./src/UserOutfitManager.js");
    const { UserOutfitPanel } = await import("./src/UserOutfitPanel.js");
    
    // Import AutoOutfitSystem with error handling
    let AutoOutfitSystem;
    try {
        const autoOutfitModule = await import("./src/AutoOutfitSystem.js");
        AutoOutfitSystem = autoOutfitModule.AutoOutfitSystem;
    } catch (error) {
        console.error("[OutfitTracker] Failed to load AutoOutfitSystem:", error);
        // Create a dummy class if AutoOutfitSystem fails to load
        AutoOutfitSystem = class DummyAutoOutfitSystem {
            constructor() { this.isEnabled = false; }
            enable() { return '[Outfit System] Auto outfit system not available'; }
            disable() { return '[Outfit System] Auto outfit system not available'; }
            setPrompt() { return '[Outfit System] Auto outfit system not available'; }
            resetToDefaultPrompt() { return '[Outfit System] Auto outfit system not available'; }
            getStatus() { return { enabled: false, hasPrompt: false }; }
            manualTrigger() { this.showPopup('Auto outfit system not available', 'error'); }
            showPopup() {}
        };
    }
    
    const botManager = new BotOutfitManager([...CLOTHING_SLOTS, ...ACCESSORY_SLOTS]);
    const userManager = new UserOutfitManager([...CLOTHING_SLOTS, ...ACCESSORY_SLOTS]);
    const botPanel = new BotOutfitPanel(botManager, CLOTHING_SLOTS, ACCESSORY_SLOTS, saveSettingsDebounced);
    const userPanel = new UserOutfitPanel(userManager, CLOTHING_SLOTS, ACCESSORY_SLOTS, saveSettingsDebounced);
    const autoOutfitSystem = new AutoOutfitSystem(botManager);
    
    // Store panels globally for access in other functions
    window.botOutfitPanel = botPanel;
    window.userOutfitPanel = userPanel;
    window.autoOutfitSystem = autoOutfitSystem;
    
    function registerOutfitCommands() {
        const { registerSlashCommand } = SillyTavern.getContext();
        
        registerSlashCommand('outfit-bot', (...args) => {
            console.log("Bot Outfit command triggered");
            botPanel.toggle();
            toastr.info('Toggled character outfit panel', 'Outfit System');
        }, [], 'Toggle character outfit tracker', true, true);
            
        registerSlashCommand('outfit-user', (...args) => {
            console.log("User Outfit command triggered");
            userPanel.toggle();
            toastr.info('Toggled user outfit panel', 'Outfit System');
        }, [], 'Toggle user outfit tracker', true, true);
        
        // Only register auto commands if AutoOutfitSystem loaded successfully
        if (AutoOutfitSystem.name !== 'DummyAutoOutfitSystem') {
            registerSlashCommand('outfit-auto', (...args) => {
                if (args[0] === 'on') {
                    const message = autoOutfitSystem.enable();
                    toastr.info(message, 'Outfit System');
                } else if (args[0] === 'off') {
                    const message = autoOutfitSystem.disable();
                    toastr.info(message, 'Outfit System');
                } else {
                    const status = autoOutfitSystem.getStatus();
                    toastr.info(`Auto outfit: ${status.enabled ? 'ON' : 'OFF'}\nPrompt: ${status.hasPrompt ? 'SET' : 'NOT SET'}`);
                }
            }, [], 'Toggle auto outfit updates (on/off)', true, true);
            
            registerSlashCommand('outfit-prompt', (...args) => {
                const prompt = args.join(' ');
                if (prompt) {
                    const message = autoOutfitSystem.setPrompt(prompt);
                    if (extension_settings.outfit_tracker?.enableSysMessages) {
                        botPanel.sendSystemMessage(message);
                    }
                } else {
                    toastr.info('Current prompt length: ' + (autoOutfitSystem.systemPrompt?.length || 0));
                }
            }, [], 'Set auto outfit system prompt', true, true);
            
            registerSlashCommand('outfit-prompt-reset', (...args) => {
                const message = autoOutfitSystem.resetToDefaultPrompt();
                if (extension_settings.outfit_tracker?.enableSysMessages) {
                    botPanel.sendSystemMessage(message);
                }
                // Update the textarea in settings
                $("#outfit-prompt-input").val(autoOutfitSystem.systemPrompt);
                extension_settings[MODULE_NAME].autoOutfitPrompt = autoOutfitSystem.systemPrompt;
                saveSettingsDebounced();
            }, [], 'Reset to default system prompt', true, true);
            
            registerSlashCommand('outfit-prompt-view', (...args) => {
                const status = autoOutfitSystem.getStatus();
                const preview = autoOutfitSystem.systemPrompt.length > 100 
                    ? autoOutfitSystem.systemPrompt.substring(0, 100) + '...' 
                    : autoOutfitSystem.systemPrompt;
                
                toastr.info(`Prompt preview: ${preview}\n\nFull length: ${status.promptLength} chars`, 'Current System Prompt', {
                    timeOut: 10000,
                    extendedTimeOut: 20000
                });
            }, [], 'View current system prompt', true, true);
            
            registerSlashCommand('outfit-auto-trigger', async (...args) => {
                const result = await autoOutfitSystem.manualTrigger();
                toastr.info(result, 'Manual Outfit Check');
            }, [], 'Manually trigger auto outfit check', true, true);
        }
    }

    function updateForCurrentCharacter() {
        const context = getContext();
        const charName = context.characters[context.characterId]?.name || 'Unknown';
        botManager.setCharacter(charName);
        botPanel.updateCharacter(charName);
    }

    function setupEventListeners() {
        const context = getContext();
        const { eventSource, event_types } = context;
        
        // Listen for app ready event to mark initialization
        eventSource.on(event_types.APP_READY, () => {
            console.log("[OutfitTracker] App ready, marking auto outfit system as initialized");
            autoOutfitSystem.markAppInitialized();
        });
        
        eventSource.on(event_types.CHAT_CHANGED, updateForCurrentCharacter);
        eventSource.on(event_types.CHARACTER_CHANGED, updateForCurrentCharacter);
    }

    function initSettings() {
        if (!extension_settings[MODULE_NAME]) {
            extension_settings[MODULE_NAME] = {
                autoOpenBot: true,
                autoOpenUser: false,
                position: 'right',
                enableSysMessages: true,
                autoOutfitSystem: false,
                autoOutfitApi: { mode: 'main', baseUrl: '', apiKey: '', model: '' },
                showStatusPopups: true,
                checkInterval: 3,
                triggerWords: AutoOutfitSystem.getDefaultTriggerWords?.() ?? [],
                autoOutfitPrompt: AutoOutfitSystem.name !== 'DummyAutoOutfitSystem' 
                    ? new AutoOutfitSystem(botManager).getDefaultPrompt() 
                    : '',
                presets: {
                    bot: {},
                    user: {}
                }
            };
        }
        
        // Only initialize auto outfit system if it loaded successfully
        if (AutoOutfitSystem.name !== 'DummyAutoOutfitSystem') {
            if (extension_settings[MODULE_NAME].autoOutfitPrompt) {
                autoOutfitSystem.setPrompt(extension_settings[MODULE_NAME].autoOutfitPrompt);
            } else {
                // Ensure we always have a prompt
                extension_settings[MODULE_NAME].autoOutfitPrompt = autoOutfitSystem.systemPrompt;
            }
            
            // Existing users won't have the API settings yet
            if (!extension_settings[MODULE_NAME].autoOutfitApi) {
                extension_settings[MODULE_NAME].autoOutfitApi = { mode: 'main', baseUrl: '', apiKey: '', model: '' };
            }
            autoOutfitSystem.setApiConfig(extension_settings[MODULE_NAME].autoOutfitApi);

            // Existing users won't have this setting yet
            if (extension_settings[MODULE_NAME].showStatusPopups === undefined) {
                extension_settings[MODULE_NAME].showStatusPopups = true;
            }
            autoOutfitSystem.setStatusPopups(extension_settings[MODULE_NAME].showStatusPopups);

            // Existing users won't have the check interval or trigger words yet
            if (extension_settings[MODULE_NAME].checkInterval === undefined) {
                extension_settings[MODULE_NAME].checkInterval = 3;
            }
            if (!Array.isArray(extension_settings[MODULE_NAME].triggerWords)) {
                extension_settings[MODULE_NAME].triggerWords = AutoOutfitSystem.getDefaultTriggerWords();
            }
            autoOutfitSystem.setCheckInterval(extension_settings[MODULE_NAME].checkInterval);
            autoOutfitSystem.setTriggerWords(extension_settings[MODULE_NAME].triggerWords);

            if (extension_settings[MODULE_NAME].autoOutfitSystem) {
                autoOutfitSystem.enable();
            }
        }
    }

    function createSettingsUI() {
        const hasAutoSystem = AutoOutfitSystem.name !== 'DummyAutoOutfitSystem';
        const autoSettingsHtml = hasAutoSystem ? `
            <div class="flex-container">
                <label for="outfit-auto-system">Enable auto outfit updates</label>
                <input type="checkbox" id="outfit-auto-system"
                        ${extension_settings[MODULE_NAME].autoOutfitSystem ? 'checked' : ''}>
            </div>
            <div class="flex-container">
                <label for="outfit-status-popups">Show status popups (checking / completed)</label>
                <input type="checkbox" id="outfit-status-popups"
                        ${extension_settings[MODULE_NAME].showStatusPopups ? 'checked' : ''}>
            </div>
            <div class="flex-container">
                <label for="outfit-check-interval">Run check every N AI messages:</label>
                <input id="outfit-check-interval" class="text_pole" type="number" min="1" step="1" style="width: 70px;">
            </div>
            <div class="flex-container">
                <label>Trigger words (a check runs when your message contains one; click a word to remove it):</label>
            </div>
            <div class="flex-container">
                <input id="outfit-trigger-input" class="text_pole" type="text" placeholder="Add a trigger word">
                <button id="outfit-trigger-add" class="menu_button">Add</button>
                <button id="outfit-trigger-reset" class="menu_button">Reset to defaults</button>
            </div>
            <div id="outfit-trigger-list" class="flex-container" style="flex-wrap: wrap;"></div>
            <div class="flex-container">
                <label for="outfit-api-mode">Outfit check API:</label>
                <select id="outfit-api-mode">
                    <option value="main">Main API (current SillyTavern API)</option>
                    <option value="openai">OpenAI-compatible endpoint</option>
                </select>
            </div>
            <div id="outfit-openai-settings" style="display: none;">
                <div class="flex-container">
                    <label for="outfit-api-base">Base URL:</label>
                    <input id="outfit-api-base" class="text_pole" type="text" placeholder="e.g. http://localhost:8080/v1">
                </div>
                <div class="flex-container">
                    <label for="outfit-api-key">API key:</label>
                    <input id="outfit-api-key" class="text_pole" type="password" placeholder="Leave empty if not needed">
                </div>
                <div class="flex-container">
                    <button id="outfit-api-fetch-models" class="menu_button">Fetch models</button>
                </div>
                <div class="flex-container">
                    <label for="outfit-api-model">Model:</label>
                    <input id="outfit-api-model" class="text_pole" type="text" list="outfit-api-model-list" placeholder="Pick from list or type a model name">
                    <datalist id="outfit-api-model-list"></datalist>
                </div>
            </div>
            <div class="flex-container">
                <label for="outfit-prompt-input">System Prompt:</label>
                <textarea id="outfit-prompt-input" rows="6" placeholder="Enter system prompt for auto outfit detection">${extension_settings[MODULE_NAME].autoOutfitPrompt || ''}</textarea>
            </div>
            <div class="flex-container">
                <button id="outfit-prompt-reset-btn" class="menu_button">Reset to Default Prompt</button>
                <button id="outfit-prompt-view-btn" class="menu_button">View Current Prompt</button>
            </div>
        ` : `
            <div class="flex-container">
                <label>Auto Outfit System: <span style="color: #ff6b6b;">Not Available</span></label>
            </div>
        `;

        const settingsHtml = `
        <div class="outfit-extension-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Outfit Tracker Settings</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="flex-container">
                        <label for="outfit-sys-toggle">Enable system messages</label>
                        <input type="checkbox" id="outfit-sys-toggle"
                                ${extension_settings[MODULE_NAME].enableSysMessages ? 'checked' : ''}>
                    </div>
                    <div class="flex-container">
                        <label for="outfit-auto-bot">Auto-open character panel</label>
                        <input type="checkbox" id="outfit-auto-bot"
                                ${extension_settings[MODULE_NAME].autoOpenBot ? 'checked' : ''}>
                    </div>
                    <div class="flex-container">
                        <label for="outfit-auto-user">Auto-open user panel</label>
                        <input type="checkbox" id="outfit-auto-user"
                                ${extension_settings[MODULE_NAME].autoOpenUser ? 'checked' : ''}>
                    </div>
                    ${autoSettingsHtml}
                </div>
            </div>
        </div>
        `;

        $("#extensions_settings").append(settingsHtml);

        $("#outfit-sys-toggle").on("input", function() {
            extension_settings[MODULE_NAME].enableSysMessages = $(this).prop('checked');
            saveSettingsDebounced();
        });
        
        $("#outfit-auto-bot").on("input", function() {
            extension_settings[MODULE_NAME].autoOpenBot = $(this).prop('checked');
            saveSettingsDebounced();
        });
        
        $("#outfit-auto-user").on("input", function() {
            extension_settings[MODULE_NAME].autoOpenUser = $(this).prop('checked');
            saveSettingsDebounced();
        });
        
        // Only add auto system event listeners if it loaded successfully
        if (hasAutoSystem) {
            $("#outfit-auto-system").on("input", function() {
                extension_settings[MODULE_NAME].autoOutfitSystem = $(this).prop('checked');
                if ($(this).prop('checked')) {
                    autoOutfitSystem.enable();
                } else {
                    autoOutfitSystem.disable();
                }
                saveSettingsDebounced();
            });

            $("#outfit-status-popups").on("input", function() {
                const enabled = $(this).prop('checked');
                extension_settings[MODULE_NAME].showStatusPopups = enabled;
                autoOutfitSystem.setStatusPopups(enabled);
                saveSettingsDebounced();
            });

            // Check interval
            $("#outfit-check-interval").val(extension_settings[MODULE_NAME].checkInterval).on("change", function() {
                const value = Math.max(1, parseInt($(this).val(), 10) || 3);
                $(this).val(value);
                extension_settings[MODULE_NAME].checkInterval = value;
                autoOutfitSystem.setCheckInterval(value);
                saveSettingsDebounced();
            });

            // Trigger words
            const renderTriggerWords = () => {
                const words = extension_settings[MODULE_NAME].triggerWords;
                const list = $("#outfit-trigger-list").empty();
                words.forEach((word, index) => {
                    const chip = $('<span class="menu_button" style="cursor: pointer;"></span>').text(`${word} ×`);
                    chip.on("click", () => {
                        extension_settings[MODULE_NAME].triggerWords.splice(index, 1);
                        saveTriggerWords();
                    });
                    list.append(chip);
                });
            };

            const saveTriggerWords = () => {
                autoOutfitSystem.setTriggerWords(extension_settings[MODULE_NAME].triggerWords);
                saveSettingsDebounced();
                renderTriggerWords();
            };

            const addTriggerWord = () => {
                const input = $("#outfit-trigger-input");
                const word = (input.val() || '').trim();
                if (!word) return;
                const words = extension_settings[MODULE_NAME].triggerWords;
                if (!words.some(w => w.toLowerCase() === word.toLowerCase())) {
                    words.push(word);
                    saveTriggerWords();
                }
                input.val('');
            };

            $("#outfit-trigger-add").on("click", addTriggerWord);
            $("#outfit-trigger-input").on("keydown", function(e) {
                if (e.key === 'Enter') addTriggerWord();
            });
            $("#outfit-trigger-reset").on("click", function() {
                extension_settings[MODULE_NAME].triggerWords = AutoOutfitSystem.getDefaultTriggerWords();
                saveTriggerWords();
            });
            renderTriggerWords();

            // API settings for the outfit check
            const apiSettings = extension_settings[MODULE_NAME].autoOutfitApi;
            $("#outfit-api-mode").val(apiSettings.mode);
            $("#outfit-api-base").val(apiSettings.baseUrl);
            $("#outfit-api-key").val(apiSettings.apiKey);
            $("#outfit-api-model").val(apiSettings.model);
            $("#outfit-openai-settings").toggle(apiSettings.mode === 'openai');

            const saveApiSettings = () => {
                const api = extension_settings[MODULE_NAME].autoOutfitApi;
                api.mode = $("#outfit-api-mode").val();
                api.baseUrl = ($("#outfit-api-base").val() || '').trim();
                api.apiKey = ($("#outfit-api-key").val() || '').trim();
                api.model = ($("#outfit-api-model").val() || '').trim();
                autoOutfitSystem.setApiConfig(api);
                saveSettingsDebounced();
            };

            $("#outfit-api-mode").on("change", function() {
                $("#outfit-openai-settings").toggle($(this).val() === 'openai');
                saveApiSettings();
            });

            $("#outfit-api-base, #outfit-api-key, #outfit-api-model").on("change", saveApiSettings);

            $("#outfit-api-fetch-models").on("click", async function() {
                const baseUrl = ($("#outfit-api-base").val() || '').trim().replace(/\/+$/, '');
                if (!baseUrl) {
                    toastr.warning('Enter a base URL first.', 'Outfit System');
                    return;
                }

                const headers = {};
                const key = ($("#outfit-api-key").val() || '').trim();
                if (key) {
                    headers['Authorization'] = `Bearer ${key}`;
                }

                try {
                    const response = await fetch(`${baseUrl}/models`, { headers });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    const ids = (data.data || []).map(model => model.id).filter(Boolean);

                    const list = $("#outfit-api-model-list").empty();
                    ids.forEach(id => list.append($('<option>').val(id)));

                    toastr.success(`Found ${ids.length} model(s). You can also type a model name.`, 'Outfit System');
                } catch (error) {
                    toastr.error(`Could not fetch models: ${error.message}`, 'Outfit System');
                }
            });

            $("#outfit-prompt-input").on("change", function() {
                extension_settings[MODULE_NAME].autoOutfitPrompt = $(this).val();
                autoOutfitSystem.setPrompt($(this).val());
                saveSettingsDebounced();
            });
            
            $("#outfit-prompt-reset-btn").on("click", function() {
                const message = autoOutfitSystem.resetToDefaultPrompt();
                $("#outfit-prompt-input").val(autoOutfitSystem.systemPrompt);
                extension_settings[MODULE_NAME].autoOutfitPrompt = autoOutfitSystem.systemPrompt;
                saveSettingsDebounced();
                
                if (extension_settings.outfit_tracker?.enableSysMessages) {
                    botPanel.sendSystemMessage(message);
                } else {
                    toastr.info(message);
                }
            });
            
            $("#outfit-prompt-view-btn").on("click", function() {
                const status = autoOutfitSystem.getStatus();
                const preview = autoOutfitSystem.systemPrompt.length > 100 
                    ? autoOutfitSystem.systemPrompt.substring(0, 100) + '...' 
                    : autoOutfitSystem.systemPrompt;
                
                toastr.info(`Prompt preview: ${preview}\n\nFull length: ${status.promptLength} characters`, 'Current System Prompt', {
                    timeOut: 15000,
                    extendedTimeOut: 30000
                });
            });
        }
    }

    initSettings();
    registerOutfitCommands();
    setupEventListeners();
    updateForCurrentCharacter();
    createSettingsUI();

    if (extension_settings[MODULE_NAME].autoOpenBot) {
        setTimeout(() => botPanel.show(), 1000);
    }
    
    if (extension_settings[MODULE_NAME].autoOpenUser) {
        setTimeout(() => userPanel.show(), 1000);
    }
}

$(async () => {
    try {
        await initializeExtension();
        console.log("[OutfitTracker] Extension loaded successfully");
    } catch (error) {
        console.error("[OutfitTracker] Initialization failed", error);
    }
});
