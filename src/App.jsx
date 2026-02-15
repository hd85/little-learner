import { useState, useEffect, useCallback, useRef } from "react";
import * as Tone from "tone";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, getDocs } from "firebase/firestore";

// ============ FIREBASE CONFIG ============
// Client-side identifiers (safe to commit). Security is enforced by Firestore rules.
// Replace with your Firebase project config from Firebase Console → Project Settings → Web App
const firebaseConfig = {
  apiKey: "AIzaSyAcPs8TX7-ILJ0FvMXUMhIJgZ2T8JTFRW8",
  authDomain: "little-learner-f0341.firebaseapp.com",
  projectId: "little-learner-f0341",
  storageBucket: "little-learner-f0341.firebasestorage.app",
  messagingSenderId: "481835344480",
  appId: "1:481835344480:web:36bbc64575a894bf2cd905"
};

const FIREBASE_ENABLED = firebaseConfig.apiKey !== "REPLACE_ME";
let auth = null, db = null;
const googleProvider = new GoogleAuthProvider();
if (FIREBASE_ENABLED) {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
}

const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Baloo+2:wght@400;500;600;700;800&display=swap";

const theme = {
  bg: "#FFF8F0", bgWarm: "#FEF3E2", card: "#FFFFFF",
  text: "#5D4037", textLight: "#8D6E63",
  accent1: "#E8A87C", accent2: "#95B8A0", accent3: "#D4A5A5",
  accent4: "#7FB3D3", accent5: "#C5A3CF", accent6: "#F2D388",
  accent7: "#E07A5F", arsenal: "#EF0107",
  shadow: "0 8px 32px rgba(93, 64, 55, 0.08)",
  shadowHover: "0 12px 40px rgba(93, 64, 55, 0.14)",
};

// ============ SOUND ENGINE ============
let audioStarted = false;
let speechUnlocked = false;
async function ensureAudio() {
  if (!audioStarted) {
    await Tone.start();
    // iOS Safari: force resume the underlying AudioContext
    if (Tone.getContext().state !== "running") {
      await Tone.getContext().resume();
    }
    audioStarted = true;
  }
  // iOS requires speech to be triggered from user gesture at least once
  if (!speechUnlocked && "speechSynthesis" in window) {
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

// ============ SPEECH ============
function speak(text, rate = 0.85) {
  if (!("speechSynthesis" in window) || !text) return;
  // Cancel any in-progress speech
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  utter.pitch = 1.1;
  // Pick a friendly English voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes("Samantha")) // iOS
    || voices.find(v => v.name.includes("Google") && v.lang.startsWith("en"))
    || voices.find(v => v.lang.startsWith("en"));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}
// Preload voices (some browsers load async)
if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sine" },
  envelope: { attack: 0.02, decay: 0.3, sustain: 0.1, release: 0.8 },
  volume: -12,
}).toDestination();

const bellSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 1.2 },
  volume: -10,
}).toDestination();

const bassSynth = new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.05, decay: 0.4, sustain: 0, release: 0.6 },
  volume: -15,
}).toDestination();

function playCorrect() {
  ensureAudio();
  const now = Tone.now();
  bellSynth.triggerAttackRelease("C5", "8n", now);
  bellSynth.triggerAttackRelease("E5", "8n", now + 0.1);
  bellSynth.triggerAttackRelease("G5", "8n", now + 0.2);
  bellSynth.triggerAttackRelease("C6", "4n", now + 0.3);
}

function playWrong() {
  ensureAudio();
  bassSynth.triggerAttackRelease("G3", "8n", Tone.now());
}

function playTap() {
  ensureAudio();
  synth.triggerAttackRelease("G5", "32n", Tone.now());
}

function playCelebration() {
  ensureAudio();
  const now = Tone.now();
  const notes = ["C5", "E5", "G5", "C6", "E6", "G6"];
  notes.forEach((n, i) => bellSynth.triggerAttackRelease(n, "16n", now + i * 0.08));
}

function playMix() {
  ensureAudio();
  const now = Tone.now();
  synth.triggerAttackRelease("C4", "16n", now);
  synth.triggerAttackRelease("E4", "16n", now + 0.15);
  synth.triggerAttackRelease("G4", "8n", now + 0.3);
}

const LETTER_NOTES = {
  A: "C4", B: "D4", C: "E4", D: "F4", E: "G4", F: "A4", G: "B4",
  H: "C5", I: "D5", J: "E5", K: "F5", L: "G5", M: "A5",
  N: "C4", O: "D4", P: "E4", Q: "F4", R: "G4", S: "A4", T: "B4",
  U: "C5", V: "D5", W: "E5", X: "F5", Y: "G5", Z: "A5",
};

function playLetter(letter) {
  ensureAudio();
  const note = LETTER_NOTES[letter.toUpperCase()] || "C5";
  synth.triggerAttackRelease(note, "8n", Tone.now());
}

function playNumber(num) {
  ensureAudio();
  const scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"];
  synth.triggerAttackRelease(scale[num - 1] || "C4", "8n", Tone.now());
}

// ============ DATA ============
const PHONICS_DATA = [
  { letter: "A", word: "Apple", emoji: "🍎", sound: "ah" },
  { letter: "B", word: "Bear", emoji: "🐻", sound: "buh" },
  { letter: "C", word: "Cat", emoji: "🐱", sound: "kuh" },
  { letter: "D", word: "Dog", emoji: "🐶", sound: "duh" },
  { letter: "E", word: "Egg", emoji: "🥚", sound: "eh" },
  { letter: "F", word: "Fish", emoji: "🐟", sound: "fuh" },
  { letter: "G", word: "Grape", emoji: "🍇", sound: "guh" },
  { letter: "H", word: "Hat", emoji: "🎩", sound: "huh" },
  { letter: "I", word: "Ice", emoji: "🧊", sound: "ih" },
  { letter: "J", word: "Jar", emoji: "🏺", sound: "juh" },
  { letter: "K", word: "Kite", emoji: "🪁", sound: "kuh" },
  { letter: "L", word: "Lion", emoji: "🦁", sound: "luh" },
  { letter: "M", word: "Moon", emoji: "🌙", sound: "muh" },
  { letter: "N", word: "Nest", emoji: "🪺", sound: "nuh" },
  { letter: "O", word: "Orange", emoji: "🍊", sound: "oh" },
  { letter: "P", word: "Pear", emoji: "🍐", sound: "puh" },
  { letter: "Q", word: "Queen", emoji: "👑", sound: "kwuh" },
  { letter: "R", word: "Rain", emoji: "🌧️", sound: "ruh" },
  { letter: "S", word: "Sun", emoji: "☀️", sound: "sss" },
  { letter: "T", word: "Tree", emoji: "🌳", sound: "tuh" },
  { letter: "U", word: "Umbrella", emoji: "☂️", sound: "uh" },
  { letter: "V", word: "Vine", emoji: "🌿", sound: "vvv" },
  { letter: "W", word: "Water", emoji: "💧", sound: "wuh" },
  { letter: "X", word: "X-ray", emoji: "🩻", sound: "ks" },
  { letter: "Y", word: "Yarn", emoji: "🧶", sound: "yuh" },
  { letter: "Z", word: "Zebra", emoji: "🦓", sound: "zzz" },
];

const ANIMALS_E = ["🐻","🐰","🦊","🐱","🐶","🦋","🐢","🐝","🐞","🦉","🐸","🦆","🐿️","🦔","🐾","🦩","🦚","🐠","🦎","🐌"];
const FRUITS = ["🍎","🍊","🍋","🍇","🍓","🫐","🍑","🥝","🍌","🍐","🍒","🍈","🥭","🍍","🥥","🍉"];
const NATURE = ["🌸","🌻","🌿","🍃","🌺","🌷","🌼","🍄","🌈","⭐","🌵","🌾","🍁","🌹","💐","🪻"];
const VEHICLES_E = ["🚗","🚌","🚂","✈️","🚀","🛸","🚁","🚲","🛵","⛵","🚒","🚑"];
const SPORTS_E = ["⚽","🏀","🎾","🏈","⚾","🏐","🎱","🏓","🥊","🏑"];

const CVC_WORDS = [
  // a-words
  { word: "CAT", hint: "🐱" }, { word: "HAT", hint: "🎩" }, { word: "BAT", hint: "🦇" },
  { word: "MAP", hint: "🗺️" }, { word: "VAN", hint: "🚐" }, { word: "FAN", hint: "🌬️" },
  { word: "JAM", hint: "🍯" }, { word: "RAM", hint: "🐏" }, { word: "DAM", hint: "🦫" },
  { word: "RAT", hint: "🐀" }, { word: "MAT", hint: "🧹" }, { word: "TAP", hint: "🚰" },
  { word: "CAN", hint: "🥫" }, { word: "PAN", hint: "🍳" }, { word: "SAT", hint: "🪑" },
  { word: "BAG", hint: "👜" }, { word: "TAG", hint: "🏷️" }, { word: "WAX", hint: "🕯️" },
  { word: "NAP", hint: "😴" }, { word: "LAP", hint: "🏃" }, { word: "CAP", hint: "🧢" },
  // e-words
  { word: "BED", hint: "🛏️" }, { word: "HEN", hint: "🐔" }, { word: "PEN", hint: "🖊️" },
  { word: "NET", hint: "🥅" }, { word: "WEB", hint: "🕸️" }, { word: "JET", hint: "✈️" },
  { word: "RED", hint: "🔴" }, { word: "TEN", hint: "🔟" }, { word: "VET", hint: "👩‍⚕️" },
  { word: "PET", hint: "🐕" }, { word: "BET", hint: "🎰" }, { word: "SET", hint: "📦" },
  { word: "MEN", hint: "👬" }, { word: "LEG", hint: "🦵" }, { word: "PEG", hint: "📌" },
  // i-words
  { word: "PIG", hint: "🐷" }, { word: "BIG", hint: "🐘" }, { word: "DIG", hint: "⛏️" },
  { word: "FIG", hint: "🍐" }, { word: "WIG", hint: "💇" }, { word: "BIN", hint: "🗑️" },
  { word: "FIN", hint: "🦈" }, { word: "PIN", hint: "📌" }, { word: "WIN", hint: "🏆" },
  { word: "SIT", hint: "🪑" }, { word: "BIT", hint: "🔩" }, { word: "HIT", hint: "🥊" },
  { word: "FIT", hint: "💪" }, { word: "KIT", hint: "🧰" }, { word: "LIP", hint: "👄" },
  { word: "TIP", hint: "💡" }, { word: "RIP", hint: "📄" }, { word: "SIP", hint: "🧃" },
  { word: "MIX", hint: "🥣" }, { word: "SIX", hint: "6️⃣" }, { word: "FIX", hint: "🔧" },
  // o-words
  { word: "DOG", hint: "🐶" }, { word: "FOX", hint: "🦊" }, { word: "MOP", hint: "🧹" },
  { word: "LOG", hint: "🪵" }, { word: "HOG", hint: "🐗" }, { word: "FOG", hint: "🌫️" },
  { word: "COG", hint: "⚙️" }, { word: "COT", hint: "🛏️" }, { word: "HOT", hint: "🔥" },
  { word: "POT", hint: "🍯" }, { word: "DOT", hint: "⚫" }, { word: "BOX", hint: "📦" },
  { word: "HOP", hint: "🐰" }, { word: "MOM", hint: "👩" }, { word: "POP", hint: "🎈" },
  { word: "TOP", hint: "🔝" }, { word: "COP", hint: "👮" }, { word: "ROD", hint: "🎣" },
  // u-words
  { word: "SUN", hint: "☀️" }, { word: "BUG", hint: "🐛" }, { word: "CUP", hint: "🥤" },
  { word: "BUS", hint: "🚌" }, { word: "MUG", hint: "☕" }, { word: "RUG", hint: "🟫" },
  { word: "HUG", hint: "🤗" }, { word: "TUB", hint: "🛁" }, { word: "CUB", hint: "🐻" },
  { word: "PUP", hint: "🐶" }, { word: "NUT", hint: "🥜" }, { word: "CUT", hint: "✂️" },
  { word: "GUT", hint: "💪" }, { word: "HUT", hint: "🛖" }, { word: "RUN", hint: "🏃" },
  { word: "FUN", hint: "🎉" }, { word: "GUN", hint: "🔫" }, { word: "BUN", hint: "🍔" },
  { word: "GUM", hint: "🫧" }, { word: "HUM", hint: "🎵" }, { word: "SUM", hint: "➕" },
];

