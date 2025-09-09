# Changelog
---

## [2.8.8] - 2025-09
### Fixed
- Compare Section
  - Level is now formatted in the textbox correctly

---

## [2.8.7] - 2025-09
### Fixed
- 'Replace from Live Battle' now correctly pulls the most recent Pokemon shown on the Live Battle tab
  - Broken with last update


---

## [2.8.6] - 2025-09
### Added
- Live Route OCR
  - New 'Encounter Info' filter
    - Added Catch Rate chip
    - Added Catch % chip
    - Added Held Item toggle
    - Added Lv. Toggle
    - Moved 'Toggle Caught' option to this menu

- Area Search
  - Included 'Encounter Info' filter from Live Route Tab
  - Area Search now persists search upon switching tabs, clears on search bar click

### Fixed
- General
  - Deoxys Eggs no longer appear in the dataset (idk where that came from)
  - Evolutions with weird location methods now correctly displayed (Eevee, Nosepass, & Magneton)
  - Evolutions that required Happiness (friendship) now correctly displayed (Eevee, Pichu, etc)
  - Abilities that were not spaced correctly are fixed
    - Lightningrod & Compoundeyes

- Pokemon Profile
  - Switched UI from 3 rows to 4 rows across the top information section
  - Changed the location of the Held Item to be included in the top
    - If more than 1 held item are applicable; a dropdown arrow will reveal the rest of the items
    - Displays 'No Held Items' if none apply
  - Labeled 'Abilities'
  - Introduced Grid boxes around the 4 columns of top level information
  - Changed font size of the Dex # to be smaller

- Compare Section
  - Selecting a Pokemon to Compare now opens the Compare menu with 1 selected Pokemon
  - Clicking "Compare" in the Live Battle Tab now brings you to the compare screen with the 2nd Pokemon unselected
    - Pokemon from the active team can be easily imported this way
  - Changed the 'x' button to be named 'Swap'

 
 - Live Route OCR 
  - Incresed letter match requirment to '3' *previously 2*
    - Should help with the Live Route occasionally switching off of the intended route breifly 
  - Locations that start with 'Mt.' are now properly identified

---

## [2.8.5] - 2025-09
### Added
- Natures, IVs, & EVs Now Included in the Dataset!
    - View how these values affect Base Stats on Pokemon
    - *Optional to use,* Pokemon data will always default to 0 IVs, 0 EVs, +/- Nature
    - Included inside of the single Profile & Compare section
      - Dropdown inside of the single view, automatically open inside of compare view
      - *This data will continue to be implemented across more areas in future updates*

### Fixed
- Compare Tab
  - Long ability names now switch to a compact form to fit in a single line as intended

- Pokemon Profile
  - Highlighted the current Pokemon inside of the Evolution chain

---

## [2.8.4] - 2025-09
### Added
- Compare Pokemon!
  - You can now compare 2 different Pokemon inside of Pokemon Search
  - Displays Sprite, Abilities, Type, Weakness, Resistance, and compares Basic Stats
  - Uses green & red indicators to quickly see what Basic Stat differences are present
  - 'Compare' buttons located in Pokemon Search, Pokemon Profile, and Live Battle Tab
  - Clicking 'Compare' in Live Battle Tab auto-selects that Pokemon to compare and switches to Pokemon Search
  - 'Replace from Live Battle Tab' button overwrites compared Pokemon with the one detected in battle

- Recent Search History 
  - See your most recent searches inside of a Pokemon chip in the Pokemon Search Tab
  - 'Clear Recents' wipes Pokemon chips from screen
  - Recent Pokemon can be selected when 'Compare' is toggled

- Base Stat Total Display
  - A Base Stat Total # now appears anywhere a Pokemons Base Stats were seen before

### Fixed
- Team Builder Tab
  - Clicking a Pokemons name now takes you to their profile

- Live Route Tab
  - Enlarged size of the Caught indicator Pokeball in the Live Route Tab
  - EV Yield now displays inside of Pokemon block

- Pokemon Search Tab
  - Dynamic Type Matchups now fill the width with only data that is needed
  - Clicking on an Egg Group category now starts a filtered search of that Egg Group
  - Clicking on a Pokemon Type now starts a filtered search of that Type
  - When any filter is toggled, a 'Clear Filters' button appears for use
  - Fixed Evolution stage "Trade: 0" to say "Trade"
  - Updated UI to be more inline with other tab data now
    - Base Stat row changed to be Boxes
    - Held Items with sprites & Tooltips on hover
    - Relocated & Resized EV Yield Pill
    - Split the top Pokemon information into columns for consistency.
    - 'Close' button now appears in the bottom corner
    - Reworked all data to fit into a 'grid' to look pretty
  
---

## [2.8.2] - 2025-09
### Added
- Secondary "Type" Filter in Pokemon Search
  - Search Pokemon by 2 Types now, appearing only if the 1st Type is selected
- Items in Team Builder
  - Included Held Items to be saved alongside your Team
    - Hover for description

