import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { AudioContext } from "react-native-audio-api";
import AudioManager from "react-native-audio-api/src/system/AudioManager";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

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

const FREQUENCIES: Record<Color, number> = {
  [Color.Green]: 329.63, // E4
  [Color.Red]: 261.63, // C4
  [Color.Yellow]: 220.0, // A3
  [Color.Blue]: 164.81, // E3
};
const ERROR_FREQ = 110; // A2

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

  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Configure audio session to use ambient category
    // This prevents the app from triggering lock screen music controls
    AudioManager.setAudioSessionOptions({
      iosCategory: "ambient",
      iosMode: "default",
    });

    audioCtx.current = new AudioContext();
    const handleAppStateChange = (nextAppState: any) => {
      if (nextAppState === "active" && audioCtx.current?.state === "suspended") {
        audioCtx.current.resume();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
      audioCtx.current?.close();
    };
  }, []);

  const playTone = useCallback(
    (color: Color | "error", duration: number = 0.4) => {
      if (!soundEnabled) return;
      const ctx = audioCtx.current;
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const freq = color === "error" ? ERROR_FREQ : FREQUENCIES[color];
      const type = color === "error" ? "sawtooth" : "sine";
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

      // Smooth attack and release envelope to prevent clicks/pops
      const attackTime = 0.02;
      const releaseTime = 0.05;
      const sustainTime = duration - attackTime - releaseTime;

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + attackTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime + attackTime + sustainTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration + 0.1); // Stop slightly after gain reaches 0
    },
    [soundEnabled]
  );

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
      playTone("error", 0.8);
      setGameOver(true);
      endGame();
      return;
    }
    setPlayerSequence(newPlayerSequence);
    if (newPlayerSequence.length === sequence.length) {
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
        <Text style={styles.currentScoreNumber}>{score}</Text>
        <View style={styles.currentScoreLabelContainer}>
          <Text style={styles.currentScoreLabel}>CURRENT SCORE</Text>
        </View>
      </View>

      {/* Game Board - Circular Container */}
      <View style={styles.gameBoardContainer}>
        <View style={styles.gameBoard}>
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
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            gameOver ? styles.startButtonGameOver : gameStarted ? styles.startButtonRestart : styles.startButtonStart,
            pressed && styles.startButtonPressed,
          ]}
          onPress={handleStartGame}
        >
          <Text style={styles.startButtonText}>{gameOver ? "TRY AGAIN" : gameStarted ? "RESTART" : "START GAME"}</Text>
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
