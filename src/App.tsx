/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Music } from 'lucide-react';

const COLORS = {
  burgundy: '#4d1428',
  stageBg: '#0d0d0d',
  wood: '#795548',
  targetBlue: '#34aadc',
  userPurple: '#9c27b0',
  success: '#2ecc71',
  fail: '#e74c3c',
};

const SETTINGS = {
  bpm: 80,
  pitches: [329.63, 392.00, 440.00, 493.88, 523.25], // E4, G4, A4, B4, C5 - Warmer, smoother range
  volume: 0.25, 
  fillSpeedPctPerSec: 10,
};

type Note = {
  startBeat: number;
  len: number;
  freq: number;
};

type UserAction = {
  start: number;
  len: number;
};

type Phase = 'IDLE' | 'MEMORIZING' | 'WAITING' | 'RECALLING';

export default function App() {
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [level, setLevel] = useState(1);
  const [numNotes, setNumNotes] = useState(2);
  const [hasStarted, setHasStarted] = useState(false);
  const [status, setStatus] = useState('Chạm START để bắt đầu');
  const [statusColor, setStatusColor] = useState('#666');
  const [melody, setMelody] = useState<Note[]>([]);
  const [totalBeats, setTotalBeats] = useState(0);
  
  const melodyRef = useRef<Note[]>([]);
  const totalBeatsRef = useRef(0);
  const totalDurationRef = useRef(0);
  const numNotesRef = useRef(2);
  const scheduledNodesRef = useRef<OscillatorNode[]>([]);
  
  const [containerWidth, setContainerWidth] = useState(90); 
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [targetFillWidth, setTargetFillWidth] = useState(0);
  const [userFillWidth, setUserFillWidth] = useState(0);

  const phaseRef = useRef<Phase>('IDLE');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    numNotesRef.current = numNotes;
  }, [numNotes]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sessionBeatDurRef = useRef(0.7);

  const gameRef = useRef({
    isPressing: false,
    pressStart: 0,
    startTime: 0,
    activeOsc: null as OscillatorNode | null,
    activeGain: null as GainNode | null,
    noteIndex: 0,
    animationFrame: 0,
  });

  const isFinalizingRef = useRef(false);

  const stopAllAudio = () => {
    scheduledNodesRef.current.forEach(node => {
      try {
        node.stop();
        node.disconnect();
      } catch (e) {}
    });
    scheduledNodesRef.current = [];
    if (gameRef.current.activeOsc) {
      try {
        gameRef.current.activeOsc.stop();
        gameRef.current.activeOsc.disconnect();
      } catch (e) {}
      gameRef.current.activeOsc = null;
      gameRef.current.activeGain = null;
    }
  };

  const getAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-20, ctx.currentTime);
      comp.knee.setValueAtTime(30, ctx.currentTime);
      comp.ratio.setValueAtTime(10, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.1, ctx.currentTime);
      
      const master = ctx.createGain();
      master.gain.setValueAtTime(1.0, ctx.currentTime);
      
      comp.connect(master);
      master.connect(ctx.destination);
      
      audioCtxRef.current = ctx;
      compressorRef.current = comp;
      masterGainRef.current = master;
    }
    return { ctx: audioCtxRef.current, dest: compressorRef.current! };
  };

  const generateMelody = (targetNoteCount: number) => {
    const newMelody: Note[] = [];
    let current = 0;

    let lastFreq: number | null = null;
    for (let i = 0; i < targetNoteCount; i++) {
      const len = 1 + Math.floor(Math.random() * 3);

      let freq: number;
      do {
        freq = SETTINGS.pitches[Math.floor(Math.random() * SETTINGS.pitches.length)];
      } while (freq === lastFreq);
      lastFreq = freq;

      newMelody.push({ startBeat: current, len, freq });
      current += len;
    }

    const total = current;
    const beatDur = 0.7;
    sessionBeatDurRef.current = beatDur;

    const totalDuration = total * beatDur;
    
    // Constant visual speed: 7% width per beat
    const barWidth = total * 7; 
    setContainerWidth(barWidth);

    setMelody(newMelody);
    melodyRef.current = newMelody;
    setTotalBeats(total);
    totalBeatsRef.current = total;
    totalDurationRef.current = totalDuration;
    return { melody: newMelody, totalBeats: total, totalDuration };
  };

  const playDrum = (ctx: AudioContext, dest: AudioNode, time: number, isStrong: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isStrong ? 1200 : 800, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.05);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1.0, time + 0.001); // Maximum punch for metronome
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.1);
    scheduledNodesRef.current.push(osc);
  };

  const playTune = (ctx: AudioContext, dest: AudioNode, melody: Note[], startTime: number, beatDur: number) => {
    melody.forEach((n) => {
      const noteStart = startTime + n.startBeat * beatDur;
      const noteEnd   = noteStart + (n.len * beatDur);
      
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(n.freq, noteStart);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, noteStart);

      const attack = 0.1; 
      const release = 0.1;

      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(SETTINGS.volume, noteStart + attack);
      gain.gain.setValueAtTime(SETTINGS.volume, noteEnd - release);
      gain.gain.linearRampToValueAtTime(0, noteEnd);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.2);
      scheduledNodesRef.current.push(osc);
    });
  };

  const startMemorize = async () => {
    cancelAnimationFrame(gameRef.current.animationFrame);
    stopAllAudio();
    isFinalizingRef.current = false;
    
    const { ctx, dest } = getAudio();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const { melody: newMelody, totalBeats: total, totalDuration } = generateMelody(numNotesRef.current);
    const beatDur = sessionBeatDurRef.current;
    
    setHasStarted(true);
    setPhase('MEMORIZING');
    phaseRef.current = 'MEMORIZING';
    setStatus('STAGE 1: MEMORIZE');
    setStatusColor('white');
    
    // Explicit resets
    setCursorPos(0);
    setTargetFillWidth(0);
    setUserFillWidth(0);
    setUserActions([]);
    userActionsRef.current = [];

    const onsetBuffer = 0.2;
    const start = ctx.currentTime + onsetBuffer; 
    
    for (let i = 0; i < total; i++) {
      playDrum(ctx, dest, start + i * beatDur, i % 4 === 0);
    }
    playTune(ctx, dest, newMelody, start, beatDur);

    const animate = () => {
      if (phaseRef.current !== 'MEMORIZING') return;
      
      const now = ctx.currentTime;
      const elapsed = Math.max(0, now - start);
      const progress = Math.min(elapsed / totalDuration, 1);
      
      setCursorPos(progress * 100);
      setTargetFillWidth(progress * 100);
      
      if (progress < 1) {
        gameRef.current.animationFrame = requestAnimationFrame(animate);
      } else {
        setPhase('WAITING');
        phaseRef.current = 'WAITING';
        setStatus('STAGE 2: CHẠM GIỮ ĐỂ RECALL');
      }
    };
    gameRef.current.animationFrame = requestAnimationFrame(animate);
  };

  const finalize = (actions: UserAction[], currentMelody: Note[], currentTotalBeats: number) => {
    if (isFinalizingRef.current && phaseRef.current === 'IDLE') return; 
    isFinalizingRef.current = true;
    
    cancelAnimationFrame(gameRef.current.animationFrame);
    stopAllAudio();

    setPhase('IDLE');
    phaseRef.current = 'IDLE';
    setCursorPos(0);
    setTargetFillWidth(0);
    setUserFillWidth(0);
    
    const tolerance = 0.20; // Sai số cho các mốc thời gian (onsets/offsets)
    let isCorrect = actions.length === currentMelody.length;
    let failReason = "";

    if (!isCorrect) {
      failReason = actions.length < currentMelody.length ? "Thiếu nhịp!" : "Thừa nhịp!";
    } else {
      for (let i = 0; i < currentMelody.length; i++) {
        const target = currentMelody[i];
        const user = actions[i];
        
        const targetStart = target.startBeat;
        const targetEnd = target.startBeat + target.len;
        const userStart = user.start;
        const userEnd = user.start + user.len;
        
        const startDiff = Math.abs(targetStart - userStart);
        const endDiff = Math.abs(targetEnd - userEnd);
        
        if (startDiff > tolerance || endDiff > tolerance) {
          isCorrect = false;
          if (startDiff > tolerance) {
            failReason = `Nốt ${i+1} nhấn sai mốc`;
          } else {
            failReason = `Nốt ${i+1} nhả sai mốc`;
          }
          break;
        }
      }
    }

    if (isCorrect) {
      setStatus(`CHÍNH XÁC! (Lvl ${level}) ▶ Lượt tiếp theo...`);
      setStatusColor(COLORS.success);
      setLevel((prev) => prev + 1);
      setTimeout(() => {
        startMemorize();
      }, 1500);
    } else {
      setStatus(`${failReason} ▶ Thử lại...`);
      setStatusColor(COLORS.fail);
      setTimeout(() => {
        startMemorize();
      }, 1500);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    handleStartInput();
  };

  const handlePointerUp = () => {
    handleEndInput();
  };

  const userActionsRef = useRef<UserAction[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Meta', 'Control', 'Alt', 'Shift', 'Tab', 'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) return;
      e.preventDefault();
      if (!gameRef.current.isPressing) {
        handleStartInput();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Meta', 'Control', 'Alt', 'Shift', 'Tab', 'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) return;
      e.preventDefault();
      handleEndInput();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleStartInput = () => {
    const currentPhase = phaseRef.current;
    if (currentPhase === 'IDLE' || currentPhase === 'MEMORIZING') return;

    const { ctx, dest } = getAudio();

    if (currentPhase === 'WAITING') {
      setPhase('RECALLING');
      phaseRef.current = 'RECALLING';
      gameRef.current.startTime = ctx.currentTime;
      gameRef.current.noteIndex = 0;
      setUserActions([]);
      userActionsRef.current = [];
      
      const animateUser = () => {
        if (phaseRef.current !== 'RECALLING') return;
        
        const now = ctx.currentTime;
        const elapsed = now - gameRef.current.startTime;
        const beatDur = sessionBeatDurRef.current;
        const currentBeat = elapsed / beatDur;
        const progress = Math.min(Math.max(0, currentBeat / totalBeatsRef.current), 1);
        
        setUserFillWidth(progress * 100);
        
        // Allow extra Beats of "buffer" for the user to finish their last note
        const timeLimit = totalBeatsRef.current + 2.0;
        
        if (currentBeat < timeLimit && gameRef.current.startTime > 0) {
          gameRef.current.animationFrame = requestAnimationFrame(animateUser);
        } else if (gameRef.current.startTime > 0) {
          // Time is up. Wait for current finger to lift, then finalize.
          const checkEnd = () => {
             if (gameRef.current.isPressing && ctx.currentTime - gameRef.current.startTime < (timeLimit + 10) * beatDur) {
               gameRef.current.animationFrame = requestAnimationFrame(checkEnd);
             } else {
               if (!isFinalizingRef.current) {
                 const currentActions = [...userActionsRef.current];
                 gameRef.current.startTime = 0;
                 finalize(currentActions, melodyRef.current, totalBeatsRef.current);
               }
             }
          };
          checkEnd();
        }
      };
      gameRef.current.animationFrame = requestAnimationFrame(animateUser);
    }

    if (gameRef.current.isPressing) return;

    // Safety: ensure any stray osc is killed
    if (gameRef.current.activeOsc) {
      try {
        gameRef.current.activeOsc.stop();
        gameRef.current.activeOsc.disconnect();
      } catch (e) {}
    }

    gameRef.current.isPressing = true;
    gameRef.current.pressStart = ctx.currentTime;

    if (gameRef.current.noteIndex < melodyRef.current.length) {
      const freq = melodyRef.current[gameRef.current.noteIndex].freq;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const now = ctx.currentTime;
      
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      
      const attack = 0.08;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(SETTINGS.volume, now + attack);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start();
      gameRef.current.activeOsc = osc;
      gameRef.current.activeGain = gain;
      gameRef.current.noteIndex++;
    }
  };

  const handleEndInput = () => {
    if (!gameRef.current.isPressing) return;
    gameRef.current.isPressing = false;

    const { ctx } = getAudio();

    if (gameRef.current.activeOsc) {
      const time = ctx.currentTime;
      gameRef.current.activeGain!.gain.cancelScheduledValues(time);
      gameRef.current.activeGain!.gain.setValueAtTime(gameRef.current.activeGain!.gain.value, time);
      gameRef.current.activeGain!.gain.linearRampToValueAtTime(0, time + 0.08);
      gameRef.current.activeOsc.stop(time + 0.15);

      const beatDur = sessionBeatDurRef.current;
      const startBeat = (gameRef.current.pressStart - gameRef.current.startTime) / beatDur;
      const endBeat = (time - gameRef.current.startTime) / beatDur;

      const newAction = { start: startBeat, len: endBeat - startBeat };
      setUserActions((prev) => [...prev, newAction]);
      userActionsRef.current.push(newAction);

      gameRef.current.activeOsc = null;
      gameRef.current.activeGain = null;

      if (userActionsRef.current.length >= melodyRef.current.length) {
        cancelAnimationFrame(gameRef.current.animationFrame);
        gameRef.current.startTime = 0;
        finalize(userActionsRef.current, melodyRef.current, totalBeatsRef.current);
      }
    }
  };

  const stopGame = () => {
    stopAllAudio();
    cancelAnimationFrame(gameRef.current.animationFrame);
    setPhase('IDLE');
    phaseRef.current = 'IDLE';
    setHasStarted(false);
    setLevel(1);
    setStatus('Chạm START để bắt đầu');
    setStatusColor('#666');
    setTargetFillWidth(0);
    setUserFillWidth(0);
    setCursorPos(0);
    setUserActions([]);
    userActionsRef.current = [];
  };

  return (
    <div className="min-h-screen bg-[#4d1428] text-white flex flex-col items-center justify-center p-4 font-sans select-none overflow-hidden touch-none">
      <div className="w-full max-w-2xl text-center">
        <motion.div 
          className="bg-[#0d0d0d] rounded-none p-8 relative overflow-hidden min-h-[500px] flex flex-col justify-center items-center cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="absolute top-6 left-8 z-50">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { 
                e.stopPropagation(); 
                stopGame();
              }}
              className={`p-3 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 rounded-xl transition-all flex items-center gap-2 group ${!hasStarted ? 'opacity-30 grayscale' : 'opacity-100'}`}
              title="Dừng và về Menu"
            >
              <RotateCcw size={20} className="group-hover:rotate-[-45deg] transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-tighter">Stop</span>
            </motion.button>
          </div>

          <div className="absolute top-6 right-8 flex flex-col items-end gap-1 text-[#555] font-bold text-sm tracking-widest z-50">
            {hasStarted ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col items-end"
              >
                <span className="text-white/80">NOTES: {numNotes}</span>
                <span className="text-white/40 text-[10px]">LVL: {level}</span>
              </motion.div>
            ) : (
              <span className="text-white/20 uppercase tracking-[0.2em]">Setup Mode</span>
            )}
          </div>

          <AnimatePresence mode="wait">
            {phase === 'IDLE' && !hasStarted && (
              <motion.div 
                key="setup-ui"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-10 z-10"
              >
                <div className="relative group">
                  <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl group-hover:bg-emerald-500/30 transition-all" />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); startMemorize(); }}
                    className="relative w-44 h-44 bg-gradient-to-br from-emerald-400 to-teal-600 border-[6px] border-white/20 shadow-2xl rounded-full flex flex-col items-center justify-center text-white ring-8 ring-emerald-500/10"
                  >
                    <Play size={56} className="fill-white mb-1 ml-2 drop-shadow-lg" />
                    <span className="text-xs tracking-[0.3em] font-black uppercase opacity-80">Start</span>
                  </motion.button>
                </div>

                <div className="flex flex-col items-center gap-4 bg-white/5 p-6 rounded-[32px] backdrop-blur-md border border-white/10 shadow-2xl">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-black">Số lượng nốt mẫu</span>
                  <div className="flex items-center gap-8">
                    <motion.button
                      whileHover={{ scale: 1.2, backgroundColor: 'rgba(255,255,255,0.15)' }}
                      whileTap={{ scale: 0.8 }}
                      onClick={(e) => { e.stopPropagation(); setNumNotes(prev => Math.max(2, prev - 1)); }}
                      className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 transition-all"
                    >
                      <span className="text-3xl font-light text-emerald-400">−</span>
                    </motion.button>
                    
                    <div className="flex flex-col items-center min-w-[60px]">
                      <span className="text-5xl font-black font-mono text-white tracking-tighter">{numNotes}</span>
                      <div className="flex gap-1 mt-1">
                        {[...Array(numNotes)].map((_, i) => (
                          <div key={i} className="w-1 h-1 bg-emerald-500 rounded-full" />
                        ))}
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.2, backgroundColor: 'rgba(255,255,255,0.15)' }}
                      whileTap={{ scale: 0.8 }}
                      onClick={(e) => { e.stopPropagation(); setNumNotes(prev => Math.min(12, prev + 1)); }}
                      className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 transition-all"
                    >
                      <span className="text-3xl font-light text-emerald-400">+</span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0 }}
              className="w-full space-y-8"
            >
                {(phase === 'MEMORIZING' || phase === 'WAITING' || phase === 'IDLE') && (
                  <div className="space-y-2">
                    <div className="text-[10px] text-[#444] uppercase tracking-[0.2em] font-bold text-left ml-[5%]">Memorize Stage</div>
                    <div className="relative h-14 mx-auto mb-6" style={{ width: `${containerWidth}%` }}>
                      {/* Target Melody Blocks */}
                      {melody.map((note, i) => (
                        <div key={`target-container-${note.startBeat}-${i}`}>
                          <div
                            className="absolute h-full bg-[#d4a373] z-10"
                            style={{
                              left: `${totalBeats > 0 ? (note.startBeat / totalBeats) * 100 : 0}%`,
                              width: `${totalBeats > 0 ? (note.len / totalBeats) * 100 : 0}%`,
                            }}
                          />
                          {/* Vertical Separator Line */}
                          <div 
                            className="absolute h-full w-[2px] bg-white/40 z-30"
                            style={{ left: `${totalBeats > 0 ? ((note.startBeat + note.len) / totalBeats) * 100 : 0}%`, transform: 'translateX(-100%)' }}
                          />
                        </div>
                      ))}
                      {/* Progress Fill */}
                      <div 
                        className="absolute top-0 left-0 h-full bg-[#9c27b0] z-20 pointer-events-none" 
                        style={{ width: `${targetFillWidth}%` }}
                      />
                      {/* Cursor */}
                      <motion.svg 
                        className="absolute top-[-30px] w-8 h-10 pointer-events-none z-40"
                        style={{ left: `${cursorPos}%`, transform: 'translateX(-50%)', display: phase === 'MEMORIZING' ? 'block' : 'none' }}
                        viewBox="0 0 100 100"
                      >
                        <path 
                          d="M50 0 C50 0 10 40 10 70 A40 40 0 1 0 90 70 C90 40 50 0 50 0 Z" 
                          fill="#151515" 
                          stroke="white" 
                          strokeWidth="10"
                        />
                      </motion.svg>
                      {/* No markers per request */}
                    </div>
                  </div>
                )}

                <div className="space-y-2 mt-8">
                  <div className="text-[10px] text-[#444] uppercase tracking-[0.2em] font-bold text-left ml-[5%]">Your Recall (Giữ phím bất kỳ hoặc chạm)</div>
                  <div className="relative h-14 mx-auto mb-6" style={{ width: `${containerWidth}%` }}>
                    {/* User Recall Blocks */}
                    {userActions.map((action, i) => (
                      <div key={`user-container-${action.start}-${i}`}>
                        <div
                          className="absolute h-full bg-[#9c27b0] z-10"
                          style={{
                            left: `${totalBeats > 0 ? (action.start / totalBeats) * 100 : 0}%`,
                            width: `${totalBeats > 0 ? (action.len / totalBeats) * 100 : 0}%`,
                          }}
                        />
                        {/* Vertical Separator Line */}
                        <div 
                          className="absolute h-full w-[2px] bg-white/40 z-30"
                          style={{ left: `${totalBeats > 0 ? ((action.start + action.len) / totalBeats) * 100 : 0}%`, transform: 'translateX(-100%)' }}
                        />
                      </div>
                    ))}
                    {/* Current Handle Fill */}
                    <div 
                      className="absolute top-0 left-0 h-full bg-[#9c27b0] z-10" 
                      style={{ width: `${userFillWidth}%`, opacity: gameRef.current.isPressing ? 1 : 0 }} 
                    />
                    {/* Cursor for Recall */}
                    <motion.svg 
                      className="absolute top-[-30px] w-8 h-10 pointer-events-none z-40"
                      style={{ 
                        left: `${userFillWidth}%`, 
                        transform: 'translateX(-50%)', 
                        display: phase === 'RECALLING' ? 'block' : 'none' 
                      }}
                      viewBox="0 0 100 100"
                    >
                      <path 
                        d="M50 0 C50 0 10 40 10 70 A40 40 0 1 0 90 70 C90 40 50 0 50 0 Z" 
                        fill="#151515" 
                        stroke="white" 
                        strokeWidth="10"
                      />
                    </motion.svg>
                    {/* No markers per request */}
                  </div>
                </div>
              </motion.div>
          </AnimatePresence>
        </motion.div>
        
        <div 
          className="mt-8 text-xl font-bold min-h-[1.5em]"
          style={{ color: statusColor }}
        >
          {status}
        </div>
      </div>
    </div>
  );
}