const HABITATS = [
  { name: "Farm", emoji: "🏡", bg: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", animals: [{ emoji: "🐄", name: "Cow" }, { emoji: "🐔", name: "Chicken" }, { emoji: "🐷", name: "Pig" }, { emoji: "🐴", name: "Horse" }, { emoji: "🐑", name: "Sheep" }, { emoji: "🐐", name: "Goat" }, { emoji: "🦆", name: "Duck" }, { emoji: "🐇", name: "Rabbit" }] },
  { name: "Ocean", emoji: "🌊", bg: "linear-gradient(135deg,#E3F2FD,#B3E5FC)", animals: [{ emoji: "🐟", name: "Fish" }, { emoji: "🐙", name: "Octopus" }, { emoji: "🐬", name: "Dolphin" }, { emoji: "🦀", name: "Crab" }, { emoji: "🐋", name: "Whale" }, { emoji: "🦈", name: "Shark" }, { emoji: "🐠", name: "Clownfish" }, { emoji: "🦑", name: "Squid" }] },
  { name: "Jungle", emoji: "🌴", bg: "linear-gradient(135deg,#E8F5E9,#A5D6A7)", animals: [{ emoji: "🦁", name: "Lion" }, { emoji: "🐒", name: "Monkey" }, { emoji: "🦜", name: "Parrot" }, { emoji: "🐍", name: "Snake" }, { emoji: "🦎", name: "Lizard" }, { emoji: "🐆", name: "Leopard" }, { emoji: "🦋", name: "Butterfly" }, { emoji: "🐸", name: "Frog" }] },
  { name: "Arctic", emoji: "❄️", bg: "linear-gradient(135deg,#E1F5FE,#B3E5FC)", animals: [{ emoji: "🐧", name: "Penguin" }, { emoji: "🐻‍❄️", name: "Polar Bear" }, { emoji: "🦭", name: "Seal" }, { emoji: "🦌", name: "Reindeer" }, { emoji: "🦊", name: "Arctic Fox" }, { emoji: "🐺", name: "Wolf" }, { emoji: "🦅", name: "Snowy Owl" }] },
  { name: "Desert", emoji: "🏜️", bg: "linear-gradient(135deg,#FFF8E1,#FFE0B2)", animals: [{ emoji: "🐪", name: "Camel" }, { emoji: "🦂", name: "Scorpion" }, { emoji: "🦎", name: "Gecko" }, { emoji: "🐍", name: "Rattlesnake" }, { emoji: "🦅", name: "Eagle" }, { emoji: "🐇", name: "Jackrabbit" }] },
  { name: "Forest", emoji: "🌲", bg: "linear-gradient(135deg,#E8F5E9,#C8E6C9)", animals: [{ emoji: "🦊", name: "Fox" }, { emoji: "🦌", name: "Deer" }, { emoji: "🐿️", name: "Squirrel" }, { emoji: "🦉", name: "Owl" }, { emoji: "🐻", name: "Bear" }, { emoji: "🦔", name: "Hedgehog" }, { emoji: "🐺", name: "Wolf" }] },
  { name: "Pond", emoji: "🪷", bg: "linear-gradient(135deg,#E0F7FA,#B2EBF2)", animals: [{ emoji: "🐸", name: "Frog" }, { emoji: "🦆", name: "Duck" }, { emoji: "🐢", name: "Turtle" }, { emoji: "🐟", name: "Goldfish" }, { emoji: "🦢", name: "Swan" }, { emoji: "🐌", name: "Snail" }] },
  { name: "Savanna", emoji: "🌅", bg: "linear-gradient(135deg,#FFF3E0,#FFE0B2)", animals: [{ emoji: "🦒", name: "Giraffe" }, { emoji: "🦓", name: "Zebra" }, { emoji: "🐘", name: "Elephant" }, { emoji: "🦏", name: "Rhino" }, { emoji: "🦛", name: "Hippo" }, { emoji: "🐃", name: "Buffalo" }, { emoji: "🦩", name: "Flamingo" }] },
];

const ARSENAL_PLAYERS = [
  { name: "David Raya", number: 1, country: "Spain", flag: "🇪🇸", position: "GK" },
  { name: "William Saliba", number: 2, country: "France", flag: "🇫🇷", position: "DEF" },
  { name: "Ben White", number: 4, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "DEF" },
  { name: "Gabriel", number: 6, country: "Brazil", flag: "🇧🇷", position: "DEF" },
  { name: "Bukayo Saka", number: 7, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "FWD" },
  { name: "Martin Ødegaard", number: 8, country: "Norway", flag: "🇳🇴", position: "MID" },
  { name: "Gabriel Jesus", number: 9, country: "Brazil", flag: "🇧🇷", position: "FWD" },
  { name: "Gabriel Martinelli", number: 11, country: "Brazil", flag: "🇧🇷", position: "FWD" },
  { name: "Jurriën Timber", number: 12, country: "Netherlands", flag: "🇳🇱", position: "DEF" },
  { name: "Viktor Gyökeres", number: 14, country: "Sweden", flag: "🇸🇪", position: "FWD" },
  { name: "Jakub Kiwior", number: 15, country: "Poland", flag: "🇵🇱", position: "DEF" },
  { name: "Oleksandr Zinchenko", number: 17, country: "Ukraine", flag: "🇺🇦", position: "DEF" },
  { name: "Leandro Trossard", number: 19, country: "Belgium", flag: "🇧🇪", position: "FWD" },
  { name: "Noni Madueke", number: 20, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "FWD" },
  { name: "Ethan Nwaneri", number: 22, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "MID" },
  { name: "Mikel Merino", number: 23, country: "Spain", flag: "🇪🇸", position: "MID" },
  { name: "Kai Havertz", number: 29, country: "Germany", flag: "🇩🇪", position: "FWD" },
  { name: "Riccardo Calafiori", number: 33, country: "Italy", flag: "🇮🇹", position: "DEF" },
  { name: "Martin Zubimendi", number: 36, country: "Spain", flag: "🇪🇸", position: "MID" },
  { name: "Declan Rice", number: 41, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "MID" },
  { name: "Myles Lewis-Skelly", number: 49, country: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", position: "MID" },
];

// ============ DATA: NEW ACTIVITIES ============
const COLOR_MIXES = [
  { target: "Orange", hex: "#FF8C00", ingredients: ["Red", "Yellow"], emoji: "🍊" },
  { target: "Green", hex: "#4CAF50", ingredients: ["Blue", "Yellow"], emoji: "🌿" },
  { target: "Purple", hex: "#9C27B0", ingredients: ["Red", "Blue"], emoji: "🍇" },
  { target: "Pink", hex: "#FF69B4", ingredients: ["Red", "White"], emoji: "🌸" },
  { target: "Light Blue", hex: "#87CEEB", ingredients: ["Blue", "White"], emoji: "🦋" },
  { target: "Brown", hex: "#8B4513", ingredients: ["Red", "Green"], emoji: "🐻" },
  { target: "Light Green", hex: "#90EE90", ingredients: ["Green", "White"], emoji: "🥬" },
  { target: "Dark Red", hex: "#B71C1C", ingredients: ["Red", "Black"], emoji: "🫀" },
  { target: "Navy", hex: "#1A237E", ingredients: ["Blue", "Black"], emoji: "🫐" },
  { target: "Dark Green", hex: "#1B5E20", ingredients: ["Green", "Black"], emoji: "🌲" },
  { target: "Grey", hex: "#9E9E9E", ingredients: ["Black", "White"], emoji: "🐘" },
  { target: "Lime", hex: "#CDDC39", ingredients: ["Yellow", "Green"], emoji: "🍋" },
  { target: "Teal", hex: "#009688", ingredients: ["Blue", "Green"], emoji: "🐸" },
  { target: "Olive", hex: "#827717", ingredients: ["Yellow", "Black"], emoji: "🫒" },
];

const PRIMARY_COLORS = [
  { name: "Red", hex: "#EF5350" },
  { name: "Blue", hex: "#42A5F5" },
  { name: "Yellow", hex: "#FFD54F" },
  { name: "White", hex: "#F5F5F5" },
  { name: "Green", hex: "#66BB6A" },
  { name: "Black", hex: "#424242" },
];

const PATTERNS = [
  // AB patterns (simple alternating)
  { sequence: ["🍎","🍌","🍎","🍌"], answer: "🍎", options: ["🍎","🍇","🍌"] },
  { sequence: ["⭐","🌙","⭐","🌙"], answer: "⭐", options: ["⭐","☀️","🌙"] },
  { sequence: ["🔴","🔵","🔴","🔵"], answer: "🔴", options: ["🔴","🟢","🔵"] },
  { sequence: ["🐱","🐶","🐱","🐶"], answer: "🐱", options: ["🐱","🐰","🐶"] },
  { sequence: ["🌸","🌻","🌸","🌻"], answer: "🌸", options: ["🌸","🌺","🌻"] },
  { sequence: ["🚗","🚌","🚗","🚌"], answer: "🚗", options: ["🚗","🚂","🚌"] },
  { sequence: ["☀️","🌧️","☀️","🌧️"], answer: "☀️", options: ["☀️","⛅","🌧️"] },
  { sequence: ["🍕","🍔","🍕","🍔"], answer: "🍕", options: ["🍕","🌮","🍔"] },
  { sequence: ["🎸","🥁","🎸","🥁"], answer: "🎸", options: ["🎸","🎹","🥁"] },
  { sequence: ["🐝","🌸","🐝","🌸"], answer: "🐝", options: ["🐝","🦋","🌸"] },
  { sequence: ["❤️","💙","❤️","💙"], answer: "❤️", options: ["❤️","💜","💙"] },
  { sequence: ["🐢","🐇","🐢","🐇"], answer: "🐢", options: ["🐢","🦊","🐇"] },
  // ABC patterns
  { sequence: ["🐱","🐶","🐰","🐱","🐶"], answer: "🐰", options: ["🐰","🐱","🐶"] },
  { sequence: ["☀️","🌧️","⛅","☀️","🌧️"], answer: "⛅", options: ["⛅","🌪️","☀️"] },
  { sequence: ["🟢","🔵","🔴","🟢","🔵"], answer: "🔴", options: ["🔴","🟡","🟢"] },
  { sequence: ["🦋","🐝","🐞","🦋","🐝"], answer: "🐞", options: ["🐞","🦋","🐝"] },
  { sequence: ["🍎","🍊","🍋","🍎","🍊"], answer: "🍋", options: ["🍋","🍎","🍊"] },
  { sequence: ["🐻","🐼","🐨","🐻","🐼"], answer: "🐨", options: ["🐨","🐻","🐼"] },
  { sequence: ["🚗","🚌","🚂","🚗","🚌"], answer: "🚂", options: ["🚂","🚗","🚌"] },
  { sequence: ["🌹","🌻","🌷","🌹","🌻"], answer: "🌷", options: ["🌷","🌹","🌻"] },
  { sequence: ["🏀","⚽","🎾","🏀","⚽"], answer: "🎾", options: ["🎾","🏀","⚽"] },
  { sequence: ["🧁","🍩","🍰","🧁","🍩"], answer: "🍰", options: ["🍰","🧁","🍩"] },
  // AAB patterns
  { sequence: ["🌸","🌸","🌻","🌸","🌸"], answer: "🌻", options: ["🌻","🌺","🌸"] },
  { sequence: ["🔵","🔵","🔴","🔵","🔵"], answer: "🔴", options: ["🔴","🔵","🟢"] },
  { sequence: ["🐶","🐶","🐱","🐶","🐶"], answer: "🐱", options: ["🐱","🐶","🐰"] },
  { sequence: ["⭐","⭐","🌙","⭐","⭐"], answer: "🌙", options: ["🌙","⭐","☀️"] },
  { sequence: ["🍓","🍓","🫐","🍓","🍓"], answer: "🫐", options: ["🫐","🍓","🍇"] },
  { sequence: ["🚗","🚗","🚌","🚗","🚗"], answer: "🚌", options: ["🚌","🚗","🚂"] },
  // ABB patterns
  { sequence: ["🍎","🍌","🍌","🍎","🍌"], answer: "🍌", options: ["🍌","🍎","🍇"] },
  { sequence: ["🐸","🐛","🐛","🐸","🐛"], answer: "🐛", options: ["🐛","🐸","🦋"] },
  { sequence: ["☀️","❄️","❄️","☀️","❄️"], answer: "❄️", options: ["❄️","☀️","🌧️"] },
  // Growing patterns
  { sequence: ["🐣","🐥","🐔","🐣","🐥"], answer: "🐔", options: ["🐔","🐣","🐥"] },
  { sequence: ["🌱","🌿","🌳","🌱","🌿"], answer: "🌳", options: ["🌳","🌱","🌿"] },
  { sequence: ["🥚","🐛","🦋","🥚","🐛"], answer: "🦋", options: ["🦋","🥚","🐛"] },
];

const ODD_ONE_OUT = [
  // Food vs non-food
  { group: ["🍎","🍌","🍇"], odd: "🥕", category: "Fruits", oddName: "Vegetable" },
  { group: ["🍕","🍔","🌮"], odd: "📚", category: "Fast Food", oddName: "Book" },
  { group: ["🍪","🧁","🍰"], odd: "🥦", category: "Sweets", oddName: "Vegetable" },
  { group: ["🥕","🥦","🌽"], odd: "🍭", category: "Vegetables", oddName: "Candy" },
  { group: ["🍓","🫐","🍒"], odd: "🧀", category: "Berries", oddName: "Cheese" },
  { group: ["🍞","🥐","🥖"], odd: "🎈", category: "Bread", oddName: "Balloon" },
  // Animals
  { group: ["🐶","🐱","🐰"], odd: "🐟", category: "Pets", oddName: "Fish" },
  { group: ["🐛","🐝","🦋"], odd: "🐸", category: "Bugs", oddName: "Frog" },
  { group: ["🐄","🐷","🐔"], odd: "🦁", category: "Farm Animals", oddName: "Wild Animal" },
  { group: ["🦁","🐘","🦒"], odd: "🐶", category: "Safari Animals", oddName: "Pet" },
  { group: ["🐟","🐬","🐙"], odd: "🐻", category: "Sea Animals", oddName: "Bear" },
  { group: ["🐦","🦅","🦜"], odd: "🐍", category: "Birds", oddName: "Snake" },
  { group: ["🐸","🐊","🦎"], odd: "🐝", category: "Reptiles", oddName: "Bee" },
  { group: ["🐿️","🦔","🐇"], odd: "🐋", category: "Small Animals", oddName: "Whale" },
  // Vehicles
  { group: ["🚗","🚌","🏎️"], odd: "🌳", category: "Vehicles", oddName: "Tree" },
  { group: ["✈️","🚁","🚀"], odd: "🚗", category: "Things that Fly", oddName: "Car" },
  { group: ["⛵","🚢","🛥️"], odd: "🚂", category: "Boats", oddName: "Train" },
  { group: ["🚲","🛵","🏍️"], odd: "🎸", category: "Two-Wheelers", oddName: "Guitar" },
  // Nature & sky
  { group: ["⭐","🌙","☀️"], odd: "🌸", category: "In the Sky", oddName: "Flower" },
  { group: ["🌧️","⛈️","🌨️"], odd: "🔥", category: "Weather", oddName: "Fire" },
  { group: ["🌸","🌹","🌻"], odd: "🍄", category: "Flowers", oddName: "Mushroom" },
  { group: ["🌲","🌴","🌳"], odd: "🏠", category: "Trees", oddName: "House" },
  { group: ["🌊","💧","🧊"], odd: "🔥", category: "Water", oddName: "Fire" },
  // School & tools
  { group: ["✏️","📏","🖊️"], odd: "🍕", category: "School Supplies", oddName: "Food" },
  { group: ["📖","📚","📓"], odd: "⚽", category: "Books", oddName: "Ball" },
  { group: ["🔨","🪛","🔧"], odd: "🎂", category: "Tools", oddName: "Cake" },
  // Music & sports
  { group: ["🎸","🥁","🎹"], odd: "⚽", category: "Instruments", oddName: "Ball" },
  { group: ["⚽","🏀","🎾"], odd: "🎸", category: "Balls", oddName: "Guitar" },
  { group: ["🏊","🚴","🏃"], odd: "😴", category: "Sports", oddName: "Sleeping" },
  // Clothing
  { group: ["👒","🧢","🎩"], odd: "👟", category: "Hats", oddName: "Shoe" },
  { group: ["👕","👗","🧥"], odd: "🎒", category: "Clothes", oddName: "Bag" },
  { group: ["👟","👢","🩴"], odd: "🧤", category: "Shoes", oddName: "Glove" },
  // Shapes & colors
  { group: ["🔴","🟢","🔵"], odd: "⭐", category: "Circles", oddName: "Star" },
  { group: ["🟥","🟧","🟨"], odd: "⚫", category: "Colored Squares", oddName: "Black Circle" },
  // Seasons & time
  { group: ["❄️","⛄","🧣"], odd: "☀️", category: "Winter Things", oddName: "Sun" },
  { group: ["🌸","🌷","🐣"], odd: "🍂", category: "Spring Things", oddName: "Autumn Leaf" },
  { group: ["🏖️","🍦","☀️"], odd: "⛄", category: "Summer Things", oddName: "Snowman" },
  // Home items
  { group: ["🛋️","🪑","🛏️"], odd: "🚗", category: "Furniture", oddName: "Car" },
  { group: ["🍳","🥄","🍽️"], odd: "🔑", category: "Kitchen Items", oddName: "Key" },
  { group: ["📺","💻","📱"], odd: "🌺", category: "Screens", oddName: "Flower" },
];

// ============ DATA: VALUES & COMPANION ============
const VALUES = ["Joy", "Excitement", "Kindness", "Discipline", "Fun", "Gratefulness", "Positive Habits"];

const VALUES_MAP = {
  counting:   { values: ["Discipline", "Positive Habits"], moments: ["Counting carefully takes Discipline! You're building a great habit 💪", "Every number you count is a Positive Habit growing stronger 🌱"] },
  shapes:     { values: ["Joy", "Excitement"], moments: ["Finding shapes is exciting! That's the Joy of discovery 🌈", "Your eyes are so sharp — what an exciting skill! ✨"] },
  letters:    { values: ["Discipline", "Gratefulness"], moments: ["Learning letters takes Discipline — and you've got it! 📚", "Words help us connect with everyone — be Grateful for them! 💛"] },
  matching:   { values: ["Discipline", "Positive Habits"], moments: ["Matching takes focus — that's Discipline at work! 🎯", "Practicing every day builds Positive Habits 🌟"] },
  tracing:    { values: ["Discipline", "Positive Habits"], moments: ["Tracing carefully is a Positive Habit that builds strength ✏️", "Your patience shows real Discipline! Keep going 💪"] },
  words:      { values: ["Kindness", "Discipline"], moments: ["Words let us be Kind to others — you're learning to connect! 💬", "Spelling takes Discipline — and you're showing so much! 🧩"] },
  habitats:   { values: ["Kindness", "Gratefulness"], moments: ["Learning about animal homes shows Kindness to nature 🌍", "Being Grateful for all creatures makes the world better 🦋"] },
  arsenal:    { values: ["Fun", "Excitement"], moments: ["Having Fun while learning is the best! ⚽", "Your Excitement for the Gunners is amazing! 🔴"] },
  colorMixer: { values: ["Joy", "Fun"], moments: ["Mixing colors brings so much Joy! 🎨", "Creating something new is pure Fun! 🌈"] },
  patterns:   { values: ["Discipline", "Excitement"], moments: ["Spotting patterns takes Discipline and focus! 🧠", "The Excitement of finding a pattern is the best reward! 🔮"] },
  oddOneOut:  { values: ["Joy", "Positive Habits"], moments: ["Finding what's different brings Joy to thinking! 🔍", "Training your brain is a wonderful Positive Habit! 🌟"] },
};

const ENCOURAGEMENT = {
  correct: [
    "Wonderful! 🌟", "Amazing work! ✨", "You did it! 💫", "Brilliant! 🌈",
    "Superb! 🦋", "Nailed it! ⭐", "Incredible! 🎉", "So clever! 🧠",
    "You're a star! 🌟", "Way to go! 🚀", "Spot on! 🎯", "Fantastic! 💖",
    "Awesome! 🍯", "You rock! 🪨", "Beautiful! 🌸",
  ],
  incorrect: [
    "Almost! Try again 💛", "So close! Give it another go 🌷",
    "Good try! One more time 🌻", "Nearly there! 🌿",
    "Not quite, but you're learning! 🌱", "Hmm, let's try again! 💫",
    "Keep going, you've got this! 🦋", "That's okay! Try once more 🍀",
  ],
  struggling: [
    "Take your time, no rush! 🐢", "You're doing great just by trying! 💛",
    "Every mistake helps you learn! 🌱", "I believe in you! 🌟",
    "Let's think about this together! 🤔", "You're braver than you know! 🦁",
  ],
  streak: [
    "You're on fire! 🔥🔥", "Unstoppable! ⚡", "What a streak! 🌟🌟",
    "Nothing can stop you! 🚀", "Combo! Keep it up! 💥",
  ],
  effort: [
    "Great effort today! 🌻", "You tried your best, and that's what matters! 💛",
    "Sprout is so proud of you! 🌱", "Every practice makes you stronger! 💪",
    "You showed up and that's amazing! ⭐",
  ],
};

const COMPANION_STAGES = [
  { name: "Egg", emoji: "🥚", minStars: 0, greeting: "..." },
  { name: "Caterpillar", emoji: "🐛", minStars: 5, greeting: "Munch munch!" },
  { name: "Cocoon", emoji: "🫘", minStars: 20, greeting: "Shh, I'm changing!" },
  { name: "Butterfly", emoji: "🦋", minStars: 50, greeting: "Look, I can fly!" },
  { name: "Rainbow Butterfly", emoji: "🦋", minStars: 100, greeting: "We did it together!" },
];

function getCompanionStage(totalStars) {
  for (let i = COMPANION_STAGES.length - 1; i >= 0; i--) {
    if (totalStars >= COMPANION_STAGES[i].minStars) return { ...COMPANION_STAGES[i], level: i };
  }
  return { ...COMPANION_STAGES[0], level: 0 };
}

const OFFLINE_SUGGESTIONS = {
  counting: ["Count steps as you walk upstairs together", "Count fruit at the grocery store"],
  shapes: ["Find circles and squares around the house", "Draw shapes in sand or flour"],
  letters: ["Point out letters on signs during walks", "Sing the ABC song together"],
  matching: ["Play 'I Spy' with first letters of objects", "Find things starting with the same letter"],
  tracing: ["Draw numbers in the air with your finger", "Trace numbers in sand or shaving cream"],
  words: ["Label objects around the house with sticky notes", "Sound out words on cereal boxes"],
  habitats: ["Visit a local park and spot animal homes", "Watch a nature documentary together"],
  arsenal: ["Watch a match together and spot shirt numbers", "Kick a ball and practice counting goals"],
  colorMixer: ["Mix food coloring in water at home", "Paint with primary colors and mix them"],
  patterns: ["Make patterns with blocks or LEGOs", "Clap rhythmic patterns together"],
  oddOneOut: ["Play 'What doesn't belong?' with toys", "Sort laundry and find the odd item"],
};

// ============ DATA: STICKERS ============
const STICKERS = [
  { id: "first_play", emoji: "🌱", name: "First Sprout", desc: "Complete any activity" },
  { id: "count_star", emoji: "🔢", name: "Number Whiz", desc: "Get 3 stars in Counting" },
  { id: "shape_star", emoji: "💎", name: "Shape Hunter", desc: "Get 3 stars in Shapes" },
  { id: "letter_star", emoji: "📖", name: "Letter Lover", desc: "Get 3 stars in Letter Match" },
  { id: "word_star", emoji: "🧙", name: "Word Wizard", desc: "Get 3 stars in Word Builder" },
  { id: "habitat_star", emoji: "🌍", name: "Nature Guide", desc: "Get 3 stars in Animal Homes" },
  { id: "color_star", emoji: "🎨", name: "Color Artist", desc: "Get 3 stars in Color Mixer" },
  { id: "pattern_star", emoji: "🧠", name: "Pattern Pro", desc: "Get 3 stars in Patterns" },
  { id: "odd_star", emoji: "🔍", name: "Sharp Eye", desc: "Get 3 stars in Odd One Out" },
  { id: "arsenal_star", emoji: "⚽", name: "Super Fan", desc: "Score 8+ in Arsenal Quiz" },
  { id: "streak_3", emoji: "🔥", name: "3-Day Streak", desc: "Play 3 days in a row" },
  { id: "streak_7", emoji: "⚡", name: "Week Warrior", desc: "Play 7 days in a row" },
  { id: "stars_10", emoji: "🌟", name: "Rising Star", desc: "Earn 10 total stars" },
  { id: "explorer", emoji: "🗺️", name: "Explorer", desc: "Try every activity" },
  { id: "try_hard", emoji: "💪", name: "Super Tryer", desc: "Complete 3 activities in one day" },
  { id: "explorer_5", emoji: "🌍", name: "World Explorer", desc: "Try 5 different activities" },
  { id: "kind_heart", emoji: "💝", name: "Kind Heart", desc: "Earn a value moment" },
];

// ============ UTILITIES ============
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function getYesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getToday() { return new Date().toISOString().split("T")[0]; }

const ALL_ACTIVITY_IDS = ["counting","shapes","letters","matching","tracing","words","habitats","arsenal","colorMixer","patterns","oddOneOut"];

const DEFAULT_PROGRESS = {
  version: 2,
  stats: Object.fromEntries(ALL_ACTIVITY_IDS.map(id => [id, { plays: 0, bestScore: 0, lastPlayed: null, totalStars: 0 }])),
  stickers: [],
  streak: { current: 0, lastDate: null, longest: 0 },
  totalStars: 0,
  valuesReinforced: {},
  lastActivity: null,
  lastSessionDate: null,
  companionName: "Sprout",
  sessionsToday: 0,
  childName: "",
};

function checkNewStickers(progress) {
  const earned = new Set(progress.stickers);
  const newOnes = [];
  const s = progress.stats;
  const totalPlays = ALL_ACTIVITY_IDS.reduce((sum, id) => sum + (s[id]?.plays || 0), 0);
  if (totalPlays >= 1 && !earned.has("first_play")) newOnes.push("first_play");
  if ((s.counting?.bestScore || 0) >= 6 && !earned.has("count_star")) newOnes.push("count_star");
  if ((s.shapes?.bestScore || 0) >= 6 && !earned.has("shape_star")) newOnes.push("shape_star");
  if ((s.matching?.bestScore || 0) >= 6 && !earned.has("letter_star")) newOnes.push("letter_star");
  if ((s.words?.bestScore || 0) >= 8 && !earned.has("word_star")) newOnes.push("word_star");
  if ((s.habitats?.bestScore || 0) >= 8 && !earned.has("habitat_star")) newOnes.push("habitat_star");
  if ((s.colorMixer?.bestScore || 0) >= 6 && !earned.has("color_star")) newOnes.push("color_star");
  if ((s.patterns?.bestScore || 0) >= 8 && !earned.has("pattern_star")) newOnes.push("pattern_star");
  if ((s.oddOneOut?.bestScore || 0) >= 8 && !earned.has("odd_star")) newOnes.push("odd_star");
  if ((s.arsenal?.bestScore || 0) >= 8 && !earned.has("arsenal_star")) newOnes.push("arsenal_star");
  if (progress.streak.current >= 3 && !earned.has("streak_3")) newOnes.push("streak_3");
  if (progress.streak.current >= 7 && !earned.has("streak_7")) newOnes.push("streak_7");
  if (progress.totalStars >= 10 && !earned.has("stars_10")) newOnes.push("stars_10");
  const triedAll = ALL_ACTIVITY_IDS.every(id => (s[id]?.plays || 0) >= 1);
  if (triedAll && !earned.has("explorer")) newOnes.push("explorer");
  if ((progress.sessionsToday || 0) >= 3 && !earned.has("try_hard")) newOnes.push("try_hard");
  const triedCount = ALL_ACTIVITY_IDS.filter(id => (s[id]?.plays || 0) >= 1).length;
  if (triedCount >= 5 && !earned.has("explorer_5")) newOnes.push("explorer_5");
  if (Object.keys(progress.valuesReinforced || {}).length > 0 && !earned.has("kind_heart")) newOnes.push("kind_heart");
  return newOnes;
}

// ============ AUTH HOOK ============
function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(FIREBASE_ENABLED);

  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      // User closed the popup or it was blocked — no action needed
      console.log("Sign-in:", e.code);
    }
  }, []);

  const logOut = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    await signOut(auth);
  }, []);

  return { user, authLoading, signIn, logOut };
}

