# Data Center for your educational games

A small system that records what players do in your games and lets **only you** see it all on a dashboard.

```
your games  --(tracker.js)-->  Firebase Firestore (free tier)  <--(admin/index.html)--  you
```

| File | What it is |
|---|---|
| `admin/index.html` | Owner dashboard: all players, stars, progress, events, search, CSV export, delete |
| `tracker.js` | One script your games include to send data |
| `firebase-config.js` | Your Firebase settings (you fill this in once) |
| `firestore.rules` | Security rules: players can only write their own data, only you can read everything |
| `demo.html` | Test page to check that recording works |

## Setup (about 10 minutes)

1. Go to <https://console.firebase.google.com>, click **Add project**, and create one (Analytics is not needed).
2. **Build -> Firestore Database -> Create database.** Choose production mode and a region near you.
3. **Build -> Authentication -> Get started -> Sign-in method.** Enable **Anonymous** (for players) and **Google** (for you).
4. In Authentication -> **Settings -> Authorized domains**, add the domain where you host the site, e.g. `uhyun-steak.github.io`.
5. **Project settings -> Your apps -> Web (`</>`)**, register an app, and copy the config values into `firebase-config.js`.
6. Open `firestore.rules`, replace `OWNER_EMAIL_HERE` with your Google account email, then paste the whole file into **Firestore -> Rules** and click **Publish**.
7. Upload this folder to your GitHub Pages repo (for example next to your `heyo` game).
8. Open `demo.html` on your site, type a name, press the buttons. Then open `admin/index.html`, sign in with Google, and the player appears.

Sign-in with Google does not work when you open the files directly from your computer (`file://`). Use your hosted site, or run `python3 -m http.server` in this folder and open `http://localhost:8000/admin/` (`localhost` is already an authorized domain by default).

## Adding it to a game

Put these two lines in each game's HTML, before your game script:

```html
<script src="firebase-config.js"></script>
<script src="tracker.js"></script>
```

(Adjust the paths if the game is in a subfolder, e.g. `../data-center/tracker.js`.)

Then call:

```js
GameTracker.setPlayer(name);                          // when a child types their name
GameTracker.addStars(1, 'letters');                   // stars earned (also logged as an event)
GameTracker.saveProgress('letters', { level: 3 });    // current progress in a game
GameTracker.logEvent('letters', 'answer', { letter: 'B', correct: true });
```

The `game` name (like `letters`) is how the dashboard groups things, so use the same name every time.
If the database is down or not configured, the game keeps working and saves on the device only.

## Good to know

- **Players are anonymous.** Each browser gets a random ID. If a child switches device or clears browser data, they appear as a new player.
- **The config values in `firebase-config.js` are public by design.** The rules in `firestore.rules` are the lock. Do not skip step 6.
- **Children's data.** These are preschool games, so collect as little as possible. Ask for a first name or nickname only, never surname, email, or birthdate, and check what consent or notice is required where your players live (for example parental consent under COPPA or GDPR). Delete players from the dashboard when asked.
- **Free tier limits.** Firestore's free quota is generous (tens of thousands of reads and writes per day). The dashboard reads all players each time you open it, which is fine for hundreds or a few thousand players.
- **Abuse.** Anyone could in theory send junk data to your database. The rules cap sizes, and Firebase App Check can be added later if that ever becomes a problem.
