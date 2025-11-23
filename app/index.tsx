import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioContext } from 'react-native-audio-api';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View, AppState } from 'react-native';

const { width } = Dimensions.get('window');
const buttonSize = width * 0.4;

enum Color {
  Green = 'green',
  Red = 'red',
  Yellow = 'yellow',
  Blue = 'blue',
}

const colors = [Color.Green, Color.Red, Color.Yellow, Color.Blue];

const FREQUENCIES: Record<Color, number> = {
  [Color.Green]: 329.63, // E4
  [Color.Red]: 261.63,   // C4
  [Color.Yellow]: 220.00, // A3
  [Color.Blue]: 164.81   // E3
};
const ERROR_FREQ = 110; // A2

const HIGH_SCORE_KEY = 'simon_says_high_score';


export default function Game() {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [sequence, setSequence] = useState<Color[]>([]);
  const [playerSequence, setPlayerSequence] = useState<Color[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initialize AudioContext
    audioCtx.current = new AudioContext();

    const handleAppStateChange = (nextAppState: any) => {
        if (nextAppState === 'active' && audioCtx.current?.state === 'suspended') {
            audioCtx.current.resume();
        }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
        subscription.remove();
        audioCtx.current?.close();
    };
  }, []);


  const playTone = (color: Color | 'error', duration: number = 0.4) => {
    const ctx = audioCtx.current;
    if (!ctx) return;
  
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
  
    const freq = color === 'error' ? ERROR_FREQ : FREQUENCIES[color];
    const type = color === 'error' ? 'sawtooth' : 'sine';
  
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
  
    // Envelope to avoid clicking
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05); // Ramp up volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration); // Ramp down
  
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
  
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  };


  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const storedHighScore = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        if (storedHighScore !== null) {
          setHighScore(parseInt(storedHighScore, 10));
        }
      } catch (error) {
        console.error('Error loading high score', error);
      }
    };
    loadHighScore();
  }, []);

  const saveHighScore = async (newHighScore: number) => {
    try {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
    } catch (error) {
      console.error('Error saving high score', error);
    }
  };

  const handleStartGame = () => {
    setGameStarted(true);
    setScore(0);
    setSequence([]);
    setPlayerSequence([]);
    setTimeout(() => {
        addNewColorToSequence();
    }, 500)
  };

  const addNewColorToSequence = () => {
    setIsPlayerTurn(false);
    const newColor = colors[Math.floor(Math.random() * colors.length)];
    const newSequence = [...sequence, newColor];
    setSequence(newSequence);
    playSequence(newSequence);
  };

  const playSequence = async (seq: Color[]) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    for (let i = 0; i < seq.length; i++) {
      const color = seq[i];
      setActiveColor(color);
      playTone(color);
      await new Promise(resolve => setTimeout(resolve, 600));
      setActiveColor(null);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    setPlayerSequence([]);
    setIsPlayerTurn(true);
  };

  const handleColorPress = (color: Color) => {
    if (!gameStarted || !isPlayerTurn) return;

    playTone(color);
    const newPlayerSequence = [...playerSequence, color];
    

    if (newPlayerSequence[newPlayerSequence.length - 1] !== sequence[newPlayerSequence.length - 1]) {
      playTone('error', 0.8);
      endGame();
      return;
    }
    
    setPlayerSequence(newPlayerSequence);

    if (newPlayerSequence.length === sequence.length) {
      setScore(score + 1);
      setTimeout(() => {
        addNewColorToSequence();
      }, 1000)
    }
  };

  const endGame = () => {
    Alert.alert('Game Over!', `Your score: ${score}`);
    if (score > highScore) {
      setHighScore(score);
      saveHighScore(score);
    }
    setGameStarted(false);
    setSequence([]);
    setPlayerSequence([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simon Says</Text>
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>Score: {score}</Text>
        <Text style={styles.scoreText}>High Score: {highScore}</Text>
      </View>
      <View style={styles.gameBoard}>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.colorButton, styles.green, activeColor === Color.Green && styles.activeButton]}
            onPress={() => handleColorPress(Color.Green)}
            disabled={!isPlayerTurn}
          />
          <TouchableOpacity
            style={[styles.colorButton, styles.red, activeColor === Color.Red && styles.activeButton]}
            onPress={() => handleColorPress(Color.Red)}
            disabled={!isPlayerTurn}
          />
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.colorButton, styles.yellow, activeColor === Color.Yellow && styles.activeButton]}
            onPress={() => handleColorPress(Color.Yellow)}
            disabled={!isPlayerTurn}
          />
          <TouchableOpacity
            style={[styles.colorButton, styles.blue, activeColor === Color.Blue && styles.activeButton]}
            onPress={() => handleColorPress(Color.Blue)}
            disabled={!isPlayerTurn}
          />
        </View>
      </View>
      {!gameStarted ? (
        <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.startButton} onPress={endGame}>
          <Text style={styles.startButtonText}>Restart Game</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 20,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#eee',
  },
  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  scoreText: {
    fontSize: 22,
    color: '#eee',
  },
  gameBoard: {
    borderWidth: 4,
    borderColor: '#000',
    borderRadius: buttonSize,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  row: {
    flexDirection: 'row',
  },
  colorButton: {
    width: buttonSize,
    height: buttonSize,
    margin: 8,
    opacity: 0.5,
  },
  activeButton: {
    opacity: 1,
    transform: [{scale: 1.05}]
  },
  green: {
    backgroundColor: '#00A74A',
    borderTopLeftRadius: buttonSize,
  },
  red: {
    backgroundColor: '#CC232A',
    borderTopRightRadius: buttonSize,
  },
  yellow: {
    backgroundColor: '#F9F10F',
    borderBottomLeftRadius: buttonSize,
  },
  blue: {
    backgroundColor: '#0769C5',
    borderBottomRightRadius: buttonSize,
  },
  startButton: {
    backgroundColor: '#444',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#555',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});