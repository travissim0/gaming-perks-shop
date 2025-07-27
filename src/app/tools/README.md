# Infantry Blob Viewer

A modern, cross-platform web-based viewer and animator for Infantry Online BLO/CFS files, featuring both sprite animation and audio playback capabilities. Built with TypeScript and HTML5 Canvas.

## Features

✨ **Modern UI**
- Dark theme with responsive design
- Tabbed interface for sprites and audio
- Smooth animations and transitions

🎮 **Sprite Viewing & Animation**
- Load and display Infantry BLO files
- Real-time animation playback with speed control
- Frame-by-frame navigation
- Auto-start animation on tab switch
- Tree-view browsing of sprite collections

🔊 **Audio Support**
- WAV audio file playback
- Waveform visualization
- Volume control and metadata display
- Playlist management with shuffle

🔧 **Advanced Controls**
- Zoom from 50% to 2000% with preset buttons
- HSV color adjustments (Hue, Saturation, Value)
- Customizable background color
- CFS timing display and control
- Directory loading for batch processing

⚡ **Performance**
- Non-blocking UI updates
- Smooth 60fps rendering
- Efficient canvas-based display
- Cross-platform compatibility

## Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Modern web browser with HTML5 Canvas support

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/infantry-blob-viewer.git
   cd infantry-blob-viewer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the TypeScript:**
   ```bash
   npm run build
   ```

4. **Start the development server:**
   ```bash
   npm run serve
   ```

5. **Open your browser:**
   ```
   http://localhost:8080
   ```

### Development Mode

For active development with auto-recompilation:

```bash
npm run dev
```

This will:
- Watch TypeScript files for changes
- Auto-compile on save
- Serve the application on localhost:8080

## Usage

### Loading BLO Files

**Single File:**
1. Click **"Load BLO File"** button
2. Select an Infantry BLO file from your system
3. Wait for sprites to load and appear in the tree view

**Directory Loading:**
1. Click **"Load Directory"** button
2. Select a folder containing multiple BLO files
3. Browse through the hierarchical tree view

### Sprite Navigation

**Sprites Tab:**
- Browse sprites using the tree view on the left
- Search sprites with the search box
- Select sprites to view in the center canvas
- Use expand/collapse controls for large collections

**Animation Controls:**
- Control playback with Play/Pause/Stop buttons
- Adjust animation speed (1-20, default: 15)
- Navigate frames manually with Row/Column sliders
- View current CFS timing information

**Visual Adjustments:**
- Adjust zoom level with slider or preset buttons
- Modify HSV values for color effects
- Change background color for better contrast
- View sprite dimensions and frame information

### Audio Features

**Audio Tab:**
- Load and play WAV audio files embedded in BLO files
- Visual waveform display
- Volume control and playback management
- Audio metadata viewing

### Keyboard Shortcuts

- **Tab**: Switch between Sprites and Audio tabs
- **Space**: Play/Pause animation (when on Animation tab)
- **Arrow Keys**: Navigate frames (when focused on sliders)
- **↑↓**: Navigate BLO files
- **←→**: Navigate sprites within selected BLO

## Architecture

### File Structure
```
infantry-blob-viewer/
├── src/
│   └── app.ts          # Main TypeScript application
├── index.html          # HTML structure and layout
├── styles.css          # Modern CSS styling
├── package.json        # Node.js dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md          # This file
```

### Key Components

**BlobViewer Class:**
- Main application controller
- Handles file loading and parsing
- Manages animation state and timing
- Controls canvas rendering

**File Format Support:**
- BLO (Blob) file parsing with multiple sprite support
- CFS (Compressed Frame Set) sprite extraction
- WAV audio file extraction and playback
- Palette-based color rendering with HSV adjustments
- Frame metadata and timing information

**Rendering Pipeline:**
- HTML5 Canvas-based sprite display
- Real-time color transformations
- Zoom and scaling support
- Transparent pixel handling
- Audio waveform visualization

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## What is Infantry Online?

Infantry Online was a 2D multiplayer combat game that used BLO (Blob) files to store game assets including sprites, animations, and audio. This viewer allows you to:

- Extract and view sprite graphics from BLO files
- Play back sprite animations with original timing
- Listen to embedded audio files
- Analyze the structure and metadata of game assets

## Acknowledgments

This project is built upon the foundational work of the [Gibbed.Infantry](https://github.com/gibbed/Gibbed.Infantry) project by Rick. The BLO and CFS file format parsing, data structures, and core concepts for handling Infantry Online assets are derived from that excellent work.

**Key contributions from Gibbed.Infantry:**
- BLO file format specification and parsing logic
- CFS (Compressed Frame Set) decompression algorithms
- Sprite frame structure and metadata handling
- Palette and color management systems

This web-based implementation represents a modernized, cross-platform adaptation of those foundational tools, reimplemented in TypeScript for browser-based usage while maintaining compatibility with the original file formats.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

## License

This project uses a dual licensing approach:

- Code and concepts derived from [Gibbed.Infantry](https://github.com/gibbed/Gibbed.Infantry) remain under the original zlib license
- New web-based implementation code is licensed under the MIT License

See the [LICENSE](LICENSE) file for complete details.

## Troubleshooting

### Common Issues

**BLO files not loading:**
- Ensure BLO file is valid Infantry Online format
- Check browser console for error messages
- Verify file isn't corrupted or truncated

**Performance issues:**
- Reduce zoom level for large sprites
- Close other browser tabs
- Use Chrome/Firefox for best performance
- Try loading fewer BLO files at once

**Build errors:**
- Ensure Node.js v16+ is installed
- Run `npm install` to update dependencies
- Clear dist folder: `npm run clean`

**Audio not playing:**
- Verify BLO file contains audio data
- Check browser audio permissions
- Test with different BLO files

### Getting Help

- Check browser developer console for errors
- Verify BLO file format compatibility
- Test with known working BLO files first
- Report issues on GitHub with sample files (if possible) 