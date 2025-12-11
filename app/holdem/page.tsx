"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { glassPanelClass, gradientBackground, primaryButtonGradient } from "../theme";
import { useWalletBalance } from "../hooks/useSupabaseWallet";

const INITIAL_BALANCE = 100;
const BOT_BUY_IN = 160;
const ANTE = 10;
const BET_INCREMENT = 20;

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

const BOT_NAMES = ["Nebula", "Flux", "Echo"];

const rankToValue = new Map(RANKS.map((rank, idx) => [rank, idx + 2] as const));

interface Card {
  suit: (typeof SUITS)[number];
  rank: (typeof RANKS)[number];
}

type Phase = "preflop" | "flop" | "turn" | "river" | "showdown";

interface PlayerState {
  id: string;
  name: string;
  stack: number;
  cards: Card[];
  folded: boolean;
  bet: number;
  isHuman: boolean;
  avatarHue: number;
  handRank?: HandEvaluation;
}

interface HandEvaluation {
  type: HandStrength;
  ranks: number[];
  description: string;
}

enum HandStrength {
  HighCard = 1,
  OnePair,
  TwoPair,
  ThreeOfAKind,
  Straight,
  Flush,
  FullHouse,
  FourOfAKind,
  StraightFlush,
  RoyalFlush,
}

interface GameConclusion {
  title: string;
  detail: string;
  variant: "win" | "lose" | "split" | "info";
}

const HAND_RANKING_EXAMPLES: ReadonlyArray<{
  name: string;
  description: string;
  cards: Card[];
}> = [
  {
    name: "Royal Flush",
    description: "Ten to Ace suited",
    cards: [
      { rank: "10", suit: "♠" },
      { rank: "J", suit: "♠" },
      { rank: "Q", suit: "♠" },
      { rank: "K", suit: "♠" },
      { rank: "A", suit: "♠" },
    ],
  },
  {
    name: "Straight Flush",
    description: "Five in a row, same suit",
    cards: [
      { rank: "5", suit: "♥" },
      { rank: "6", suit: "♥" },
      { rank: "7", suit: "♥" },
      { rank: "8", suit: "♥" },
      { rank: "9", suit: "♥" },
    ],
  },
  {
    name: "Four of a Kind",
    description: "Four cards sharing a rank",
    cards: [
      { rank: "8", suit: "♠" },
      { rank: "8", suit: "♥" },
      { rank: "8", suit: "♦" },
      { rank: "8", suit: "♣" },
      { rank: "2", suit: "♠" },
    ],
  },
  {
    name: "Full House",
    description: "Three of a kind plus a pair",
    cards: [
      { rank: "K", suit: "♦" },
      { rank: "K", suit: "♣" },
      { rank: "K", suit: "♥" },
      { rank: "4", suit: "♠" },
      { rank: "4", suit: "♦" },
    ],
  },
  {
    name: "Flush",
    description: "Five cards of the same suit",
    cards: [
      { rank: "A", suit: "♦" },
      { rank: "J", suit: "♦" },
      { rank: "9", suit: "♦" },
      { rank: "6", suit: "♦" },
      { rank: "3", suit: "♦" },
    ],
  },
  {
    name: "Straight",
    description: "Five ranks in sequence",
    cards: [
      { rank: "4", suit: "♠" },
      { rank: "5", suit: "♦" },
      { rank: "6", suit: "♣" },
      { rank: "7", suit: "♥" },
      { rank: "8", suit: "♠" },
    ],
  },
  {
    name: "Three of a Kind",
    description: "Three cards sharing a rank",
    cards: [
      { rank: "Q", suit: "♣" },
      { rank: "Q", suit: "♦" },
      { rank: "Q", suit: "♥" },
      { rank: "9", suit: "♠" },
      { rank: "5", suit: "♣" },
    ],
  },
  {
    name: "Two Pair",
    description: "Two different pairs",
    cards: [
      { rank: "J", suit: "♠" },
      { rank: "J", suit: "♥" },
      { rank: "6", suit: "♦" },
      { rank: "6", suit: "♣" },
      { rank: "3", suit: "♥" },
    ],
  },
  {
    name: "One Pair",
    description: "A single matching pair",
    cards: [
      { rank: "A", suit: "♣" },
      { rank: "A", suit: "♥" },
      { rank: "9", suit: "♦" },
      { rank: "4", suit: "♠" },
      { rank: "2", suit: "♥" },
    ],
  },
  {
    name: "High Card",
    description: "Best card when nothing else hits",
    cards: [
      { rank: "A", suit: "♠" },
      { rank: "J", suit: "♦" },
      { rank: "8", suit: "♣" },
      { rank: "5", suit: "♥" },
      { rank: "2", suit: "♣" },
    ],
  },
];

interface HintRecommendation {
  title: string;
  suggestion: string;
  reasons: string[];
}

interface ShowdownResult {
  winners: Array<{ id: string; name: string; evaluation?: HandEvaluation }>;
  evaluations: Array<{ id: string; name: string; evaluation?: HandEvaluation }>;
  reason: "showdown" | "fold";
}

interface PlayerActionContext {
  action: "check" | "call" | "raise" | "fold";
  raiseTo?: number;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[], seed = Date.now()): Card[] {
  const copy = [...deck];
  let currentIndex = copy.length;
  let randomSeed = seed;
  while (currentIndex !== 0) {
    randomSeed = (randomSeed * 9301 + 49297) % 233280;
    const randomIndex = Math.floor((randomSeed / 233280) * currentIndex);
    currentIndex -= 1;
    const temp = copy[currentIndex];
    copy[currentIndex] = copy[randomIndex];
    copy[randomIndex] = temp;
  }
  return copy;
}