// ============ MERGE PROGRESS ============
function mergeProgress(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  // Merge stats: Math.max for numeric fields, latest lastPlayed
  const mergedStats = { ...DEFAULT_PROGRESS.stats };
  ALL_ACTIVITY_IDS.forEach(id => {
    const l = local.stats?.[id] || {};
    const r = remote.stats?.[id] || {};
    mergedStats[id] = {
      plays: Math.max(l.plays || 0, r.plays || 0),
      bestScore: Math.max(l.bestScore || 0, r.bestScore || 0),
      totalStars: Math.max(l.totalStars || 0, r.totalStars || 0),
      lastPlayed: (l.lastPlayed || "") > (r.lastPlayed || "") ? l.lastPlayed : r.lastPlayed,
    };
  });

  // Stickers: set union
  const mergedStickers = [...new Set([...(local.stickers || []), ...(remote.stickers || [])])];

  // Streak: device with more recent lastDate wins, Math.max for longest
  const lStreak = local.streak || {};
  const rStreak = remote.streak || {};
  const streakWinner = (lStreak.lastDate || "") >= (rStreak.lastDate || "") ? lStreak : rStreak;
  const mergedStreak = {
    current: streakWinner.current || 0,
    lastDate: streakWinner.lastDate || null,
    longest: Math.max(lStreak.longest || 0, rStreak.longest || 0),
  };

  // Values reinforced: Math.max per value
  const mergedValues = {};
  const allValueKeys = new Set([...Object.keys(local.valuesReinforced || {}), ...Object.keys(remote.valuesReinforced || {})]);
  allValueKeys.forEach(k => {
    mergedValues[k] = Math.max((local.valuesReinforced || {})[k] || 0, (remote.valuesReinforced || {})[k] || 0);
  });

  // totalStars: recalculate from merged stats (source of truth)
  const totalStars = ALL_ACTIVITY_IDS.reduce((sum, id) => sum + (mergedStats[id]?.totalStars || 0), 0);

  // Session metadata: most recent device wins
  const localDate = local.lastSessionDate || "";
  const remoteDate = remote.lastSessionDate || "";
  const metaWinner = localDate >= remoteDate ? local : remote;

  return {
    ...DEFAULT_PROGRESS,
    version: 2,
    stats: mergedStats,
    stickers: mergedStickers,
    streak: mergedStreak,
    totalStars,
    valuesReinforced: mergedValues,
    lastActivity: metaWinner.lastActivity || null,
    lastSessionDate: metaWinner.lastSessionDate || null,
    companionName: local.companionName || remote.companionName || "Sprout",
    sessionsToday: metaWinner.sessionsToday || 0,
  };
}

// ============ PROGRESS HOOK ============
function useProgress() {
  const [progress, setProgress] = useState(() => {
    try {
      const saved = localStorage.getItem("littleLearner_progress");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.version >= 1) {
          const merged = { ...DEFAULT_PROGRESS, ...parsed, version: 2, stats: { ...DEFAULT_PROGRESS.stats, ...parsed.stats } };
          if (!merged.valuesReinforced) merged.valuesReinforced = {};
          if (!merged.lastActivity) merged.lastActivity = null;
          if (!merged.lastSessionDate) merged.lastSessionDate = null;
          if (!merged.companionName) merged.companionName = "Sprout";
          if (merged.sessionsToday === undefined) merged.sessionsToday = 0;
          return merged;
        }
      }
    } catch (e) { /* ignore */ }
    return DEFAULT_PROGRESS;
  });

  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | offline
  const firestoreUserRef = useRef(null);
  const unsubFirestore = useRef(null);
  const isOwnWrite = useRef(false);

  // Save to localStorage (always) and Firestore (if signed in)
  const save = useCallback((updater) => {
    setProgress(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem("littleLearner_progress", JSON.stringify(next)); } catch (e) { /* ignore */ }
      // Async write to Firestore
      if (firestoreUserRef.current && FIREBASE_ENABLED) {
        isOwnWrite.current = true;
        setSyncStatus("syncing");
        setDoc(firestoreUserRef.current, next)
          .then(() => setSyncStatus("synced"))
          .catch(() => setSyncStatus("offline"));
      }
      return next;
    });
  }, []);

  // Connect/disconnect Firestore listener when user changes
  const setUser = useCallback((user) => {
    // Clean up previous listener
    if (unsubFirestore.current) {
      unsubFirestore.current();
      unsubFirestore.current = null;
    }

    if (!user || !FIREBASE_ENABLED) {
      firestoreUserRef.current = null;
      setSyncStatus("idle");
      return;
    }

    const userDocRef = doc(db, "progress", user.uid);
    firestoreUserRef.current = userDocRef;
    setSyncStatus("syncing");

    let isFirstSnapshot = true;
    unsubFirestore.current = onSnapshot(userDocRef, (snap) => {
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        // First snapshot: merge Firestore data with localStorage
        const remoteData = snap.exists() ? snap.data() : null;
        setProgress(localPrev => {
          const merged = mergeProgress(localPrev, remoteData);
          try { localStorage.setItem("littleLearner_progress", JSON.stringify(merged)); } catch (e) { /* ignore */ }
          // Write merged result back to Firestore
          setDoc(userDocRef, merged).catch(() => {});
          return merged;
        });
        setSyncStatus("synced");
        return;
      }
      // Subsequent snapshots: skip our own writes
      if (isOwnWrite.current) {
        isOwnWrite.current = false;
        return;
      }
      // Remote change from another device
      const remoteData = snap.exists() ? snap.data() : null;
      if (remoteData) {
        setProgress(localPrev => {
          const merged = mergeProgress(localPrev, remoteData);
          try { localStorage.setItem("littleLearner_progress", JSON.stringify(merged)); } catch (e) { /* ignore */ }
          return merged;
        });
        setSyncStatus("synced");
      }
    }, () => {
      setSyncStatus("offline");
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (unsubFirestore.current) unsubFirestore.current(); };
  }, []);

  const recordActivity = useCallback((activityId, score, totalRounds) => {
    save(prev => {
      const stat = prev.stats[activityId] || { plays: 0, bestScore: 0, lastPlayed: null, totalStars: 0 };
      const stars = score >= totalRounds ? 3 : score >= totalRounds * 0.7 ? 2 : score >= totalRounds * 0.4 ? 1 : 0;
      const today = getToday();
      const streakUpdate = { ...prev.streak };
      if (streakUpdate.lastDate !== today) {
        if (streakUpdate.lastDate === getYesterday()) {
          streakUpdate.current += 1;
        } else if (streakUpdate.lastDate !== today) {
          streakUpdate.current = 1;
        }
        streakUpdate.lastDate = today;
        streakUpdate.longest = Math.max(streakUpdate.longest, streakUpdate.current);
      }
      // Update values reinforced
      const valuesReinforced = { ...(prev.valuesReinforced || {}) };
      const activityValues = VALUES_MAP[activityId]?.values || [];
      activityValues.forEach(v => { valuesReinforced[v] = (valuesReinforced[v] || 0) + 1; });
      // Track sessions today
      const sessionsToday = prev.lastSessionDate === today ? (prev.sessionsToday || 0) + 1 : 1;
      const draft = {
        ...prev,
        stats: { ...prev.stats, [activityId]: {
          plays: stat.plays + 1,
          bestScore: Math.max(stat.bestScore, score),
          lastPlayed: today,
          totalStars: stat.totalStars + stars,
        }},
        streak: streakUpdate,
        totalStars: prev.totalStars + stars,
        valuesReinforced,
        lastActivity: activityId,
        lastSessionDate: today,
        sessionsToday,
      };
      const newStickers = checkNewStickers(draft);
      draft.stickers = [...prev.stickers, ...newStickers];
      return draft;
    });
  }, [save]);

  const setChildName = useCallback((name) => {
    save(prev => ({ ...prev, childName: name }));
  }, [save]);

  return { progress, recordActivity, setUser, syncStatus, setChildName };
}