### Fixed
- Sprites
  - Missing images for some forms now resolve their sprites correctly (Castform Sunny/Rainy/Snowy, Giratina-Origin).

- Options Menu  
  - Check for Updates
    - No longer gives you conflicting data with the in-app toast - Leaves it to Windows
  - OCR On/Off
    - Manually disable the OCR if it's not used (saves performance)
  - Reload OCR
    - Now *actually* reloads the OCR
  - Removed "Refresh App"
    - Not needed

---

## [2.7.8]- 2025-09
### Added
- Teambuilder Tab UI Overhaul
  - A Grid for your Team now generates as Pokemon are selected into the Team
  - Now includes Pokemon sprites beneath your Team Name
  - Pokemon Type information now included in the new Team Grid

### Fixed
- Team Builder Tab
  - Inconsistent Type Chip sizes in the Team Builder Tab now all appear uniform
  - Clicking 'Save' while making changes to a loaded team now overwrites the saved team
    - Previously you would have to name the team the same name to overwrite it
  - Resized, re-space, and centered most information in the UI
  - Recommended Pokemon Types now do a better job of deciding what will help your team
    - Analyzes Team Un-Resisted and checks against the current teams' Pokemon Types to determine recommended result

---

## [2.7.7]- 2025-09
### Added
- Spiced up the Live Battle Tab UI to look more modern
  - Rezised a lot of the information on the UI, including the Sprite
  - Now displays 'Immune' instead of 0% weakness
  - Bordered the Base Stats to be easier to read at a glance
  - Included the Catch Rate % alongside the Catch Rate

---

## [2.7.6]- 2025-09
### Fixed
- Live Route Tab now organizes data into cells on the UI - This looks more visually appealing, especially for Pokemon with a lot of data

- Live Battle Tab now correctly identifies Double Battle, Swarm, & Horde Pokemon again
  - *This feature was broken during the OCR Rework*

- Fixed duplicate encounter rarities inside of Live Route

---

## [2.7.2]- 2025-09
### Added
- Team Builder Tab
  - Quickly assemble your roster and find out where weakness gaps reside on your team
  - Name & Save multiple teams for quick access
  - Recommended Pokemon types based on gaps in coverage

- "Home" Screen Added
  - Clicking "3's PokeMMO Tool" at the top now brings the user to a clean Home screen UI

- "Neo" Theme Added
  - Futuristic styled theme

### Fixed
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

## [1.3.9] - 2025-08
### Added
- Region Selector
  - Added segmented buttons to switch between regions directly in the live tab.
    -  (Kanto, Johto, Hoenn, Sinnoh, Unova)


### Improvements
- FINALLY Improved Screen Capture
  - Optimized location capture logic for better accuracy when reading in-game data.

- Filtering System Overhaul
  - Enhanced filtering logic for encounter data, ensuring more consistent and accurate results.

- Location Data Handling
  - Improved logic so Pokémon missing from the Pokédex now correctly pull location data when it exists (e.g., Machop in Fiery Path).

- Encounter Rarity Display
  - Cleaned up formatting to fix parenthesis/spacing issues when showing encounter methods and rates.

Hardened Location Capture
  - Improved performance when switching routes quickly and tabbing away from the active screen.

### Bug Fixes
- Tab Focus Bug
  - Fixed issue where the live tab stopped working after clicking away or opening menus; the tab now properly refreshes when focus is regained.

- Parenthesis Issue
  - Fixed formatting bug where extra or missing parentheses appeared in encounter text.

- Missing Pokémon Locations
  - Fixed bug where some Pokémon with valid data showed no location entries.

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
- Live Route feed (beta)
  - A new Live tab that auto-detects your current area from the top-left PokeMMO HUD and shows the matching encounter table.
  - OCR helper (LiveRouteOCR)
    - Lightweight native helper that screenshots the HUD, runs OCR, and streams results to the app over WebSocket.
  - Channel-suffix handling
    - Location strings like Route 212 Ch. 1 are normalized to Route 212 before matching, so channel info no longer interferes.
  - Fuzzy location matching
    - Noisy OCR (extra spaces/stray characters) is cleaned/normalized and mapped to the right route/town with tolerant matching.

- Debug hooks
  - Optional logging with last screenshot and OCR text to help diagnose mismatches.

### Improvements
- UI: New tab switcher (Pokémon / Areas / Live) with a status chip (Connected/Disconnected) and live location line.

- Resilience: Helper start/stop is sandboxed—failure to launch no longer crashes the app; the app continues to run and you’ll just see “Start LiveRouteOCR…”.

- Performance: Smarter capture region and pre-processing for sharper OCR, plus throttled updates to avoid flicker.

