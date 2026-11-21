# Lesson Time Planner

A single static page for planning lessons across time zones. Add students by city, country or time zone, then see everyone's local time at once: right now, or at any date and time you pick.

- **Live view:** each person's current time, date ("tomorrow for you"), and part of the day (night, morning, daytime, evening).
- **Pick any time, from anyone's side:** change the date or time on any row (yours or a student's) and every other row converts to match. Daylight saving is handled by the browser's built-in time zone data.
- **Day planner:** a 24-hour grid of your day, coloured by each student's local part of the day, so you can spot hours that suit everyone. Click a cell to pick that time.
- **Easy adding:** type a city (e.g. "Osaka"), a time zone (`Europe/Berlin`) or an offset (`UTC+3`).
- **Private:** the list lives only in the browser (`localStorage`). Move it to another device with a share link or a backup file.

The only network call is the place search, which goes to the free [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api) (no key needed). Time zone and offset search still works offline.

## Publish on GitHub Pages

1. Create a public repository and push these files to the `main` branch.
2. In the repo, open **Settings → Pages**, set **Source** to "Deploy from a branch", then choose `main` and `/ (root)`.
3. The page will appear at `https://<user>.github.io/<repo>/`.

## Run locally

The page uses ES modules, so open it through a local web server, not as a `file://` URL:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests

```sh
npm test   # Node 18+; tests the time zone conversion code in tz.js
```

## Files

- `index.html`, `style.css`: page and styles
- `app.js`: UI, storage, place search, share and backup
- `tz.js`: time zone maths built on `Intl` (no libraries)
