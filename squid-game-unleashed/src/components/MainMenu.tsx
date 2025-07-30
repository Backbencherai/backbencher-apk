import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useGame } from '../context/GameContext';

const MenuContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
  position: relative;
  overflow: hidden;
`;

const BackgroundPattern = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(circle at 25% 25%, #ff6b6b22 0%, transparent 50%),
    radial-gradient(circle at 75% 75%, #4ecdc422 0%, transparent 50%);
  animation: pulse 4s ease-in-out infinite alternate;
  
  @keyframes pulse {
    0% { opacity: 0.3; }
    100% { opacity: 0.7; }
  }
`;

const Title = styled(motion.h1)`
  font-size: 4rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 2rem;
  background: linear-gradient(45deg, #ff6b6b, #ff8e8e, #ffb3b3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  
  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled(motion.p)`
  font-size: 1.2rem;
  text-align: center;
  margin-bottom: 3rem;
  color: #cccccc;
  max-width: 600px;
`;

const PlayerInfo = styled(motion.div)`
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem 2rem;
  border-radius: 10px;
  margin-bottom: 2rem;
  border: 2px solid rgba(255, 107, 107, 0.3);
  backdrop-filter: blur(10px);
`;

const GameGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  width: 100%;
  padding: 0 2rem;
`;

const GameCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  border: 2px solid transparent;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  
  &:hover {
    border-color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
    transform: translateY(-5px);
  }
`;

const GameIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const GameTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #ffffff;
`;

const GameDescription = styled.p`
  color: #cccccc;
  font-size: 0.9rem;
  line-height: 1.4;
`;

const NameInput = styled.input`
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  padding: 0.8rem 1rem;
  color: white;
  font-size: 1rem;
  margin-right: 1rem;
  backdrop-filter: blur(10px);
  
  &:focus {
    outline: none;
    border-color: #ff6b6b;
  }
  
  &::placeholder {
    color: #999;
  }
`;

const Button = styled(motion.button)`
  background: linear-gradient(45deg, #ff6b6b, #ff8e8e);
  border: none;
  border-radius: 8px;
  padding: 0.8rem 1.5rem;
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: linear-gradient(45deg, #ff5252, #ff7979);
    transform: translateY(-2px);
  }
`;

const games = [
  {
    id: 'red-light-green-light',
    title: 'Red Light, Green Light',
    description: 'Move when green, freeze when red. Get caught moving and you\'re out!',
    icon: '🚦',
    route: '/red-light-green-light'
  },
  {
    id: 'honeycomb',
    title: 'Honeycomb Challenge',
    description: 'Carefully cut out the shape from the honeycomb candy without breaking it.',
    icon: '🍯',
    route: '/honeycomb'
  },
  {
    id: 'tug-of-war',
    title: 'Tug of War',
    description: 'Time your pulls perfectly to win the ultimate test of strength.',
    icon: '🪢',
    route: '/tug-of-war'
  },
  {
    id: 'marbles',
    title: 'Marbles',
    description: 'A game of wit and deception. Guess correctly to survive.',
    icon: '⚪',
    route: '/marbles'
  },
  {
    id: 'glass-bridge',
    title: 'Glass Bridge',
    description: 'Choose the right glass panels to cross the bridge safely.',
    icon: '🌉',
    route: '/glass-bridge'
  },
  {
    id: 'squid-game',
    title: 'Squid Game',
    description: 'The final game. Attack and defend in the ultimate showdown.',
    icon: '🦑',
    route: '/squid-game'
  }
];

const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [playerName, setPlayerName] = useState(state.player.name);

  const handleNameChange = () => {
    if (playerName.trim()) {
      dispatch({ type: 'SET_PLAYER_NAME', payload: playerName.trim() });
    }
  };

  const handleGameSelect = (game: typeof games[0]) => {
    dispatch({ type: 'START_GAME', payload: game.id });
    navigate(game.route);
  };

  return (
    <MenuContainer>
      <BackgroundPattern />
      
      <Title
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        SQUID GAME
      </Title>
      
      <Subtitle
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        456 players, 6 games, 1 survivor. Do you have what it takes?
      </Subtitle>

      <PlayerInfo
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <span>Player: {state.player.name}</span>
          <span>Lives: ❤️ {state.player.lives}</span>
          <span>Score: {state.player.score}</span>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <NameInput
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNameChange()}
          />
          <Button
            onClick={handleNameChange}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Update Name
          </Button>
        </div>
      </PlayerInfo>

      <GameGrid
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        {games.map((game, index) => (
          <GameCard
            key={game.id}
            onClick={() => handleGameSelect(game)}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 + index * 0.1 }}
            whileHover={{ 
              scale: 1.03,
              boxShadow: '0 10px 30px rgba(255, 107, 107, 0.3)'
            }}
            whileTap={{ scale: 0.98 }}
          >
            <GameIcon>{game.icon}</GameIcon>
            <GameTitle>{game.title}</GameTitle>
            <GameDescription>{game.description}</GameDescription>
          </GameCard>
        ))}
      </GameGrid>
    </MenuContainer>
  );
};

export default MainMenu;