# Jazz Chart Viewer

A static browser application for importing and displaying iReal Pro chord-chart data. It can be hosted on GitHub Pages or opened directly from `index.html` after downloading the files.

Published site: [https://over-keys.github.io/Jazz-Chart-Viewer/](https://over-keys.github.io/Jazz-Chart-Viewer/)

## GitHub Pages deployment

Place all files and folders in this directory at the root of the selected GitHub Pages publishing source. Keep `index.html` and `.nojekyll` at that root.

No build step, package installation, or server-side processing is required.

## Use

The Help button opens the Japanese guide by default. English help is available from that page and from Settings.

1. Open the published site or `index.html`.
2. Open **Settings**, then choose **Import iReal data**.
3. Paste an `irealb://` or `irealbook://` shared string, or select a saved text or HTML file.
4. Search by song title or composer and choose a result. Only the first 100 matches are shown.
5. Choose Original or Expanded view.

Imported song source data and display settings are stored in the browser. Source data is stored compactly and reparsed when the application starts.

## Privacy and imported content

This application imports and displays chord-chart data selected by the user. Imported data is processed locally in the browser and is not uploaded to the application operator. Users are responsible for ensuring that they have the right to use the imported content.

## Trademark notice

iReal Pro is a trademark of Technimo LLC. This application is not affiliated with or endorsed by Technimo LLC.
