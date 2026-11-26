# HonyMix Inventory & POS App

A lightweight, animated, small-business inventory and point-of-sale (POS) web application powered by Google Sheets & Google Apps Script—with an instant offline Demo Mode so you can test everything immediately.

## Folder Structure
- `frontend/index.html` — Responsive web app interface (Dashboard, Quick Sale POS, Restock, Products, Automations)
- `frontend/styles.css` — Modern UI with ambient animations, animated revenue bars, and print-ready customer receipts
- `frontend/app.js` — Frontend logic, live receipt preview, CSV export, and Apps Script API connector
- `backend/Code.gs` — Complete Google Apps Script backend combining your web API, Google Form dropdown auto-sync, and oversell protection

## Quick Start (2 Ways to Run)

### Option 1: Instant Demo Mode (Zero Setup)
1. Double-click `frontend/index.html` to open it in any web browser.
2. Click **"Launch Instant Demo Mode (No Setup Needed)"** (or sign in with `admin` / `Honymix2026`).
3. Test recording sales, restocking items, printing receipts, and exporting CSV reports right away.

### Option 2: Connect to Your Live Google Sheet
1. Open your Google Sheet and go to **Extensions → Apps Script**.
2. Replace the code with the contents of `backend/Code.gs` and click **Save**.
3. Run `setupSheets_` once if you haven't created your `Products`, `Sales`, and `Purchases` tabs yet.
4. Run `installAutomations` once to enable automatic Google Form dropdown syncing and oversell stock protection.
5. Click **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Copy the generated Web App URL, paste it into the login screen of `frontend/index.html`, and sign in (`admin` / `Honymix2026`).
