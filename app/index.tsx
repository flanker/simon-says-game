import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

const { width, height } = Dimensions.get("window");
const gameBoardSize = Math.min(width, height) * 0.75;
const GAP = 28;
const PADDING = 20;
const padSize = (gameBoardSize - PADDING * 2 - GAP) / 2;

enum Color {
  Green = "green",
  Red = "red",
  Yellow = "yellow",
  Blue = "blue",
}

const colors = [Color.Green, Color.Red, Color.Yellow, Color.Blue];

// Audio file mapping: Green=do, Red=re, Yellow=mi, Blue=fa
const SOUND_FILES: Record<Color, any> = {
  [Color.Green]: require("@/assets/sound/do.wav"),
  [Color.Red]: require("@/assets/sound/re.wav"),
  [Color.Yellow]: require("@/assets/sound/mi.wav"),
  [Color.Blue]: require("@/assets/sound/fa.wav"),
};

const HIGH_SCORE_KEY = "simon_says_high_score";
const SOUND_ENABLED_KEY = "simon_says_sound_enabled";

// =================================================================
// GamePad Component
// =================================================================
interface GamePadProps {
  color: Color;
  isActive: boolean;
  onClick: (color: Color) => void;
  disabled: boolean;
}

const GamePad: React.FC<GamePadProps> = ({ color, isActive, onClick, disabled }) => {
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);

  // Trigger animation when active or pressed
  useEffect(() => {
    if (isActive || isPressed) {
      scale.value = withSequence(withTiming(1.05, { duration: 100 }), withTiming(1, { duration: 100 }));

      // Ripple effect: start from center (scale 0) and expand outward
      rippleScale.value = 0;
      rippleOpacity.value = 0.8;
      rippleScale.value = withTiming(1.5, { duration: 400 });
      rippleOpacity.value = withTiming(0, { duration: 400 });
    }
  }, [isActive, isPressed]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const padStyles = [
    styles.padBase,
    padColorStyles[color].base,
    (isActive || isPressed) && padColorStyles[color].active,
    (isActive || isPressed) && styles.padActive,
    isPressed && styles.padPressed,
  ];

  return (
    <Animated.View style={[styles.padContainer, animatedStyle]}>
      <Pressable
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        onPress={() => !disabled && onClick(color)}
        disabled={disabled}
        style={padStyles}
      >
        <LinearGradient colors={["rgba(255, 255, 255, 0.4)", "transparent"]} style={styles.glossyOverlay} />
        <Animated.View style={[styles.rippleEffect, rippleStyle]}>
          <View style={styles.rippleCircle} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

// =================================================================
// Main Game Component
// =================================================================
export default function Game() {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [sequence, setSequence] = useState<Color[]>([]);
  const [playerSequence, setPlayerSequence] = useState<Color[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Animations
  const scoreHighlight = useSharedValue(0);
  const boardShake = useSharedValue(0);
  const gameOverScale = useSharedValue(0);

  const scoreAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(scoreHighlight.value, [0, 1], ["#475569", "#6FD0B2"]), // slate-600 to seafoam
  }));

  const boardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boardShake.value }],
  }));

  const gameOverAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gameOverScale.value }],
    opacity: gameOverScale.value,
  }));

  // Audio players for each color
  const doPlayer = useAudioPlayer(SOUND_FILES[Color.Green]);
  const rePlayer = useAudioPlayer(SOUND_FILES[Color.Red]);
  const miPlayer = useAudioPlayer(SOUND_FILES[Color.Yellow]);
  const faPlayer = useAudioPlayer(SOUND_FILES[Color.Blue]);
  const gameOverPlayer = useAudioPlayer(require("@/assets/sound/game-over.wav"));
  const winPlayer = useAudioPlayer(require("@/assets/sound/instant-win.wav"));
  const bgmPlayer = useAudioPlayer(require("@/assets/sound/bgm.mp3"));

  // Map colors to their audio players
  const audioPlayers: Record<Color, ReturnType<typeof useAudioPlayer>> = {
    [Color.Green]: doPlayer,
    [Color.Red]: rePlayer,
    [Color.Yellow]: miPlayer,
    [Color.Blue]: faPlayer,
  };

  // Setup background music
  useEffect(() => {
    bgmPlayer.loop = true;
    bgmPlayer.volume = 0.3; // Lower volume for background music
    if (soundEnabled) {
      bgmPlayer.play();
    }

    return () => {
      try {
        bgmPlayer.pause();
      } catch (e) {
        console.log("Error pausing BGM on cleanup", e);
      }
    };
  }, []);

  // Control BGM based on sound settings
  useEffect(() => {
    if (soundEnabled) {
      bgmPlayer.play();
    } else {
      bgmPlayer.pause();
    }
  }, [soundEnabled]);

  const playTone = useCallback(
    async (color: Color) => {
      if (!soundEnabled) return;
      const player = audioPlayers[color];
      try {
        // Force restart: pause, seek to start, then play
        if (player.playing) {
          player.pause();
        }
        await player.seekTo(0);
        player.play();
      } catch (error) {
        console.warn('Error playing tone:', error);
      }
    },
    [soundEnabled, audioPlayers]
  );

  const playGameOver = useCallback(async () => {
    // Trigger shake animation
    boardShake.value = withSequence(
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );

    // Show Game Over popup
    gameOverScale.value = withSpring(1);

    if (!soundEnabled) return;
    try {
      if (gameOverPlayer.playing) {
        gameOverPlayer.pause();
      }
      await gameOverPlayer.seekTo(0);
      gameOverPlayer.play();
    } catch (error) {
      console.warn('Error playing game over sound:', error);
    }
  }, [soundEnabled, gameOverPlayer]);

  const playWin = useCallback(async () => {
    // Trigger score highlight animation
    scoreHighlight.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 500 }));

    if (!soundEnabled) return;
    try {
      if (winPlayer.playing) {
        winPlayer.pause();
      }
      await winPlayer.seekTo(0);
      winPlayer.play();
    } catch (error) {
      console.warn('Error playing win sound:', error);
    }
  }, [soundEnabled, winPlayer]);

  const playSequence = useCallback(
    async (seq: Color[]) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (let i = 0; i < seq.length; i++) {
        const color = seq[i];
        setActiveColor(color);
        playTone(color);
        await new Promise((resolve) => setTimeout(resolve, 600));
        setActiveColor(null);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      setPlayerSequence([]);
      setIsPlayerTurn(true);
    },
    [playTone]
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedHighScore = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        if (storedHighScore !== null) {
          setHighScore(parseInt(storedHighScore, 10));
        }
        const storedSoundEnabled = await AsyncStorage.getItem(SOUND_ENABLED_KEY);
        if (storedSoundEnabled !== null) {
          setSoundEnabled(storedSoundEnabled === "true");
        }
      } catch (error) {
        console.error("Error loading settings", error);
      }
    };
    loadSettings();
  }, []);

  // Play sequence when it changes
  useEffect(() => {
    if (gameStarted && sequence.length > 0 && !gameOver) {
      playSequence(sequence);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, gameStarted, gameOver]);

  const saveHighScore = async (newHighScore: number) => {
    try {
      await AsyncStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
    } catch (error) {
      console.error("Error saving high score", error);
    }
  };

  const toggleSound = async () => {
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);

    // Provide haptic feedback instead of sound
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await AsyncStorage.setItem(SOUND_ENABLED_KEY, newSoundEnabled.toString());
    } catch (error) {
      console.error("Error saving sound setting", error);
    }
  };

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setPlayerSequence([]);
    setIsPlayerTurn(false);
    setActiveColor(null);
    gameOverScale.value = withTiming(0, { duration: 200 });

    // Start with a fresh sequence
    const firstColor = colors[Math.floor(Math.random() * colors.length)];
    setSequence([firstColor]);
  };

  const addNewColorToSequence = () => {
    setIsPlayerTurn(false);
    setSequence((prev) => {
      const newColor = colors[Math.floor(Math.random() * colors.length)];
      return [...prev, newColor];
    });
  };

  const handleColorPress = (color: Color) => {
    if (!gameStarted || !isPlayerTurn || gameOver) return;
    playTone(color);
    const newPlayerSequence = [...playerSequence, color];
    if (newPlayerSequence[newPlayerSequence.length - 1] !== sequence[newPlayerSequence.length - 1]) {
      // Wrong answer - play game over sound
      setTimeout(() => {
        playGameOver();
      }, 300);
      setGameOver(true);
      endGame();
      return;
    }
    setPlayerSequence(newPlayerSequence);
    if (newPlayerSequence.length === sequence.length) {
      // Correct sequence completed - play win sound
      setTimeout(() => {
        playWin();
      }, 300);
      setScore(score + 1);
      setTimeout(addNewColorToSequence, 1000);
    }
  };

  const endGame = () => {
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>SIMON</Text>
          <Text style={styles.titleAccent}>SAYS</Text>
          <Text style={styles.subtitle}>Memory Game</Text>
        </View>
        <View style={styles.highScoreSection}>
          <Text style={styles.highScoreValue}>{highScore}</Text>
          <Text style={styles.highScoreLabel}>BEST</Text>
        </View>
      </View>

      {/* Sound Toggle - Bottom Left */}
      <Pressable onPress={toggleSound} style={styles.soundButton}>
        <Text style={styles.soundButtonText}>{soundEnabled ? "🔊" : "🔇"}</Text>
      </Pressable>

      {/* Current Score Display - iOS Style */}
      <View style={styles.currentScoreDisplay}>
        <Animated.Text style={[styles.currentScoreNumber, scoreAnimatedStyle]}>{score}</Animated.Text>
        <View style={styles.currentScoreLabelContainer}>
          <Text style={styles.currentScoreLabel}>CURRENT SCORE</Text>
        </View>
      </View>

      {/* Game Board - Circular Container */}
      <View style={styles.gameBoardContainer}>
        <Animated.View style={[styles.gameBoard, boardAnimatedStyle]}>
          <View style={styles.padsGrid}>
            <GamePad
              color={Color.Green}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Green}
            />
            <GamePad
              color={Color.Red}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Red}
            />
            <GamePad
              color={Color.Yellow}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Yellow}
            />
            <GamePad
              color={Color.Blue}
              onClick={handleColorPress}
              disabled={!isPlayerTurn || gameOver}
              isActive={activeColor === Color.Blue}
            />
          </View>
        </Animated.View>
      </View>

      {/* Game Over Popup */}
      <Animated.View style={[styles.gameOverOverlay, gameOverAnimatedStyle]} pointerEvents={gameOver ? "auto" : "none"}>
        <View style={styles.gameOverBox}>
          <Text style={styles.gameOverText}>GAME OVER</Text>
          <Pressable
            style={({ pressed }) => [styles.tryAgainButton, pressed && styles.tryAgainButtonPressed]}
            onPress={handleStartGame}
          >
            <Text style={styles.tryAgainButtonText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            gameStarted ? styles.startButtonRestart : styles.startButtonStart,
            pressed && styles.startButtonPressed,
            { opacity: gameOver ? 0 : 1 },
          ]}
          onPress={handleStartGame}
          disabled={gameOver}
        >
          <Text style={styles.startButtonText}>{gameStarted ? "RESTART" : "START GAME"}</Text>
        </Pressable>

        <Text style={styles.hintText}>
          {gameStarted ? (isPlayerTurn ? "Repeat the pattern!" : "Watch the sequence...") : "Press Start to begin."}
        </Text>
      </View>
    </View>
  );
}

