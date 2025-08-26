# Changelog

All notable changes to **Pokemmo Tool** will be documented in this file.  
This project adheres to [Semantic Versioning](https://semver.org/).
---

## [1.8.0] - 2025-08
### Added
  - **Overhaul of the OCR (capture tool for route display)**
      - Broader OCR active window selection
        - Now uses a number of factors to determine which window is the correct PokeMMO window. PokeMMO window must be focused to have data update.
      - Support for most UI Scales
        - OCR will now attempted to magnify the route capture if it appears too small, and continue to loop until a useable route can be found. This should help pull data for most UI scale sizes.
      - Windowed Mode Support
        - OCR will now correctly target the route in a Windowed screen.
       
  - **Pokemon Moveset Data**
      - Some Pokemon have been updated to include moveset data and egg groups.
          - This lays down groundwork for a full moveset and data implementation.
       
  - **Region Selection Filter**
      - Added dropdown in the 'Areas' tab to filter between regions

  - **Patch Notes Button**
      - Added a button so you'll never miss the juice
   
  - **View Pokemon from the Live Tab**
      - Added an option to "View" a Pokemon directly out of the Live tab. 
 
### Fixed
- **OCR "jitter" has been drastically reduced**
     - OCR now uses a combination of factors to minimize the jitter of detecting a route & no_route experienced before.
     - Route data is temporarily stored and pushed to user until a deterministic difference can be identified. It then references the local database for a known route location, if it matches, it updates.
     - OCR has improved filtering of artifacts when moving through screens that make it hard to read what the route says.
- **Route Search Keyword Mistmatch**
     - Better hadnling of route names between regions and how keywords filter these names.

---

## [1.7.1] - 2025-08
### Fixed
  - Unintentional app break, app install now works again.
  - Blank app window issue resolved after packaging.
    
---

## [1.6.8] - 2025-08
### Fixed
  - Liveroute OCR not starting – LiveRoute now properly starts as intended.

---

## [1.6.0] - 2025-08
### Added
  - **Auto-Updater** – users can check for updates directly from the app.  
  - **Check for Updates** button added to settings.  

### Fixed
- LiveRouteOCR files now correctly packaged with the app, ensuring the **Live Tab** connects without manual file copying.  
- Blank app window issue resolved after packaging.  

---

## [1.5.0] - 2025-08
### Added
- Packaged `.exe` portable build for easier distribution.  
- Improved packaging process to include **all required DLLs and dependencies**.  

### Fixed
- Missing application icon when packaged.  
- Security prompts clarified in documentation.  

---

## [1.4.0] - 2025-08
### Added
- **Region Buttons** – switch between Kanto, Hoenn, Sinnoh, and Unova instantly.  
- Performance upgrades for faster data handling.  
- Stability improvements when switching between tabs.  

### Fixed
- Tabbing out of the app no longer causes disconnections.  
- Missing Pokémon location data restored.  
- Parenthesis display issue resolved.  

---

## [1.3.5] - 2025-08
### Added
- Improved **screen location capture** for better accuracy.  
- Improved **filtering system** for encounters.  

### Fixed
- Better stability when changing windows or tabbing out.  
- Fixed Pokémon with missing location data.  
- Fixed parenthesis formatting issue.  

---

## [1.3.0] - 2025-08
### Added
- **Live Route Tab** – real-time tracking of Pokémon encounters based on player location.  
- Display automatically updates as you move through the game.  

### Fixed
- Improved packaging for more complete distribution.  

---

## [1.2.7] - 2025-08
### Added
- **Color-coded encounter rarities**:  
  - Very Common → Brown  
  - Common → White  
  - Uncommon → Green  
  - Rare → Blue  
  - Very Rare → Purple  
  - Horde → Red  
- Grouped together Pokémon with multiple encounter methods (e.g., Golbat in cave + grass now shows in one box).  
- All **Victory Road entrances in Sinnoh** are combined into a single entry.  

### Fixed
- Cleaned up duplicate and extra data from encounters.  

---

## [1.2.6] - 2025-08
### Added
- Stability improvements to encounter display.  

---

## [1.2.1] - 2025-08
### Changed
- Removed support for **Generations 6–9**, focusing exclusively on **Generations 1–5** to match PokéMMO.  
- Removed Fairy type to prevent type conflicts.  

---

## [1.2.0] - 2025-08
### Added
- Initial release with **Pokédex lookup** and encounter data scraping.  
- Base interface with tabs and early data integration.  