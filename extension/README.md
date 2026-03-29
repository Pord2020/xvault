# Siftly Chrome Extension

See related bookmarks from your Siftly library as you browse Twitter/X.

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder inside this repository
5. Make sure Siftly is running at `http://localhost:3000`
6. Pin the extension from the Extensions menu and click it while browsing Twitter/X

## Usage

- **Auto-search**: When you open the popup on a Twitter/X page, it automatically searches your bookmarks based on the tweet you are viewing
- **Manual search**: Type any query into the search box to find related bookmarks
- **Add to Queue**: Click the Queue button on any result card to add it to your reading queue
- **View bookmark**: Click View to open the full bookmark in your Siftly instance
- **Floating badge**: A small "📚 Siftly" badge appears in the bottom-right corner of Twitter/X pages showing how many related bookmarks exist for the current tweet

## Settings

Click the gear icon in the popup header to change the Siftly URL (default: `http://localhost:3000`).

## Requirements

- Google Chrome (or any Chromium-based browser supporting Manifest V3)
- A running Siftly instance (see main README for setup instructions)
