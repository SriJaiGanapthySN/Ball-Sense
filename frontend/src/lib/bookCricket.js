import { assign, createMachine } from "xstate";

export const BOOKS = [
  { id: "pavilion", title: "The Pavilion", edition: "Clothbound classic", pages: 420, binding: "cloth", cover: "#245b48", ink: "#efda99", paper: "#f4f0e5", accent: "#245b48" },
  { id: "atlas", title: "Boundary Atlas", edition: "Illustrated paperback", pages: 460, binding: "paperback", cover: "#a53443", ink: "#fff2d6", paper: "#faf5e9", accent: "#a53443" },
  { id: "scorebook", title: "Matchday Notes", edition: "Wirebound scorebook", pages: 500, binding: "wire", cover: "#315a80", ink: "#e7f1ee", paper: "#f0f4f3", accent: "#315a80" },
];
export const BOOK_OVERS = [1, 2, 5, 10];
export const BOOK_WICKETS = [1, 3, 5, 10];
export const BOOK_FLIP_MS = 1300;

export function pageOutcome(page) {
  if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("Page must be a positive whole number.");
  const digit = page % 10;
  return { page, digit, runs: digit === 0 ? 0 : ((digit - 1) % 6) + 1, wicket: digit === 0 };
}

export function sampleBookPage(pageCount, random = Math.random) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new RangeError("Invalid page count.");
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Random sample must be in [0, 1).");
  return 1 + Math.floor(sample * pageCount);
}

export function bookSpread(page, pageCount) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || !Number.isSafeInteger(page) || page < 1 || page > pageCount) throw new RangeError("Page is outside this book.");
  const left = page % 2 === 0 ? page : page - 1;
  return { left: left || null, right: left + 1 <= pageCount ? left + 1 : null };
}

const emptyScore = () => ({ runs: 0, wickets: 0, balls: 0 });
export const initialBookContext = () => ({
  bookId: BOOKS[0].id, mode: "solo", overs: 2, wicketLimit: 3,
  names: { you: "You", opponent: "Computer" }, innings: 1, batting: "you", battingFirst: "you",
  scores: { you: emptyScore(), opponent: emptyScore() }, target: null,
  history: [], lastBall: null, pendingPage: null, flipId: 0, result: null,
});
const inningsOver = (context) => context.scores[context.batting].wickets >= context.wicketLimit || context.scores[context.batting].balls >= context.overs * 6;

function revealPage(context) {
  const outcome = pageOutcome(context.pendingPage);
  const previous = context.scores[context.batting];
  const score = { runs: previous.runs + outcome.runs, wickets: previous.wickets + Number(outcome.wicket), balls: previous.balls + 1 };
  const delivery = { ...outcome, innings: context.innings, batting: context.batting, ball: score.balls };
  return { scores: { ...context.scores, [context.batting]: score }, lastBall: delivery, history: [...context.history, delivery], pendingPage: null };
}

export const bookCricketMachine = createMachine({
  id: "bookCricket",
  initial: "setup",
  context: initialBookContext,
  on: { RESET: { target: ".setup", actions: assign(({ context }) => ({ ...initialBookContext(), flipId: context.flipId + 1 })) } },
  states: {
    setup: {
      on: {
        START: {
          guard: ({ event }) => BOOKS.some((book) => book.id === event.bookId) && BOOK_OVERS.includes(event.overs) && BOOK_WICKETS.includes(event.wicketLimit) && ["solo", "local"].includes(event.mode) && ["you", "opponent"].includes(event.battingFirst),
          target: "playing",
          actions: assign(({ context, event }) => ({
            ...initialBookContext(), flipId: context.flipId, bookId: event.bookId,
            mode: event.mode, overs: event.overs, wicketLimit: event.wicketLimit,
            batting: event.battingFirst, battingFirst: event.battingFirst,
            names: event.mode === "local" ? { you: String(event.youName || "").trim().slice(0, 24) || "Player 1", opponent: String(event.opponentName || "").trim().slice(0, 24) || "Player 2" } : { you: "You", opponent: "Computer" },
          })),
        },
      },
    },
    playing: {
      on: {
        OPEN: {
          guard: ({ context, event }) => Number.isSafeInteger(event.page) && event.page >= 1 && event.page <= BOOKS.find((book) => book.id === context.bookId).pages,
          target: "flipping",
          actions: assign(({ context, event }) => ({ pendingPage: event.page, flipId: context.flipId + 1 })),
        },
      },
    },
    flipping: {
      on: {
        REVEAL: {
          guard: ({ context, event }) => event.flipId === context.flipId,
          target: "resolving",
          actions: assign(({ context }) => revealPage(context)),
        },
      },
    },
    resolving: {
      always: [
        {
          guard: ({ context }) => context.innings === 2 && (context.scores[context.batting].runs >= context.target || inningsOver(context)),
          target: "finished",
          actions: assign(({ context }) => {
            const difference = context.scores.you.runs - context.scores.opponent.runs;
            const chased = context.scores[context.batting].runs >= context.target;
            const wicketsLeft = context.wicketLimit - context.scores[context.batting].wickets;
            return { result: { winner: difference === 0 ? "tie" : difference > 0 ? "you" : "opponent", margin: difference === 0 ? "Scores level" : chased ? `${wicketsLeft} wicket${wicketsLeft === 1 ? "" : "s"}` : `${Math.abs(difference)} run${Math.abs(difference) === 1 ? "" : "s"}` } };
          }),
        },
        { guard: ({ context }) => inningsOver(context), target: "inningsBreak", actions: assign(({ context }) => ({ target: context.scores[context.batting].runs + 1 })) },
        { target: "playing" },
      ],
    },
    inningsBreak: {
      on: { NEXT_INNINGS: { target: "playing", actions: assign(({ context }) => ({ innings: 2, batting: context.battingFirst === "you" ? "opponent" : "you", lastBall: null })) } },
    },
    finished: {},
  },
});