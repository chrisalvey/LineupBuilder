# DraftKings Contest CSV Files

This folder contains pre-loaded DraftKings contest CSV files.

## Filename Format

All CSV files in this folder **must** follow this exact format:

```
YYYY-MM-DD-ContestType-Description.csv
```

### Format Breakdown:

- **YYYY-MM-DD**: The contest date (e.g., `2025-12-01`)
- **ContestType**: Either `Classic` or `Showdown` (case-insensitive)
- **Description**: Any description text (e.g., `Week13`, `TNF-DET-GB`)

### Examples:

✅ **Valid filenames:**
- `2025-12-01-Classic-Week13.csv`
- `2025-12-05-Showdown-TNF-DET-GB.csv`
- `2025-12-08-Classic-Sunday-Main.csv`

❌ **Invalid filenames:**
- `week13.csv` (missing date and contest type)
- `2025-12-01-Week13.csv` (missing contest type)
- `12-01-2025-Classic-Week13.csv` (wrong date format)
- `2025-12-01-Tournament-Week13.csv` (invalid contest type)

## How It Works:

1. Place your DraftKings player CSV files in this folder
2. Update `contests.json` in the parent directory to include the contest metadata
3. The app will automatically load and display future contests in the dropdown
4. Past contests (based on the date in the filename) are automatically filtered out
5. Misnamed files will be logged as warnings in the browser console

## Validation:

The app validates each filename and will show console warnings for:
- Invalid date format
- Invalid contest type
- Missing description
- Missing `.csv` extension

## Note:

Make sure the CSV files contain the same columns as DraftKings export files:
- Name
- Position
- Salary
- AvgPointsPerGame
- Game Info
- TeamAbbrev
- etc.
