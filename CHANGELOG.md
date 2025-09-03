# Changelog
---

## [2.7.0]- 2025-09
- ### Added
- Team Builder Tab
  - Quickly assemble your roster and find out where weakness gaps reside on your team
  - Name & Save multiple teams for quick access
  - Recommended Pokemon types based on gaps in coverage

- "Home" Screen Added
  - Clicking "3's PokeMMO Tool" at the top now brings the user to a clean Home screen UI

- "Neo" Theme Added
  - Futuristic styled theme

### *Big* Fix
- Complete OCR Rework (Capature tool for Route and Battle Tabs)
  - Finalized window detection by returning immediately on title matches and retrieving the window’s process ID inline for fallback checks
  - Improved window discovery by enumerating visible windows for a PokeMMO match, ensuring the correct handle is found even when the game isn’t focused
  - Streamlined PokeMMO window check with fast title/class heuristics (GLFW + “javaw.exe”) and a fallback process check for reliability
  - Added process-based fallback that treats both pokemmo and javaw executables as valid, ensuring the OCR attaches to Java-hosted clients
  - Introduced a RemoveDiacritics helper to normalize titles before comparison, avoiding false negatives from accented characters
  - OCR now caches last recieved data and persists this data even between tab switches, ensuring no refresh is needed when tabbing back
  - ### MUCH more reliable & faster window detetion <3

- Reworked Navigation Bar Layout
  - Grouped the 'Live' tabs to be offset together
  - Included the new Team Builder tab
---

## [2.6.5]- 2025-09
### Added
- Themes
  - Choose from new theme options seen in the 'Theme' button - Themes are based on Pokemon games inside of PokeMMO
    - Red, Blue, Gold, Silver, Emerald, Diamond, Pearl, Black, & White are available now!
    - Theme changes most elements of UI, if there are issues experienced, please let me know!

- Sort Moveset Data
  - Click the label inside the Moveset data to sort by that category
    - Move Name, Type, Power, Category, and Accuracy. 

### Fixed
- Addressed missing Routes & Areas not appearing in the Live Tab
  - Live Route now does a better job of keywording particular areas that it was not indexing before (Ex- Jagged Pass)

- Live Battle Tab Performance
  - Live Battle code has been changed to be more in-line with the Live Route, leading to faster grab times and more consistency

---

## [2.6.3]- 2025-09
### Fixed
- Live Battle Tab now persists last Pokemon detected until it discovers a new Pokemon to display. This prevents flashing in and out during battle.

- Pokemon Catch Rate Data is now stored locally, instead of requesting from the Pokeapi - this speeds up display time greatly.

- Fixed certain locations from appearing in the Live Tab, even though their Area data existed

---

## [2.6.1]- 2025-08
### Fixed
- Live Route & Live Battle should grab the PokeMMO window faster and more consistently
  - Added a window cache check in-front of the forground window check to grab the last recognized PokeMMO window before cycling a full search
    - Results in much faster window grabbing

- All encounter methods now appear in the Live & Area tab. Make sure you re-select them!
  - Previously, some encounter methods were missing from the Live & Area tab, resulting in some Pokemon not appearing on the route - even though this data was in their profile
    - Cave, Dark Grass, Dust Cloud, Headbutt, Honey Tree, Inside, & Shadow are now all included in the encounter method dataset

---

## [2.5.9]- 2025-08
### Fixed
- Evolutionary Data not appearing properly
  - Evolutionary paths that are not linear (Ex- Poliwrath) are now properly displayed

---

## [2.5.8]- 2025-08
### Fixed
- Hardened Live Battle Tab
  - No longer flickers while active Pokemon is on screen
  - No longer temporarily disappears when the Pokemon name is hidden for a few seconds (like when a move is used)
  - Output text is cleaned up to depict when a Pokemon is not on screen
  - Output text no longer includes random characters
  - "Show Caught" checkbox now remembers what you selected after changing tabs

- Market Tab Reactivated
  - Search the Market tab for useful price information - *credit PokeMMO Hub*
    - *Can only search Items*

- Caught List Size
  - Condensed the width of the Caught List
  - Added grids for better accessibility

- Encounter Type Filter now persists between tab changes

---

## [2.5.3]- 2025-08
### Fixed
- Clicking a Pokémon in the Live and Areas tabs now opens its profile directly, removing the separate "View" button.

- Area Search now persists after switching tabs and clears by clicking the search bar

- *Market Tab Disabled - will be implemented soon*

---

## [2.5.0]- 2025-08
### Added
- Breeding Tab!
  - See what parent combos are needed to get your outcome.

- Pokemon Catch % now available in the Pokemon's profile.
  - Click to toggle asleep & 1HP

- Groundwork set for Live Market feature - *beta* *may not function as intended / at all currently*
  - Search current prices and find price history from the GTL - *Credit PokeMMO Hub for the api*

---

## [2.4.4]- 2025-08
### Fixed
- Alternate Form Pokemon now appear correctly inside of the Pokedex!

- Encounter Method Filter has been visually updated and copied to the Area tab in addition to the Live tab

- Major graphical improvements to the Live Battle tab

- Support for Double Battles in the Live Battle tab

- Reduced jitter and startup initialization time in the Live Battle tab - *still beta but getting close*

---

## [2.4.1]- 2025-08
### Added
- Held Item Filter!
    - Filter Held Items in the Pokemon Search Tab.

- Encounter Method Filter!
  - Sort the Live Route Tab with a Method Filter now - Grass, Fishing, Water, Lure, & Rocks

### Fixed
- Searching "Route 1" no longer returns Routes containing 'Route 1' in the string (and similar instances)

- Live Battle Tab improvements - *still in beta*

---

## [2.4.0]- 2025-08
### Added
- Live Battle Tab! *Beta* *Might not work as intended / at all for you yet*
  - Use the Live Battle Tab to look futher into the Pokemon you're facing!
  - Includes Type, Weakness, Ev Yield, Base Stats, Held Items, & Catch Rate

  - Currently only supports 1 Pokemon on screen at a time
    - Support for Alpha, Double Battle, and potentially Hordes to come soon.
  - *Beta* so expect hiccups here and there. I will continue to polish the tool over time.

### Fixed
- Position of Total Caught Pokemon. 
- Adjusted UI labels to reflect Route and Battle Live tabs

### Known Issues
- Typing a route with a single digit string i.e "Route 1" reutrns results for multiple routes     containing "Route 1" in the string.
- Alternate Form Pokemon are not indexed correctly in the Pokedex, even though the data for them exists.
- The Live Battle Tab is extremely buggy, and may not work at all sometimes.


---

## [2.3.5]- 2025-08
### Added
- Move Search!
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