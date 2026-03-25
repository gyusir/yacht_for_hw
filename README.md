# Yacht Dice

A web-based multiplayer Yacht Dice game supporting both **Yacht** and **Yahtzee** rule variants. Play with a friend in real-time through Firebase Realtime Database, deployed on GitHub Pages.

## Features

- **Two game modes**: Classic Yacht (12 categories) and Yahtzee (13 categories with bonuses)
- **Real-time multiplayer**: Play with a friend using room codes
- **Modern UI**: Clean minimalist design with dark/light theme toggle
- **Responsive**: Works on desktop and mobile
- **No build step**: Pure HTML, CSS, and JavaScript

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** and follow the steps
3. In the project dashboard, click the **</>** (Web) icon to add a web app
4. Copy the Firebase config object

### 2. Enable Realtime Database

1. In Firebase Console, go to **Build > Realtime Database**
2. Click **Create Database**
3. Choose a location and start in **test mode** (for development)

### 3. Configure the App

Open `js/firebase-config.js` and replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 4. Deploy to GitHub Pages

1. Push the code to your GitHub repository
2. Go to **Settings > Pages**
3. Under **Source**, select your branch (e.g., `main`) and root (`/`)
4. Click **Save** — your site will be live at `https://<username>.github.io/<repo>/`

## How to Play

1. Open the game in your browser
2. Enter your name and click **Continue**
3. **Create Room**: Choose a game mode (Yacht or Yahtzee) and share the 6-digit room code with your friend
4. **Join Room**: Enter the room code shared by your friend
5. Take turns rolling dice (up to 3 rolls per turn), hold dice between rolls, then choose a scoring category
6. The game ends when all categories are filled — highest score wins!

## Game Rules

### Yacht (12 categories)
| Category | Score |
|---|---|
| Ones – Sixes | Sum of matching dice |
| Full House | Sum of all dice (must be 3+2 pattern) |
| Four of a Kind | Sum of the four matching dice |
| Little Straight (1-2-3-4-5) | 30 points |
| Big Straight (2-3-4-5-6) | 30 points |
| Choice | Sum of all dice |
| Yacht (five of a kind) | 50 points |

### Yahtzee (13 categories)
| Category | Score |
|---|---|
| Ones – Sixes | Sum of matching dice |
| Three of a Kind | Sum of all dice (need 3+) |
| Four of a Kind | Sum of all dice (need 4+) |
| Full House | 25 points (fixed) |
| Small Straight (4 consecutive) | 30 points |
| Large Straight (5 consecutive) | 40 points |
| Yahtzee (five of a kind) | 50 points |
| Chance | Sum of all dice |
| **Upper Bonus** | +35 if upper section sum >= 63 |
| **Yahtzee Bonus** | +100 for each additional Yahtzee |

## Tech Stack

- HTML5, CSS3, Vanilla JavaScript
- Firebase Realtime Database (CDN)
- GitHub Pages (static hosting)
