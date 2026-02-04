"use strict";
var CompressionFlags;
(function (CompressionFlags) {
    CompressionFlags[CompressionFlags["None"] = 0] = "None";
    CompressionFlags[CompressionFlags["DupeRowsVertically"] = 1] = "DupeRowsVertically";
    CompressionFlags[CompressionFlags["DupeRowsHorizontally"] = 2] = "DupeRowsHorizontally";
    CompressionFlags[CompressionFlags["ColumnsAreHalfRotation"] = 4] = "ColumnsAreHalfRotation";
    CompressionFlags[CompressionFlags["ColumnsAreQuarterRotation"] = 8] = "ColumnsAreQuarterRotation";
    CompressionFlags[CompressionFlags["NoPixels"] = 16] = "NoPixels";
    CompressionFlags[CompressionFlags["RowsAreHalfRotation"] = 32] = "RowsAreHalfRotation";
    CompressionFlags[CompressionFlags["RowsAreQuarterRotation"] = 64] = "RowsAreQuarterRotation";
    CompressionFlags[CompressionFlags["NoCompression"] = 128] = "NoCompression";
    CompressionFlags[CompressionFlags["Unknown8"] = 256] = "Unknown8";
})(CompressionFlags || (CompressionFlags = {}));
class SpriteAnimator {
    constructor() {
        this.sprites = [];
        this.allSprites = [];
        this.currentSpriteIndex = 0;
        this.currentRow = 0;
        this.currentColumn = 0;
        this.animationId = null;
        this.isPlaying = false;
        this.animationSpeed = 15;
        this.zoomLevel = 2;
        this.actualRowCount = 1;
        this.actualColumnCount = 1;
        this.hueShift = 0;
        this.saturationAdjust = 0;
        this.valueAdjust = 0;
        this.bgColor = { r: 128, g: 128, b: 128 };
        this.currentTab = 'sprites';
        this.elements = {};
        this.bloFiles = [];
        this.currentBloFile = null;
        this.audioFiles = new Map();
        this.allAudioFiles = new Map();
        this.spritesByBlo = new Map();
        this.expandedBloFiles = new Set();
        this.expandedAudioBloFiles = new Set();
        this.spriteSearchFilter = '';
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.currentAudioFile = null;
        this.audioFileList = [];
        this.currentAudioIndex = -1;
        this.maxLoadedBloFiles = 12;
        this.loadedBloOrder = [];
        this.debounceTimer = null;
        this.currentAudioUrl = null;
        this.canvas = document.getElementById('spriteCanvas');
        this.ctx = this.canvas.getContext('2d');
        if (!this.canvas || !this.ctx) {
            console.error('Failed to initialize canvas or context');
            return;
        }
        this.canvas.width = 700;
        this.canvas.height = 700;
        console.log('Canvas initialized:', this.canvas.width, 'x', this.canvas.height);
        this.initializeElements();
        this.setupEventListeners();
        this.updateCanvasBackground();
        this.switchTab('sprites').catch(err => console.error('Error initializing default tab:', err));
        this.setStatus('Ready - Load a BLO file to begin');
        this.drawTestPattern();
    }
    initializeElements() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            directoryInput: document.getElementById('directoryInput'),
            loadButton: document.getElementById('loadButton'),
            loadDirectoryButton: document.getElementById('loadDirectoryButton'),
            fileCountLeft: document.getElementById('fileCountLeft'),
            bloFileSelector: document.getElementById('bloFileSelector'),
            spriteSelector: document.getElementById('spriteSelector'),
            audioPlayer: document.getElementById('audioPlayer'),
            audioInfo: document.getElementById('audioInfo'),
            volumeSlider: document.getElementById('volumeSlider'),
            volumeValue: document.getElementById('volumeValue'),
            spriteTab: document.getElementById('sprite-tab'),
            audioTab: document.getElementById('audio-tab'),
            currentTrackName: document.getElementById('currentTrackName'),
            currentTrackDetails: document.getElementById('currentTrackDetails'),
            waveformCanvas: document.getElementById('waveformCanvas'),
            audioPlayBtn: document.getElementById('audioPlayBtn'),
            audioPauseBtn: document.getElementById('audioPauseBtn'),
            audioStopBtn: document.getElementById('audioStopBtn'),
            currentTime: document.getElementById('currentTime'),
            totalTime: document.getElementById('totalTime'),
            audioFileName: document.getElementById('audioFileName'),
            audioFileSize: document.getElementById('audioFileSize'),
            audioDuration: document.getElementById('audioDuration'),
            audioFormat: document.getElementById('audioFormat'),
            playButton: document.getElementById('playButton'),
            pauseButton: document.getElementById('pauseButton'),
            stopButton: document.getElementById('stopButton'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            cfsTime: document.getElementById('cfsTime'),
            rowSlider: document.getElementById('rowSlider'),
            columnSlider: document.getElementById('columnSlider'),
            rowValue: document.getElementById('rowValue'),
            columnValue: document.getElementById('columnValue'),
            currentFrame: document.getElementById('currentFrame'),
            zoomSlider: document.getElementById('zoomSlider'),
            zoomValue: document.getElementById('zoomValue'),
            hueSlider: document.getElementById('hueSlider'),
            saturationSlider: document.getElementById('saturationSlider'),
            valueSlider: document.getElementById('valueSlider'),
            hueValue: document.getElementById('hueValue'),
            saturationValue: document.getElementById('saturationValue'),
            valueValue: document.getElementById('valueValue'),
            bgRedSlider: document.getElementById('bgRedSlider'),
            bgGreenSlider: document.getElementById('bgGreenSlider'),
            bgBlueSlider: document.getElementById('bgBlueSlider'),
            bgRedValue: document.getElementById('bgRedValue'),
            bgGreenValue: document.getElementById('bgGreenValue'),
            bgBlueValue: document.getElementById('bgBlueValue'),
            spriteDimensions: document.getElementById('spriteDimensions'),
            frameCount: document.getElementById('frameCount'),
            rowCount: document.getElementById('rowCount'),
            colCount: document.getElementById('colCount'),
            statusText: document.getElementById('statusText'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            errorMessage: document.getElementById('errorMessage')
        };
        this.zoomPresets = document.querySelectorAll('[data-zoom]');
    }
    setupEventListeners() {
        this.elements.loadButton.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        this.elements.loadDirectoryButton.addEventListener('click', () => {
            this.elements.directoryInput.click();
        });
        this.elements.fileInput.addEventListener('change', (e) => {
            const input = e.target;
            if (input.files && input.files[0]) {
                this.loadBloFile(input.files[0]);
            }
        });
        this.elements.directoryInput.addEventListener('change', async (e) => {
            const input = e.target;
            if (input.files) {
                await this.loadBloDirectory(Array.from(input.files));
            }
        });
        this.elements.spriteSelector.addEventListener('change', (e) => {
            const select = e.target;
            const spriteIndex = parseInt(select.value);
            console.log(`Sprite selector changed to index: ${spriteIndex}`);
            this.selectSprite(spriteIndex);
        });
        this.elements.playButton.addEventListener('click', () => this.startAnimation());
        this.elements.pauseButton.addEventListener('click', () => this.pauseAnimation());
        this.elements.stopButton.addEventListener('click', () => this.stopAnimation());
        this.elements.speedSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.animationSpeed = parseInt(slider.value);
            this.elements.speedValue.textContent = slider.value;
            const interval = Math.max(10, 200 - (this.animationSpeed * 10));
            this.elements.cfsTime.textContent = `${interval}ms`;
        });
        this.elements.rowSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.currentRow = parseInt(slider.value);
            this.elements.rowValue.textContent = slider.value;
            this.updateDisplay();
        });
        this.elements.columnSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.currentColumn = parseInt(slider.value);
            this.elements.columnValue.textContent = slider.value;
            this.updateDisplay();
        });
        this.elements.zoomSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.zoomLevel = parseFloat(slider.value);
            this.elements.zoomValue.textContent = `${this.zoomLevel.toFixed(1)}x`;
            this.updateDisplay();
        });
        this.elements.zoomSlider.value = this.zoomLevel.toString();
        this.elements.zoomValue.textContent = `${this.zoomLevel.toFixed(1)}x`;
        this.zoomPresets.forEach((btn) => {
            btn.addEventListener('click', () => {
                const zoom = parseFloat(btn.getAttribute('data-zoom'));
                this.zoomLevel = zoom;
                this.elements.zoomSlider.value = zoom.toString();
                this.elements.zoomValue.textContent = `${zoom.toFixed(1)}x`;
                this.updateDisplay();
            });
        });
        this.elements.hueSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.hueShift = parseInt(slider.value);
            this.elements.hueValue.textContent = slider.value;
            this.debounceUpdateDisplay();
        });
        this.elements.saturationSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.saturationAdjust = parseInt(slider.value);
            this.elements.saturationValue.textContent = slider.value;
            this.debounceUpdateDisplay();
        });
        this.elements.valueSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.valueAdjust = parseInt(slider.value);
            this.elements.valueValue.textContent = slider.value;
            this.debounceUpdateDisplay();
        });
        this.elements.bgRedSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.bgColor.r = parseInt(slider.value);
            this.elements.bgRedValue.textContent = slider.value;
            this.updateCanvasBackground();
        });
        this.elements.bgGreenSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.bgColor.g = parseInt(slider.value);
            this.elements.bgGreenValue.textContent = slider.value;
            this.updateCanvasBackground();
        });
        this.elements.bgBlueSlider.addEventListener('input', (e) => {
            const slider = e.target;
            this.bgColor.b = parseInt(slider.value);
            this.elements.bgBlueValue.textContent = slider.value;
            this.updateCanvasBackground();
        });
        this.elements.volumeSlider.addEventListener('input', (e) => {
            const slider = e.target;
            const volume = parseInt(slider.value) / 100;
            const audioPlayer = this.elements.audioPlayer;
            audioPlayer.volume = volume;
            this.elements.volumeValue.textContent = `${slider.value}%`;
        });
        const audioPlayer = this.elements.audioPlayer;
        audioPlayer.volume = 0.5;
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const target = e.target;
                const tabName = target.getAttribute('data-tab');
                await this.switchTab(tabName);
            });
        });
        this.elements.audioPlayBtn.addEventListener('click', () => this.playCurrentAudio());
        this.elements.audioPauseBtn.addEventListener('click', () => this.pauseCurrentAudio());
        this.elements.audioStopBtn.addEventListener('click', () => this.stopCurrentAudio());
        this.waveformCanvas = this.elements.waveformCanvas;
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        const expandAllBtn = document.getElementById('expandAllBtn');
        const collapseAllBtn = document.getElementById('collapseAllBtn');
        const expandAllAudioBtn = document.getElementById('expandAllAudioBtn');
        const collapseAllAudioBtn = document.getElementById('collapseAllAudioBtn');
        const spriteSearch = document.getElementById('spriteSearch');
        const audioSearch = document.getElementById('audioSearch');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => this.expandAllBloFiles());
        }
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => this.collapseAllBloFiles());
        }
        if (expandAllAudioBtn) {
            expandAllAudioBtn.addEventListener('click', () => this.expandAllAudioBloFiles());
        }
        if (collapseAllAudioBtn) {
            collapseAllAudioBtn.addEventListener('click', () => this.collapseAllAudioBloFiles());
        }
        if (spriteSearch) {
            spriteSearch.addEventListener('input', (e) => {
                const target = e.target;
                this.spriteSearchFilter = target.value.toLowerCase();
                this.updateSpriteTreeView();
            });
        }
        if (audioSearch) {
            audioSearch.addEventListener('input', (e) => {
                const target = e.target;
                this.updateAudioTreeView(target.value.toLowerCase());
            });
        }
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const wheelEvent = e;
            const zoomDelta = wheelEvent.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.5, Math.min(20, this.zoomLevel * zoomDelta));
            if (newZoom !== this.zoomLevel) {
                this.zoomLevel = newZoom;
                this.elements.zoomSlider.value = this.zoomLevel.toString();
                this.elements.zoomValue.textContent = `${this.zoomLevel.toFixed(1)}x`;
                this.updateDisplay();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    if (this.currentTab === 'audio') {
                        this.cycleAudio(-1).catch(err => console.error('Error cycling audio:', err));
                    }
                    else {
                        this.cycleBloFile(-1);
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (this.currentTab === 'audio') {
                        this.cycleAudio(1).catch(err => console.error('Error cycling audio:', err));
                    }
                    else {
                        this.cycleBloFile(1);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.currentTab === 'sprites') {
                        this.cycleSprite(-1);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.currentTab === 'sprites') {
                        this.cycleSprite(1);
                    }
                    break;
                case 'Tab':
                    e.preventDefault();
                    this.switchTab(this.currentTab === 'sprites' ? 'audio' : 'sprites').catch(err => console.error('Error switching tab:', err));
                    break;
            }
        });
    }
    debounceUpdateDisplay() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.updateDisplay();
        }, 16);
    }
    async loadBloDirectory(files) {
        this.bloFiles = [];
        files.forEach(file => {
            if (file.name.toLowerCase().endsWith('.blo')) {
                const type = this.categorizeBloFile(file.name);
                this.bloFiles.push({ file, name: file.name, type });
            }
        });
        this.bloFiles.sort((a, b) => {
            if (a.type !== b.type) {
                const order = { graphics: 0, sounds: 1, hybrid: 2 };
                return order[a.type] - order[b.type];
            }
            return a.name.localeCompare(b.name);
        });
        this.updateLeftPanelBloList();
        const manBloIndex = this.bloFiles.findIndex(f => f.name.toLowerCase() === 'man.blo');
        if (manBloIndex >= 0) {
            await this.loadBloFile(this.bloFiles[manBloIndex].file);
        }
        else if (this.bloFiles.length > 0) {
            const firstGraphics = this.bloFiles.find(f => f.type === 'graphics');
            if (firstGraphics) {
                await this.loadBloFile(firstGraphics.file);
            }
        }
        this.setStatus(`Ready - ${this.bloFiles.length} BLO files available. Click any file to load it.`);
    }
    categorizeBloFile(filename) {
        const name = filename.toLowerCase();
        if (name.includes('gfx') || name.includes('man') || name.includes('char') ||
            name.includes('weapon') || name.includes('vehicle') || name.includes('tile') ||
            name.includes('floor') || name.includes('wall') || name.includes('object')) {
            return 'graphics';
        }
        if (name.includes('sound') || name.includes('audio') || name.includes('sfx') ||
            name.includes('music') || name.includes('voice')) {
            return 'sounds';
        }
        return 'graphics';
    }
    updateLeftPanelBloList() {
        const treeView = document.getElementById('spriteTreeView');
        if (!treeView) {
            console.warn('Sprite tree view element not found');
            return;
        }
        treeView.innerHTML = '';
        let graphicsCount = 0, soundsCount = 0, hybridCount = 0;
        this.bloFiles.forEach(file => {
            if (file.type === 'graphics')
                graphicsCount++;
            else if (file.type === 'sounds')
                soundsCount++;
            else
                hybridCount++;
        });
        if (this.bloFiles.length === 0) {
            treeView.innerHTML = '<div class="tree-empty">No BLO files loaded</div>';
            this.elements.fileCountLeft.textContent = `0 files`;
            return;
        }
        const groupedFiles = {
            graphics: [],
            sounds: [],
            hybrid: []
        };
        this.bloFiles.forEach((fileItem, index) => {
            const item = {
                file: fileItem.file,
                name: fileItem.name,
                type: fileItem.type,
                index: index
            };
            groupedFiles[fileItem.type].push(item);
        });
        ['graphics', 'sounds', 'hybrid'].forEach(type => {
            const files = groupedFiles[type];
            if (files.length > 0) {
                const typeHeader = document.createElement('div');
                typeHeader.className = 'blo-type-header';
                typeHeader.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Files (${files.length})`;
                treeView.appendChild(typeHeader);
                const fileList = document.createElement('div');
                fileList.className = 'blo-file-list';
                files.forEach(({ file, name, index }) => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'blo-file-item';
                    if (this.currentBloFile && this.currentBloFile.name === file.name) {
                        fileItem.classList.add('active');
                    }
                    const fileName = document.createElement('span');
                    fileName.className = 'blo-file-name';
                    fileName.textContent = name;
                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'file-status';
                    const loadedSprites = this.spritesByBlo.get(name);
                    if (loadedSprites && loadedSprites.length >= 0) {
                        statusSpan.textContent = `${loadedSprites.length} sprites`;
                        statusSpan.classList.add('loaded');
                    }
                    else {
                        statusSpan.textContent = 'Click to load';
                        statusSpan.classList.add('unloaded');
                    }
                    fileItem.appendChild(fileName);
                    fileItem.appendChild(statusSpan);
                    fileItem.addEventListener('click', async () => {
                        statusSpan.textContent = 'Loading...';
                        statusSpan.className = 'file-status loading';
                        fileItem.classList.add('loading');
                        try {
                            await this.loadBloFile(file);
                            const sprites = this.spritesByBlo.get(name) || [];
                            statusSpan.textContent = `${sprites.length} sprites`;
                            statusSpan.className = 'file-status loaded';
                        }
                        catch (error) {
                            console.error(`Failed to load ${name}:`, error);
                            statusSpan.textContent = 'Failed to load';
                            statusSpan.className = 'file-status error';
                        }
                        finally {
                            fileItem.classList.remove('loading');
                        }
                        document.querySelectorAll('.blo-file-item').forEach(item => item.classList.remove('active'));
                        fileItem.classList.add('active');
                    });
                    fileList.appendChild(fileItem);
                });
                treeView.appendChild(fileList);
            }
        });
        this.elements.fileCountLeft.textContent = `${this.bloFiles.length} files - Graphics: ${graphicsCount}, Sounds: ${soundsCount}, Hybrid: ${hybridCount}`;
    }
    cycleBloFile(direction) {
        if (this.bloFiles.length === 0)
            return;
        let currentIndex = -1;
        if (this.currentBloFile) {
            currentIndex = this.bloFiles.findIndex(f => f.file.name === this.currentBloFile.name);
        }
        const newIndex = currentIndex + direction;
        if (newIndex < 0) {
            currentIndex = this.bloFiles.length - 1;
        }
        else if (newIndex >= this.bloFiles.length) {
            currentIndex = 0;
        }
        else {
            currentIndex = newIndex;
        }
        this.loadBloFile(this.bloFiles[currentIndex].file);
        this.setStatus(`BLO File: ${this.bloFiles[currentIndex].name} (${currentIndex + 1}/${this.bloFiles.length})`);
        setTimeout(() => {
            this.scrollToSelectedBloFile(this.bloFiles[currentIndex].name);
        }, 100);
    }
    cycleSprite(direction) {
        if (this.sprites.length === 0)
            return;
        const newIndex = this.currentSpriteIndex + direction;
        if (newIndex < 0) {
            this.currentSpriteIndex = this.sprites.length - 1;
        }
        else if (newIndex >= this.sprites.length) {
            this.currentSpriteIndex = 0;
        }
        else {
            this.currentSpriteIndex = newIndex;
        }
        const selector = this.elements.spriteSelector;
        selector.selectedIndex = this.currentSpriteIndex;
        this.selectSprite(this.currentSpriteIndex);
        const sprite = this.sprites[this.currentSpriteIndex];
        this.scrollToSelectedSprite(sprite.name);
        this.setStatus(`Sprite: ${sprite.name} (${this.currentSpriteIndex + 1}/${this.sprites.length})`);
    }
    async loadBloFile(file) {
        this.showLoading(true);
        this.setStatus(`Loading ${file.name}...`);
        this.currentBloFile = file;
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
            this.currentAudioUrl = null;
        }
        const audioPlayer = this.elements.audioPlayer;
        audioPlayer.pause();
        audioPlayer.src = '';
        this.audioFiles.clear();
        try {
            const arrayBuffer = await file.arrayBuffer();
            const dataView = new DataView(arrayBuffer);
            const entries = this.parseBloFile(dataView);
            this.sprites = [];
            if (this.spritesByBlo.has(file.name)) {
                const oldSprites = this.spritesByBlo.get(file.name) || [];
                oldSprites.forEach(oldSprite => {
                    const index = this.allSprites.findIndex(s => s.name === oldSprite.name && s === oldSprite);
                    if (index >= 0) {
                        this.allSprites.splice(index, 1);
                    }
                });
            }
            this.spritesByBlo.set(file.name, []);
            const spriteSelector = this.elements.spriteSelector;
            spriteSelector.innerHTML = '<option value="">Loading sprites...</option>';
            let loadedCount = 0;
            let audioCount = 0;
            const startTime = performance.now();
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.name.endsWith('.cfs')) {
                    try {
                        const spriteData = new Uint8Array(arrayBuffer, entry.offset, entry.size);
                        const sprite = await this.parseCfsFile(spriteData, entry.name);
                        if (sprite) {
                            console.log(`Loaded sprite: ${sprite.name}, ${sprite.frames.length} frames, ${sprite.rowCount}x${sprite.columnCount}`);
                            this.sprites.push(sprite);
                            this.allSprites.push(sprite);
                            this.spritesByBlo.get(file.name).push(sprite);
                            loadedCount++;
                        }
                    }
                    catch (error) {
                        console.warn(`Failed to load sprite ${entry.name}:`, error);
                    }
                }
                else if (entry.name.endsWith('.wav')) {
                    try {
                        const audioData = new Uint8Array(arrayBuffer, entry.offset, entry.size);
                        this.audioFiles.set(entry.name, audioData);
                        this.allAudioFiles.set(entry.name, { data: audioData, source: file.name });
                        audioCount++;
                    }
                    catch (error) {
                        console.warn(`Failed to load audio ${entry.name}:`, error);
                    }
                }
            }
            const loadTime = (performance.now() - startTime).toFixed(1);
            spriteSelector.innerHTML = '';
            if (this.sprites.length === 0) {
                spriteSelector.innerHTML = '<option value="">No valid sprites found</option>';
                this.setStatus(`No sprites found in ${file.name} (${loadTime}ms)`);
            }
            else {
                this.sprites.forEach((sprite, index) => {
                    const option = document.createElement('option');
                    option.value = index.toString();
                    const actualRows = sprite.rowCount || Math.ceil(sprite.frames.length / Math.max(1, sprite.columnCount || 8));
                    const actualCols = sprite.columnCount || Math.ceil(sprite.frames.length / Math.max(1, actualRows));
                    option.textContent = `${sprite.name} (${sprite.frames.length} frames, ${actualRows}x${actualCols})`;
                    spriteSelector.appendChild(option);
                });
                spriteSelector.selectedIndex = 0;
                this.updateSpriteGrid();
                this.updateSpriteTreeView();
                this.selectSprite(0);
                this.manageMemory(file.name);
                this.setStatus(`Loaded ${file.name}: ${loadedCount} sprites, ${audioCount} audio files (${loadTime}ms) - ${this.getMemoryStatus()}`);
            }
            if (audioCount > 0) {
                this.updateAudioTreeView();
            }
            this.updateLeftPanelBloList();
            if (this.currentBloFile && this.currentBloFile.name === file.name) {
                setTimeout(() => {
                    this.scrollToSelectedBloFile(file.name);
                }, 50);
            }
        }
        catch (error) {
            console.error('Error loading BLO file:', error);
            this.setStatus(`Failed to load ${file.name}: ${error}`);
            this.showError(`Failed to load BLO file: ${error}`);
            this.updateLeftPanelBloList();
        }
        finally {
            this.showLoading(false);
        }
    }
    parseBloFile(dataView) {
        const entries = [];
        try {
            let offset = 0;
            const version = dataView.getUint32(offset, true);
            offset += 4;
            console.log('BLO Version:', version);
            if (version < 1 || version > 2) {
                throw new Error('Unsupported blob version: ' + version);
            }
            const entryCount = dataView.getUint32(offset, true);
            offset += 4;
            console.log('Entry count:', entryCount);
            if (entryCount > 10000 || entryCount <= 0) {
                throw new Error('Invalid entry count: ' + entryCount);
            }
            const nameLength = version === 2 ? 32 : 14;
            for (let i = 0; i < entryCount; i++) {
                const nameBytes = new Uint8Array(dataView.buffer, offset, nameLength);
                const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '');
                offset += nameLength;
                const entryOffset = dataView.getUint32(offset, true);
                offset += 4;
                const size = dataView.getUint32(offset, true);
                offset += 4;
                if (name && size > 0 && entryOffset < dataView.byteLength) {
                    entries.push({ name, offset: entryOffset, size });
                    console.log(`Entry ${i}: "${name}" at ${entryOffset}, size ${size}`);
                }
            }
        }
        catch (error) {
            console.error('Error parsing BLO file:', error);
            throw error;
        }
        return entries;
    }
    readFixedString(data, offset, length) {
        const bytes = new Uint8Array(data.buffer, data.byteOffset + offset, length);
        let result = '';
        for (let i = 0; i < length; i++) {
            if (bytes[i] === 0)
                break;
            result += String.fromCharCode(bytes[i]);
        }
        return result;
    }
    async parseCfsFile(data, name) {
        try {
            const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
            let offset = 0;
            console.log(`Parsing CFS file: ${name}, size: ${data.byteLength}`);
            if (data.byteLength < 50) {
                throw new Error('File too small to be valid CFS');
            }
            const version = dataView.getUint16(offset, true);
            offset += 2;
            console.log(`CFS Version: ${version}`);
            if (version < 2 || version > 5) {
                throw new Error(`Unsupported CFS version: ${version}`);
            }
            let dataSize, frameCount, animationTime;
            let width, height, rowCount, columnCount;
            let lightCount, shadowCount, userDataSize;
            let ySortAdjust, compressionFlags;
            let maxSolidIndex = 0;
            if (version >= 5) {
                dataSize = dataView.getUint32(offset, true);
                offset += 4;
                frameCount = dataView.getUint16(offset, true);
                offset += 2;
                animationTime = dataView.getUint16(offset, true);
                offset += 2;
                width = dataView.getUint16(offset, true);
                offset += 2;
                height = dataView.getUint16(offset, true);
                offset += 2;
                rowCount = dataView.getUint16(offset, true);
                offset += 2;
                columnCount = dataView.getUint16(offset, true);
                offset += 2;
                lightCount = dataView.getUint16(offset, true);
                offset += 2;
                shadowCount = dataView.getUint16(offset, true);
                offset += 2;
                userDataSize = dataView.getUint16(offset, true);
                offset += 2;
                ySortAdjust = dataView.getUint16(offset, true);
                offset += 2;
                compressionFlags = dataView.getUint16(offset, true);
                offset += 2;
                offset += 2;
                offset += 2;
                offset += 2;
                maxSolidIndex = dataView.getUint8(offset);
                offset += 1;
                offset += 1;
                offset += 1;
                offset += 1;
                offset += 32;
                offset += 48;
                offset += 64;
            }
            else if (version >= 4) {
                frameCount = dataView.getUint16(offset, true);
                offset += 2;
                animationTime = dataView.getUint16(offset, true);
                offset += 2;
                width = dataView.getUint16(offset, true);
                offset += 2;
                height = dataView.getUint16(offset, true);
                offset += 2;
                rowCount = dataView.getUint16(offset, true);
                offset += 2;
                columnCount = dataView.getUint16(offset, true);
                offset += 2;
                lightCount = dataView.getUint16(offset, true);
                offset += 2;
                shadowCount = dataView.getUint16(offset, true);
                offset += 2;
                userDataSize = dataView.getUint16(offset, true);
                offset += 2;
                compressionFlags = dataView.getUint8(offset);
                offset += 1;
                maxSolidIndex = dataView.getUint8(offset);
                offset += 1;
                dataSize = dataView.getUint32(offset, true);
                offset += 4;
                offset += 16;
                offset += 1;
                offset += 1;
                ySortAdjust = dataView.getUint16(offset, true);
                offset += 2;
                offset += 1;
                offset += 1;
                offset += 1;
                offset += 48;
                offset += 32;
            }
            else if (version >= 3) {
                frameCount = dataView.getUint16(offset, true);
                offset += 2;
                animationTime = dataView.getUint16(offset, true);
                offset += 2;
                width = dataView.getUint16(offset, true);
                offset += 2;
                height = dataView.getUint16(offset, true);
                offset += 2;
                rowCount = dataView.getUint16(offset, true);
                offset += 2;
                columnCount = dataView.getUint16(offset, true);
                offset += 2;
                lightCount = dataView.getUint16(offset, true);
                offset += 2;
                shadowCount = dataView.getUint16(offset, true);
                offset += 2;
                userDataSize = dataView.getUint16(offset, true);
                offset += 2;
                compressionFlags = dataView.getUint8(offset);
                offset += 1;
                maxSolidIndex = dataView.getUint8(offset);
                offset += 1;
                dataSize = dataView.getUint32(offset, true);
                offset += 4;
                offset += 16;
                offset += 1;
                offset += 1;
                ySortAdjust = dataView.getUint16(offset, true);
                offset += 2;
                offset += 1;
                offset += 1;
                offset += 1;
                offset += 9;
            }
            else {
                frameCount = dataView.getUint16(offset, true);
                offset += 2;
                animationTime = dataView.getUint16(offset, true);
                offset += 2;
                width = dataView.getUint16(offset, true);
                offset += 2;
                height = dataView.getUint16(offset, true);
                offset += 2;
                rowCount = dataView.getUint16(offset, true);
                offset += 2;
                columnCount = dataView.getUint16(offset, true);
                offset += 2;
                lightCount = dataView.getUint16(offset, true);
                offset += 2;
                shadowCount = dataView.getUint16(offset, true);
                offset += 2;
                userDataSize = dataView.getUint16(offset, true);
                offset += 2;
                compressionFlags = dataView.getUint8(offset);
                offset += 1;
                maxSolidIndex = dataView.getUint8(offset);
                offset += 1;
                offset += 6;
                dataSize = dataView.getUint32(offset, true);
                offset += 4;
                ySortAdjust = 0;
            }
            console.log(`Header: ${frameCount} frames, ${width}x${height}, ${rowCount}x${columnCount}, compression: 0x${compressionFlags.toString(16)}`);
            if (width > 1024 || height > 1024 || width <= 0 || height <= 0) {
                throw new Error(`Invalid sprite dimensions: ${width}x${height}`);
            }
            if (lightCount !== 0 && lightCount !== 32) {
                console.warn(`Invalid light count: ${lightCount}`);
            }
            if (shadowCount !== 0 && shadowCount !== 8) {
                console.warn(`Invalid shadow count: ${shadowCount}`);
            }
            console.log(`Reading palette at offset ${offset}`);
            const palette = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                palette[i] = dataView.getUint32(offset, true);
                offset += 4;
            }
            console.log('Palette loaded, first few colors:', Array.from(palette.slice(0, 4)).map(c => `0x${c.toString(16).padStart(8, '0')}`));
            console.log(`Palette ends at offset ${offset}`);
            if (userDataSize > 0) {
                console.log(`Skipping ${userDataSize} bytes of user data at offset ${offset}`);
                offset += userDataSize;
                console.log(`User data ends at offset ${offset}`);
            }
            console.log(`Reading ${frameCount} frame infos starting at offset ${offset}`);
            const frameInfos = [];
            for (let i = 0; i < frameCount; i++) {
                const x = dataView.getUint16(offset, true);
                offset += 2;
                const y = dataView.getUint16(offset, true);
                offset += 2;
                const frameWidth = dataView.getInt16(offset, true);
                offset += 2;
                const frameHeight = dataView.getInt16(offset, true);
                offset += 2;
                const frameDataOffset = dataView.getUint32(offset, true);
                offset += 4;
                if (Math.abs(frameWidth) > 512 || Math.abs(frameHeight) > 512) {
                    console.warn(`Frame ${i}: Invalid dimensions ${frameWidth}x${frameHeight}, skipping`);
                    continue;
                }
                frameInfos.push({
                    x: x,
                    y: y,
                    width: frameWidth,
                    height: frameHeight,
                    dataOffset: frameDataOffset
                });
                if (i < 3) {
                    console.log(`Frame ${i} info: ${frameWidth}x${frameHeight} at (${x},${y}), offset: ${frameDataOffset}`);
                }
            }
            console.log(`Frame infos loaded: ${frameInfos.length}`);
            const frameDataStartOffset = offset;
            console.log(`Frame data starts at offset ${frameDataStartOffset}, dataSize: ${dataSize}`);
            console.log(`Processing ${frameInfos.length} valid frames out of ${frameCount} total`);
            const frames = [];
            const noCompression = (compressionFlags & 0x1) !== 0;
            for (let i = 0; i < frameInfos.length; i++) {
                const info = frameInfos[i];
                const absWidth = Math.abs(info.width);
                const absHeight = Math.abs(info.height);
                if (absWidth > 512 || absHeight > 512 || absWidth <= 0 || absHeight <= 0) {
                    console.warn(`Frame ${i}: Invalid dimensions ${absWidth}x${absHeight}`);
                    continue;
                }
                try {
                    const frame = {
                        width: absWidth,
                        height: absHeight,
                        x: info.x,
                        y: info.y,
                        pixels: new Uint8Array(absWidth * absHeight)
                    };
                    const frameDataPosition = frameDataStartOffset + info.dataOffset;
                    if (frameDataPosition >= data.byteLength) {
                        console.warn(`Frame ${i}: Data offset ${info.dataOffset} out of bounds`);
                        continue;
                    }
                    if (noCompression) {
                        console.log(`Frame ${i}: Uncompressed, reading ${frame.pixels.length} pixels`);
                        const bytesToRead = Math.min(frame.pixels.length, data.byteLength - frameDataPosition);
                        for (let p = 0; p < bytesToRead; p++) {
                            frame.pixels[p] = data[frameDataPosition + p];
                        }
                    }
                    else {
                        console.log(`Frame ${i}: Compressed, decompressing...`);
                        let dataPos = frameDataPosition;
                        const scanlineLengths = [];
                        for (let y = 0; y < absHeight; y++) {
                            if (dataPos >= data.byteLength)
                                break;
                            let length = data[dataPos++];
                            if (length === 0xFF) {
                                if (dataPos + 1 < data.byteLength) {
                                    length = data[dataPos] | (data[dataPos + 1] << 8);
                                    dataPos += 2;
                                }
                                else {
                                    length = 0;
                                }
                            }
                            scanlineLengths.push(length);
                        }
                        for (let y = 0; y < absHeight; y++) {
                            const length = scanlineLengths[y] || 0;
                            if (length === 0 || dataPos + length > data.byteLength)
                                continue;
                            let x = 0;
                            let scanlinePos = 0;
                            const rowOffset = y * absWidth;
                            while (scanlinePos < length && x < absWidth) {
                                if (dataPos + scanlinePos >= data.byteLength)
                                    break;
                                const control = data[dataPos + scanlinePos++];
                                const transparent = (control >> 4) & 0xF;
                                x += transparent;
                                const literal = control & 0xF;
                                for (let l = 0; l < literal && x < absWidth && scanlinePos < length; l++) {
                                    if (dataPos + scanlinePos < data.byteLength) {
                                        frame.pixels[rowOffset + x] = data[dataPos + scanlinePos++];
                                        x++;
                                    }
                                }
                            }
                            dataPos += length;
                        }
                    }
                    if (info.width < 0) {
                        for (let y = 0; y < absHeight; y++) {
                            const rowStart = y * absWidth;
                            for (let x = 0; x < Math.floor(absWidth / 2); x++) {
                                const temp = frame.pixels[rowStart + x];
                                frame.pixels[rowStart + x] = frame.pixels[rowStart + absWidth - 1 - x];
                                frame.pixels[rowStart + absWidth - 1 - x] = temp;
                            }
                        }
                    }
                    if (info.height < 0) {
                        const scanline = new Uint8Array(absHeight);
                        for (let x = 0; x < absWidth; x++) {
                            for (let y = 0; y < absHeight; y++) {
                                scanline[y] = frame.pixels[y * absWidth + x];
                            }
                            for (let y = 0; y < absHeight; y++) {
                                frame.pixels[y * absWidth + x] = scanline[absHeight - 1 - y];
                            }
                        }
                    }
                    frames.push(frame);
                    if (i < 3) {
                        console.log(`Frame ${i}: ${absWidth}x${absHeight} at (${info.x},${info.y}), decompressed successfully`);
                        let nonZeroPixels = 0;
                        for (let p = 0; p < frame.pixels.length; p++) {
                            if (frame.pixels[p] !== 0)
                                nonZeroPixels++;
                        }
                        console.log(`  Non-zero pixels: ${nonZeroPixels}/${frame.pixels.length}`);
                    }
                }
                catch (error) {
                    console.error(`Error decompressing frame ${i}:`, error);
                }
            }
            console.log(`Successfully created ${frames.length} frames out of ${frameCount} expected`);
            if (frames.length === 0) {
                console.warn('No valid frames found, using fallback');
                return this.parseCfsFileSimple(data, name);
            }
            return {
                name,
                width,
                height,
                rowCount,
                columnCount,
                frames,
                palette,
                ySortAdjust,
                shadowCount,
                lightCount,
                animationTime,
                compressionFlags,
                blitMode: 0,
                rowMeaning: 0,
                sortTransform: 0,
                maxSolidIndex,
                category: "Sprite",
                description: "Infantry Sprite",
                userPaletteStart: 0,
                userPalette: 0
            };
        }
        catch (error) {
            console.error(`Error parsing CFS file ${name}:`, error);
            try {
                return this.parseCfsFileSimple(data, name);
            }
            catch (fallbackError) {
                console.error(`Fallback CFS parsing also failed:`, fallbackError);
                return null;
            }
        }
    }
    parseCfsFileSimple(data, name) {
        console.log('Using simplified CFS fallback for', name);
        const palette = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            palette[i] = 0xFF000000 | (i << 16) | (i << 8) | i;
        }
        const testPixels = new Uint8Array(32 * 32);
        for (let i = 0; i < testPixels.length; i++) {
            testPixels[i] = (i % 256);
        }
        return {
            name,
            width: 32,
            height: 32,
            rowCount: 1,
            columnCount: 1,
            frames: [{
                    width: 32,
                    height: 32,
                    x: 0,
                    y: 0,
                    pixels: testPixels
                }],
            palette,
            ySortAdjust: 0,
            shadowCount: 0,
            lightCount: 0,
            animationTime: 200,
            compressionFlags: 0,
            blitMode: 0,
            rowMeaning: 0,
            sortTransform: 0,
            maxSolidIndex: 255,
            category: "Test",
            description: "Test Sprite",
            userPaletteStart: 0,
            userPalette: 0
        };
    }
    selectSprite(index) {
        if (index < 0 || index >= this.sprites.length)
            return;
        this.currentSpriteIndex = index;
        const sprite = this.sprites[index];
        console.log(`=== SELECTING SPRITE ${index}: ${sprite.name} ===`);
        console.log(`Original: ${sprite.frames.length} frames, ${sprite.rowCount}x${sprite.columnCount} grid`);
        console.log(`Dimensions: ${sprite.width}x${sprite.height}`);
        console.log(`First frame info:`, sprite.frames[0] ? {
            width: sprite.frames[0].width,
            height: sprite.frames[0].height,
            x: sprite.frames[0].x,
            y: sprite.frames[0].y,
            pixelCount: sprite.frames[0].pixels.length
        } : 'No frames');
        let actualRowCount = sprite.rowCount;
        let actualColumnCount = sprite.columnCount;
        if (actualRowCount <= 0 && actualColumnCount > 0) {
            actualRowCount = Math.ceil(sprite.frames.length / actualColumnCount);
            console.log(`Fixed rowCount: ${actualRowCount} (was ${sprite.rowCount})`);
        }
        else if (actualColumnCount <= 0 && actualRowCount > 0) {
            actualColumnCount = Math.ceil(sprite.frames.length / actualRowCount);
            console.log(`Fixed columnCount: ${actualColumnCount} (was ${sprite.columnCount})`);
        }
        else if (actualRowCount <= 0 && actualColumnCount <= 0) {
            actualColumnCount = Math.ceil(Math.sqrt(sprite.frames.length));
            actualRowCount = Math.ceil(sprite.frames.length / actualColumnCount);
            console.log(`Fixed grid: ${actualRowCount}x${actualColumnCount} (both were invalid)`);
        }
        this.actualRowCount = actualRowCount;
        this.actualColumnCount = actualColumnCount;
        console.log(`Using grid: ${actualRowCount}x${actualColumnCount}`);
        this.elements.rowSlider.max = Math.max(0, actualRowCount - 1).toString();
        this.elements.columnSlider.max = Math.max(0, actualColumnCount - 1).toString();
        this.currentRow = 0;
        this.currentColumn = 0;
        this.elements.rowSlider.value = '0';
        this.elements.columnSlider.value = '0';
        this.elements.rowValue.textContent = '0';
        this.elements.columnValue.textContent = '0';
        this.elements.spriteDimensions.textContent = `${sprite.width}x${sprite.height}`;
        this.elements.frameCount.textContent = `${sprite.frames.length} (${sprite.shadowCount} shadows, ${sprite.lightCount} lights)`;
        this.elements.rowCount.textContent = actualRowCount.toString();
        this.elements.colCount.textContent = actualColumnCount.toString();
        this.updateGridSelection();
        this.clearCanvas();
        this.updateDisplay();
        this.setStatus(`Selected sprite: ${sprite.name}`);
    }
    updateDisplay() {
        if (this.sprites.length === 0 || this.currentSpriteIndex >= this.sprites.length) {
            this.clearCanvas();
            console.log('No sprites to display');
            return;
        }
        const sprite = this.sprites[this.currentSpriteIndex];
        const frameIndex = this.currentRow * this.actualColumnCount + this.currentColumn;
        console.log(`Displaying sprite ${this.currentSpriteIndex}, frame ${frameIndex} (${this.currentRow}x${this.currentColumn})`);
        console.log(`Sprite has ${sprite.frames.length} frames, ${sprite.rowCount}x${sprite.columnCount} (using ${this.actualRowCount}x${this.actualColumnCount})`);
        if (frameIndex >= sprite.frames.length) {
            console.warn(`Frame index ${frameIndex} >= ${sprite.frames.length}, clearing canvas`);
            this.clearCanvas();
            return;
        }
        const frame = sprite.frames[frameIndex];
        console.log(`Rendering frame: ${frame.width}x${frame.height} at (${frame.x},${frame.y})`);
        this.renderFrame(sprite, frame, frameIndex);
        this.elements.currentFrame.textContent =
            `${frameIndex + 1}/${sprite.frames.length} (Row: ${this.currentRow + 1}, Col: ${this.currentColumn + 1})`;
    }
    renderFrame(sprite, frame, frameIndex) {
        console.log(`renderFrame called: frame ${frameIndex}, ${frame.width}x${frame.height}, ${frame.pixels.length} pixels`);
        this.clearCanvas();
        if (!frame.pixels || frame.pixels.length === 0) {
            console.warn('No pixel data for frame');
            return;
        }
        let nonZeroCount = 0;
        for (let i = 0; i < Math.min(100, frame.pixels.length); i++) {
            if (frame.pixels[i] !== 0)
                nonZeroCount++;
        }
        console.log(`Frame has ${nonZeroCount} non-zero pixels in first 100 bytes`);
        const canvasWidth = 700;
        const canvasHeight = 700;
        if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
            this.updateCanvasBackground();
            console.log(`Canvas resized to ${canvasWidth}x${canvasHeight}`);
        }
        console.log(`Canvas size: ${canvasWidth}x${canvasHeight}, zoom: ${this.zoomLevel}`);
        console.log(`Frame data: ${frame.width}x${frame.height}, ${frame.pixels.length} pixels`);
        if (frame.width <= 0 || frame.height <= 0 || frame.pixels.length !== frame.width * frame.height) {
            console.error(`Invalid frame data: ${frame.width}x${frame.height}, expected ${frame.width * frame.height} pixels, got ${frame.pixels.length}`);
            this.clearCanvas();
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`Invalid Frame: ${frame.width}x${frame.height}`, 10, 30);
            this.ctx.fillText(`Expected ${frame.width * frame.height} pixels`, 10, 50);
            this.ctx.fillText(`Got ${frame.pixels.length} pixels`, 10, 70);
            return;
        }
        let imageData;
        try {
            imageData = this.ctx.createImageData(frame.width, frame.height);
        }
        catch (error) {
            console.error(`Failed to create ImageData for ${frame.width}x${frame.height}:`, error);
            return;
        }
        const data = imageData.data;
        console.log(`Creating ${frame.width}x${frame.height} image with ${frame.pixels.length} pixels`);
        const totalNormalFrames = sprite.rowCount * sprite.columnCount;
        const isShadowFrame = frameIndex >= totalNormalFrames && frameIndex < totalNormalFrames + (sprite.shadowCount || 0);
        let visiblePixels = 0;
        let maxPaletteIndex = 0;
        for (let i = 0; i < frame.pixels.length; i++) {
            const paletteIndex = frame.pixels[i];
            maxPaletteIndex = Math.max(maxPaletteIndex, paletteIndex);
            let color = sprite.palette[paletteIndex];
            if (color === undefined) {
                console.warn(`Missing palette entry for index ${paletteIndex}`);
                color = 0xFF00FF00;
            }
            if (paletteIndex !== 0) {
                color = this.applyColorAdjustments(color);
                visiblePixels++;
            }
            const pixelIndex = i * 4;
            if (paletteIndex === 0) {
                data[pixelIndex] = 0;
                data[pixelIndex + 1] = 0;
                data[pixelIndex + 2] = 0;
                data[pixelIndex + 3] = 0;
            }
            else {
                if ((color & 0xFF000000) === 0) {
                    color |= 0xFF000000;
                }
                let r = (color >>> 16) & 0xFF;
                let g = (color >>> 8) & 0xFF;
                let b = color & 0xFF;
                let a = 255;
                if (paletteIndex > sprite.maxSolidIndex) {
                    const shadowRange = 255 - sprite.maxSolidIndex;
                    const shadowLevel = paletteIndex - sprite.maxSolidIndex;
                    if (shadowRange > 0) {
                        if (shadowLevel <= shadowRange * 0.25) {
                            a = 192;
                            r = Math.floor(r * 0.8);
                            g = Math.floor(g * 0.8);
                            b = Math.floor(b * 0.8);
                        }
                        else if (shadowLevel <= shadowRange * 0.5) {
                            a = 128;
                            r = Math.floor(r * 0.6);
                            g = Math.floor(g * 0.6);
                            b = Math.floor(b * 0.6);
                        }
                        else if (shadowLevel <= shadowRange * 0.75) {
                            a = 96;
                            r = Math.floor(r * 0.4);
                            g = Math.floor(g * 0.4);
                            b = Math.floor(b * 0.4);
                        }
                        else {
                            a = 64;
                            r = Math.floor(r * 0.2);
                            g = Math.floor(g * 0.2);
                            b = Math.floor(b * 0.2);
                        }
                    }
                }
                else if (isShadowFrame) {
                    r = Math.floor(r * 0.3);
                    g = Math.floor(g * 0.3);
                    b = Math.floor(b * 0.3);
                    a = 128;
                }
                data[pixelIndex] = r;
                data[pixelIndex + 1] = g;
                data[pixelIndex + 2] = b;
                data[pixelIndex + 3] = a;
            }
        }
        console.log(`Converted ${visiblePixels} visible pixels out of ${frame.pixels.length}, max palette index: ${maxPaletteIndex}`);
        console.log(`maxSolidIndex: ${sprite.maxSolidIndex}, shadow pixels: ${maxPaletteIndex > sprite.maxSolidIndex ? 'detected' : 'none'}`);
        if (isShadowFrame) {
            console.log(`Legacy shadow frame detected - applied uniform translucency`);
        }
        const logicalFrameWidth = sprite.width;
        const logicalFrameHeight = sprite.height;
        const logicalCanvas = document.createElement('canvas');
        logicalCanvas.width = logicalFrameWidth;
        logicalCanvas.height = logicalFrameHeight;
        const logicalCtx = logicalCanvas.getContext('2d');
        if (!logicalCtx) {
            console.error('Failed to create logical canvas context');
            this.drawTestPattern();
            return;
        }
        logicalCtx.clearRect(0, 0, logicalFrameWidth, logicalFrameHeight);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
            console.error('Failed to create temporary canvas context');
            this.drawTestPattern();
            return;
        }
        tempCtx.putImageData(imageData, 0, 0);
        const offsetX = frame.x;
        const offsetY = frame.y + sprite.ySortAdjust;
        logicalCtx.drawImage(tempCanvas, offsetX, offsetY);
        console.log(`LOGICAL FRAME: ${logicalFrameWidth}x${logicalFrameHeight} cell`);
        console.log(`ACTUAL DATA: ${frame.width}x${frame.height} at offset (${offsetX}, ${offsetY})`);
        const effectiveZoom = this.zoomLevel;
        const scaledLogicalWidth = logicalFrameWidth * effectiveZoom;
        const scaledLogicalHeight = logicalFrameHeight * effectiveZoom;
        const centerX = (canvasWidth - scaledLogicalWidth) / 2;
        const centerY = (canvasHeight - scaledLogicalHeight) / 2;
        console.log(`FINAL DRAW: Logical frame ${scaledLogicalWidth}x${scaledLogicalHeight} centered at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
        this.ctx.imageSmoothingEnabled = false;
        try {
            this.ctx.drawImage(logicalCanvas, centerX, centerY, scaledLogicalWidth, scaledLogicalHeight);
            console.log('Frame rendered successfully');
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Frame ${frameIndex}: ${logicalFrameWidth}x${logicalFrameHeight} logical frame with ${frame.width}x${frame.height} data at (${offsetX},${offsetY}) zoom: ${effectiveZoom}x`, 10, canvasHeight - 30);
            const compressionInfo = `Compression: 0x${sprite.compressionFlags.toString(16)} | Animation: ${sprite.animationTime}ms`;
            this.ctx.fillText(compressionInfo, 10, canvasHeight - 10);
            if (sprite.category !== "Sprite" || sprite.description !== "Infantry Sprite") {
                this.ctx.fillStyle = 'yellow';
                this.ctx.fillText(`"${sprite.category}" - ${sprite.description}`, 10, 20);
            }
        }
        catch (error) {
            console.error('Error drawing frame:', error);
        }
    }
    applyColorAdjustments(color) {
        if (this.hueShift === 0 && this.saturationAdjust === 0 && this.valueAdjust === 0) {
            return color;
        }
        const r = ((color >>> 16) & 0xFF) / 255;
        const g = ((color >>> 8) & 0xFF) / 255;
        const b = (color & 0xFF) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        let h = 0, s = 0, v = max;
        if (delta !== 0) {
            s = delta / max;
            if (r === max)
                h = ((g - b) / delta) % 6;
            else if (g === max)
                h = (b - r) / delta + 2;
            else
                h = (r - g) / delta + 4;
            h *= 60;
            if (h < 0)
                h += 360;
        }
        h = (h + this.hueShift) % 360;
        if (h < 0)
            h += 360;
        s = Math.max(0, Math.min(1, s + this.saturationAdjust / 100));
        v = Math.max(0, Math.min(1, v + this.valueAdjust / 100));
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        let rPrime = 0, gPrime = 0, bPrime = 0;
        if (h < 60) {
            rPrime = c;
            gPrime = x;
            bPrime = 0;
        }
        else if (h < 120) {
            rPrime = x;
            gPrime = c;
            bPrime = 0;
        }
        else if (h < 180) {
            rPrime = 0;
            gPrime = c;
            bPrime = x;
        }
        else if (h < 240) {
            rPrime = 0;
            gPrime = x;
            bPrime = c;
        }
        else if (h < 300) {
            rPrime = x;
            gPrime = 0;
            bPrime = c;
        }
        else {
            rPrime = c;
            gPrime = 0;
            bPrime = x;
        }
        const newR = Math.round((rPrime + m) * 255);
        const newG = Math.round((gPrime + m) * 255);
        const newB = Math.round((bPrime + m) * 255);
        return (newR << 16) | (newG << 8) | newB;
    }
    clearCanvas() {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        console.log(`Canvas cleared: ${this.canvas.width}x${this.canvas.height}`);
    }
    updateCanvasBackground() {
        this.canvas.style.backgroundColor = `rgb(${this.bgColor.r}, ${this.bgColor.g}, ${this.bgColor.b})`;
    }
    drawTestPattern() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(10, 10, 50, 50);
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(70, 10, 50, 50);
        this.ctx.fillStyle = 'green';
        this.ctx.fillRect(130, 10, 50, 50);
        this.ctx.fillStyle = 'blue';
        this.ctx.fillRect(190, 10, 50, 50);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Test Pattern - Canvas Working', 10, 90);
        console.log('Test pattern drawn - remove this when sprites load successfully');
    }
    startAnimation() {
        if (this.isPlaying || this.sprites.length === 0)
            return;
        this.isPlaying = true;
        this.setStatus('Animation playing...');
        const animate = () => {
            if (!this.isPlaying)
                return;
            this.currentColumn++;
            if (this.currentColumn >= this.actualColumnCount) {
                this.currentColumn = 0;
                this.currentRow++;
                if (this.currentRow >= this.actualRowCount) {
                    this.currentRow = 0;
                }
            }
            this.elements.rowSlider.value = this.currentRow.toString();
            this.elements.columnSlider.value = this.currentColumn.toString();
            this.elements.rowValue.textContent = this.currentRow.toString();
            this.elements.columnValue.textContent = this.currentColumn.toString();
            this.updateDisplay();
            const interval = Math.max(10, 200 - (this.animationSpeed * 10));
            this.animationId = setTimeout(animate, interval);
        };
        animate();
    }
    pauseAnimation() {
        this.isPlaying = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
        this.setStatus('Animation paused');
    }
    stopAnimation() {
        this.pauseAnimation();
        this.currentRow = 0;
        this.currentColumn = 0;
        this.elements.rowSlider.value = '0';
        this.elements.columnSlider.value = '0';
        this.elements.rowValue.textContent = '0';
        this.elements.columnValue.textContent = '0';
        this.updateDisplay();
        this.setStatus('Animation stopped');
    }
    playAudio(filename) {
        const audioData = this.audioFiles.get(filename);
        if (!audioData)
            return;
        try {
            const audioPlayer = this.elements.audioPlayer;
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
                this.currentAudioUrl = null;
            }
            const blob = new Blob([audioData], { type: 'audio/wav' });
            this.currentAudioUrl = URL.createObjectURL(blob);
            audioPlayer.src = this.currentAudioUrl;
            audioPlayer.load();
            this.elements.audioInfo.textContent = `Playing: ${filename} (${(audioData.length / 1024).toFixed(1)}KB)`;
            audioPlayer.play().catch(error => {
                console.log('Auto-play prevented:', error);
                this.elements.audioInfo.textContent = `Ready to play: ${filename} (${(audioData.length / 1024).toFixed(1)}KB) - Click play button`;
            });
        }
        catch (error) {
            console.error('Error playing audio:', error);
            this.elements.audioInfo.textContent = `Error playing ${filename}`;
        }
    }
    showLoading(show) {
        if (show) {
            this.elements.loadingIndicator.classList.remove('hidden');
        }
        else {
            this.elements.loadingIndicator.classList.add('hidden');
        }
    }
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.remove('hidden');
        setTimeout(() => {
            this.elements.errorMessage.classList.add('hidden');
        }, 5000);
    }
    setStatus(message) {
        this.elements.statusText.textContent = message;
    }
    async switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        if (tabName === 'sprites') {
            this.elements.spriteTab.classList.add('active');
            this.updateSpriteTreeView();
        }
        else {
            this.elements.audioTab.classList.add('active');
            this.updateAudioTreeView();
        }
        this.setStatus(`Switched to ${tabName} mode`);
    }
    playCurrentAudio() {
        if (this.currentAudioFile) {
            const audioPlayer = this.elements.audioPlayer;
            audioPlayer.play().catch(error => {
                console.log('Play prevented:', error);
                this.setStatus('Could not play audio - user interaction required');
            });
        }
    }
    pauseCurrentAudio() {
        const audioPlayer = this.elements.audioPlayer;
        audioPlayer.pause();
    }
    stopCurrentAudio() {
        const audioPlayer = this.elements.audioPlayer;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    expandAllBloFiles() {
        this.spritesByBlo.forEach((_, bloName) => {
            this.expandedBloFiles.add(bloName);
        });
        this.updateSpriteTreeView();
    }
    collapseAllBloFiles() {
        this.expandedBloFiles.clear();
        this.updateSpriteTreeView();
    }
    expandAllAudioBloFiles() {
        this.allAudioFiles.forEach((audioData, filename) => {
            this.expandedAudioBloFiles.add(audioData.source);
        });
        const audioSearch = document.getElementById('audioSearch');
        const searchFilter = audioSearch ? audioSearch.value.toLowerCase() : '';
        this.updateAudioTreeView(searchFilter);
    }
    collapseAllAudioBloFiles() {
        this.expandedAudioBloFiles.clear();
        const audioSearch = document.getElementById('audioSearch');
        const searchFilter = audioSearch ? audioSearch.value.toLowerCase() : '';
        this.updateAudioTreeView(searchFilter);
    }
    updateSpriteTreeView() {
        const treeView = document.getElementById('spriteTreeView');
        if (!treeView) {
            console.warn('Sprite tree view element not found');
            return;
        }
        treeView.innerHTML = '';
        if (this.spritesByBlo.size === 0 || Array.from(this.spritesByBlo.values()).every(sprites => sprites.length === 0)) {
            this.updateLeftPanelBloList();
            return;
        }
        let graphicsCount = 0, soundsCount = 0, hybridCount = 0;
        this.bloFiles.forEach(file => {
            if (file.type === 'graphics')
                graphicsCount++;
            else if (file.type === 'sounds')
                soundsCount++;
            else
                hybridCount++;
        });
        const groupedFiles = {
            graphics: [],
            sounds: [],
            hybrid: []
        };
        this.bloFiles.forEach((fileItem, index) => {
            const item = {
                file: fileItem.file,
                name: fileItem.name,
                type: fileItem.type,
                index: index
            };
            groupedFiles[fileItem.type].push(item);
        });
        ['graphics', 'sounds', 'hybrid'].forEach(type => {
            const files = groupedFiles[type];
            if (files.length > 0) {
                const typeHeader = document.createElement('div');
                typeHeader.className = 'blo-type-header';
                typeHeader.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Files (${files.length})`;
                treeView.appendChild(typeHeader);
                files.forEach(({ file, name, index }) => {
                    const sprites = this.spritesByBlo.get(name) || [];
                    const bloContainer = document.createElement('div');
                    bloContainer.className = 'tree-blo-file';
                    const bloHeader = document.createElement('div');
                    bloHeader.className = `tree-blo-header ${this.expandedBloFiles.has(name) ? 'expanded' : ''}`;
                    if (this.currentBloFile && this.currentBloFile.name === file.name) {
                        bloHeader.classList.add('active');
                    }
                    const expandIcon = document.createElement('span');
                    expandIcon.className = 'expand-icon';
                    expandIcon.textContent = '▶';
                    const bloTitle = document.createElement('span');
                    if (sprites.length > 0) {
                        bloTitle.textContent = `${name} (${sprites.length} sprites)`;
                    }
                    else {
                        bloTitle.textContent = `${name} (Click to load)`;
                        bloTitle.style.opacity = '0.7';
                    }
                    bloHeader.appendChild(expandIcon);
                    bloHeader.appendChild(bloTitle);
                    bloHeader.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (sprites.length === 0) {
                            await this.loadBloFile(file);
                        }
                        else {
                            if (this.expandedBloFiles.has(name)) {
                                this.expandedBloFiles.delete(name);
                            }
                            else {
                                this.expandedBloFiles.add(name);
                            }
                            this.updateSpriteTreeView();
                        }
                    });
                    const spritesContainer = document.createElement('div');
                    spritesContainer.className = `tree-blo-sprites ${this.expandedBloFiles.has(name) ? 'expanded' : ''}`;
                    if (sprites.length > 0) {
                        const filteredSprites = sprites.filter(sprite => this.spriteSearchFilter === '' ||
                            sprite.name.toLowerCase().includes(this.spriteSearchFilter));
                        filteredSprites.forEach((sprite, index) => {
                            const spriteItem = document.createElement('div');
                            spriteItem.className = 'sprite-grid-item';
                            const thumbnail = this.generateSpriteThumbnail(sprite, 70);
                            const img = document.createElement('img');
                            img.src = thumbnail;
                            img.alt = sprite.name;
                            img.className = 'sprite-thumbnail-full';
                            const overlay = document.createElement('div');
                            overlay.className = 'sprite-name-overlay';
                            overlay.textContent = sprite.name;
                            spriteItem.appendChild(img);
                            spriteItem.appendChild(overlay);
                            spriteItem.addEventListener('click', () => {
                                this.selectSpriteFromTree(sprite, name);
                                document.querySelectorAll('.sprite-grid-item').forEach(item => item.classList.remove('selected'));
                                spriteItem.classList.add('selected');
                            });
                            spritesContainer.appendChild(spriteItem);
                        });
                    }
                    bloContainer.appendChild(bloHeader);
                    if (sprites.length > 0) {
                        bloContainer.appendChild(spritesContainer);
                    }
                    treeView.appendChild(bloContainer);
                });
            }
        });
        this.elements.fileCountLeft.textContent = `${this.bloFiles.length} files - Graphics: ${graphicsCount}, Sounds: ${soundsCount}, Hybrid: ${hybridCount}`;
    }
    updateAudioTreeView(searchFilter = '') {
        const treeView = document.getElementById('audioTreeView');
        if (!treeView) {
            console.warn('Audio tree view element not found');
            return;
        }
        treeView.innerHTML = '';
        if (this.allAudioFiles.size === 0) {
            this.audioFileList = [];
            this.currentAudioIndex = -1;
            treeView.innerHTML = '<div class="tree-empty">No audio files loaded</div>';
            const audioSummary = document.getElementById('audioSummary');
            if (audioSummary) {
                audioSummary.textContent = '0 files loaded';
            }
            return;
        }
        this.audioFileList = [];
        const audioByBlo = new Map();
        this.allAudioFiles.forEach(({ data, source }, filename) => {
            const matchesSearch = searchFilter === '' ||
                filename.toLowerCase().includes(searchFilter) ||
                source.toLowerCase().includes(searchFilter);
            if (matchesSearch) {
                const audioItem = { filename, data, source };
                this.audioFileList.push(audioItem);
                if (!audioByBlo.has(source)) {
                    audioByBlo.set(source, []);
                }
                audioByBlo.get(source).push(audioItem);
            }
        });
        if (searchFilter === '') {
            audioByBlo.forEach((audioFiles, bloName) => {
                this.expandedAudioBloFiles.add(bloName);
            });
        }
        else {
            audioByBlo.forEach((audioFiles, bloName) => {
                this.expandedAudioBloFiles.add(bloName);
            });
        }
        let totalFiles = 0;
        audioByBlo.forEach((audioFiles, bloName) => {
            totalFiles += audioFiles.length;
            const bloContainer = document.createElement('div');
            bloContainer.className = 'tree-blo-file';
            const bloHeader = document.createElement('div');
            bloHeader.className = `tree-blo-header ${this.expandedAudioBloFiles.has(bloName) ? 'expanded' : ''}`;
            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon';
            expandIcon.textContent = '▶';
            const bloTitle = document.createElement('span');
            bloTitle.textContent = `${bloName} (${audioFiles.length} audio files)`;
            bloHeader.appendChild(expandIcon);
            bloHeader.appendChild(bloTitle);
            bloHeader.addEventListener('click', () => {
                if (this.expandedAudioBloFiles.has(bloName)) {
                    this.expandedAudioBloFiles.delete(bloName);
                }
                else {
                    this.expandedAudioBloFiles.add(bloName);
                }
                this.updateAudioTreeView(searchFilter);
            });
            const audioContainer = document.createElement('div');
            audioContainer.className = `tree-blo-audio ${this.expandedAudioBloFiles.has(bloName) ? 'expanded' : ''}`;
            audioFiles.forEach(({ filename, data }) => {
                const audioItem = document.createElement('div');
                audioItem.className = 'audio-file-item';
                const nameDiv = document.createElement('div');
                nameDiv.textContent = filename;
                const sizeDiv = document.createElement('div');
                sizeDiv.className = 'file-size';
                sizeDiv.textContent = `${(data.length / 1024).toFixed(1)}KB`;
                audioItem.appendChild(nameDiv);
                audioItem.appendChild(sizeDiv);
                audioItem.addEventListener('click', async () => {
                    console.log(`Clicked audio file: ${filename}`);
                    document.querySelectorAll('.audio-file-item').forEach(item => item.classList.remove('active'));
                    audioItem.classList.add('active');
                    await this.playAudioFromAll(filename);
                });
                audioContainer.appendChild(audioItem);
            });
            bloContainer.appendChild(bloHeader);
            bloContainer.appendChild(audioContainer);
            treeView.appendChild(bloContainer);
        });
        const audioSummary = document.getElementById('audioSummary');
        if (audioSummary) {
            if (searchFilter) {
                audioSummary.textContent = `${totalFiles} files found (searching: "${searchFilter}")`;
            }
            else {
                audioSummary.textContent = `${totalFiles} files loaded`;
            }
        }
    }
    selectSpriteFromAll(index) {
        if (index < 0 || index >= this.allSprites.length)
            return;
        const sprite = this.allSprites[index];
        this.currentSpriteIndex = index;
        if (this.currentTab !== 'sprites') {
            this.switchTab('sprites');
        }
        this.sprites = [sprite];
        this.currentSpriteIndex = 0;
        this.selectSprite(0);
        this.updateSpriteTreeView();
    }
    async cycleAudio(direction) {
        if (this.audioFileList.length === 0)
            return;
        if (this.currentAudioIndex < 0) {
            this.currentAudioIndex = 0;
        }
        else {
            this.currentAudioIndex += direction;
            if (this.currentAudioIndex >= this.audioFileList.length) {
                this.currentAudioIndex = 0;
            }
            else if (this.currentAudioIndex < 0) {
                this.currentAudioIndex = this.audioFileList.length - 1;
            }
        }
        const audioFile = this.audioFileList[this.currentAudioIndex];
        if (audioFile) {
            await this.playAudioFromAll(audioFile.filename);
            this.updateAudioSelection();
            this.scrollToSelectedAudio(audioFile.filename);
        }
    }
    updateAudioSelection() {
        document.querySelectorAll('.audio-file-item').forEach(item => item.classList.remove('active'));
        if (this.currentAudioIndex >= 0 && this.currentAudioIndex < this.audioFileList.length) {
            const currentFile = this.audioFileList[this.currentAudioIndex];
            document.querySelectorAll('.audio-file-item').forEach(item => {
                const nameDiv = item.querySelector('div:first-child');
                if (nameDiv && nameDiv.textContent === currentFile.filename) {
                    item.classList.add('active');
                }
            });
        }
    }
    selectSpriteFromTree(sprite, bloName) {
        if (this.currentTab !== 'sprites') {
            this.switchTab('sprites');
        }
        const globalIndex = this.allSprites.findIndex(s => s.name === sprite.name);
        if (globalIndex >= 0) {
            this.currentSpriteIndex = globalIndex;
            this.sprites = [sprite];
            this.currentSpriteIndex = 0;
            this.selectSprite(0);
            this.updateSpriteTreeView();
            this.setStatus(`Selected ${sprite.name} from ${bloName}`);
        }
    }
    async playAudioFromAll(filename) {
        const audioData = this.allAudioFiles.get(filename);
        if (!audioData)
            return;
        this.currentAudioFile = filename;
        this.currentAudioIndex = this.audioFileList.findIndex(item => item.filename === filename);
        try {
            const audioPlayer = this.elements.audioPlayer;
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
                this.currentAudioUrl = null;
            }
            const blob = new Blob([audioData.data], { type: 'audio/wav' });
            this.currentAudioUrl = URL.createObjectURL(blob);
            audioPlayer.src = this.currentAudioUrl;
            audioPlayer.load();
            await new Promise((resolve) => {
                const onCanPlay = async () => {
                    try {
                        console.log(`Attempting to auto-play: ${filename}`);
                        await audioPlayer.play();
                        console.log(`Successfully auto-playing: ${filename}`);
                        this.setStatus(`🔊 Playing: ${filename}`);
                    }
                    catch (error) {
                        console.log('Auto-play prevented by browser policy:', error);
                        this.setStatus(`⏸️ Ready: ${filename} (Click play button - browser blocked auto-play)`);
                    }
                    resolve();
                };
                if (audioPlayer.readyState >= 2) {
                    onCanPlay();
                }
                else {
                    audioPlayer.addEventListener('canplay', onCanPlay, { once: true });
                }
            });
            this.elements.currentTrackName.textContent = filename;
            this.elements.currentTrackDetails.textContent = `From: ${audioData.source}`;
            this.elements.audioFileName.textContent = filename;
            this.elements.audioFileSize.textContent = `${(audioData.data.length / 1024).toFixed(1)}KB`;
        }
        catch (error) {
            console.error('Error playing audio:', error);
            this.setStatus(`Error playing ${filename}`);
        }
    }
    updateGridSelection() {
        document.querySelectorAll('.sprite-grid-item').forEach((item, index) => {
            if (index === this.currentSpriteIndex) {
                item.classList.add('selected');
            }
            else {
                item.classList.remove('selected');
            }
        });
    }
    generateSpriteThumbnail(sprite, size = 32) {
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = size;
        thumbnailCanvas.height = size;
        const thumbnailCtx = thumbnailCanvas.getContext('2d');
        if (!thumbnailCtx || !sprite.frames.length) {
            if (thumbnailCtx) {
                thumbnailCtx.fillStyle = '#333333';
                thumbnailCtx.fillRect(0, 0, size, size);
                thumbnailCtx.fillStyle = '#666666';
                thumbnailCtx.font = '10px Arial';
                thumbnailCtx.fillText('?', size / 2 - 3, size / 2 + 3);
            }
            return thumbnailCanvas.toDataURL();
        }
        const frame = sprite.frames[0];
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = frame.width;
        frameCanvas.height = frame.height;
        const frameCtx = frameCanvas.getContext('2d');
        if (!frameCtx)
            return thumbnailCanvas.toDataURL();
        const imageData = frameCtx.createImageData(frame.width, frame.height);
        const data = imageData.data;
        for (let i = 0; i < frame.pixels.length; i++) {
            const paletteIndex = frame.pixels[i];
            let color = sprite.palette[paletteIndex] || 0xFF000000;
            const pixelIndex = i * 4;
            if (paletteIndex === 0) {
                data[pixelIndex] = 0;
                data[pixelIndex + 1] = 0;
                data[pixelIndex + 2] = 0;
                data[pixelIndex + 3] = 0;
            }
            else {
                if ((color & 0xFF000000) === 0) {
                    color |= 0xFF000000;
                }
                data[pixelIndex] = (color >>> 16) & 0xFF;
                data[pixelIndex + 1] = (color >>> 8) & 0xFF;
                data[pixelIndex + 2] = color & 0xFF;
                data[pixelIndex + 3] = 255;
            }
        }
        frameCtx.putImageData(imageData, 0, 0);
        thumbnailCtx.imageSmoothingEnabled = false;
        thumbnailCtx.fillStyle = '#1e1e1e';
        thumbnailCtx.fillRect(0, 0, size, size);
        const scale = Math.min(size / frame.width, size / frame.height);
        const scaledWidth = frame.width * scale;
        const scaledHeight = frame.height * scale;
        const offsetX = (size - scaledWidth) / 2;
        const offsetY = (size - scaledHeight) / 2;
        thumbnailCtx.drawImage(frameCanvas, offsetX, offsetY, scaledWidth, scaledHeight);
        return thumbnailCanvas.toDataURL();
    }
    createSpriteGrid() {
        const spriteGrid = document.createElement('div');
        spriteGrid.className = 'sprite-grid';
        spriteGrid.id = 'spriteGrid';
        const spriteSelector = this.elements.spriteSelector;
        const parent = spriteSelector.parentElement;
        spriteSelector.style.display = 'none';
        parent.insertBefore(spriteGrid, spriteSelector.nextSibling);
    }
    updateSpriteGrid() {
        let spriteGrid = document.getElementById('spriteGrid');
        if (!spriteGrid) {
            this.createSpriteGrid();
            spriteGrid = document.getElementById('spriteGrid');
        }
        spriteGrid.innerHTML = '';
        if (this.sprites.length === 0) {
            spriteGrid.innerHTML = '<div class="sprite-grid-item empty">No sprites loaded</div>';
            return;
        }
        this.sprites.forEach((sprite, index) => {
            const spriteItem = document.createElement('div');
            spriteItem.className = `sprite-grid-item ${index === this.currentSpriteIndex ? 'selected' : ''}`;
            spriteItem.setAttribute('data-sprite-index', index.toString());
            const thumbnail = this.generateSpriteThumbnail(sprite, 70);
            const img = document.createElement('img');
            img.src = thumbnail;
            img.alt = sprite.name;
            img.className = 'sprite-thumbnail-full';
            const overlay = document.createElement('div');
            overlay.className = 'sprite-name-overlay';
            overlay.textContent = sprite.name;
            spriteItem.appendChild(img);
            spriteItem.appendChild(overlay);
            spriteItem.addEventListener('click', () => {
                this.selectSprite(index);
                const selector = this.elements.spriteSelector;
                selector.selectedIndex = index;
                document.querySelectorAll('.sprite-grid-item').forEach(item => item.classList.remove('selected'));
                spriteItem.classList.add('selected');
            });
            spriteGrid.appendChild(spriteItem);
        });
    }
    manageMemory(newlyLoadedBloName) {
        this.loadedBloOrder = [newlyLoadedBloName, ...this.loadedBloOrder.filter(name => name !== newlyLoadedBloName)];
        while (this.loadedBloOrder.length > this.maxLoadedBloFiles) {
            const oldestBlo = this.loadedBloOrder.pop();
            if (oldestBlo && oldestBlo !== newlyLoadedBloName) {
                this.unloadBloFile(oldestBlo);
                console.log(`Unloaded ${oldestBlo} to free memory`);
            }
        }
        this.updateLeftPanelBloList();
    }
    unloadBloFile(bloName) {
        const spritesToRemove = this.spritesByBlo.get(bloName) || [];
        spritesToRemove.forEach(sprite => {
            const index = this.allSprites.findIndex(s => s === sprite);
            if (index >= 0) {
                this.allSprites.splice(index, 1);
            }
        });
        this.spritesByBlo.delete(bloName);
        this.loadedBloOrder = this.loadedBloOrder.filter(name => name !== bloName);
    }
    getMemoryStatus() {
        const loaded = this.loadedBloOrder.length;
        const total = this.bloFiles.length;
        return `${loaded}/${this.maxLoadedBloFiles} files in memory, ${total} total available`;
    }
    scrollToSelectedBloFile(fileName) {
        const treeView = document.getElementById('spriteTreeView');
        if (!treeView) {
            console.warn('Tree view not found for scrolling');
            return;
        }
        let targetElement = null;
        console.log('Looking for BLO file:', fileName);
        const bloFileItems = treeView.querySelectorAll('.blo-file-item');
        console.log('Found BLO file items:', bloFileItems.length);
        bloFileItems.forEach((item, index) => {
            const nameElement = item.querySelector('.blo-file-name');
            if (nameElement) {
                console.log(`BLO item ${index}:`, nameElement.textContent, 'active:', item.classList.contains('active'));
                if (nameElement.textContent === fileName) {
                    targetElement = item;
                    console.log('Found BLO file item by name:', fileName, targetElement);
                }
            }
        });
        if (!targetElement) {
            const activeItem = treeView.querySelector('.blo-file-item.active');
            if (activeItem) {
                targetElement = activeItem;
                console.log('Found active BLO item:', targetElement);
            }
        }
        if (!targetElement) {
            const bloHeaders = treeView.querySelectorAll('.tree-blo-header');
            bloHeaders.forEach(header => {
                const headerText = header.textContent || '';
                if (headerText.includes(fileName)) {
                    targetElement = header;
                    console.log('Found BLO header:', fileName, targetElement);
                }
            });
        }
        if (targetElement) {
            console.log('Found target element, scrolling to BLO file:', fileName);
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
            targetElement.style.outline = '2px solid #007acc';
            setTimeout(() => {
                targetElement.style.outline = '';
            }, 1000);
        }
        else {
            console.warn('Could not find target element for BLO file:', fileName);
            console.log('Available BLO items:');
            bloFileItems.forEach((item, index) => {
                const nameElement = item.querySelector('.blo-file-name');
                console.log(`  ${index}: ${nameElement?.textContent} (active: ${item.classList.contains('active')})`);
            });
        }
    }
    scrollToSelectedSprite(spriteName) {
        const treeView = document.getElementById('spriteTreeView');
        if (!treeView)
            return;
        const spriteItems = Array.from(treeView.querySelectorAll('.sprite-grid-item'));
        const targetElement = spriteItems.find(item => {
            const overlay = item.querySelector('.sprite-name-overlay');
            return overlay && overlay.textContent === spriteName;
        });
        if (targetElement) {
            let parent = targetElement.parentElement;
            while (parent && !parent.classList.contains('tree-blo-sprites')) {
                parent = parent.parentElement;
            }
            if (parent && !parent.classList.contains('expanded')) {
                let sibling = parent.previousElementSibling;
                if (sibling && sibling.classList.contains('tree-blo-header')) {
                    sibling.click();
                }
            }
            setTimeout(() => {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }, 150);
        }
    }
    scrollToSelectedAudio(audioFileName) {
        const treeView = document.getElementById('audioTreeView');
        if (!treeView)
            return;
        const audioItems = Array.from(treeView.querySelectorAll('.audio-file-item'));
        const targetElement = audioItems.find(item => {
            const nameDiv = item.querySelector('div:first-child');
            return nameDiv && nameDiv.textContent === audioFileName;
        });
        if (targetElement) {
            let parent = targetElement.parentElement;
            while (parent && !parent.classList.contains('tree-blo-audio')) {
                parent = parent.parentElement;
            }
            if (parent && !parent.classList.contains('expanded')) {
                let sibling = parent.previousElementSibling;
                if (sibling && sibling.classList.contains('tree-blo-header')) {
                    sibling.click();
                }
            }
            setTimeout(() => {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }, 150);
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new SpriteAnimator();
});
//# sourceMappingURL=app.js.map