// ============ SHARED COMPONENTS ============
function GentleButton({ children, onClick, color = theme.accent2, style = {}, disabled = false }) {
  const [pressed, setPressed] = useState(false);
  return <button
    onClick={(e) => { playTap(); onClick?.(e); }}
    onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)}
    onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
    disabled={disabled}
    style={{ background: color, border: "none", borderRadius: 20, padding: "14px 28px", color: "#fff", fontFamily: "'Baloo 2', cursive", fontSize: 18, fontWeight: 600, cursor: disabled ? "default" : "pointer", transition: "all 0.15s ease", boxShadow: `0 4px 16px ${color}44`, opacity: disabled ? 0.5 : 1, transform: pressed && !disabled ? "scale(0.95)" : "scale(1)", ...style }}
  >{children}</button>;
}

function SoundButton({ onClick, style = {} }) {
  return <button onClick={() => { playTap(); onClick?.(); }} style={{ background: theme.accent4, border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: `0 4px 12px ${theme.accent4}44`, ...style }}>🔊</button>;
}

function Celebration({ show }) {
  if (!show) return null;
  const celebEmoji = ["⭐","🌟","✨","💫","🎉","🎊","🌈","💖","🦋","🍀"];
  const confettiColors = ["#E8A87C","#95B8A0","#D4A5A5","#7FB3D3","#C5A3CF","#F2D388","#E07A5F"];
  return <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 1000, overflow: "hidden" }}>
    <div style={{ position: "absolute", top: "50%", left: "50%", width: 300, height: 300, marginLeft: -150, marginTop: -150, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)", animation: "burstFlash 0.6s ease-out forwards" }} />
    {Array.from({ length: 20 }).map((_, i) => <span key={`e${i}`} style={{ position: "absolute", left: `${Math.random() * 100}%`, top: "-40px", fontSize: `${20 + Math.random() * 20}px`, animation: `celebFallDrift ${1.5 + Math.random() * 2}s ease-in forwards`, animationDelay: `${Math.random() * 0.5}s` }}>{celebEmoji[i % celebEmoji.length]}</span>)}
    {Array.from({ length: 15 }).map((_, i) => <div key={`c${i}`} style={{ position: "absolute", left: `${Math.random() * 100}%`, top: "-20px", width: 8 + Math.random() * 6, height: 12 + Math.random() * 8, borderRadius: 2, background: confettiColors[i % confettiColors.length], animation: `celebFallDrift ${1.8 + Math.random() * 1.5}s ease-in forwards, confettiSpin ${0.5 + Math.random() * 0.5}s linear infinite`, animationDelay: `${Math.random() * 0.6}s` }} />)}
  </div>;
}

function ProgressDots({ total, current }) {
  return <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "16px 0" }}>{Array.from({ length: total }).map((_, i) => <div key={i} style={{ width: i === current ? 28 : 10, height: 10, borderRadius: 5, background: i < current ? theme.accent2 : i === current ? theme.accent1 : "#E0D5C8", transition: "all 0.4s ease" }} />)}</div>;
}

function StarDisplay({ score, total }) {
  const stars = score >= total ? 3 : score >= total * 0.7 ? 2 : score >= total * 0.4 ? 1 : 0;
  return <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "8px 0" }}>
    {[1,2,3].map(i => <span key={i} style={{ fontSize: 28, opacity: i <= stars ? 1 : 0.2, transition: "all 0.3s ease", animation: i <= stars ? `popIn 0.4s ease backwards` : "none", animationDelay: `${i * 0.15}s` }}>{i <= stars ? "⭐" : "☆"}</span>)}
  </div>;
}

function Companion({ mood = "idle", totalStars = 0, context = {}, style = {} }) {
  const stage = getCompanionStage(totalStars);
  const [bubble, setBubble] = useState("");
  const [showBubble, setShowBubble] = useState(false);
  const prevMood = useRef(mood);

  useEffect(() => {
    if (mood === prevMood.current && mood === "idle") return;
    prevMood.current = mood;
    let msg = "";
    if (mood === "happy" && (context.correctStreak || 0) >= 3) {
      msg = ENCOURAGEMENT.streak[randInt(0, ENCOURAGEMENT.streak.length - 1)];
    } else if (mood === "happy") {
      msg = ENCOURAGEMENT.correct[randInt(0, ENCOURAGEMENT.correct.length - 1)];
    } else if (mood === "encourage" && (context.wrongStreak || 0) >= 2) {
      msg = ENCOURAGEMENT.struggling[randInt(0, ENCOURAGEMENT.struggling.length - 1)];
    } else if (mood === "encourage") {
      msg = ENCOURAGEMENT.incorrect[randInt(0, ENCOURAGEMENT.incorrect.length - 1)];
    }
    if (msg) {
      setBubble(msg); setShowBubble(true);
      const t = setTimeout(() => setShowBubble(false), 2500);
      return () => clearTimeout(t);
    } else { setShowBubble(false); }
  }, [mood, context.correctStreak, context.wrongStreak]);

  const isRainbow = stage.level === 4;
  const anim = mood === "happy" ? "popIn 0.5s ease, float 3s ease-in-out infinite 0.5s" : mood === "encourage" ? "headShake 0.5s ease" : "float 3s ease-in-out infinite";

  return <div style={{ position: "relative", display: "inline-block", ...style }}>
    {showBubble && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", background: "#fff", borderRadius: 12, padding: "6px 10px", fontSize: 12, fontFamily: "'Quicksand', sans-serif", color: theme.text, whiteSpace: "nowrap", boxShadow: theme.shadow, animation: "fadeUp 0.3s ease", marginBottom: 4, maxWidth: 180, textAlign: "center", zIndex: 20 }}>
      {bubble}
      <div style={{ position: "absolute", top: "100%", left: "50%", marginLeft: -4, width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "4px solid #fff" }} />
    </div>}
    <div style={{ fontSize: 32, animation: `${anim}${isRainbow ? ", rainbowShimmer 2s linear infinite" : ""}`, display: "inline-block" }}>{stage.emoji}</div>
  </div>;
}

function ValueMoment({ activityId }) {
  const mapping = VALUES_MAP[activityId];
  if (!mapping) return null;
  const [msg] = useState(() => mapping.moments[randInt(0, mapping.moments.length - 1)]);
  const [value] = useState(() => mapping.values[randInt(0, mapping.values.length - 1)]);
  return <div style={{ background: "linear-gradient(135deg, #FFF8E1, #FFFDE7)", borderRadius: 16, padding: "12px 16px", margin: "12px 0", textAlign: "center", animation: "fadeUp 0.5s ease", border: "2px solid #FFE082" }}>
    <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.text, margin: 0 }}>{msg}</p>
    <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: 12, color: "#F9A825", background: "#FFF9C4", borderRadius: 8, padding: "2px 8px", marginTop: 6, display: "inline-block" }}>{value} ✨</span>
  </div>;
}

function BackButton({ onClick }) {
  return <button onClick={() => { playTap(); onClick(); }} style={{ position: "absolute", top: 20, left: 20, background: "rgba(255,255,255,0.8)", border: "none", borderRadius: 16, padding: "10px 18px", fontFamily: "'Quicksand', sans-serif", fontSize: 15, fontWeight: 600, color: theme.textLight, cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 6, zIndex: 10 }}><span style={{ fontSize: 18 }}>←</span> Back</button>;
}

function PageShell({ onBack, title, emoji, subtitle, speakText, children, mascotMood, totalStars, companionContext }) {
  const spokenRef = useRef("");
  useEffect(() => {
    const toSpeak = speakText || subtitle;
    if (toSpeak && toSpeak !== spokenRef.current) {
      spokenRef.current = toSpeak;
      // Small delay so the page renders first
      const t = setTimeout(() => speak(toSpeak), 400);
      return () => clearTimeout(t);
    }
  }, [speakText, subtitle]);
  return <div style={{ minHeight: "100vh", background: theme.bg, padding: "24px 16px", position: "relative", animation: "fadeUp 0.35s ease" }}>
    <BackButton onClick={onBack} />
    <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: 60 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 28, color: theme.text, textAlign: "center", margin: 0 }}>{emoji} {title}</h2>
        {mascotMood && <Companion mood={mascotMood} totalStars={totalStars || 0} context={companionContext || {}} style={{ fontSize: 24 }} />}
      </div>
      {subtitle && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 16, color: theme.textLight, textAlign: "center", marginTop: 4 }}>{subtitle}</p>}
      {children}
    </div>
  </div>;
}

// ============ COUNTING ============
function CountingGame({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [target, setTarget] = useState(0); const [items, setItems] = useState([]); const [options, setOptions] = useState([]); const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const [showHint, setShowHint] = useState(false); const [showAnswer, setShowAnswer] = useState(false); const T = 6;
  const newRound = useCallback(() => { const c = randInt(1, 9); const es = [ANIMALS_E, FRUITS, NATURE, VEHICLES_E, SPORTS_E][randInt(0, 4)]; const em = es[randInt(0, es.length - 1)]; setTarget(c); setItems(Array.from({ length: c }, (_, i) => ({ emoji: em, id: i, x: 15 + Math.random() * 70, y: 10 + Math.random() * 60, delay: i * 0.1, rotation: -15 + Math.random() * 30 }))); setSelected(null); setCorrect(null); setMascotMood("idle"); setShowHint(false); setShowAnswer(false); const w = new Set(); while (w.size < 2) { const x = randInt(1, 9); if (x !== c) w.add(x); } setOptions(shuffle([c, ...w])); }, []);
  useEffect(() => { newRound(); }, []);
  const pick = (n) => { if (selected !== null) return; setSelected(n); playTap(); if (n === target) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); setShowHint(false); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(ns, T); } }, 1800); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setShowAnswer(true); speak(`The answer is ${target}`); }, 800); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(score, T); } }, 2500); } };
  return <PageShell onBack={onBack} title="Count with Me" emoji="🌿" subtitle="How many do you see?" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }}><ProgressDots total={T} current={round} /><div style={{ background: theme.card, borderRadius: 28, padding: 24, boxShadow: theme.shadow, position: "relative", height: 260, marginTop: 16, overflow: "hidden" }}>{items.map(i => <span key={i.id} style={{ position: "absolute", left: `${i.x}%`, top: `${i.y}%`, fontSize: 42, transform: `rotate(${i.rotation}deg)`, animation: `popIn 0.5s ease backwards${showHint ? ", pulse 1s ease-in-out infinite" : ""}`, animationDelay: `${i.delay}s`, userSelect: "none" }}>{i.emoji}</span>)}</div><div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 28 }}>{options.map(n => { const s = selected === n, r = correct === true && s, w = correct === false && s, isAnswer = showAnswer && n === target; return <button key={n} onClick={() => pick(n)} style={{ width: 80, height: 80, borderRadius: 24, background: r ? "#D4EDDA" : isAnswer ? "#D4EDDA" : w ? "#F8D7DA" : theme.card, border: r ? `3px solid ${theme.accent2}` : isAnswer ? `3px solid ${theme.accent2}` : w ? `3px solid ${theme.accent3}` : "3px solid #E8DDD0", fontFamily: "'Baloo 2', cursive", fontSize: 32, fontWeight: 700, color: theme.text, cursor: selected !== null ? "default" : "pointer", transform: (s || isAnswer) ? "scale(1.1)" : "scale(1)", transition: "all 0.25s ease", boxShadow: theme.shadow, animation: w ? "wiggle 0.3s ease" : isAnswer ? "pulse 0.5s ease" : "none" }}>{n}</button>; })}</div>{round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="counting" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); newRound(); }}>Play Again 🌻</GentleButton></div>}<Celebration show={celebrating} /></PageShell>;
}

// ============ SHAPES ============
function ShapeSorting({ onBack, onComplete, totalStars }) {
  const shapes = [{ name: "Circle", svg: <circle cx="40" cy="40" r="35" />, color: theme.accent1 }, { name: "Square", svg: <rect x="8" y="8" width="64" height="64" rx="4" />, color: theme.accent2 }, { name: "Triangle", svg: <polygon points="40,5 75,75 5,75" />, color: theme.accent4 }, { name: "Star", svg: <polygon points="40,5 48,30 75,30 53,48 62,75 40,58 18,75 27,48 5,30 32,30" />, color: theme.accent6 }];
  const [round, setRound] = useState(0); const [tIdx, setTIdx] = useState(0); const [display, setDisplay] = useState([]); const [done, setDone] = useState(false); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const T = 6;
  const newRound = useCallback(() => { const ti = randInt(0, 3); setTIdx(ti); setDone(false); setMascotMood("idle"); const g = []; const tc = randInt(2, 4); for (let i = 0; i < tc; i++) g.push({ ...shapes[ti], id: i, isTarget: true, found: false }); while (g.length < 8) { let x = randInt(0, 3); while (x === ti) x = randInt(0, 3); g.push({ ...shapes[x], id: g.length, isTarget: false, found: false }); } setDisplay(shuffle(g)); }, []);
  useEffect(() => { newRound(); }, []);
  const tap = (id) => { playTap(); setDisplay(prev => { const s = prev.find(x => x.id === id); if (!s || s.found || !s.isTarget) return prev; const u = prev.map(x => x.id === id ? { ...x, found: true } : x); if (u.filter(x => x.isTarget).every(x => x.found)) { const ns = score + 1; setScore(ns); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); playCelebration(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { setDone(true); onComplete?.(ns, T); } }, 1800); } else { playCorrect(); } return u; }); };
  const tgt = shapes[tIdx];
  return <PageShell onBack={onBack} title="Find the Shape" emoji="🔷" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak: 0 }} speakText={`Tap all the ${tgt.name}s`}><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 17, color: theme.textLight, textAlign: "center", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Tap all the <strong style={{ color: theme.text }}>{tgt.name}s</strong><svg width="28" height="28" viewBox="0 0 80 80"><g fill={tgt.color} opacity="0.9">{tgt.svg}</g></svg></p><ProgressDots total={T} current={round} /><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20, padding: 8 }}>{display.map((s, i) => <button key={s.id} onClick={() => tap(s.id)} style={{ width: "100%", aspectRatio: "1", borderRadius: 20, background: s.found ? "#D4EDDA" : theme.card, border: s.found ? `3px solid ${theme.accent2}` : "3px solid #EDE6DC", cursor: s.found ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s ease", animation: `popIn 0.4s ease backwards`, animationDelay: `${i * 0.05}s`, transform: s.found ? "scale(0.9)" : "scale(1)", boxShadow: theme.shadow }}><svg width="44" height="44" viewBox="0 0 80 80"><g fill={s.color} opacity={s.found ? 0.5 : 0.85}>{s.svg}</g></svg></button>)}</div>{done && <div style={{ textAlign: "center", marginTop: 24 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="shapes" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setDone(false); setScore(0); setCorrectStreak(0); newRound(); }}>Play Again 🌿</GentleButton></div>}<Celebration show={celebrating} /></PageShell>;
}

// ============ LETTER EXPLORER ============
function LetterExplorer({ onBack, onComplete, totalStars }) {
  const [idx, setIdx] = useState(0); const [revealed, setRevealed] = useState(false); const [ak, setAk] = useState(0); const [visited, setVisited] = useState(new Set()); const item = PHONICS_DATA[idx];
  const go = (i) => { setIdx(i); setRevealed(false); setAk(k => k + 1); playTap(); setVisited(prev => new Set([...prev, i])); };
  const rev = () => { setRevealed(true); playLetter(item.letter); const nv = new Set([...visited, idx]); setVisited(nv); if (nv.size === 26) onComplete?.(26, 26); };
  return <PageShell onBack={onBack} title="Letter Garden" emoji="🔤" subtitle="Tap the letter to hear its sound"><div style={{ textAlign: "center", marginTop: 4 }}><span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>{visited.size}/26 explored</span></div><div key={ak} onClick={!revealed ? rev : undefined} style={{ background: theme.card, borderRadius: 32, padding: "40px 24px", marginTop: 16, boxShadow: theme.shadow, textAlign: "center", cursor: !revealed ? "pointer" : "default", animation: "fadeUp 0.5s ease" }}><div style={{ fontSize: 120, fontFamily: "'Baloo 2', cursive", fontWeight: 800, color: theme.accent4, lineHeight: 1, transition: "all 0.4s ease", transform: revealed ? "scale(0.8)" : "scale(1)" }}>{item.letter}</div>{revealed && <div style={{ animation: "fadeUp 0.5s ease" }}><div style={{ fontSize: 64, margin: "12px 0" }}>{item.emoji}</div><p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 28, color: theme.text, margin: "8px 0 4px" }}>{item.word}</p><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 18, color: theme.textLight, fontStyle: "italic" }}>"{item.letter}" says <strong>"{item.sound}"</strong></p><SoundButton onClick={() => playLetter(item.letter)} style={{ margin: "12px auto 0" }} /></div>}{!revealed && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 15, color: theme.textLight, marginTop: 16, opacity: 0.7 }}>tap to explore ✨</p>}</div><div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 28 }}><GentleButton onClick={() => go(Math.max(0, idx - 1))} color={theme.accent3} disabled={idx === 0}>← Previous</GentleButton><GentleButton onClick={() => go(Math.min(25, idx + 1))} color={theme.accent2} disabled={idx === 25}>Next →</GentleButton></div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 24 }}>{PHONICS_DATA.map((p, i) => <button key={p.letter} onClick={() => go(i)} style={{ width: 36, height: 36, borderRadius: 10, background: i === idx ? theme.accent4 : visited.has(i) ? theme.accent2 + "33" : theme.card, color: i === idx ? "#fff" : theme.textLight, border: "none", fontFamily: "'Baloo 2', cursive", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: i === idx ? `0 4px 12px ${theme.accent4}44` : "none" }}>{p.letter}</button>)}</div></PageShell>;
}

