# 🦑 Squid Game Unleashed

A fully interactive web-based clone of the popular Netflix series "Squid Game" featuring all 6 iconic games with dynamic animations, smooth gameplay, and modern UI/UX.

## 🎮 Games Included

### 1. Red Light, Green Light 🚦
- **Objective**: Reach the finish line without being caught moving during red light
- **Controls**: W/↑ = Forward, S/↓ = Backward
- **Features**: Movement detection, reaction time mechanics, animated doll

### 2. Honeycomb Challenge 🍯
- **Objective**: Cut out shapes from honeycomb candy without breaking it
- **Controls**: Mouse to cut along the dotted lines
- **Features**: 4 different shapes (star, circle, triangle, umbrella), crack detection system

### 3. Tug of War 🪢
- **Objective**: Match rhythm patterns to pull the rope to your side
- **Controls**: Spacebar to match the beat patterns
- **Features**: Dynamic rhythm generation, power meter, team animations

### 4. Marbles Game ⚪
- **Objective**: Win all opponent's marbles through strategic betting and guessing
- **Controls**: Click to bet and guess odd/even
- **Features**: Psychological gameplay, betting mechanics, hand animations

### 5. Glass Bridge 🌉
- **Objective**: Cross the bridge by choosing the correct glass panels
- **Controls**: Click on glass panels to step
- **Features**: Risk-based gameplay, 3 hints available, glass breaking animations

### 6. Squid Game (Final) 🦑
- **Objective**: Defeat your opponent in the traditional Korean game
- **Controls**: Click to move, buttons to attack/defend
- **Features**: Turn-based combat, positioning strategy, health system

## 🚀 Features

- **Dynamic Animations**: Smooth Framer Motion animations throughout
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **State Management**: Global game state with React Context
- **Lives System**: 3 lives per player with progression tracking
- **Scoring System**: Points awarded based on performance and time
- **Modern UI**: Glass morphism effects and Squid Game themed styling
- **Sound Ready**: Architecture ready for sound effects integration

## 🛠️ Technology Stack

- **React 18** with TypeScript
- **Framer Motion** for animations
- **Styled Components** for styling
- **React Router** for navigation
- **Context API** for state management

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd squid-game-unleashed
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## 🎯 How to Play

1. **Start**: Enter your player name on the main menu
2. **Select Games**: Choose from any of the 6 available games
3. **Follow Instructions**: Each game has specific controls and objectives
4. **Survive**: Complete games to earn points and progress
5. **Win**: Survive all games to become the ultimate winner!

## 🎨 Game Mechanics

### Lives System
- Start with 3 lives ❤️❤️❤️
- Lose a life when eliminated from a game
- Game over when all lives are lost

### Scoring System
- Points awarded based on:
  - Time remaining
  - Performance accuracy
  - Difficulty completed
  - Lives remaining

### Progression
- Complete games in any order
- Track completed games in player profile
- Unlock achievements (ready for future implementation)

## 🔧 Development

### Project Structure
```
src/
├── components/          # Reusable UI components
│   └── MainMenu.tsx    # Main game selection menu
├── context/            # React Context for state management
│   └── GameContext.tsx # Global game state
├── games/              # Individual game components
│   ├── RedLightGreenLight.tsx
│   ├── HoneycombGame.tsx
│   ├── TugOfWar.tsx
│   ├── MarblesGame.tsx
│   ├── GlassBridge.tsx
│   └── SquidGameFinal.tsx
└── App.tsx             # Main application component
```

### Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## 🎵 Future Enhancements

- [ ] Sound effects and background music
- [ ] Multiplayer support
- [ ] Achievement system
- [ ] Leaderboards
- [ ] Additional game modes
- [ ] VIP spectator mode
- [ ] Tournament brackets

## 🎨 Design Philosophy

The game follows the aesthetic of the original Squid Game series:
- **Color Palette**: Dominated by reds, greens, and blues
- **Typography**: Clean, bold fonts for readability
- **Animations**: Smooth, purposeful animations that enhance gameplay
- **Responsiveness**: Fully responsive design for all screen sizes

## 🐛 Known Issues

- Glass Bridge player positioning needs refinement on mobile
- Tug of War rhythm detection could be more precise
- Canvas-based games may have performance issues on older devices

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is for educational purposes only. All Squid Game intellectual property belongs to Netflix and Hwang Dong-hyuk.

## 🎬 Inspiration

Based on the Netflix series "Squid Game" created by Hwang Dong-hyuk. This project is a tribute to the show's brilliant game design and psychological thriller elements.

---

**⚠️ Warning**: This game contains themes similar to the original series. Player discretion advised.

**🎮 Ready to play?** Run `npm start` and may the odds be ever in your favor!