function combinations<T>(source: T[], choose: number): T[][] {
  const result: T[][] = [];
  const recurse = (start: number, combo: T[]) => {
    if (combo.length === choose) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < source.length; i += 1) {
      combo.push(source[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  };
  recurse(0, []);
  return result;
}

function getStraightHigh(values: number[]): number | null {
  if (values.length < 5) return null;
  const uniqueAsc = Array.from(new Set(values)).sort((a, b) => a - b);
  for (let i = uniqueAsc.length - 1; i >= 4; i -= 1) {
    const slice = uniqueAsc.slice(i - 4, i + 1);
    const isRun = slice.every((value, idx) => idx === 0 || value === slice[idx - 1] + 1);
    if (isRun) {
      return slice[slice.length - 1];
    }
  }
  const hasWheel = uniqueAsc.includes(14) && uniqueAsc.includes(2) && uniqueAsc.includes(3) && uniqueAsc.includes(4) && uniqueAsc.includes(5);
  if (hasWheel) return 5;
  return null;
}

function rankLabel(value: number): string {
  const entry = Array.from(rankToValue.entries()).find(([, v]) => v === value);
  return entry ? entry[0] : value.toString();
}

function evaluateFive(cards: Card[]): HandEvaluation {
  const sorted = [...cards].sort((a, b) => rankToValue.get(b.rank)! - rankToValue.get(a.rank)!);
  const values = sorted.map((card) => rankToValue.get(card.rank)!);
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);
  const rankGroups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] === a[1]) return b[0] - a[0];
    return b[1] - a[1];
  });

  const describe = (name: string, detail?: string) => (detail ? `${name} (${detail})` : name);

  if (isFlush && straightHigh) {
    const isRoyal = straightHigh === 14;
    return {
      type: isRoyal ? HandStrength.RoyalFlush : HandStrength.StraightFlush,
      ranks: [straightHigh],
      description: isRoyal ? "Royal Flush" : describe("Straight Flush", `${rankLabel(straightHigh)} high`),
    };
  }

  if (rankGroups[0]?.[1] === 4) {
    const fourRank = rankGroups[0][0];
    const kicker = values.find((value) => value !== fourRank) ?? 0;
    return {
      type: HandStrength.FourOfAKind,
      ranks: [fourRank, kicker],
      description: describe("Four of a Kind", `${rankLabel(fourRank)}s`),
    };
  }

  if (rankGroups[0]?.[1] === 3 && rankGroups[1]?.[1] === 2) {
    const trips = rankGroups[0][0];
    const pair = rankGroups[1][0];
    return {
      type: HandStrength.FullHouse,
      ranks: [trips, pair],
      description: describe("Full House", `${rankLabel(trips)}s over ${rankLabel(pair)}s`),
    };
  }

  if (isFlush) {
    return {
      type: HandStrength.Flush,
      ranks: values,
      description: describe("Flush", `${rankLabel(values[0])} high`),
    };
  }

  if (straightHigh) {
    return {
      type: HandStrength.Straight,
      ranks: [straightHigh],
      description: describe("Straight", `${rankLabel(straightHigh)} high`),
    };
  }

  if (rankGroups[0]?.[1] === 3) {
    const trips = rankGroups[0][0];
    const kickers = values.filter((value) => value !== trips).slice(0, 2);
    return {
      type: HandStrength.ThreeOfAKind,
      ranks: [trips, ...kickers],
      description: describe("Three of a Kind", `${rankLabel(trips)}s`),
    };
  }

  if (rankGroups[0]?.[1] === 2 && rankGroups[1]?.[1] === 2) {
    const [pairA, pairB] = [rankGroups[0][0], rankGroups[1][0]].sort((a, b) => b - a);
    const kicker = values.find((value) => value !== pairA && value !== pairB) ?? 0;
    return {
      type: HandStrength.TwoPair,
      ranks: [pairA, pairB, kicker],
      description: describe("Two Pair", `${rankLabel(pairA)}s & ${rankLabel(pairB)}s`),
    };
  }

  if (rankGroups[0]?.[1] === 2) {
    const pair = rankGroups[0][0];
    const kickers = values.filter((value) => value !== pair).slice(0, 3);
    return {
      type: HandStrength.OnePair,
      ranks: [pair, ...kickers],
      description: describe("One Pair", `${rankLabel(pair)}s`),
    };
  }

  return {
    type: HandStrength.HighCard,
    ranks: values,
    description: describe("High Card", `${rankLabel(values[0])}`),
  };
}

function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    const padded = [...cards];
    while (padded.length < 5) {
      padded.push(cards[cards.length - 1] ?? cards[0]);
      if (padded.length === cards.length) break;
    }
    return evaluateFive(padded.slice(0, 5));
  }
  const all = combinations(cards, 5);
  let best = evaluateFive(all[0]);
  for (let i = 1; i < all.length; i += 1) {
    const candidate = evaluateFive(all[i]);
    if (compareHands(candidate, best) > 0) {
      best = candidate;
    }
  }
  return best;
}