// ============ LETTER MATCH ============
function LetterMatch({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null); const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const [showHint, setShowHint] = useState(false); const [showAnswer, setShowAnswer] = useState(false); const T = 6;
  const newRound = useCallback(() => { const i = randInt(0, 25); const t = PHONICS_DATA[i]; const w = new Set(); while (w.size < 2) { const x = randInt(0, 25); if (x !== i) w.add(x); } setPuzzle({ target: t, options: shuffle([t, ...Array.from(w).map(x => PHONICS_DATA[x])]) }); setSelected(null); setCorrect(null); setMascotMood("idle"); setShowHint(false); setShowAnswer(false); }, []);
  useEffect(() => { newRound(); }, []); if (!puzzle) return null;
  const pick = (l) => { if (selected !== null) return; setSelected(l); if (l === puzzle.target.letter) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); setShowHint(false); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(ns, T); } }, 1800); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setShowAnswer(true); speak(`${puzzle.target.word} starts with ${puzzle.target.letter}`); }, 800); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(score, T); } }, 2500); } };
  const cols = [theme.accent1, theme.accent4, theme.accent5];
  return <PageShell onBack={onBack} title="Match the Letter" emoji="🌸" subtitle="Which letter does this start with?" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }} speakText={`Which letter does ${puzzle.target.word} start with?`}><ProgressDots total={T} current={round} /><div style={{ background: theme.card, borderRadius: 28, padding: 32, boxShadow: theme.shadow, textAlign: "center", marginTop: 16 }}><div style={{ fontSize: 80, marginBottom: 8 }}>{puzzle.target.emoji}</div><p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 26, color: theme.text }}>{puzzle.target.word}</p>{showHint && <p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 40, color: theme.accent4, animation: "pulse 1s ease-in-out infinite", margin: "8px 0 0" }}>{puzzle.target.letter}</p>}</div><div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 28 }}>{puzzle.options.map((o, i) => { const s = selected === o.letter, r = correct === true && s, w = correct === false && s, isAnswer = showAnswer && o.letter === puzzle.target.letter; return <button key={o.letter} onClick={() => pick(o.letter)} style={{ width: 90, height: 90, borderRadius: 24, background: r ? "#D4EDDA" : isAnswer ? "#D4EDDA" : w ? "#F8D7DA" : theme.card, border: r ? `3px solid ${theme.accent2}` : isAnswer ? `3px solid ${theme.accent2}` : w ? `3px solid ${theme.accent3}` : `3px solid ${cols[i]}33`, fontFamily: "'Baloo 2', cursive", fontSize: 40, fontWeight: 800, color: cols[i], cursor: selected ? "default" : "pointer", transform: (s || isAnswer) ? "scale(1.1)" : "scale(1)", transition: "all 0.25s ease", boxShadow: theme.shadow, animation: w ? "wiggle 0.3s ease" : isAnswer ? "pulse 0.5s ease" : "none" }}>{o.letter}</button>; })}</div>{round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="matching" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); newRound(); }}>Play Again 🌸</GentleButton></div>}<Celebration show={celebrating} /></PageShell>;
}

// ============ NUMBER TRACING ============
function NumberTrace({ onBack, onComplete, totalStars }) {
  const canvasRef = useRef(null); const [num, setNum] = useState(1); const [isDrawing, setIsDrawing] = useState(false); const [celebrating, setCelebrating] = useState(false); const [strokeCount, setStrokeCount] = useState(0); const [completed, setCompleted] = useState(new Set());
  const lastPos = useRef(null); const currentStroke = useRef([]); const allStrokes = useRef([]);
  const numberSVG = { 1: "M 50 15 L 50 85", 2: "M 25 30 Q 25 10 50 10 Q 75 10 75 30 Q 75 50 50 60 L 25 85 L 75 85", 3: "M 25 15 L 65 15 Q 80 15 80 35 Q 80 50 55 50 Q 80 50 80 65 Q 80 85 55 85 L 25 85", 4: "M 60 10 L 20 60 L 80 60 M 60 10 L 60 85", 5: "M 70 10 L 30 10 L 25 50 Q 50 35 75 50 Q 80 70 55 85 L 25 85", 6: "M 65 15 Q 30 15 25 50 Q 20 80 50 85 Q 80 85 80 65 Q 80 45 50 45 Q 25 45 25 55", 7: "M 20 10 L 80 10 L 45 85", 8: "M 50 10 Q 25 10 25 30 Q 25 50 50 50 Q 75 50 75 30 Q 75 10 50 10 M 50 50 Q 20 50 20 70 Q 20 88 50 88 Q 80 88 80 70 Q 80 50 50 50", 9: "M 75 45 Q 75 15 50 10 Q 25 10 25 35 Q 25 50 50 50 Q 75 50 75 40 L 70 85" };
  const drawAll = useCallback(() => { const c = canvasRef.current; if (!c) return; const rect = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = rect.width * dpr; c.height = rect.height * dpr; const ctx = c.getContext("2d"); ctx.scale(dpr, dpr); const w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h); ctx.save(); ctx.font = `bold ${h * 0.72}px 'Baloo 2', cursive`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(242,211,136,0.12)"; ctx.fillText(String(num), w / 2, h / 2 + 8); ctx.restore(); const path = numberSVG[num]; if (path) { const sx = w / 100, sy = h / 100; ctx.save(); ctx.strokeStyle = "rgba(200,185,165,0.4)"; ctx.lineWidth = 20; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([6, 14]); const p = new Path2D(); const cmds = path.match(/[MLQC][^MLQC]*/g); if (cmds) cmds.forEach(cmd => { const t = cmd[0], ns = cmd.slice(1).trim().split(/[\s,]+/).map(Number); if (t === "M") p.moveTo(ns[0] * sx, ns[1] * sy); else if (t === "L") p.lineTo(ns[0] * sx, ns[1] * sy); else if (t === "Q") p.quadraticCurveTo(ns[0] * sx, ns[1] * sy, ns[2] * sx, ns[3] * sy); }); ctx.stroke(p); ctx.restore(); } const drawStroke = (s) => { if (s.length < 2) return; ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); for (let i = 1; i < s.length; i++) { const xc = (s[i].x + s[i-1].x)/2, yc = (s[i].y + s[i-1].y)/2; ctx.quadraticCurveTo(s[i-1].x, s[i-1].y, xc, yc); } ctx.strokeStyle = theme.accent4; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]); ctx.stroke(); }; allStrokes.current.forEach(drawStroke); }, [num]);
  useEffect(() => { allStrokes.current = []; currentStroke.current = []; setStrokeCount(0); setTimeout(drawAll, 50); }, [num, drawAll]);
  useEffect(() => { const r = () => drawAll(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [drawAll]);
  const getPos = (e) => { const r = canvasRef.current.getBoundingClientRect(); const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; return { x: cx - r.left, y: cy - r.top }; };
  const onStart = (e) => { e.preventDefault(); ensureAudio(); setIsDrawing(true); const p = getPos(e); currentStroke.current = [p]; lastPos.current = p; };
  const onMove = (e) => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e); currentStroke.current.push(p); const c = canvasRef.current.getContext("2d"), dpr = window.devicePixelRatio || 1; c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.beginPath(); c.moveTo(lastPos.current.x, lastPos.current.y); c.lineTo(p.x, p.y); c.strokeStyle = theme.accent4; c.lineWidth = 7; c.lineCap = "round"; c.setLineDash([]); c.stroke(); c.restore(); lastPos.current = p; };
  const onEnd = () => { if (!isDrawing) return; setIsDrawing(false); if (currentStroke.current.length > 2) { allStrokes.current.push([...currentStroke.current]); const nc = strokeCount + 1; setStrokeCount(nc); if (nc >= 2) { const nc2 = new Set([...completed, num]); setCompleted(nc2); setCelebrating(true); playCelebration(); setTimeout(() => { setCelebrating(false); if (num < 9) setNum(n => n + 1); else { onComplete?.(nc2.size, 9); } }, 2200); } } currentStroke.current = []; lastPos.current = null; };
  const clear = () => { allStrokes.current = []; currentStroke.current = []; setStrokeCount(0); drawAll(); };
  return <PageShell onBack={onBack} title="Trace the Number" emoji="✏️" subtitle="Draw over the dotted lines"><div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "16px 0" }}>{[1,2,3,4,5,6,7,8,9].map(n => <button key={n} onClick={() => { setNum(n); playNumber(n); }} style={{ width: 36, height: 36, borderRadius: 12, background: n === num ? theme.accent6 : completed.has(n) ? theme.accent2 + "33" : theme.card, color: n === num ? "#fff" : theme.textLight, border: "none", fontFamily: "'Baloo 2', cursive", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: n === num ? `0 4px 12px ${theme.accent6}44` : "none" }}>{n}</button>)}</div><div style={{ background: theme.card, borderRadius: 28, boxShadow: theme.shadow, overflow: "hidden", marginTop: 8, aspectRatio: "1", touchAction: "none" }}><canvas ref={canvasRef} onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} style={{ width: "100%", height: "100%", cursor: "crosshair", display: "block" }} /></div><div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}><GentleButton onClick={clear} color={theme.accent3} style={{ fontSize: 15, padding: "10px 20px" }}>Clear ↺</GentleButton><SoundButton onClick={() => playNumber(num)} /></div><Celebration show={celebrating} /></PageShell>;
}

// ============ ANIMAL HABITATS ============
function AnimalHabitats({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null); const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const [showAnswer, setShowAnswer] = useState(false); const T = 8;
  const newRound = useCallback(() => { const hi = randInt(0, HABITATS.length - 1); const h = HABITATS[hi]; const a = h.animals[randInt(0, h.animals.length - 1)]; const opts = shuffle([h, ...shuffle(HABITATS.filter((_, i) => i !== hi)).slice(0, 2)]); setPuzzle({ animal: a, correctHabitat: h, options: opts }); setSelected(null); setCorrect(null); setMascotMood("idle"); setShowAnswer(false); }, []);
  useEffect(() => { newRound(); }, []); if (!puzzle) return null;
  const pick = (n) => { if (selected !== null) return; setSelected(n); playTap(); if (n === puzzle.correctHabitat.name) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(ns, T); } }, 2000); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setShowAnswer(true); speak(`${puzzle.animal.name} lives in the ${puzzle.correctHabitat.name}`); }, 800); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(score, T); } }, 2500); } };
  return <PageShell onBack={onBack} title="Animal Homes" emoji="🌍" subtitle="Where does this animal live?" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }} speakText={`Where does the ${puzzle.animal.name} live?`}><ProgressDots total={T} current={round} /><div style={{ background: theme.card, borderRadius: 28, padding: "32px 24px", boxShadow: theme.shadow, textAlign: "center", marginTop: 16 }}><div style={{ fontSize: 90, lineHeight: 1, animation: "popIn 0.5s ease" }}>{puzzle.animal.emoji}</div><p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 28, color: theme.text, marginTop: 12 }}>{puzzle.animal.name}</p></div><div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>{puzzle.options.map(h => { const s = selected === h.name, r = correct === true && s, w = correct === false && s, isAnswer = showAnswer && h.name === puzzle.correctHabitat.name; return <button key={h.name} onClick={() => pick(h.name)} style={{ background: r ? "#D4EDDA" : isAnswer ? "#D4EDDA" : w ? "#F8D7DA" : h.bg, border: r ? `3px solid ${theme.accent2}` : isAnswer ? `3px solid ${theme.accent2}` : w ? `3px solid ${theme.accent3}` : "3px solid transparent", borderRadius: 20, padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, cursor: selected ? "default" : "pointer", transition: "all 0.25s ease", transform: (s || isAnswer) ? "scale(1.03)" : "scale(1)", boxShadow: theme.shadow, animation: w ? "wiggle 0.3s ease" : isAnswer ? "pulse 0.5s ease" : "none" }}><span style={{ fontSize: 36 }}>{h.emoji}</span><span style={{ fontFamily: "'Baloo 2', cursive", fontSize: 22, fontWeight: 700, color: theme.text }}>{h.name}</span><div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>{h.animals.slice(0, 3).map((a, i) => <span key={i} style={{ fontSize: 20 }}>{a.emoji}</span>)}</div></button>; })}</div>{round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="habitats" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); newRound(); }}>Play Again 🌍</GentleButton></div>}<Celebration show={celebrating} /></PageShell>;
}