// =================================================================
// Styles
// =================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDF4E3", // cream/beige macaron background
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  header: {
    width: "100%",
    maxWidth: 400,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 8,
  },
  titleSection: {
    flex: 1,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#475569", // slate-600
    letterSpacing: -1,
    lineHeight: 36,
  },
  titleAccent: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FF8593", // strawberry macaron
    letterSpacing: -1,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 10,
    color: "#94a3b8", // slate-400
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  soundButton: {
    position: "absolute",
    bottom: 40,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 10,
  },
  soundButtonText: {
    fontSize: 24,
  },
  highScoreSection: {
    alignItems: "flex-end",
    paddingBottom: 4,
  },
  highScoreLabel: {
    fontSize: 10,
    color: "#94a3b8", // slate-400
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  highScoreValue: {
    fontSize: 36,
    fontFamily: "monospace",
    color: "#FF8593", // strawberry macaron
    fontWeight: "700",
  },
  currentScoreDisplay: {
    alignItems: "center",
    justifyContent: "center",
  },
  currentScoreNumber: {
    fontSize: 96,
    fontWeight: "200",
    color: "#475569", // slate-600
    fontFamily: "monospace",
    letterSpacing: -4,
    textShadowColor: "rgba(111, 208, 178, 0.2)", // seafoam glow
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  currentScoreLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -8,
  },
  currentScoreLabel: {
    fontSize: 11,
    color: "#94a3b8", // slate-400
    fontWeight: "600",
    letterSpacing: 2,
  },
  gameBoardContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  gameBoard: {
    width: gameBoardSize,
    height: gameBoardSize,
    backgroundColor: "#ffffff", // white
    borderRadius: gameBoardSize / 2,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 8,
    borderColor: "#ffffff", // white border
  },
  padsGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  controls: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  startButton: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    borderBottomWidth: 4,
  },
  startButtonStart: {
    backgroundColor: "#85C4FF", // azure macaron
    borderBottomColor: "#65A4DF",
  },
  startButtonRestart: {
    backgroundColor: "#cbd5e1", // slate-300
    borderBottomColor: "#94a3b8", // slate-400
  },
  startButtonGameOver: {
    backgroundColor: "#FF8593", // strawberry macaron
    borderBottomColor: "#E06573",
  },
  startButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }, { translateY: 4 }],
    borderBottomWidth: 0,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  hintText: {
    marginTop: 24,
    textAlign: "center",
    color: "#94a3b8", // slate-400
    fontSize: 12,
    paddingHorizontal: 32,
  },
  // GamePad styles
  padContainer: {
    width: padSize,
    height: padSize,
  },
  padBase: {
    width: padSize,
    height: padSize,
    borderRadius: 16,
    borderBottomWidth: 8,
    overflow: "hidden",
  },
  padActive: {
    borderBottomWidth: 0,
    transform: [{ translateY: 2 }],
    shadowRadius: 40,
    shadowOpacity: 0.8,
    elevation: 20,
  },
  padPressed: {
    transform: [{ translateY: 2 }, { scale: 0.95 }],
    borderBottomWidth: 0,
  },
  glossyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  rippleEffect: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 16,
  },
  rippleCircle: {
    width: "100%",
    height: "100%",
    backgroundColor: "white",
    borderRadius: 1000,
  },
  gameOverOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    backgroundColor: "rgba(255, 255, 255, 0.5)", // Semi-transparent background
  },
  gameOverBox: {
    backgroundColor: "#ffffff",
    padding: 32,
    borderRadius: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 4,
    borderColor: "#E06573", // strawberry border
  },
  gameOverText: {
    fontSize: 40,
    fontWeight: "900",
    color: "#E06573", // strawberry
    marginBottom: 24,
    letterSpacing: -1,
  },
  tryAgainButton: {
    backgroundColor: "#E06573", // strawberry
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    shadowColor: "#E06573",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tryAgainButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  tryAgainButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
  },
});

const padColorStyles = {
  [Color.Green]: StyleSheet.create({
    base: { backgroundColor: "#6FD0B2", borderColor: "#4FB092" }, // seafoam macaron
    active: { backgroundColor: "#98E6CD", shadowColor: "#6FD0B2" }, // lighter seafoam
  }),
  [Color.Red]: StyleSheet.create({
    base: { backgroundColor: "#FF8593", borderColor: "#E06573" }, // strawberry macaron
    active: { backgroundColor: "#FFACB7", shadowColor: "#FF8593" }, // lighter strawberry
  }),
  [Color.Yellow]: StyleSheet.create({
    base: { backgroundColor: "#FFD768", borderColor: "#E0B849" }, // custard macaron
    active: { backgroundColor: "#FFE699", shadowColor: "#FFD768" }, // lighter custard
  }),
  [Color.Blue]: StyleSheet.create({
    base: { backgroundColor: "#85C4FF", borderColor: "#65A4DF" }, // azure macaron
    active: { backgroundColor: "#ADD8FF", shadowColor: "#85C4FF" }, // lighter azure
  }),
};
