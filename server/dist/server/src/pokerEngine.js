"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateHandNames = exports.evaluateHands = exports.dealCards = exports.shuffleDeck = exports.createDeck = exports.blindsFor = exports.DEFAULT_BLIND_DIVISOR = exports.BLIND_DIVISORS = exports.STAKE_TIERS = void 0;
// @ts-ignore
const pokersolver_1 = require("pokersolver");
const types_1 = require("../../shared/types");
Object.defineProperty(exports, "STAKE_TIERS", { enumerable: true, get: function () { return types_1.STAKE_TIERS; } });
Object.defineProperty(exports, "BLIND_DIVISORS", { enumerable: true, get: function () { return types_1.BLIND_DIVISORS; } });
Object.defineProperty(exports, "DEFAULT_BLIND_DIVISOR", { enumerable: true, get: function () { return types_1.DEFAULT_BLIND_DIVISOR; } });
Object.defineProperty(exports, "blindsFor", { enumerable: true, get: function () { return types_1.blindsFor; } });
const createDeck = () => {
    const suits = ['h', 'd', 'c', 's'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const s of suits) {
        for (const r of ranks) {
            deck.push({ rank: r, suit: s });
        }
    }
    return deck;
};
exports.createDeck = createDeck;
const crypto_1 = __importDefault(require("crypto"));
const shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto_1.default.randomInt(0, i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
};
exports.shuffleDeck = shuffleDeck;
const dealCards = (room) => {
    const activePlayers = room.players.filter(p => p.isActive && !p.isSpectating);
    if (room.deck.length < activePlayers.length * 2) {
        console.error(`dealCards: deck has ${room.deck.length} cards, need ${activePlayers.length * 2}`);
        return;
    }
    activePlayers.forEach(p => {
        p.cards = [room.deck.pop(), room.deck.pop()];
        p.hasFolded = false;
        p.hasActed = false;
        p.currentBet = 0;
        p.totalContribution = 0;
    });
};
exports.dealCards = dealCards;
const evaluateHands = (room) => {
    const communityStrings = room.communityCards.map(c => `${c.rank}${c.suit}`);
    const hands = room.players
        .filter(p => !p.hasFolded && p.isActive && !p.isSpectating)
        .map(p => {
        const playerStrings = p.cards.map(c => `${c.rank}${c.suit}`);
        const hand = pokersolver_1.Hand.solve([...playerStrings, ...communityStrings]);
        hand.playerId = p.id;
        return hand;
    });
    const winners = pokersolver_1.Hand.winners(hands);
    return winners.map((w) => ({
        playerId: w.playerId,
        handName: w.name,
        winningCards: w.cards.map((c) => `${c.value === '1' ? 'A' : c.value}${c.suit}`) // pokersolver uses '1' for low Ace
    }));
};
exports.evaluateHands = evaluateHands;
const updateHandNames = (room) => {
    const communityStrings = room.communityCards.map(c => `${c.rank}${c.suit}`);
    room.players.forEach(p => {
        if (p.cards && p.cards.length > 0) {
            const playerStrings = p.cards.map(c => `${c.rank}${c.suit}`);
            const hand = pokersolver_1.Hand.solve([...playerStrings, ...communityStrings]);
            p.handName = hand.name;
        }
        else {
            p.handName = '';
        }
    });
};
exports.updateHandNames = updateHandNames;