// ============ WORD BUILDER ============
function WordBuilder({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null); const [sel, setSel] = useState([]); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const T = 8;
  const newRound = useCallback(() => { const wd = CVC_WORDS[randInt(0, CVC_WORDS.length - 1)]; const wl = wd.word.split(""); const extras = []; const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; while (extras.length < 6) { const l = alpha[randInt(0, 25)]; if (!wl.includes(l) && !extras.includes(l)) extras.push(l); } const grid = shuffle([...wl, ...extras]).map((l, i) => ({ letter: l, id: i })); setPuzzle({ ...wd, grid }); setSel([]); setCorrect(null); setMascotMood("idle"); }, []);
  useEffect(() => { newRound(); }, []); if (!puzzle) return null;
  const tap = (cell) => { if (correct === true) return; if (sel.find(s => s.id === cell.id)) { setSel(p => p.filter(s => s.id !== cell.id)); playTap(); return; } if (sel.length >= puzzle.word.length) return; const ns = [...sel, cell]; setSel(ns); playLetter(cell.letter); if (ns.length === puzzle.word.length) { const att = ns.map(s => s.letter).join(""); if (att === puzzle.word) { const nsc = score + 1; setScore(nsc); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); playCelebration(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(nsc, T); } }, 2200); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setSel([]); setCorrect(null); setMascotMood("idle"); }, 1200); } } };
  const tl = puzzle.word.split(""); const lc = [theme.accent1, theme.accent2, theme.accent4, theme.accent5, theme.accent6, theme.accent7, theme.accent3, "#E07A5F", "#7FB3D3"];
  return <PageShell onBack={onBack} title="Word Builder" emoji="🧩" subtitle="Tap letters to spell the word" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }} speakText={`Spell the word ${puzzle.word}`}><ProgressDots total={T} current={round} /><div style={{ background: theme.card, borderRadius: 28, padding: "24px", boxShadow: theme.shadow, textAlign: "center", marginTop: 16 }}><div style={{ fontSize: 56, marginBottom: 8 }}>{puzzle.hint}</div><div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>{tl.map((l, i) => { const f = sel[i]; const w = f && f.letter !== l && correct === false; return <div key={i} style={{ width: 56, height: 64, borderRadius: 16, background: w ? "#F8D7DA" : f ? (correct === true ? "#D4EDDA" : theme.bgWarm) : "rgba(0,0,0,0.03)", border: `3px dashed ${w ? theme.accent3 : f ? theme.accent1 : "#D5C9BB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Baloo 2', cursive", fontSize: 32, fontWeight: 800, color: theme.text }}>{f ? f.letter : ""}</div>; })}</div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 24, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>{puzzle.grid.map(c => { const u = sel.find(s => s.id === c.id); const col = lc[c.id % lc.length]; return <button key={c.id} onClick={() => tap(c)} style={{ aspectRatio: "1", borderRadius: 20, background: u ? "#E8E0D5" : theme.card, border: `3px solid ${u ? "#D5C9BB" : col + "44"}`, fontFamily: "'Baloo 2', cursive", fontSize: 36, fontWeight: 800, color: u ? "#C5B8A8" : col, cursor: u ? "default" : "pointer", transform: u ? "scale(0.9)" : "scale(1)", boxShadow: u ? "none" : theme.shadow, opacity: u ? 0.5 : 1 }}>{c.letter}</button>; })}</div>{sel.length > 0 && correct !== true && <div style={{ textAlign: "center", marginTop: 16 }}><GentleButton onClick={() => { setSel([]); setCorrect(null); }} color={theme.accent3} style={{ fontSize: 15, padding: "10px 20px" }}>Clear ↺</GentleButton></div>}{round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="words" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); newRound(); }}>Play Again 🧩</GentleButton></div>}<Celebration show={celebrating} /></PageShell>;
}

// ============ ARSENAL QUIZ ============
function ArsenalQuiz({ onBack, onComplete, totalStars }) {
  const [mode, setMode] = useState(null); const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null);
  const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null);
  const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const T = 10;

  const newRound = useCallback((m) => {
    const player = ARSENAL_PLAYERS[randInt(0, ARSENAL_PLAYERS.length - 1)];
    let options;
    if (m === "number") { const wrong = new Set(); while (wrong.size < 2) { const o = ARSENAL_PLAYERS[randInt(0, ARSENAL_PLAYERS.length - 1)]; if (o.number !== player.number) wrong.add(o.number); } options = shuffle([player.number, ...wrong]); }
    else { const countries = [...new Set(ARSENAL_PLAYERS.map(p => p.country))]; const wc = shuffle(countries.filter(c => c !== player.country)).slice(0, 2); options = shuffle([player.country, ...wc]); }
    setPuzzle({ player, options }); setSelected(null); setCorrect(null);
  }, []);

  const startMode = (m) => { setMode(m); setRound(0); setScore(0); newRound(m); };

  const handlePick = (val) => {
    if (selected !== null) return; setSelected(val); playTap();
    const answer = mode === "number" ? puzzle.player.number : puzzle.player.country;
    if (val === answer) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setCorrectStreak(s => s + 1); setWrongStreak(0); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(mode); } else { onComplete?.(ns, T); } }, 2000); }
    else { setCorrect(false); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(mode); } else { onComplete?.(score, T); } }, 2500); }
  };

  if (!mode) {
    return <PageShell onBack={onBack} title="Arsenal Quiz" emoji="⚽" subtitle="Test your Gunners knowledge!"><div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      <div style={{ width: 100, height: 100, borderRadius: 24, background: "linear-gradient(135deg, #EF0107, #9C0004)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, boxShadow: "0 8px 32px rgba(239,1,7,0.25)", animation: "popIn 0.5s ease" }}>⚽</div>
      <p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, color: theme.text, textAlign: "center", marginTop: 8 }}>Choose your quiz:</p>
      <button onClick={() => { playTap(); startMode("number"); }} style={{ width: "100%", maxWidth: 360, background: "linear-gradient(135deg, #FFEBEE, #FFCDD2)", border: "3px solid #EF9A9A", borderRadius: 20, padding: "20px 24px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, boxShadow: theme.shadow, animation: "fadeUp 0.4s ease backwards" }}>
        <div style={{ fontSize: 36, width: 56, height: 56, borderRadius: 16, background: "rgba(239,1,7,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>🔢</div>
        <div style={{ textAlign: "left" }}><h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, color: theme.text, margin: 0 }}>Guess the Number</h3><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: 0 }}>What shirt number do they wear?</p></div>
      </button>
      <button onClick={() => { playTap(); startMode("country"); }} style={{ width: "100%", maxWidth: 360, background: "linear-gradient(135deg, #E3F2FD, #BBDEFB)", border: "3px solid #90CAF9", borderRadius: 20, padding: "20px 24px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, boxShadow: theme.shadow, animation: "fadeUp 0.4s ease backwards", animationDelay: "0.1s" }}>
        <div style={{ fontSize: 36, width: 56, height: 56, borderRadius: 16, background: "rgba(127,179,211,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>🌍</div>
        <div style={{ textAlign: "left" }}><h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, color: theme.text, margin: 0 }}>Guess the Country</h3><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: 0 }}>Where are they from?</p></div>
      </button>
    </div></PageShell>;
  }

  if (!puzzle) return null;
  const finished = round >= T - 1 && correct !== null;
  const posColors = { GK: "#FFD54F", DEF: "#81C784", MID: "#64B5F6", FWD: "#EF5350" };

  return <PageShell onBack={() => setMode(null)} title={mode === "number" ? "Guess the Number" : "Guess the Country"} emoji="⚽" totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }}>
    <div style={{ textAlign: "center", marginTop: 8, marginBottom: 4 }}><span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 15, color: theme.textLight, fontWeight: 600 }}>Score: <strong style={{ color: theme.accent2 }}>{score}</strong> / {T}</span></div>
    <ProgressDots total={T} current={round} />
    <div style={{ background: "linear-gradient(135deg, #1a1a2e, #2d1b3d)", borderRadius: 28, padding: "28px 24px", boxShadow: "0 12px 40px rgba(0,0,0,0.2)", textAlign: "center", marginTop: 12, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, #EF0107, #FF6B6B)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}><span style={{ background: posColors[puzzle.player.position], color: "#fff", padding: "3px 10px", borderRadius: 8, fontFamily: "'Quicksand', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{puzzle.player.position}</span></div>
      <div style={{ fontSize: 28, fontFamily: "'Baloo 2', cursive", fontWeight: 800, color: "#fff", lineHeight: 1.2, animation: "fadeUp 0.4s ease" }}>{puzzle.player.name}</div>
      <div style={{ fontSize: 18, marginTop: 8, color: "rgba(255,255,255,0.6)", fontFamily: "'Quicksand', sans-serif" }}>{mode === "number" ? `${puzzle.player.flag} #?` : `🏴 #${puzzle.player.number}`}</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
      {puzzle.options.map((opt, i) => {
        const isSel = selected === opt; const answer = mode === "number" ? puzzle.player.number : puzzle.player.country;
        const isRight = correct !== null && opt === answer; const isWrong = correct === false && isSel;
        const flag = mode === "country" ? ARSENAL_PLAYERS.find(p => p.country === opt)?.flag || "" : "";
        let bg = theme.card, border = "3px solid #EDE6DC";
        if (isRight) { bg = "#D4EDDA"; border = `3px solid ${theme.accent2}`; }
        if (isWrong) { bg = "#F8D7DA"; border = `3px solid ${theme.accent3}`; }
        return <button key={String(opt)} onClick={() => handlePick(opt)} style={{ background: bg, border, borderRadius: 20, padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, cursor: selected !== null ? "default" : "pointer", transition: "all 0.25s ease", transform: isSel ? "scale(1.03)" : "scale(1)", boxShadow: theme.shadow, animation: isWrong ? "wiggle 0.3s ease" : `fadeUp 0.3s ease backwards`, animationDelay: isWrong ? "0s" : `${i * 0.08}s` }}>
          {mode === "number" ? <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, #EF0107, #9C0004)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Baloo 2', cursive", fontSize: 24, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{opt}</div> : <span style={{ fontSize: 36, flexShrink: 0 }}>{flag}</span>}
          <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, fontWeight: 700, color: theme.text }}>{mode === "number" ? `Number ${opt}` : opt}</span>
          {isRight && <span style={{ marginLeft: "auto", fontSize: 20 }}>✅</span>}
          {isWrong && <span style={{ marginLeft: "auto", fontSize: 20 }}>❌</span>}
        </button>;
      })}
    </div>
    {correct === true && <p style={{ textAlign: "center", fontFamily: "'Baloo 2', cursive", fontSize: 22, color: theme.accent2, marginTop: 16 }}>You know your Gunners! ⚽</p>}
    {correct === false && <p style={{ textAlign: "center", fontFamily: "'Quicksand', sans-serif", fontSize: 17, color: theme.accent3, marginTop: 16 }}>{mode === "number" ? `It's #${puzzle.player.number}!` : `${puzzle.player.flag} ${puzzle.player.country}!`} Now you know! 💪</p>}
    {finished && <div style={{ textAlign: "center", marginTop: 24, animation: "fadeUp 0.5s ease" }}>
      <div style={{ background: theme.card, borderRadius: 20, padding: "20px", boxShadow: theme.shadow, display: "inline-block" }}>
        <p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 24, color: theme.text, margin: 0 }}>{score >= 8 ? "🏆 Super Fan!" : score >= 5 ? "⚽ Great job!" : "🌟 Keep learning!"}</p>
        <StarDisplay score={score} total={T} />
        <ValueMoment activityId="arsenal" />
        <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}><GentleButton onClick={() => { setCorrectStreak(0); setWrongStreak(0); startMode(mode); }} color={theme.arsenal}>Play Again</GentleButton><GentleButton onClick={() => setMode(null)} color={theme.accent4}>Switch Mode</GentleButton></div>
      </div>
    </div>}
    <Celebration show={celebrating} />
  </PageShell>;
}

// ============ COLOR MIXER ============
function ColorMixer({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [sel, setSel] = useState([]); const [mixing, setMixing] = useState(false); const [result, setResult] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const T = 8;
  const usedRef = useRef(new Set());
  const [puzzleIdx, setPuzzleIdx] = useState(() => { const i = randInt(0, COLOR_MIXES.length - 1); usedRef.current = new Set([i]); return i; });
  const puzzle = COLOR_MIXES[puzzleIdx];
  const pickNextPuzzle = useCallback(() => { let idx; do { idx = randInt(0, COLOR_MIXES.length - 1); } while (usedRef.current.has(idx) && usedRef.current.size < COLOR_MIXES.length); usedRef.current.add(idx); setPuzzleIdx(idx); }, []);

  const tapColor = (color) => {
    if (mixing || result) return;
    playTap();
    const ns = [...sel, color];
    setSel(ns);
    if (ns.length === 2) {
      setMixing(true);
      playMix();
      setTimeout(() => {
        setMixing(false);
        const names = ns.map(c => c.name).sort();
        const match = COLOR_MIXES.find(m => [...m.ingredients].sort().join() === names.join());
        if (match && match.target === puzzle.target) {
          const nsc = score + 1; setScore(nsc);
          setResult(match); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); playCorrect();
          setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); pickNextPuzzle(); setSel([]); setResult(null); setCorrect(null); setMascotMood("idle"); } else { onComplete?.(nsc, T); } }, 2000);
        } else {
          const resultColor = match ? match.hex : "#999";
          const resultName = match ? match.target : "something else";
          setResult({ hex: resultColor, target: resultName }); setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong();
          setTimeout(() => { setSel([]); setResult(null); setCorrect(null); setMascotMood("idle"); }, 2000);
        }
      }, 1200);
    }
  };

  const reset = () => { setSel([]); setResult(null); setCorrect(null); setMixing(false); };

  return <PageShell onBack={onBack} title="Color Mixer" emoji="🎨" subtitle="Mix colors to make new ones!" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }} speakText={`Can you make ${puzzle.result}?`}>
    <ProgressDots total={T} current={round} />
    <div style={{ background: theme.card, borderRadius: 28, padding: 24, boxShadow: theme.shadow, textAlign: "center", marginTop: 16 }}>
      <p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 22, color: theme.text }}>Make <strong style={{ color: puzzle.hex }}>{puzzle.target}</strong>! {puzzle.emoji}</p>
      <div style={{ width: 100, height: 100, borderRadius: "50%", margin: "16px auto", background: result ? result.hex : mixing ? `conic-gradient(${sel.map(c => c.hex).join(", ")})` : sel.length === 1 ? sel[0].hex : "#F5F0EB", border: "4px solid #EDE6DC", transition: "all 0.5s ease", animation: mixing ? "swirl 1s linear infinite" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
        {!mixing && !result && sel.length === 0 && "?"}
        {result && (correct ? "✨" : "🤔")}
      </div>
      {sel.length > 0 && !result && <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        {sel.map((c, i) => <span key={i} style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: c.hex, fontWeight: 700 }}>{c.name}{i < sel.length - 1 ? " +" : ""}</span>)}
      </div>}
    </div>
    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
      {PRIMARY_COLORS.map(c => {
        const used = sel.find(s => s.name === c.name);
        return <button key={c.name} onClick={() => tapColor(c)} disabled={mixing || result !== null || sel.length >= 2}
          style={{ width: 70, height: 70, borderRadius: "50%", background: c.hex, border: used ? `4px solid ${theme.text}` : "4px solid #EDE6DC", cursor: mixing || result || sel.length >= 2 ? "default" : "pointer", transform: used ? "scale(1.1)" : "scale(1)", transition: "all 0.2s ease", boxShadow: `0 4px 16px ${c.hex}44`, opacity: mixing ? 0.5 : 1 }}>
          <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, fontWeight: 700, color: c.name === "White" ? "#999" : c.name === "Black" ? "#ccc" : "#fff", textShadow: c.name === "Yellow" ? "0 1px 2px rgba(0,0,0,0.3)" : "none" }}>{c.name}</span>
        </button>;
      })}
    </div>
    {sel.length > 0 && !mixing && !result && <div style={{ textAlign: "center", marginTop: 12 }}><GentleButton onClick={reset} color={theme.accent3} style={{ fontSize: 14, padding: "8px 16px" }}>Reset</GentleButton></div>}
    {round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="colorMixer" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); usedRef.current.clear(); pickNextPuzzle(); reset(); }}>Play Again 🎨</GentleButton></div>}
    <Celebration show={celebrating} />
  </PageShell>;
}