### Fixed
- Route name not appearing: Normalization now strips Ch. x and other HUD glyphs so the Live tab actually resolves to your route.
- Intermittent blank reads: Better focus detection for the PokeMMO window and retries when the HUD animates.
- Portable build spawn error (ENOENT): The app now launches the helper from process.resourcesPath in packaged/portable builds.
- Missing app icon (Windows): Electron build now embeds the icon and the window uses it correctly.
- Packaging / Dev
  - Portable EXE: Added Electron-Builder config to ship a single portable .exe.
  - Extra resources include live-helper/ and icon.ico.
  - Safer process management: Helper process is cleaned up on app exit; spawn errors are surfaced in a friendly dialog and log.
  - Tessdata & logs: Helper looks for bundled tessdata; debug artifacts are written to %LOCALAPPDATA%\PokemmoLive\ (last capture, log).  

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
- New Area Search Mode
  - Added a toggle to switch between Pokémon search and Route/Area search.
  - Searching by route or location (e.g., Viridian Forest, Route 10) now shows all Pokémon that appear there.
  - Each Pokémon entry includes encounter method (Grass, Water, Fishing, etc.) and rarity/odds.

- Improved Encounter Display
  - Distinct colors for encounter methods (Grass, Water, Cave, Fishing rods, Horde, etc.).
  - Distinct colors for rarities (Very Common → Very Rare, plus % odds).
  - Makes it easier to tell apart different spawn types and probabilities at a glance.

- Search Results Polished
  - Pokémon search tiles consistently show colored type pills.
  - Clearer visual identity while browsing search results.

---

## [1.2.5] - 2025-08
### Changed
- Structural Updates
  - Restored full Pokédex integration after initial data wipe issues
  - Refactored App.jsx and main.jsx to ensure proper references to pokedex.json and pokemmo_locations.json
  - Added a legacy shape adapter to preserve compatibility with old UI expectations

- Pokédex Data
  - Trimmed Pokédex to Generations 1–5 only
  - Removed Pokémon from Generations 6–9
  - Removed the Fairy type and all Gen 6+ move/type chart impacts.
  - Ensured all search and type matchups now follow Gen 1–5 rules only.

- Sprites
  - Implemented a sprite resolver system with fallback chain:
  - Local sprite fields from pokedex data (sprite, sprites.front_default, image, icon).
  - Local /public/sprites/ and /public/sprites/national/ folders.
  - External PokeAPI fallback (both standard and official artwork).
  - Transparent PNG as final placeholder (avoids broken image icons).
  - Random header sprite now works consistently on load.

- Location Data
  - Integrated forum-sourced region files (Kanto, Johto, Hoenn, Sinnoh, Unova) with a parsing key.
  - Built a reverse-mapped pokemmo_locations.json for direct lookup in-app.
  - Fixed parsing issues where:
  - Lines with asterisks (*Horde can only occur…) were previously skipped — now normalized to simply “Horde”.
  - Viridian Forest and similar entries were defaulted as Grass encounters to avoid missing data.
  - Improved coverage: drastically reduced the number of Pokémon with missing location data.

- Missing Data Handling
  - Added a reporting mechanism to check which Pokémon are still missing location data.
  - Normalization fixes for names with special characters (♀, ♂, hyphens, etc.).

---

## [1.2.1] - 2025-08
### Changed
- Removed support for **Generations 6–9**, focusing exclusively on **Generations 1–5** to match PokéMMO.  
- Removed Fairy type to prevent type conflicts.  

---

## [1.2.0] - 2025-08
### Added
- Pokémon Location Data Integration
  - Added full support for per-region location data (Kanto, Johto, Hoenn, Sinnoh, Unova). some pokemon data not available yet
  - Locations are grouped by region with dedicated blocks—regions without data are hidden.
  - Each map entry now displays Method, Rarity, Environment, and Level (when available).
  - JSON location database cleaned up to remove duplicates, filler text.

- Weakness Grid Enhancements
  - Added clear labels: “4× Weak To”, “2× Weak To”, “Normal Damage”, “Resists (½×)”, and “Immune (0×)”.
  - Weakness chart now uses type-colored chips matching official Pokémon type palettes for instant readability.

- UI/UX Improvements
  - Header & Branding
  - App title changed to “3’s PokeMMO Tool” (previously “3s Weakness Finder”).
  - A random Pokémon sprite now displays next to the title on launch instead of the same static sprite.
  - Updated window title bar and .exe name for consistency.

- Pokémon Display
  - Pokémon names, types, and details are now properly capitalized across the app.
  - Dex number shown as “National Dex #” for clarity.
  - Autocomplete results redesigned with brighter text for better contrast on the dark theme.

- General Styling
  - Classic theme polished with improved contrasts for text and badges.
  - Location and weakness data now displayed in modern card-style layouts.
  - Imporved generic labels with explicit field labels for Method, Rarity, Environment, etc.

- Technical Changes
  - App Packaging
  - Project migrated to Electron for Windows builds, now bundling as a standalone .exe.
  - Compressed a fuckton of data
  - Cleaned up project structure for smoother builds and way faster patching  going forward.

- Known Bugs
  - In the location boxes "Method" and "Enviornment" display the same information.
  - Colors for pokemon type appear too transparent,
  - A few pokemon location data entires are missing
