import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface Player {
  id: string;
  name: string;
  lives: number;
  score: number;
  gamesCompleted: string[];
  isAlive: boolean;
}

export interface GameState {
  player: Player;
  currentGame: string | null;
  totalPlayers: number;
  playersEliminated: number;
  gameStarted: boolean;
  soundEnabled: boolean;
}

type GameAction =
  | { type: 'SET_PLAYER_NAME'; payload: string }
  | { type: 'START_GAME'; payload: string }
  | { type: 'COMPLETE_GAME'; payload: { game: string; score: number } }
  | { type: 'LOSE_LIFE' }
  | { type: 'ELIMINATE_PLAYER' }
  | { type: 'RESET_GAME' }
  | { type: 'TOGGLE_SOUND' }
  | { type: 'ADD_SCORE'; payload: number };

const initialState: GameState = {
  player: {
    id: '001',
    name: 'Player 001',
    lives: 3,
    score: 0,
    gamesCompleted: [],
    isAlive: true,
  },
  currentGame: null,
  totalPlayers: 456,
  playersEliminated: 0,
  gameStarted: false,
  soundEnabled: true,
};

const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'SET_PLAYER_NAME':
      return {
        ...state,
        player: { ...state.player, name: action.payload },
      };
    case 'START_GAME':
      return {
        ...state,
        currentGame: action.payload,
        gameStarted: true,
      };
    case 'COMPLETE_GAME':
      return {
        ...state,
        player: {
          ...state.player,
          score: state.player.score + action.payload.score,
          gamesCompleted: [...state.player.gamesCompleted, action.payload.game],
        },
        currentGame: null,
      };
    case 'LOSE_LIFE':
      const newLives = state.player.lives - 1;
      return {
        ...state,
        player: {
          ...state.player,
          lives: newLives,
          isAlive: newLives > 0,
        },
      };
    case 'ELIMINATE_PLAYER':
      return {
        ...state,
        player: { ...state.player, isAlive: false, lives: 0 },
        playersEliminated: state.playersEliminated + 1,
      };
    case 'RESET_GAME':
      return initialState;
    case 'TOGGLE_SOUND':
      return {
        ...state,
        soundEnabled: !state.soundEnabled,
      };
    case 'ADD_SCORE':
      return {
        ...state,
        player: {
          ...state.player,
          score: state.player.score + action.payload,
        },
      };
    default:
      return state;
  }
};

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
} | null>(null);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: ReactNode;
}

const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
};

export default GameProvider;