// ============ PATTERN COMPLETION ============
function PatternGame({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null); const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const [showHint, setShowHint] = useState(false); const [showAnswer, setShowAnswer] = useState(false); const T = 8;
  const usedRef = useRef(new Set());
  const newRound = useCallback(() => { let idx; do { idx = randInt(0, PATTERNS.length - 1); } while (usedRef.current.has(idx) && usedRef.current.size < PATTERNS.length); usedRef.current.add(idx); const p = PATTERNS[idx]; setPuzzle({ ...p, options: shuffle(p.options) }); setSelected(null); setCorrect(null); setMascotMood("idle"); setShowAnswer(false); }, []);
  useEffect(() => { newRound(); }, []);
  if (!puzzle) return null;
  const pick = (opt) => { if (selected !== null) return; setSelected(opt); playTap(); if (opt === puzzle.answer) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); setShowHint(false); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(ns, T); } }, 1800); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setShowAnswer(true); }, 800); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(score, T); } }, 2500); } };
  return <PageShell onBack={onBack} title="What Comes Next?" emoji="🧩" subtitle="Find the pattern!" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }}>
    <ProgressDots total={T} current={round} />
    <div style={{ background: theme.card, borderRadius: 28, padding: 24, boxShadow: theme.shadow, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {puzzle.sequence.map((item, i) => <div key={i} style={{ width: 56, height: 56, borderRadius: 16, background: showHint && i < 2 ? "#FFF9C4" : theme.bgWarm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, animation: `popIn 0.4s ease backwards`, animationDelay: `${i * 0.1}s`, border: showHint && i < 2 ? "2px solid #FFE082" : "none", transition: "all 0.3s ease" }}>{item}</div>)}
        <div style={{ width: 56, height: 56, borderRadius: 16, border: `3px dashed ${correct === true ? theme.accent2 : theme.accent1}`, background: correct === true ? "#D4EDDA" : "rgba(0,0,0,0.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: correct === true ? 32 : 24, animation: "popIn 0.4s ease backwards", animationDelay: `${puzzle.sequence.length * 0.1}s`, transition: "all 0.3s ease" }}>{correct === true ? puzzle.answer : "?"}</div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 28 }}>
      {puzzle.options.map((opt, i) => {
        const isSel = selected === opt; const isRight = correct === true && isSel; const isWrong = correct === false && isSel; const isAnswer = showAnswer && opt === puzzle.answer;
        return <button key={i} onClick={() => pick(opt)} style={{ width: 80, height: 80, borderRadius: 24, background: isRight ? "#D4EDDA" : isAnswer ? "#D4EDDA" : isWrong ? "#F8D7DA" : theme.card, border: isRight ? `3px solid ${theme.accent2}` : isAnswer ? `3px solid ${theme.accent2}` : isWrong ? `3px solid ${theme.accent3}` : "3px solid #E8DDD0", fontSize: 36, cursor: selected ? "default" : "pointer", transform: (isSel || isAnswer) ? "scale(1.1)" : "scale(1)", transition: "all 0.25s ease", boxShadow: theme.shadow, animation: isWrong ? "wiggle 0.3s ease" : isAnswer ? "pulse 0.5s ease" : "none" }}>{opt}</button>;
      })}
    </div>
    {round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="patterns" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); usedRef.current.clear(); newRound(); }}>Play Again 🧩</GentleButton></div>}
    <Celebration show={celebrating} />
  </PageShell>;
}

// ============ ODD ONE OUT ============
function OddOneOutGame({ onBack, onComplete, totalStars }) {
  const [round, setRound] = useState(0); const [puzzle, setPuzzle] = useState(null); const [selected, setSelected] = useState(null); const [correct, setCorrect] = useState(null); const [celebrating, setCelebrating] = useState(false); const [score, setScore] = useState(0); const [mascotMood, setMascotMood] = useState("idle"); const [correctStreak, setCorrectStreak] = useState(0); const [wrongStreak, setWrongStreak] = useState(0); const [showHint, setShowHint] = useState(false); const [showAnswer, setShowAnswer] = useState(false); const T = 8;
  const usedRef = useRef(new Set());
  const newRound = useCallback(() => { let idx; do { idx = randInt(0, ODD_ONE_OUT.length - 1); } while (usedRef.current.has(idx) && usedRef.current.size < ODD_ONE_OUT.length); usedRef.current.add(idx); const p = ODD_ONE_OUT[idx]; const items = shuffle([...p.group.map(e => ({ emoji: e, isOdd: false })), { emoji: p.odd, isOdd: true }]); setPuzzle({ ...p, items }); setSelected(null); setCorrect(null); setMascotMood("idle"); setShowAnswer(false); }, []);
  useEffect(() => { newRound(); }, []);
  if (!puzzle) return null;
  const tap = (item, idx) => { if (selected !== null) return; setSelected(idx); playTap(); if (item.isOdd) { const ns = score + 1; setScore(ns); setCorrect(true); setCelebrating(true); setMascotMood("happy"); setCorrectStreak(s => s + 1); setWrongStreak(0); setShowHint(false); playCorrect(); setTimeout(() => { setCelebrating(false); if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(ns, T); } }, 2200); } else { setCorrect(false); setMascotMood("encourage"); setWrongStreak(s => s + 1); setCorrectStreak(0); playWrong(); setTimeout(() => { setShowAnswer(true); }, 800); setTimeout(() => { if (round < T - 1) { setRound(r => r + 1); newRound(); } else { onComplete?.(score, T); } }, 2500); } };
  return <PageShell onBack={onBack} title="Odd One Out" emoji="🔍" subtitle="Which one is different?" mascotMood={mascotMood} totalStars={totalStars} companionContext={{ correctStreak, wrongStreak }}>
    <ProgressDots total={T} current={round} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 24, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
      {puzzle.items.map((item, i) => {
        const isSel = selected === i; const isRight = correct === true && isSel; const isWrong = correct === false && isSel;
        const isGroupHighlight = correct === true && !item.isOdd;
        const isHintDim = showHint && !item.isOdd && selected === null;
        const isAnswer = showAnswer && item.isOdd;
        return <button key={i} onClick={() => tap(item, i)} style={{ aspectRatio: "1", borderRadius: 28, background: isRight ? "#D4EDDA" : isAnswer ? "#D4EDDA" : isWrong ? "#F8D7DA" : isGroupHighlight ? theme.accent2 + "22" : theme.card, border: isRight ? `3px solid ${theme.accent2}` : isAnswer ? `3px solid ${theme.accent2}` : isWrong ? `3px solid ${theme.accent3}` : isGroupHighlight ? `3px solid ${theme.accent2}44` : "3px solid #EDE6DC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, cursor: selected !== null ? "default" : "pointer", transition: "all 0.3s ease", animation: `popIn 0.4s ease backwards ${isWrong ? ", wiggle 0.3s ease" : isAnswer ? ", pulse 0.5s ease" : ""}`, animationDelay: `${i * 0.08}s`, transform: (isSel || isAnswer) ? "scale(1.05)" : "scale(1)", boxShadow: theme.shadow, opacity: isHintDim ? 0.5 : 1 }}>{item.emoji}</button>;
      })}
    </div>
    {correct === true && <div style={{ textAlign: "center", marginTop: 20, animation: "fadeUp 0.4s ease" }}>
      <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 15, color: theme.textLight }}>The others are all <strong>{puzzle.category}</strong></p>
    </div>}
    {round >= T - 1 && correct === true && <div style={{ textAlign: "center", marginTop: 12 }}><StarDisplay score={score} total={T} /><ValueMoment activityId="oddOneOut" /><p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, margin: "8px 0" }}>{ENCOURAGEMENT.effort[randInt(0, ENCOURAGEMENT.effort.length - 1)]}</p><GentleButton onClick={() => { setRound(0); setScore(0); setCorrectStreak(0); setWrongStreak(0); usedRef.current.clear(); newRound(); }}>Play Again 🔍</GentleButton></div>}
    <Celebration show={celebrating} />
  </PageShell>;
}

// ============ STICKER GALLERY ============
function StickerGallery({ stickers, onClose }) {
  const earned = new Set(stickers);
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadeUp 0.3s ease" }} onClick={onClose}>
    <div style={{ background: theme.bg, borderRadius: 28, padding: 24, maxWidth: 420, width: "100%", maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 24, color: theme.text, margin: 0 }}>🏆 Sticker Collection</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.textLight }}>✕</button>
      </div>
      <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, marginBottom: 16 }}>{earned.size} / {STICKERS.length} collected</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {STICKERS.map(s => {
          const has = earned.has(s.id);
          return <div key={s.id} style={{ background: has ? theme.card : "#F0EBE3", borderRadius: 16, padding: 12, textAlign: "center", opacity: has ? 1 : 0.5, boxShadow: has ? theme.shadow : "none", transition: "all 0.3s ease" }}>
            <div style={{ fontSize: 32, filter: has ? "none" : "grayscale(1)" }}>{has ? s.emoji : "🔒"}</div>
            <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, fontWeight: 600, color: theme.text, margin: "4px 0 0" }}>{s.name}</p>
            <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, margin: "2px 0 0" }}>{s.desc}</p>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ============ FEEDBACK ============
const ADMIN_EMAILS = ["faizehandhasnain@gmail.com"];

function FeedbackInbox() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    getDocs(query(collection(db, "feedback"), orderBy("timestamp", "desc")))
      .then(snap => { setItems(snap.docs.map(d => d.data())); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return <div style={{ marginTop: 20, borderTop: "1px solid #EDE6DC", paddingTop: 16 }}>
    <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.text, margin: "0 0 8px" }}>📬 All Feedback</h4>
    {loading && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>Loading…</p>}
    {!loading && items.length === 0 && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>No feedback yet!</p>}
    {items.map((fb, i) => <div key={i} style={{ background: theme.card, borderRadius: 12, padding: 12, marginBottom: 8, boxShadow: theme.shadow }}>
      <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.text, margin: 0 }}>{fb.message}</p>
      <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.textLight, marginTop: 6 }}>
        {fb.childName} · {fb.parentEmail} · {new Date(fb.timestamp).toLocaleDateString()}
      </p>
    </div>)}
  </div>;
}

function FeedbackForm({ childName, user }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (!text.trim() || !FIREBASE_ENABLED) return;
    try {
      await addDoc(collection(db, "feedback"), {
        message: text.trim(),
        childName: childName || "Unknown",
        parentEmail: user?.email || "anonymous",
        timestamp: new Date().toISOString(),
      });
      setText("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (e) { /* ignore */ }
  };
  return <div style={{ marginTop: 20, borderTop: "1px solid #EDE6DC", paddingTop: 16 }}>
    <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.text, margin: "0 0 8px" }}>💬 Send Feedback</h4>
    <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.textLight, marginBottom: 8 }}>Ideas, bugs, or suggestions — we'd love to hear from you!</p>
    <textarea
      value={text} onChange={e => setText(e.target.value)}
      placeholder="What's working? What could be better?"
      rows={3}
      style={{
        width: "100%", fontFamily: "'Quicksand', sans-serif", fontSize: 14,
        padding: 12, borderRadius: 12, border: `1px solid #EDE6DC`,
        background: theme.card, color: theme.text, resize: "vertical", outline: "none",
      }}
    />
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <button onClick={submit} disabled={!text.trim()} style={{
        padding: "8px 20px", borderRadius: 14, border: "none",
        background: text.trim() ? theme.accent2 : "#ddd", color: "#fff",
        fontFamily: "'Quicksand', sans-serif", fontSize: 13, fontWeight: 600,
        cursor: text.trim() ? "pointer" : "default",
      }}>Send</button>
      {sent && <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 12, color: theme.accent2 }}>✓ Sent — thank you!</span>}
    </div>
  </div>;
}

// ============ PARENT DASHBOARD ============
function ParentDashboard({ progress, onClose, user }) {
  const activityNames = { counting: "Counting", shapes: "Shapes", letters: "Letters", matching: "Letter Match", tracing: "Tracing", words: "Word Builder", habitats: "Animal Homes", arsenal: "Arsenal Quiz", colorMixer: "Color Mixer", patterns: "Patterns", oddOneOut: "Odd One Out" };
  const recentActivities = ALL_ACTIVITY_IDS.map(id => ({ id, name: activityNames[id], ...progress.stats[id] })).filter(s => s.plays > 0).sort((a, b) => (b.lastPlayed || "").localeCompare(a.lastPlayed || ""));
  const strongAreas = recentActivities.filter(a => a.bestScore >= 6);
  const growthAreas = recentActivities.filter(a => a.plays >= 2 && a.bestScore < 4);
  const stage = getCompanionStage(progress.totalStars);
  const nextStage = COMPANION_STAGES.find(s => s.minStars > progress.totalStars);
  const recentIds = recentActivities.slice(0, 3).map(a => a.id);
  const suggestions = recentIds.flatMap(id => (OFFLINE_SUGGESTIONS[id] || []).slice(0, 1));

  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadeUp 0.3s ease" }} onClick={onClose}>
    <div style={{ background: theme.bg, borderRadius: 28, padding: 24, maxWidth: 440, width: "100%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 22, color: theme.text, margin: 0 }}>📊 Parent Dashboard</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: theme.textLight }}>✕</button>
      </div>

      {/* Stats Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
        {[{ label: "Streak", val: `${progress.streak.current} days`, sub: `Best: ${progress.streak.longest}` },
          { label: "Stars", val: progress.totalStars, sub: `${stage.emoji} ${stage.name}` },
          { label: "Stickers", val: `${progress.stickers.length}/${STICKERS.length}`, sub: `${recentActivities.length} activities` }
        ].map((s, i) => <div key={i} style={{ background: theme.card, borderRadius: 14, padding: "10px 8px", textAlign: "center", boxShadow: theme.shadow }}>
          <p style={{ fontFamily: "'Baloo 2', cursive", fontSize: 18, color: theme.text, margin: 0 }}>{s.val}</p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, margin: "2px 0 0" }}>{s.label}</p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 9, color: theme.textLight, margin: "1px 0 0" }}>{s.sub}</p>
        </div>)}
      </div>

      {/* Companion Progress */}
      {nextStage && <div style={{ background: "#FFF8E1", borderRadius: 12, padding: "8px 12px", marginBottom: 16, textAlign: "center" }}>
        <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 12, color: theme.text }}>{stage.emoji} → {nextStage.emoji} {nextStage.name}: <strong>{nextStage.minStars - progress.totalStars}</strong> more stars</span>
      </div>}

      {/* Activity Summary */}
      <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.text, margin: "0 0 8px" }}>Recent Activity</h4>
      {recentActivities.length === 0 && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>No activities yet!</p>}
      {recentActivities.slice(0, 5).map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #EDE6DC" }}>
        <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.text }}>{a.name}</span>
        <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 12, color: theme.textLight }}>{a.plays}x plays · Best: {a.bestScore}</span>
      </div>)}

      {/* Strengths & Growth */}
      {strongAreas.length > 0 && <div style={{ marginTop: 16 }}>
        <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.accent2, margin: "0 0 4px" }}>💪 Strengths</h4>
        <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>{strongAreas.map(a => a.name).join(", ")}</p>
      </div>}
      {growthAreas.length > 0 && <div style={{ marginTop: 8 }}>
        <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.accent1, margin: "0 0 4px" }}>🌱 Growing</h4>
        <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight }}>{growthAreas.map(a => a.name).join(", ")}</p>
      </div>}

      {/* Values Reinforced */}
      <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.text, margin: "16px 0 8px" }}>✨ Values Reinforced</h4>
      {VALUES.map(v => {
        const count = progress.valuesReinforced?.[v] || 0;
        return <div key={v} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 90, fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.textLight }}>{v}</span>
          <div style={{ flex: 1, height: 6, background: "#EDE6DC", borderRadius: 3 }}>
            <div style={{ width: `${Math.min(count * 12, 100)}%`, height: "100%", background: theme.accent2, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, width: 16, textAlign: "right" }}>{count}</span>
        </div>;
      })}

      {/* Offline Suggestions */}
      {suggestions.length > 0 && <div style={{ marginTop: 16 }}>
        <h4 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, color: theme.text, margin: "0 0 8px" }}>🏠 Try at Home</h4>
        {suggestions.map((s, i) => <p key={i} style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight, margin: "4px 0", paddingLeft: 12, borderLeft: `3px solid ${theme.accent2}` }}>{s}</p>)}
      </div>}

      {/* Feedback */}
      <FeedbackForm childName={progress.childName} user={user} />
      {user?.email && ADMIN_EMAILS.includes(user.email) && <FeedbackInbox />}
    </div>
  </div>;
}

