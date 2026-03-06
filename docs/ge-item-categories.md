# GE Tracker – Item category mapping

This doc describes how item categories (e.g. Herbs, Ores & Bars) are used for the GE Tracker quick filters. The actual mapping is in **`public/data/ge-categories.json`**.

## Format

`ge-categories.json` is a JSON object: each key is a category label (shown on the filter buttons), and each value is an array of **exact item names** as they appear in the OSRS Wiki prices API mapping (the `name` field).

Example:

```json
{
  "Herbs": ["Guam leaf", "Grimy guam leaf", "Ranarr weed", "Grimy ranarr weed", ...],
  "Ores & Bars": ["Copper ore", "Tin ore", "Iron ore", ...]
}
```

Matching is **case-insensitive**: "Guam leaf" and "guam leaf" both match. The filter shows only items whose `name` is in the selected category’s list.

## Adding or editing categories

1. Edit **`public/data/ge-categories.json`**.
2. Add a new key for the category (e.g. `"Ores & Bars"`) and set the value to an array of item names.
3. The GE Tracker page loads this file on load; new categories appear as filter buttons automatically. No code change needed unless you want to change button order (see below).

## Button order

Filter buttons are shown in the order of the keys in the JSON. "All" is always first (hardcoded). To reorder categories, reorder the keys in `ge-categories.json`.

## Herbs list

The **Herbs** list includes grimy and clean herbs from the main Herblore table, plus Jungle Potion herbs (Ardrigal, Rogue's purse, Sito foil, Snake weed, Volencia moss) and other herbs (Bruma herb, Doogle leaves, Elder cadantine, Goutweed, Grym leaf, Buchu leaf, Noxifer, Golpar, etc.). Add or remove names to match the wiki/GE as needed.
