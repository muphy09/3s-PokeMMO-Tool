# Changelog

All notable changes to **3's Pokemmo Tool** will be documented in this file.  
---

## [2.3.4]- 2025-08
### Added
- Move Filter!
  - Filter by a particular Move a Pokemon can learn, and refine it even further with a toggle for "Level up" only
- Total Caught #
  - Added a Total Caught option to the Catch List

### Fixed
- Improvements to the OCR to speed up detection of PokeMMO window
  - Should hopefully fix some of the inconsistent startup times.
- When filtering a category on the pokemon search, clicking into a Pokemon now scrolls to that Pokemons card.

---

## [2.2.7]- 2025-08
### Added
- Mac Release
  - DMG package has been added to the Releases. This is a stripped version of the App, just like the linux build. No Live tab feature currently
- Linux Release
  - Package for linux has been patched and added to the release. Stripped version of the windows app that does not include the Live tab feature    

### Fixed
  - Duplicate Held Item Entries from appearing
  - *Potentially* fixed the notifications Auto-Update sends

---

## [2.1.9] - 2025-08
### Added
  - UI scale (App UI) slider now included in the Options Menu -- Thanks Prior-Cobbler!
  - Held Item Sprites & Tooltips on hover

---

## [2.1.8] - 2025-08
### Fixed
  - Search bar now functions with filters selected in Pokemon tab
  - Search bar now clears when switching between tabs

---

## [2.1.7] - 2025-08
### Added
  - "Lure Only" Checkbox in Area & Live Tab
    - Filter Pokemon in the specific area to only "Lure" Pokemon -- Thanks Tcsess <3!

  - Custom Color Selection
    - Don't like what I've chosen for you? Pick that $@#% yourself with a new button at the top

  - Caught Feature
    - Mark which Pokemon you've caught to make it easier to see which ones you need to capture in a certain area.
    - Introduced a panel that allows you to select which Pokemon you've already caught
    - Can mark which Pokemon you've caught with the Pokeball icon in the top right of Pokemon boxes

  - Linux Release!
    - App now detects what OS you are running on startup and adjusts the features available accordingly. (Live is not supported in Linux)
    - I don't have a great way of testing this so feedback is MUCH appreciated for this crowd!

### Fixed
  - Cleaned the repository of unused / old data to trim file size.
---

## [2.1.5] - 2025-08
### Fixed
  - Optimized UI for Area and Live Tab
    - Redesigned the layout for Pokemon in the Areas tab and Live route to be more consistent and look less cluttered


---

## [2.1.4] - 2025-08
### Added
  - Advanced Pokemon Search
    - Search for Pokemon with filters - Type, Egg Group, Abilities, & Region!

---

## [2.1.3] - 2025-08
### Fixed
  - Day/Night specific Pokemon now properly appear properly in the Live tab, as they did in the Areas tab

---

## [2.1.1] - 2025-08
### Fixed
  - Live tab now functions again

---

## [2.1.0] - 2025-08
### Added
  - NEW Dataset for Pokemon Encounter information
    - Much more consistent between areas

---

## [2.0.0] - 2025-08
### Added
  - NEW Dataset for PokeMMO Pokemon.
    - COMPLETE overhaul of the data used for Pokemon information
    - Now includes a dropdown with Moves Information unique to PokeMMO Pokemon
      - Move Information includes method learned, type, category, power, and accuracy
    - Updated Location data to be inline with PokeMMO data - No more generic Gen 9 data!
    - Base Stats for each Pokemon have been added to the dataset
  
  - Catch Rate Data
    - See the Pokemon's catch rate displayed in the profile (Ball and status selector could be added in the future)

  - Item Search
    - Search for every item in PokeMMO and find out what it does (location data could be added in the future)

### Fixed
  - Patch Notes button now works properly! Hopefully you see this!

  - Abilities tab displayed "1, 2, 3" now updated to better represent the 'Hidden' Ability
  
  - Refreshed the UI to accomodate for the increased data.
    - Added dropdowns for Movesets and Locations to avoid clutter on the Pokemon screen.
    - Reorganized the flow of information so it appears cleaner when inside of a Pokemons' Profile
    - Rewrote containers to accomodate for the different size windows users run the app in 
  
  - Aligned 'Abilities' section to be more inline with Pokemon Type & Egg Group

---

## [1.9.7] - 2025-08
### Added
  - Pokemon Ability and Evolution chart in their profile section.
    - Includes all abilities + hidden abilities and how they evolve.
    - Hover on Pokemon ability for a Tooltip

  - TM Location Tab
    - Search for TM Locations (per region) with a new tab at the top. Thx Dom!

---

## [1.9.6] - 2025-08
### Fixed
  - Auto Update potentially displays when it is receiving, downloading, and applying an update.
    - Still testing this features' functionality

---

## [1.9.4] - 2025-08
### Fixed
  - Pokemon information persisted between tab switches; switching tabs now clears this data.
  
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