// ============ HOME SCREEN ============
function getGreeting(progress) {
  const name = progress.childName || "little learner";
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const stage = getCompanionStage(progress.totalStars);
  const today = getToday();
  const totalPlays = ALL_ACTIVITY_IDS.reduce((sum, id) => sum + (progress.stats[id]?.plays || 0), 0);

  if (progress.streak.current >= 7) return { text: `${timeGreeting}, ${name}! ${progress.streak.current}-day streak!`, sub: `${stage.emoji} is so proud of you!` };
  if (progress.streak.current >= 3) return { text: `${timeGreeting}, ${name}! ${progress.streak.current} days in a row!`, sub: `${stage.emoji} ${stage.greeting}` };
  if (totalPlays > 0 && progress.lastSessionDate !== today) return { text: `Welcome back, ${name}!`, sub: `${stage.emoji} Sprout missed you!` };
  if ((progress.sessionsToday || 0) > 0) return { text: `${timeGreeting}, ${name}!`, sub: "Ready for more adventures? 🌟" };
  if (totalPlays === 0) return { text: `Hello, ${name}! 🌱`, sub: "Let's start an adventure together!" };
  return { text: `${timeGreeting}, ${name}!`, sub: "Let's learn something wonderful! 🌿" };
}

function HomeScreen({ onSelect, progress, user, authLoading, signIn, logOut, syncStatus }) {
  const [showStickers, setShowStickers] = useState(false);
  const [showParent, setShowParent] = useState(false);
  const pressTimer = useRef(null);
  const greetingData = getGreeting(progress);
  const stage = getCompanionStage(progress.totalStars);
  const nextStage = COMPANION_STAGES.find(s => s.minStars > progress.totalStars);
  const activities = [
    { id: "counting", title: "Count with Me", emoji: "🌿", desc: "Count animals, fruits & flowers", bg: "linear-gradient(135deg, #E8F5E9, #C8E6C9)" },
    { id: "shapes", title: "Find the Shape", emoji: "🔷", desc: "Sort circles, squares & more", bg: "linear-gradient(135deg, #E3F2FD, #BBDEFB)" },
    { id: "letters", title: "Letter Garden", emoji: "🔤", desc: "Explore letters & hear sounds", bg: "linear-gradient(135deg, #F3E5F5, #E1BEE7)" },
    { id: "matching", title: "Match the Letter", emoji: "🌸", desc: "Match words to their first letter", bg: "linear-gradient(135deg, #FFF3E0, #FFE0B2)" },
    { id: "tracing", title: "Trace Numbers", emoji: "✏️", desc: "Draw over the number guides", bg: "linear-gradient(135deg, #FFFDE7, #FFF9C4)" },
    { id: "words", title: "Word Builder", emoji: "🧩", desc: "Tap letters to spell 3-letter words", bg: "linear-gradient(135deg, #FCE4EC, #F8BBD0)" },
    { id: "habitats", title: "Animal Homes", emoji: "🌍", desc: "Match animals to where they live", bg: "linear-gradient(135deg, #E0F2F1, #B2DFDB)" },
    { id: "arsenal", title: "Arsenal Quiz", emoji: "⚽", desc: "Guess shirt numbers & countries", bg: "linear-gradient(135deg, #FFEBEE, #FFCDD2)" },
    { id: "colorMixer", title: "Color Mixer", emoji: "🎨", desc: "Mix colors to make new ones", bg: "linear-gradient(135deg, #F3E5F5, #CE93D8)" },
    { id: "patterns", title: "What Comes Next?", emoji: "🔮", desc: "Find the hidden pattern", bg: "linear-gradient(135deg, #E8EAF6, #C5CAE9)" },
    { id: "oddOneOut", title: "Odd One Out", emoji: "🔍", desc: "Spot the one that's different", bg: "linear-gradient(135deg, #FFF8E1, #FFECB3)" },
  ];
  const stats = progress.stats;
  return <div style={{ minHeight: "100vh", background: theme.bg, padding: "40px 16px" }}>
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}><div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: theme.accent1, opacity: 0.06 }} /><div style={{ position: "absolute", bottom: -60, left: -60, width: 250, height: 250, borderRadius: "50%", background: theme.accent2, opacity: 0.06 }} /></div>
    <div style={{ maxWidth: 520, margin: "0 auto", position: "relative", zIndex: 1 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 8, animation: `float 3s ease-in-out infinite${stage.level === 4 ? ", rainbowShimmer 2s linear infinite" : ""}` }}>{stage.emoji}</div>
        <h1 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 38, fontWeight: 800, color: theme.text, margin: 0 }}>Little Learner</h1>
        <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 17, color: theme.textLight, marginTop: 8, fontWeight: 500 }}>{greetingData.text}</p>
        {greetingData.sub && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 14, color: theme.textLight, marginTop: 4, opacity: 0.8 }}>{greetingData.sub}</p>}
        {nextStage && <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.accent6, marginTop: 6 }}>{stage.name} — {nextStage.minStars - progress.totalStars} stars to {nextStage.name} {nextStage.emoji}</p>}
      </div>
      {/* Progress Dashboard */}
      <div style={{ background: theme.card, borderRadius: 20, padding: "14px 20px", boxShadow: theme.shadow, marginBottom: 20, display: "flex", justifyContent: "space-around", alignItems: "center", animation: "fadeUp 0.5s ease" }}>
        <div style={{ textAlign: "center", cursor: "default" }}>
          <div style={{ fontSize: 22 }}>🔥</div>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>{progress.streak.current}</p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, margin: 0 }}>streak</p>
        </div>
        <div style={{ width: 1, height: 30, background: "#EDE6DC" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22 }}>⭐</div>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>{progress.totalStars}</p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, margin: 0 }}>stars</p>
        </div>
        <div style={{ width: 1, height: 30, background: "#EDE6DC" }} />
        <button onClick={() => { playTap(); setShowStickers(true); }} style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <div style={{ fontSize: 22 }}>🏆</div>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>{progress.stickers.length}</p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 10, color: theme.textLight, margin: 0 }}>stickers</p>
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {activities.map((a, i) => {
          const st = stats[a.id] || {};
          const bestStars = st.bestScore ? (st.bestScore >= (a.id === "arsenal" || a.id === "habitats" || a.id === "words" || a.id === "patterns" || a.id === "oddOneOut" ? 8 : 6) ? 3 : st.bestScore >= (a.id === "arsenal" || a.id === "habitats" || a.id === "words" || a.id === "patterns" || a.id === "oddOneOut" ? 5.6 : 4.2) ? 2 : 1) : 0;
          return <button key={a.id} onClick={() => { ensureAudio(); playTap(); onSelect(a.id); }} style={{ background: a.bg, border: "none", borderRadius: 24, padding: "20px 24px", textAlign: "left", cursor: "pointer", boxShadow: theme.shadow, transition: "all 0.3s ease", display: "flex", alignItems: "center", gap: 20, animation: `fadeUp 0.5s ease backwards`, animationDelay: `${i * 0.05}s`, position: "relative" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = theme.shadowHover; }} onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = theme.shadow; }}>
            <div style={{ fontSize: 36, width: 56, height: 56, borderRadius: 20, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{a.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, fontWeight: 700, color: theme.text, margin: 0 }}>{a.title}</h3>
              <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight, margin: "2px 0 0" }}>{a.desc}</p>
              {st.plays > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 12 }}>{bestStars >= 1 ? "⭐" : "☆"}{bestStars >= 2 ? "⭐" : "☆"}{bestStars >= 3 ? "⭐" : "☆"}</span>
                <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.textLight }}>Played {st.plays}x</span>
              </div>}
            </div>
            <div style={{ fontSize: 18, color: theme.textLight, opacity: 0.5, flexShrink: 0 }}>→</div>
          </button>;
        })}
      </div>
      {/* Sync UI — small, parent-facing */}
      {FIREBASE_ENABLED && !authLoading && (
        <div style={{ textAlign: "center", marginTop: 28, animation: "fadeUp 0.5s ease" }}>
          {!user ? (
            <button onClick={signIn} style={{
              background: "none", border: "1px solid rgba(141,110,99,0.2)", borderRadius: 20,
              padding: "8px 18px", cursor: "pointer", opacity: 0.6,
              fontFamily: "'Quicksand', sans-serif", fontSize: 12, color: theme.textLight,
              display: "inline-flex", alignItems: "center", gap: 6,
              transition: "opacity 0.2s"
            }} onMouseEnter={e => e.currentTarget.style.opacity = "1"} onMouseLeave={e => e.currentTarget.style.opacity = "0.6"}>
              ☁️ Sync across devices
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.7 }}>
              <span style={{ fontSize: 11, fontFamily: "'Quicksand', sans-serif", color: theme.textLight }}>
                {syncStatus === "syncing" ? "☁️ Syncing…" : syncStatus === "synced" ? "☁️ Synced" : syncStatus === "offline" ? "📴 Offline" : "☁️"}
              </span>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} referrerPolicy="no-referrer" />}
              <button onClick={logOut} style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontFamily: "'Quicksand', sans-serif", fontSize: 11, color: theme.textLight, textDecoration: "underline", opacity: 0.8
              }}>sign out</button>
            </div>
          )}
        </div>
      )}
      <p
        onTouchStart={() => { pressTimer.current = setTimeout(() => setShowParent(true), 2000); }}
        onTouchEnd={() => clearTimeout(pressTimer.current)}
        onMouseDown={() => { pressTimer.current = setTimeout(() => setShowParent(true), 2000); }}
        onMouseUp={() => clearTimeout(pressTimer.current)}
        onMouseLeave={() => clearTimeout(pressTimer.current)}
        style={{ textAlign: "center", fontFamily: "'Quicksand', sans-serif", fontSize: 13, color: theme.textLight, marginTop: 32, opacity: 0.6, cursor: "default", userSelect: "none" }}
      >Made with 💛{progress.childName ? ` for ${progress.childName}` : ""}</p>
    </div>
    {showStickers && <StickerGallery stickers={progress.stickers} onClose={() => setShowStickers(false)} />}
    {showParent && <ParentDashboard progress={progress} onClose={() => setShowParent(false)} user={user} />}
  </div>;
}

// ============ NAME PROMPT ============
function NamePrompt({ onSubmit }) {
  const [name, setName] = useState("");
  return <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ textAlign: "center", maxWidth: 360, animation: "popIn 0.4s ease" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🌱</div>
      <h2 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 28, color: theme.text, marginBottom: 8 }}>Welcome to Little Learner!</h2>
      <p style={{ fontFamily: "'Quicksand', sans-serif", fontSize: 15, color: theme.textLight, marginBottom: 24 }}>What's your little learner's name?</p>
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Noah"
        autoFocus
        style={{
          fontFamily: "'Quicksand', sans-serif", fontSize: 20, fontWeight: 600,
          textAlign: "center", padding: "14px 20px", borderRadius: 16,
          border: `2px solid ${theme.accent2}`, background: theme.card,
          color: theme.text, width: "100%", outline: "none",
        }}
        onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSubmit(name.trim()); }}
      />
      <button
        onClick={() => { if (name.trim()) onSubmit(name.trim()); }}
        disabled={!name.trim()}
        style={{
          marginTop: 16, padding: "14px 40px", borderRadius: 20, border: "none",
          background: name.trim() ? theme.accent2 : "#ddd", color: "#fff",
          fontFamily: "'Quicksand', sans-serif", fontSize: 17, fontWeight: 700,
          cursor: name.trim() ? "pointer" : "default", transition: "all 0.2s",
        }}
      >Let's go! 🎉</button>
    </div>
  </div>;
}

// ============ APP ============
export default function App() {
  const [screen, setScreen] = useState("home");
  const { progress, recordActivity, setUser, syncStatus, setChildName } = useProgress();
  const { user, authLoading, signIn, logOut } = useAuth();

  // Wire auth user into progress hook
  useEffect(() => { setUser(user); }, [user, setUser]);

  const handleComplete = useCallback((activityId) => (score, total) => {
    recordActivity(activityId, score, total);
  }, [recordActivity]);

  // Show name prompt if no child name set
  if (!progress.childName) {
    return <>
      <link href={GOOGLE_FONTS} rel="stylesheet" />
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: ${theme.bg}; }
      @keyframes popIn { 0% { opacity:0; transform:scale(0.5); } 70% { transform:scale(1.05); } 100% { opacity:1; transform:scale(1); } }`}</style>
      <NamePrompt onSubmit={setChildName} />
    </>;
  }

  return <>
    <link href={GOOGLE_FONTS} rel="stylesheet" />
    <style>{`* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; } body { background: ${theme.bg}; overflow-x: hidden; }
    @keyframes popIn { 0% { opacity:0; transform:scale(0.5); } 70% { transform:scale(1.05); } 100% { opacity:1; transform:scale(1); } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes celebFallDrift { 0% { transform:translateY(-40px) translateX(0) rotate(0deg); opacity:1; } 25% { transform:translateY(25vh) translateX(15px) rotate(180deg); } 50% { transform:translateY(50vh) translateX(-10px) rotate(360deg); } 75% { transform:translateY(75vh) translateX(20px) rotate(540deg); } 100% { transform:translateY(110vh) translateX(-5px) rotate(720deg); opacity:0; } }
    @keyframes confettiSpin { from { transform:rotateX(0) rotateY(0); } to { transform:rotateX(360deg) rotateY(180deg); } }
    @keyframes burstFlash { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.3); } 30% { opacity:1; } 100% { opacity:0; transform:translate(-50%,-50%) scale(1.5); } }
    @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
    @keyframes wiggle { 0% { transform:translateX(0); } 20% { transform:translateX(-6px); } 40% { transform:translateX(6px); } 60% { transform:translateX(-4px); } 80% { transform:translateX(4px); } 100% { transform:translateX(0); } }
    @keyframes headShake { 0% { transform:translateX(0); } 25% { transform:translateX(-4px) rotate(-5deg); } 50% { transform:translateX(4px) rotate(5deg); } 75% { transform:translateX(-2px) rotate(-2deg); } 100% { transform:translateX(0) rotate(0); } }
    @keyframes swirl { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
    @keyframes rainbowShimmer { 0% { filter:hue-rotate(0deg); } 100% { filter:hue-rotate(360deg); } }
    button:focus-visible { outline:3px solid ${theme.accent4}; outline-offset:2px; }`}</style>
    {screen === "home" && <HomeScreen onSelect={setScreen} progress={progress} user={user} authLoading={authLoading} signIn={signIn} logOut={logOut} syncStatus={syncStatus} />}
    {screen === "counting" && <CountingGame onBack={() => setScreen("home")} onComplete={handleComplete("counting")} totalStars={progress.totalStars} />}
    {screen === "shapes" && <ShapeSorting onBack={() => setScreen("home")} onComplete={handleComplete("shapes")} totalStars={progress.totalStars} />}
    {screen === "letters" && <LetterExplorer onBack={() => setScreen("home")} onComplete={handleComplete("letters")} totalStars={progress.totalStars} />}
    {screen === "matching" && <LetterMatch onBack={() => setScreen("home")} onComplete={handleComplete("matching")} totalStars={progress.totalStars} />}
    {screen === "tracing" && <NumberTrace onBack={() => setScreen("home")} onComplete={handleComplete("tracing")} totalStars={progress.totalStars} />}
    {screen === "words" && <WordBuilder onBack={() => setScreen("home")} onComplete={handleComplete("words")} totalStars={progress.totalStars} />}
    {screen === "habitats" && <AnimalHabitats onBack={() => setScreen("home")} onComplete={handleComplete("habitats")} totalStars={progress.totalStars} />}
    {screen === "arsenal" && <ArsenalQuiz onBack={() => setScreen("home")} onComplete={handleComplete("arsenal")} totalStars={progress.totalStars} />}
    {screen === "colorMixer" && <ColorMixer onBack={() => setScreen("home")} onComplete={handleComplete("colorMixer")} totalStars={progress.totalStars} />}
    {screen === "patterns" && <PatternGame onBack={() => setScreen("home")} onComplete={handleComplete("patterns")} totalStars={progress.totalStars} />}
    {screen === "oddOneOut" && <OddOneOutGame onBack={() => setScreen("home")} onComplete={handleComplete("oddOneOut")} totalStars={progress.totalStars} />}
  </>;
}