function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.type !== b.type) return a.type - b.type;
  const length = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < length; i += 1) {
    const av = a.ranks[i] ?? 0;
    const bv = b.ranks[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function formatStack(value: number): string {
  return `$${value.toLocaleString()}`;
}

function rankWord(rank: Card["rank"]): string {
  switch (rank) {
    case "A":
      return "Ace";
    case "K":
      return "King";
    case "Q":
      return "Queen";
    case "J":
      return "Jack";
    case "10":
      return "Ten";
    case "9":
      return "Nine";
    case "8":
      return "Eight";
    case "7":
      return "Seven";
    case "6":
      return "Six";
    case "5":
      return "Five";
    case "4":
      return "Four";
    case "3":
      return "Three";
    default:
      return "Two";
  }
}

function estimatePreflopStrength(cards: Card[]): number {
  if (cards.length < 2) return 0.3;
  const [a, b] = cards.map((card) => rankToValue.get(card.rank) ?? 2).sort((x, y) => y - x);
  if (cards[0].rank === cards[1].rank) return 0.85;
  if (Math.abs(a - b) === 1) return (a + b) / 30 + 0.2;
  return (a + b) / 30;
}

function estimateHandStrength(cards: Card[], community: Card[], phase: Phase): number {
  if (phase === "preflop") return estimatePreflopStrength(cards);
  if (community.length + cards.length >= 5) {
    const evaluation = evaluateHand([...cards, ...community]);
    return evaluation.type / HandStrength.RoyalFlush + (evaluation.ranks[0] ?? 0) / 20;
  }
  return cards.reduce((total, card) => total + (rankToValue.get(card.rank) ?? 2), 0) / 60;
}

function describeHoleCards(cards: Card[]): string {
  if (cards.length < 2) return "No cards yet";
  const [first, second] = cards;
  const sorted = [...cards].sort((a, b) => (rankToValue.get(b.rank) ?? 0) - (rankToValue.get(a.rank) ?? 0));
  const sameRank = first.rank === second.rank;
  const suited = first.suit === second.suit;
  const label = sameRank
    ? `${rankWord(sorted[0].rank)} pair`
    : `${rankWord(sorted[0].rank)} and ${rankWord(sorted[1].rank)}`;
  if (sameRank) return label;
  return suited ? `${label} suited` : label;
}

function generateHint({
  human,
  community,
  phase,
  pot,
  callCost,
  canRaise,
  currentBet,
  isHumanTurn,
}: {
  human?: PlayerState;
  community: Card[];
  phase: Phase;
  pot: number;
  callCost: number;
  canRaise: boolean;
  currentBet: number;
  isHumanTurn: boolean;
}): HintRecommendation {
  if (!human) {
    return {
      title: "No seat taken",
      suggestion: "Join a seat before requesting advice",
      reasons: ["We couldn't find your player data at the table."],
    };
  }

  if (human.folded) {
    return {
      title: "You're already out of this pot",
      suggestion: "Wait for the next hand",
      reasons: ["You folded earlier in the hand, so there are no more actions to take."],
    };
  }

  if (phase === "showdown") {
    return {
      title: "Hand resolved",
      suggestion: "Review the results",
      reasons: ["The cards are on their backs and betting is complete for this hand."],
    };
  }

  if (!isHumanTurn) {
    return {
      title: "Await your turn",
      suggestion: "Pause and observe",
      reasons: ["Another player is currently acting. Once action returns to you, the hint will update."],
    };
  }

  if (human.cards.length < 2) {
    return {
      title: "Cards incoming",
      suggestion: "Wait for the deal",
      reasons: ["Your hole cards haven't fully appeared yet. Once they do, we'll evaluate them."],
    };
  }

  const holeDescription = describeHoleCards(human.cards);
  const boardDescription =
    community.length === 0
      ? "No community cards yet"
      : community.length < 3
      ? `${community.length} card${community.length > 1 ? "s" : ""} showing`
      : evaluateHand([...community]).description;

  const strength = estimateHandStrength(human.cards, community, phase);
  const combinedCards = [...human.cards, ...community];
  const hasShowdownInfo = combinedCards.length >= 5;
  const fullEvaluation = hasShowdownInfo ? evaluateHand(combinedCards) : null;

  const reasons: string[] = [];
  reasons.push(`Hole cards: ${holeDescription}.`);
  reasons.push(`${boardDescription}.`);
  if (callCost > 0) {
    reasons.push(`Calling costs ${formatStack(Math.min(callCost, human.stack))}.`);
  } else {
    reasons.push("You can see the next card without putting more chips in right now.");
  }
  if (pot > 0) {
    const potOdds = callCost > 0 ? callCost / (pot + callCost) : 0;
    if (callCost > 0) {
      reasons.push(`Pot odds: ${(potOdds * 100).toFixed(1)}% (pot is ${formatStack(pot)}).`);
    } else {
      reasons.push(`Current pot: ${formatStack(pot)}.`);
    }
  }
  if (fullEvaluation) {
    reasons.push(`Current made hand: ${fullEvaluation.description}.`);
  }

  const suggestedRaise = Math.min(
    human.stack,
    callCost > 0 ? callCost + BET_INCREMENT : Math.max(BET_INCREMENT, currentBet + BET_INCREMENT)
  );

  if (phase === "preflop") {
    const pair = human.cards[0].rank === human.cards[1].rank;
    const suited = human.cards[0].suit === human.cards[1].suit;
    const valueA = rankToValue.get(human.cards[0].rank) ?? 2;
    const valueB = rankToValue.get(human.cards[1].rank) ?? 2;
    const gap = Math.abs(valueA - valueB);
    if (pair && Math.max(valueA, valueB) >= 10) {
      return {
        title: "Premium pair preflop",
        suggestion: canRaise
          ? `Raise to around ${formatStack(suggestedRaise)} to build the pot`
          : "Call and keep the pressure on",
        reasons: [
          ...reasons,
          "High pairs dominate most other starting hands, so pushing value is profitable.",
        ],
      };
    }
    if (pair) {
      const play = callCost === 0 ? "Check" : "Call";
      return {
        title: "Set mining pair",
        suggestion: `${play} and try to see a flop`,
        reasons: [
          ...reasons,
          "Medium pairs play well postflop when you can see cheap community cards.",
        ],
      };
    }
    if (suited && gap <= 1 && Math.max(valueA, valueB) >= 11) {
      return {
        title: "Strong suited combo",
        suggestion: canRaise
          ? `Apply pressure with a raise to about ${formatStack(suggestedRaise)}`
          : callCost === 0
          ? "Take the free flop"
          : "Call and leverage your drawing equity",
        reasons: [
          ...reasons,
          "Suited broadway hands make top pairs and strong flush draws that win big pots.",
        ],
      };
    }
    if (callCost === 0) {
      return {
        title: "Marginal starter",
        suggestion: "Check and see the flop",
        reasons: [
          ...reasons,
          "There's no cost to continue, so you can realise your equity safely.",
        ],
      };
    }
    if (callCost <= BET_INCREMENT && strength >= 0.45) {
      return {
        title: "Playable draw",
        suggestion: "Call and evaluate the flop",
        reasons: [
          ...reasons,
          "The combination has decent equity and the price is affordable compared with the pot.",
        ],
      };
    }
    return {
      title: "Weak opener",
      suggestion: "Fold and wait for a better spot",
      reasons: [
        ...reasons,
        "Out-of-position with a weak holding is rarely profitable against pressure.",
      ],
    };
  }

  if (strength >= 0.78) {
    return {
      title: "Crushing the board",
      suggestion: canRaise
        ? `Raise to ${formatStack(suggestedRaise)} or more to extract value`
        : "Keep betting for value",
      reasons: [
        ...reasons,
        "Your hand is ahead of most ranges. Building the pot maximises your return.",
      ],
    };
  }

  if (strength >= 0.5) {
    const action = callCost === 0 ? "Check" : "Call";
    return {
      title: "Showdown-bound value",
      suggestion: `${action} and control the pot size`,
      reasons: [
        ...reasons,
        "Your equity is healthy but not invulnerable—keeping the pot moderate protects your stack.",
      ],
    };
  }

  if (callCost === 0) {
    return {
      title: "Free card opportunity",
      suggestion: "Check and take a look at the next card",
      reasons: [
        ...reasons,
        "You have drawing potential without investing additional chips right now.",
      ],
    };
  }

  if (strength >= 0.32) {
    return {
      title: "Speculative spot",
      suggestion: "Consider calling and re-evaluate on the next street",
      reasons: [
        ...reasons,
        "Your equity is borderline, but the price may justify a call if opponents are loose.",
      ],
    };
  }

  return {
    title: "Discipline saves chips",
    suggestion: "Fold and preserve your stack",
    reasons: [
      ...reasons,
      "Investing further with limited equity risks more chips than the pot is offering right now.",
    ],
  };
}

function findNextActor(players: PlayerState[], fromIndex: number, currentBet: number): number {
  for (let i = fromIndex + 1; i < players.length; i += 1) {
    const candidate = players[i];
    if (candidate.folded) continue;
    if (candidate.cards.length < 2) continue;
    if (candidate.stack === 0 && candidate.bet >= currentBet) continue;
    return i;
  }
  return -1;
}

function countActive(players: PlayerState[]): number {
  return players.filter((player) => !player.folded && player.cards.length === 2).length;
}


export default function HoldemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const botsParam = searchParams.get("bots");
  const parsedBots = botsParam ? Number.parseInt(botsParam, 10) : 1;
  const invalidBots = Number.isNaN(parsedBots) || parsedBots < 1 || parsedBots > 3;
  const botCount = invalidBots ? 1 : Math.max(1, Math.min(3, parsedBots));

  const [wallet, setWallet, walletMeta] = useWalletBalance({ mode: "singleplayer", initialBalance: INITIAL_BALANCE });

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const playersRef = useRef<PlayerState[]>([]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const [community, setCommunity] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [phase, setPhase] = useState<Phase>("preflop");
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [, setStatus] = useState("Welcome to Texas Hold'em.");
  const [showdown, setShowdown] = useState<ShowdownResult | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [raiseInput, setRaiseInput] = useState("");
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(true);
  const [showExamples, setShowExamples] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [conclusion, setConclusion] = useState<GameConclusion | null>(null);
  const hintFallbackRef = useRef(false);

  useEffect(() => {
    if (invalidBots) {
      if (typeof window !== "undefined") {
        window.alert("Please choose between 1 and 3 bots for Hold'em.");
      }
      router.replace("/");
    }
  }, [invalidBots, router]);

  useEffect(() => {
    setPlayers((prev) => {
      if (prev.length === 0 || prev.length !== botCount + 1) {
        const base: PlayerState[] = [
          {
            id: "human",
            name: "You",
            stack: wallet,
            cards: [],
            folded: false,
            bet: 0,
            isHuman: true,
            avatarHue: 280,
          },
          ...Array.from({ length: botCount }, (_, index) => ({
            id: `bot-${index}`,
            name: BOT_NAMES[index % BOT_NAMES.length] ?? `Bot ${index + 1}`,
            stack: BOT_BUY_IN,
            cards: [],
            folded: false,
            bet: 0,
            isHuman: false,
            avatarHue: 180 + index * 40,
          })),
        ];
        return base;
      }
      return prev.map((player) => (player.isHuman ? { ...player, stack: wallet } : player));
    });
  }, [botCount, wallet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = searchParams.get("code");
    if (code) {
      setIsMultiplayer(true);
      const hostFlag = sessionStorage.getItem("gmbl-host") === "1";
      setIsHost(hostFlag);
    } else {
      setIsMultiplayer(false);
      setIsHost(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isMultiplayer && showHint) {
      setShowHint(false);
      hintFallbackRef.current = false;
    }
  }, [isMultiplayer, showHint]);

  const dealCommunityCards = useCallback((count: number) => {
    setDeck((prev) => {
      const nextDeck = [...prev];
      const dealt: Card[] = [];
      for (let i = 0; i < count; i += 1) {
        const card = nextDeck.shift();
        if (card) dealt.push(card);
      }
      if (dealt.length) {
        setCommunity((prevCommunity) => [...prevCommunity, ...dealt]);
      }
      return nextDeck;
    });
  }, []);

  const resetBets = useCallback((list: PlayerState[]): PlayerState[] => list.map((player) => ({ ...player, bet: 0 })), []);

  const startHand = useCallback(() => {
    if (isMultiplayer && !isHost) return;
    const currentPlayers = playersRef.current;
    const human = currentPlayers.find((player) => player.isHuman);
    if (!human) return;
    if (human.stack < ANTE) {
      setShowTopUp(true);
      setStatus("Add more chips to keep playing.");
      return;
    }

    setConclusion(null);
    const nextDeck = shuffleDeck(createDeck());
    const updatedPlayers = currentPlayers.map((player) => {
      let nextStack = player.stack;
      if (!player.isHuman && nextStack <= 0) {
        nextStack = BOT_BUY_IN;
      }
      const folded = nextStack <= 0;
      const cards = folded ? [] : [nextDeck.shift()!, nextDeck.shift()!];
      let bet = 0;
      if (!folded) {
        const contribution = Math.min(ANTE, nextStack);
        nextStack -= contribution;
        bet = contribution;
      }
      return {
        ...player,
        stack: nextStack,
        cards,
        folded,
        bet,
        handRank: undefined,
      };
    });

    const potSeed = updatedPlayers.reduce((total, player) => total + player.bet, 0);
    const highestBet = updatedPlayers.reduce((max, player) => Math.max(max, player.bet), 0);
    setPlayers(updatedPlayers);
    setDeck(nextDeck);
    setCommunity([]);
    setPot(potSeed);
    setCurrentBet(highestBet);
    const starter = findNextActor(updatedPlayers, -1, highestBet);
    setCurrentIndex(starter);
    setPhase("preflop");
    setStatus(starter === 0 ? "You're first to act preflop." : "Preflop underway.");
    setShowdown(null);
    setHasStarted(true);
    const humanStackAfter = updatedPlayers.find((player) => player.isHuman)?.stack ?? wallet;
    setWallet(humanStackAfter);
  }, [isHost, isMultiplayer, setConclusion, setWallet, wallet]);

  const advancePhase = useCallback(
    (playersList: PlayerState[]) => {
      if (phase === "river") {
        finishHand(playersList, "showdown");
        return;
      }
      const nextPhase = phase === "preflop" ? "flop" : phase === "flop" ? "turn" : "river";
      const reset = resetBets(playersList);
      setPlayers(reset);
      setCurrentBet(0);
      setPot((prev) => prev);
      setPhase(nextPhase);
      if (nextPhase === "flop") dealCommunityCards(3);
      else dealCommunityCards(1);
      const nextIndex = findNextActor(reset, -1, 0);
      setCurrentIndex(nextIndex);
      setStatus(nextIndex === 0 ? `You're up on the ${nextPhase}.` : `${nextPhase[0].toUpperCase()}${nextPhase.slice(1)} phase.`);
    },
    [dealCommunityCards, phase, resetBets]
  );

  const finishHand = useCallback(
    (playersList: PlayerState[], reason: "showdown" | "fold") => {
      const activePlayers = playersList.filter((player) => !player.folded && player.cards.length === 2);
      const evaluationMap = new Map<string, HandEvaluation | undefined>();
      activePlayers.forEach((player) => {
        const combined = community.length + player.cards.length;
        const value = combined >= 5 ? evaluateHand([...player.cards, ...community]) : undefined;
        evaluationMap.set(player.id, value);
      });

      const evaluations = activePlayers.map((player) => ({
        id: player.id,
        name: player.name,
        evaluation: evaluationMap.get(player.id),
      }));

      let resolvedPlayers = playersList.map((player) => ({ ...player, handRank: evaluationMap.get(player.id) }));
      let winners: ShowdownResult["winners"] = [];

      if (activePlayers.length === 1 && reason === "fold") {
        const winner = activePlayers[0];
        resolvedPlayers = resolvedPlayers.map((player) =>
          player.id === winner.id ? { ...player, stack: player.stack + pot } : player
        );
        winners = [
          {
            id: winner.id,
            name: winner.name,
            evaluation: evaluationMap.get(winner.id),
          },
        ];
      } else if (activePlayers.length > 0) {
        const scored = activePlayers.map((player) => ({
          id: player.id,
          name: player.name,
          evaluation: evaluationMap.get(player.id) ?? evaluateHand([...player.cards, ...community]),
        }));
        const sorted = [...scored].sort((a, b) => compareHands(b.evaluation, a.evaluation));
        const best = sorted[0];
        const top = sorted.filter((entry) => compareHands(entry.evaluation, best.evaluation) === 0);
        const share = top.length > 0 ? Math.floor(pot / top.length) : 0;
        let remainder = top.length > 0 ? pot - share * top.length : 0;
        resolvedPlayers = resolvedPlayers.map((player) => {
          const winner = top.find((entry) => entry.id === player.id);
          if (winner) {
            const bonus = remainder > 0 ? 1 : 0;
            if (bonus) remainder -= 1;
            const payout = share + bonus;
            return { ...player, stack: player.stack + payout, handRank: winner.evaluation };
          }
          return player;
        });
        winners = top.map((entry) => ({ id: entry.id, name: entry.name, evaluation: entry.evaluation }));
      }

      const humanStack = resolvedPlayers.find((player) => player.isHuman)?.stack ?? wallet;
      setWallet(humanStack);
      setPlayers(resolvedPlayers);
      setPot(0);
      setCurrentBet(0);
      setCurrentIndex(-1);
      setPhase("showdown");
      setHasStarted(false);
      setStatus(reason === "fold" ? "Everyone else folded." : "Showdown complete.");
      setShowdown({
        winners,
        evaluations,
        reason,
      });

      const humanBefore = playersList.find((player) => player.isHuman);
      const resolvedHuman = resolvedPlayers.find((player) => player.isHuman);
      const humanFolded = Boolean(humanBefore?.folded);
      const humanWinner = resolvedHuman ? winners.some((winner) => winner.id === resolvedHuman.id) : false;
      const otherWinners = resolvedHuman ? winners.filter((winner) => winner.id !== resolvedHuman.id) : winners;
      const winningDescription =
        (humanWinner
          ? resolvedHuman?.handRank?.description ?? winners.find((winner) => winner.id === resolvedHuman?.id)?.evaluation?.description
          : winners[0]?.evaluation?.description) ?? "their hand";

      let title = reason === "fold" ? "Hand complete" : "Showdown complete";
      let detail =
        reason === "fold"
          ? otherWinners.length > 0
            ? `${otherWinners[0].name} collected the pot after the table folded.`
            : "The pot was awarded after everyone folded."
          : "The hand has wrapped.";
      let variant: GameConclusion["variant"] = "info";

      if (resolvedHuman) {
        if (humanWinner) {
          if (otherWinners.length > 0) {
            const partners = otherWinners.map((winner) => winner.name).join(" & ");
            title = "You split the pot";
            detail = `${partners} shared the winnings with you${winningDescription ? ` using ${winningDescription}.` : "."}`;
            variant = "split";
          } else if (reason === "fold") {
            title = "Pot is yours";
            detail = "Everyone else folded out.";
            variant = "win";
          } else {
            title = "You won the hand";
            detail = winningDescription ? `${winningDescription} sealed the pot.` : "Your hand held to the end.";
            variant = "win";
          }
        } else if (humanFolded) {
          title = "You folded";
          detail = otherWinners.length > 0
            ? `${otherWinners[0].name} scooped the pot after your fold.`
            : "The hand ended after you folded.";
          variant = "lose";
        } else {
          title = "You lost the hand";
          const losingWinner = winners[0];
          detail = losingWinner
            ? `${losingWinner.name} won with ${losingWinner.evaluation?.description ?? winningDescription}.`
            : "Another player collected the pot.";
          variant = "lose";
        }
      }

      setConclusion({ title, detail, variant });
    },
    [community, pot, setConclusion, setHasStarted, setWallet, wallet]
  );

  const concludeIfNeeded = useCallback(
    (playersList: PlayerState[], actedIndex: number, betValue: number) => {
      const remaining = countActive(playersList);
      if (remaining <= 1) {
        finishHand(playersList, "fold");
        return;
      }
      const next = findNextActor(playersList, actedIndex, betValue);
      if (next === -1) {
        advancePhase(playersList);
      } else {
        setCurrentIndex(next);
        setStatus(playersList[next].isHuman ? "Make your move." : `${playersList[next].name} is thinking...`);
      }
    },
    [advancePhase, finishHand]
  );

  const executeAction = useCallback(
    (index: number, context: PlayerActionContext) => {
      const currentPlayers = playersRef.current;
      const actor = currentPlayers[index];
      if (!actor) return;

      let potDelta = 0;
      let nextBet = currentBet;

      const updatedPlayers = currentPlayers.map((player, idx) => {
        if (idx !== index) return { ...player };
        if (context.action === "fold") {
          return { ...player, folded: true };
        }
        const targetBet = context.action === "raise" ? Math.max(currentBet, player.bet) + BET_INCREMENT : currentBet;
        const desired = context.raiseTo !== undefined ? Math.max(targetBet, context.raiseTo) : targetBet;
        const callAmount = Math.max(desired - player.bet, 0);
        const contribution = Math.min(callAmount, player.stack);
        potDelta += contribution;
        const newStack = player.stack - contribution;
        const newBet = player.bet + contribution;
        if (context.action === "raise") {
          nextBet = Math.max(nextBet, newBet);
        } else if (context.action === "call") {
          nextBet = Math.max(nextBet, newBet);
        }
        if (player.isHuman) {
          setWallet(newStack);
        }
        return { ...player, stack: newStack, bet: newBet };
      });

      setPlayers(updatedPlayers);
      if (potDelta > 0) {
        setPot((prev) => prev + potDelta);
      }
      setCurrentBet(nextBet);
      concludeIfNeeded(updatedPlayers, index, nextBet);
    },
    [concludeIfNeeded, currentBet, setWallet]
  );

  useEffect(() => {
    const currentPlayers = playersRef.current;
    const actor = currentIndex >= 0 ? currentPlayers[currentIndex] : null;
    if (!actor || actor.isHuman || phase === "showdown" || actor.folded) return;
    const timer = window.setTimeout(() => {
      const callCost = Math.max(currentBet - actor.bet, 0);
      const strength = estimateHandStrength(actor.cards, community, phase);
      if (callCost === 0) {
        if (strength > 0.75 && actor.stack > BET_INCREMENT) {
          executeAction(currentIndex, { action: "raise" });
        } else {
          executeAction(currentIndex, { action: "check" });
        }
      } else if (strength < 0.3 && Math.random() < 0.4) {
        executeAction(currentIndex, { action: "fold" });
      } else if (strength > 0.7 && actor.stack > callCost + BET_INCREMENT && Math.random() < 0.4) {
        executeAction(currentIndex, { action: "raise", raiseTo: currentBet + BET_INCREMENT });
      } else {
        executeAction(currentIndex, { action: "call" });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [community, currentBet, currentIndex, executeAction, phase]);

  const actingPlayer = currentIndex >= 0 ? players[currentIndex] : null;
  const isHumanTurn = Boolean(actingPlayer && actingPlayer.isHuman && phase !== "showdown");
  const callCost = isHumanTurn && actingPlayer ? Math.max(currentBet - actingPlayer.bet, 0) : 0;
  const checkLabel = callCost === 0 ? "Check" : `Call ${formatStack(Math.min(callCost, actingPlayer?.stack ?? 0))}`;
  const canRaise = isHumanTurn && actingPlayer ? actingPlayer.stack > callCost : false;
  const checkDisabled = !isHumanTurn;
  const foldDisabled = !isHumanTurn;
  const raiseDisabled = !canRaise;

  const quickDisabled = !canRaise;

  const humanPlayer = useMemo(() => players.find((player) => player.isHuman), [players]);
  const infoMode: "hidden" | "examples" | "hint" = showHint && !isMultiplayer ? "hint" : showExamples ? "examples" : "hidden";
  const hintContent = useMemo(() => {
    if (infoMode !== "hint") return null;
    return generateHint({
      human: humanPlayer,
      community,
      phase,
      pot,
      callCost,
      canRaise,
      currentBet,
      isHumanTurn,
    });
  }, [infoMode, humanPlayer, community, phase, pot, callCost, canRaise, currentBet, isHumanTurn]);
  const infoPanelVisible = infoMode !== "hidden";
  const exampleActive = showExamples;
  const hintActive = infoMode === "hint";
  const overlayActive = Boolean(conclusion || showTopUp);

  useEffect(() => {
    if (!isHumanTurn) {
      setRaiseInput("");
    }
  }, [isHumanTurn]);

  const handleCheckOrCall = useCallback(() => {
    const currentPlayers = playersRef.current;
    const actor = currentIndex >= 0 ? currentPlayers[currentIndex] : null;
    if (!actor || !actor.isHuman || phase === "showdown") return;
    const cost = Math.max(currentBet - actor.bet, 0);
    executeAction(currentIndex, { action: cost === 0 ? "check" : "call" });
  }, [currentBet, currentIndex, executeAction, phase]);

  const handleFold = useCallback(() => {
    const currentPlayers = playersRef.current;
    const actor = currentIndex >= 0 ? currentPlayers[currentIndex] : null;
    if (!actor || !actor.isHuman || phase === "showdown") return;
    executeAction(currentIndex, { action: "fold" });
  }, [currentIndex, executeAction, phase]);

  const handleRaise = useCallback(() => {
    const currentPlayers = playersRef.current;
    const actor = currentIndex >= 0 ? currentPlayers[currentIndex] : null;
    if (!actor || !actor.isHuman || phase === "showdown") return;
    const costToCall = Math.max(currentBet - actor.bet, 0);
    if (actor.stack <= costToCall) return;
    const parsed = Number.parseInt(raiseInput, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const totalContribution = Math.min(actor.stack, costToCall + parsed);
    if (totalContribution <= costToCall) return;
    executeAction(currentIndex, { action: "raise", raiseTo: actor.bet + totalContribution });
    setRaiseInput("");
  }, [currentBet, currentIndex, executeAction, phase, raiseInput]);

  const quickRaise = useCallback(
    (amount: number) => {
      const currentPlayers = playersRef.current;
      const actor = currentIndex >= 0 ? currentPlayers[currentIndex] : null;
      if (!actor || !actor.isHuman || phase === "showdown") return;
      const costToCall = Math.max(currentBet - actor.bet, 0);
      if (actor.stack <= costToCall) return;
      const totalContribution = Math.min(actor.stack, costToCall + amount);
      if (totalContribution <= costToCall) return;
      executeAction(currentIndex, { action: "raise", raiseTo: actor.bet + totalContribution });
      setRaiseInput("");
    },
    [currentBet, currentIndex, executeAction, phase]
  );

  const topUp = useCallback(() => {
    setWallet(INITIAL_BALANCE);
    setPlayers((prev) => prev.map((player) => (player.isHuman ? { ...player, stack: INITIAL_BALANCE } : player)));
    setShowTopUp(false);
    setStatus("Balance restored. Start the next hand!");
  }, [setWallet]);

  const toggleExamples = useCallback(() => {
    setShowExamples((prev) => {
      const next = !prev;
      if (!next) {
        setShowHint(false);
        hintFallbackRef.current = false;
      }
      return next;
    });
  }, []);

  const toggleHint = useCallback(() => {
    if (isMultiplayer) return;
    setShowHint((prev) => {
      if (prev) {
        const shouldReturnToExamples = hintFallbackRef.current;
        hintFallbackRef.current = false;
        if (!shouldReturnToExamples) {
          setShowExamples(false);
        }
        return false;
      }
      hintFallbackRef.current = showExamples;
      if (!showExamples) {
        setShowExamples(true);
      }
      return true;
    });
  }, [isMultiplayer, showExamples]);

  useEffect(() => {
    if (!showExamples && showHint) {
      setShowHint(false);
      hintFallbackRef.current = false;
    }
  }, [showExamples, showHint]);

  const communityClasses =
    "flex flex-wrap items-center justify-center gap-4 overflow-x-auto rounded-3xl border border-white/10 bg-white/10 px-4 py-6 backdrop-blur sm:px-8";

  const phaseLabel =
    phase === "preflop"
      ? "Preflop"
      : phase === "flop"
      ? "Flop"
      : phase === "turn"
      ? "Turn"
      : phase === "river"
      ? "River"
      : "Showdown";

  const turnLabel = !hasStarted
    ? "Awaiting deal"
    : phase === "showdown"
    ? "Showdown"
    : currentIndex === -1 || !actingPlayer
    ? "Dealing"
    : actingPlayer.isHuman
    ? "Your turn"
    : `${actingPlayer.name}'s Turn`;

  const walletDisplay = walletMeta.loading ? "---" : formatStack(wallet);
  const playerGridClass =
    players.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : players.length === 2 ? "md:grid-cols-2" : "grid-cols-1";
  const conclusionAccent =
    conclusion?.variant === "win"
      ? "from-emerald-400/30 via-teal-400/25 to-sky-400/30"
      : conclusion?.variant === "split"
      ? "from-cyan-400/25 via-sky-400/25 to-indigo-500/25"
      : conclusion?.variant === "lose"
      ? "from-rose-500/30 via-orange-500/20 to-amber-400/20"
      : "from-white/20 via-slate-500/15 to-slate-900/20";

  return (
    <main className={`relative min-h-screen overflow-hidden bg-slate-950/60 text-white`}>
      <div className={`absolute inset-0 opacity-95 ${gradientBackground}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.55),rgba(15,23,42,0.9))]" />
      <div className="relative z-10 min-h-screen">
        <div className="absolute left-6 top-8 flex items-center gap-4 md:left-12 md:top-12">
          <Link
            href="/"
            className="text-3xl font-black tracking-tight text-white transition hover:text-cyan-200"
          >
            <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
          </Link>
        </div>
        <div className="absolute right-6 top-8 flex items-center gap-3 md:right-12 md:top-12">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/70 shadow-lg backdrop-blur">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M3.75 6A1.5 1.5 0 0 1 5.25 4.5h13.5A1.5 1.5 0 0 1 20.25 6v12A1.5 1.5 0 0 1 18.75 19.5H5.25A1.5 1.5 0 0 1 3.75 18V6Zm12 7.5h.008v.008H15.75V13.5Z"
              />
            </svg>
            <span className="text-white">{walletDisplay}</span>
          </div>
        </div>

        <section className="flex min-h-screen w-full flex-col items-center gap-10 px-6 pb-24 pt-28 sm:px-10">
          <div className="flex w-full max-w-6xl flex-col items-stretch gap-6 lg:flex-row lg:items-start">
            <div
              className={`${glassPanelClass} relative flex-1 space-y-6 px-6 py-8 text-left shadow-[0_40px_160px_rgba(45,212,191,0.25)] sm:px-10`}
            >
              <div className="flex w-full flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/50">{phaseLabel}</div>
                  <h1 className="mt-1 text-3xl font-semibold text-white">{turnLabel}</h1>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-[0_18px_60px_rgba(16,185,129,0.35)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.75c-3.728 0-6.75 1.007-6.75 2.25v6c0 1.243 3.022 2.25 6.75 2.25s6.75-1.007 6.75-2.25v-6c0-1.243-3.022-2.25-6.75-2.25Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.75 9V12M5.25 9V12M12 11.25c-3.728 0-6.75-1.007-6.75-2.25M18.75 9c0 1.243-3.022 2.25-6.75 2.25"
                    />
                  </svg>
                  <span className="text-white">{formatStack(pot)}</span>
                </div>
              </div>

              <div className={`${communityClasses} min-h-[120px] w-full justify-center`} aria-label="Community cards">
                {community.length > 0 ? (
                  community.map((card, index) => <PokerCard key={`${card.rank}${card.suit}${index}`} card={card} />)
                ) : (
                  <span className="text-sm text-white/60">No community cards yet.</span>
                )}
              </div>

              {currentBet > 0 && phase !== "showdown" && (
                <div className="flex items-center justify-center">
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">
                    Current bet {formatStack(currentBet)}
                  </span>
                </div>
              )}

              <div className="flex w-full flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRaise}
                    disabled={raiseDisabled}
                    className={`${primaryButtonGradient} flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.35)] transition duration-300 hover:scale-[1.02] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Raise
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={raiseInput}
                    onChange={(event) => setRaiseInput(event.target.value)}
                    disabled={raiseDisabled}
                    placeholder={canRaise ? `${BET_INCREMENT}` : "--"}
                    className="w-24 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-sm font-semibold text-white/80 outline-none transition focus:border-cyan-200/70 focus:bg-white/15 focus:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
                  />
                  <button
                    onClick={handleCheckOrCall}
                    disabled={checkDisabled}
                    className="rounded-full border border-white/10 bg-white/10 px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white/80 transition hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/30"
                  >
                    {checkLabel}
                  </button>
                  <button
                    onClick={handleFold}
                    disabled={foldDisabled}
                    className="rounded-full border border-white/10 bg-white/10 px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white/80 transition hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/30"
                  >
                    Fold
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[5, 10, 50].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => quickRaise(amount)}
                      disabled={quickDisabled}
                      className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-1 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 hover:text-cyan-50 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/30"
                    >
                      +{amount}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative w-full rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.35)] backdrop-blur">
                <div className={`grid ${playerGridClass} gap-4`}>
                  {players.map((player) => {
                    const isHuman = player.isHuman;
                    const isActing = actingPlayer?.id === player.id && phase !== "showdown";
                    const reveal = isHuman || phase === "showdown" || player.folded;
                    const displayCards = reveal ? player.cards : [];
                    const hiddenCount = Math.max(player.cards.length - displayCards.length, 0);
                    const panelClasses = [
                      "relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.3)] transition",
                      player.folded ? "opacity-60" : "opacity-100",
                      isActing ? "ring-2 ring-emerald-300/70" : "ring-0",
                      isHuman ? "border-cyan-200/60 bg-cyan-400/15 shadow-[0_20px_80px_rgba(56,189,248,0.25)]" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={player.id} className={panelClasses}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                              style={{
                                background: isHuman
                                  ? "linear-gradient(135deg, rgba(56,189,248,0.9), rgba(14,165,233,0.85))"
                                  : `linear-gradient(135deg, hsla(${player.avatarHue}, 80%, 60%, 0.9), hsla(${player.avatarHue + 30}, 75%, 55%, 0.85))`,
                              }}
                            >
                              {player.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-white">{isHuman ? "You" : player.name}</div>
                              <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
                                {isHuman ? "Player" : "Bot"}
                              </div>
                            </div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                            {formatStack(player.stack)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[0.65rem] uppercase tracking-[0.25em] text-white/45">
                          <span>Committed {formatStack(player.bet)}</span>
                          {isHuman && callCost > 0 && !player.folded && phase !== "showdown" && (
                            <span className="text-amber-200">To Call {formatStack(callCost)}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {displayCards.map((card, cardIndex) => (
                            <PokerCard
                              key={`${player.id}-${card.rank}${card.suit}-${cardIndex}`}
                              card={card}
                              variant={isHuman ? "player" : "compact"}
                            />
                          ))}
                          {hiddenCount > 0 &&
                            Array.from({ length: hiddenCount }).map((_, hiddenIndex) => (
                              <PokerCard
                                key={`hidden-${player.id}-${hiddenIndex}`}
                                hidden
                                variant={isHuman ? "player" : "compact"}
                              />
                            ))}
                          {displayCards.length === 0 && hiddenCount <= 0 && (
                            <span className="text-xs text-white/50">No cards</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                          {player.folded && <span className="text-rose-200/80">Folded</span>}
                          {isActing && <span className="text-emerald-300/80">Acting</span>}
                          {phase === "showdown" && player.handRank && (
                            <span className="text-emerald-200">{player.handRank.description}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                {!hasStarted && (
                  isMultiplayer && !isHost ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-white/70">
                      Waiting for host
                    </span>
                  ) : (
                    <button
                      onClick={startHand}
                      className={`${primaryButtonGradient} rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-white shadow-[0_24px_80px_rgba(56,189,248,0.35)] transition duration-300 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-60`}
                      disabled={walletMeta.loading}
                    >
                      Start hand
                    </button>
                  )
                )}
              </div>
            </div>

            <AnimatePresence>
              {infoPanelVisible && (
                <motion.aside
                  key={`info-${infoMode}`}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 32 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className={`${glassPanelClass} relative w-full overflow-hidden px-6 py-6 text-left shadow-[0_30px_120px_rgba(56,189,248,0.25)] backdrop-blur lg:max-w-xs xl:max-w-sm`}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 via-cyan-400/5 to-slate-900/40 opacity-70" />
                  <div className="relative z-10">
                    <AnimatePresence mode="wait">
                      {infoMode === "examples" && (
                        <motion.div
                          key="examples"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          className="space-y-4"
                        >
                          <div>
                            <div className="text-xs uppercase tracking-[0.3em] text-white/50">Reference</div>
                            <h3 className="mt-1 text-xl font-semibold text-white">Hand rankings</h3>
                          </div>
                          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
                            {HAND_RANKING_EXAMPLES.map((item) => (
                              <div
                                key={item.name}
                                className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              >
                                <div className="text-sm font-semibold text-white">{item.name}</div>
                                <p className="mt-1 text-xs text-white/60">{item.description}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.cards.map((exampleCard, index) => (
                                    <PokerCard
                                      key={`${item.name}-${exampleCard.rank}${exampleCard.suit}-${index}`}
                                      card={exampleCard}
                                      variant="compact"
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                      {infoMode === "hint" && hintContent && (
                        <motion.div
                          key="hint"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1"
                        >
                          <div>
                            <div className="text-xs uppercase tracking-[0.3em] text-white/50">Strategy</div>
                            <h3 className="mt-1 text-xl font-semibold text-white">Recommended play</h3>
                          </div>
                          <div className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 p-4 text-sm text-white shadow-[0_20px_80px_rgba(56,189,248,0.25)]">
                            <div className="text-lg font-semibold text-white">{hintContent.title}</div>
                            <p className="mt-2 text-sm text-white/80">{hintContent.suggestion}</p>
                          </div>
                          <ul className="space-y-2 text-xs text-white/70">
                            {hintContent.reasons.map((reason, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-cyan-300" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>

          {showdown && (
            <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white shadow-[0_20px_80px_rgba(56,189,248,0.35)] backdrop-blur-xl">
              <h2 className="text-xl font-semibold">{showdown.reason === "fold" ? "Pot awarded" : "Showdown"}</h2>
              {showdown.winners.length > 0 ? (
                <p className="mt-2 text-sm text-white/70">
                  {showdown.winners.map((winner) => winner.name).join(", ")} {showdown.winners.length > 1 ? "split" : "wins"} the pot!
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/70">Hand resolved.</p>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {showdown.evaluations.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-white/70">
                    <div className="font-semibold text-white">{entry.name}</div>
                    <div>{entry.evaluation ? entry.evaluation.description : "Hand hidden"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3 sm:flex-row sm:items-center">
          <div
            className={`flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/60 px-3 py-2 shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur ${overlayActive ? "pointer-events-none opacity-40" : "pointer-events-auto"}`}
          >
            <button
              type="button"
              onClick={toggleExamples}
              aria-pressed={exampleActive}
              title="Show hand examples"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-lg font-semibold text-white/80 transition hover:bg-white/20 hover:text-white ${exampleActive ? "ring-2 ring-cyan-300/70" : ""}`}
            >
              ?
            </button>
            {!isMultiplayer && (
              <button
                type="button"
                onClick={toggleHint}
                aria-pressed={hintActive}
                title="Get a hint"
                className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold tracking-[0.2em] text-white/80 transition hover:bg-white/20 hover:text-white ${hintActive ? "ring-2 ring-emerald-300/70" : ""}`}
              >
                H
              </button>
            )}
          </div>
        </div>
      </div>

      {conclusion && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center text-white shadow-[0_40px_160px_rgba(15,23,42,0.55)] backdrop-blur-xl"
          >
            <div className={`pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br ${conclusionAccent} opacity-60`} />
            <div className="relative z-10 flex flex-col gap-4">
              <h3 className="text-2xl font-semibold tracking-tight">{conclusion.title}</h3>
              <p className="text-sm text-white/75">{conclusion.detail}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {(!isMultiplayer || isHost) && (
                  <button
                    onClick={() => {
                      setConclusion(null);
                      startHand();
                    }}
                    className={`${primaryButtonGradient} rounded-full px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white shadow-[0_24px_80px_rgba(56,189,248,0.35)] transition hover:scale-[1.03] active:scale-[0.97]`}
                  >
                    Start next hand
                  </button>
                )}
                <button
                  onClick={() => setConclusion(null)}
                  className="rounded-full border border-white/15 bg-white/10 px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
              {isMultiplayer && !isHost && (
                <p className="text-xs text-white/60">Waiting for the host to start the next hand.</p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showTopUp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center text-white shadow-[0_30px_120px_rgba(16,185,129,0.4)] backdrop-blur-xl">
            <h3 className="text-2xl font-semibold">You ran out of chips</h3>
            <p className="mt-2 text-sm text-white/70">Top up to {formatStack(INITIAL_BALANCE)} to keep the game going.</p>
            <div className="mt-6 flex justify-center gap-4">
              <button
                onClick={topUp}
                className="rounded-full bg-gradient-to-r from-emerald-400/80 via-teal-400/80 to-cyan-400/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] shadow-lg transition hover:scale-[1.03] active:scale-[0.97]"
              >
                Refill balance
              </button>
              <Link
                href="/"
                className="rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/80 transition hover:bg-white/20 hover:text-white"
              >
                Leave table
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PokerCard({
  card,
  hidden,
  variant = "default",
}: {
  card?: Card;
  hidden?: boolean;
  variant?: "default" | "player" | "compact";
}) {
  const sizeClasses =
    variant === "compact"
      ? "h-20 w-14 sm:h-24 sm:w-16"
      : variant === "player"
      ? "h-28 w-16 sm:h-32 sm:w-20"
      : "h-28 w-20 sm:h-32 sm:w-24";
  const numeralClasses = variant === "compact" ? "text-xs sm:text-sm" : "text-sm sm:text-base";
  const suitClasses = variant === "compact" ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl";
  const [faceUp, setFaceUp] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    setFaceUp(false);
    if (!hidden) {
      timer = window.setTimeout(() => {
        setFaceUp(Boolean(card));
      }, 280);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [card?.rank, card?.suit, hidden]);

  const value = card?.rank ?? "?";
  const suit = card?.suit ?? "";
  const isRed = suit === "♥" || suit === "♦";

  const front = hidden
    ? null
    : (
        <div
          className={`relative flex h-full w-full flex-col items-center justify-center rounded-2xl border border-white/40 bg-gradient-to-br from-white/95 via-white/90 to-slate-100 text-black shadow-[0_18px_60px_rgba(15,23,42,0.35)]`}
          style={{ color: isRed ? "#f87171" : "#0f172a" }}
        >
          <span className={`absolute left-2 top-2 font-semibold ${numeralClasses}`}>{value}</span>
          <span className={`${suitClasses}`}>{suit}</span>
          <span className={`absolute right-2 bottom-2 rotate-180 font-semibold ${numeralClasses}`}>{value}</span>
          <span className="pointer-events-none absolute inset-x-2 top-1 h-1 rounded-full bg-white/60 opacity-60 blur-md" />
        </div>
      );

  const back = (
    <div className="relative flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),rgba(15,23,42,0.9))] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <span className="tracking-tight text-white/50">gmbl</span>
    </div>
  );

  return (
    <div className={`relative ${sizeClasses}`} style={{ perspective: "1200px" }}>
      <motion.div
        className="relative h-full w-full"
        initial={{ opacity: 0, rotateY: 180 }}
        animate={{ opacity: 1, rotateY: hidden ? 180 : faceUp ? 0 : 180 }}
        transition={{ duration: hidden ? 0.45 : 0.6, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {!hidden && (
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          >
            {front}
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}

